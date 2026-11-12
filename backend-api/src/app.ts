import compression from 'compression';
import etag from 'etag';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './lib/errorHandler.js';
import { logger } from './lib/logger.js';
import { runWithContext } from './lib/requestContext.js';
import { authenticate, authorize } from './security/auth.js';
import { matchPattern } from './security/accessRules.js';
import { corsMiddleware } from './security/cors.js';
import { bumpCatalogVersion, invalidateAllCaches } from './services/catalogCache.js';
import { mountRoutes } from './routes/index.js';

/**
 * Ứng dụng Express: pipeline tương đương chuỗi filter của Spring (request context → header bảo mật → CORS → JWT →
 * phân quyền → controller → xử lý lỗi).
 */

// ---- Cache CDN cho API danh mục công khai (CdnCachePolicyAdvice) --------------------------------------------------
const DETAIL = 'public, s-maxage=60, stale-while-revalidate=600';
const LISTING = 'public, s-maxage=60, stale-while-revalidate=3600';
const REFERENCE = 'public, s-maxage=300, stale-while-revalidate=86400';

// Khóa cụ thể đứng trước "/api/public/places/*" (cũng khớp "regions", "amenities").
const CDN_RULES: Array<[string, string]> = [
  ['/api/public/places/regions', REFERENCE],
  ['/api/public/places/amenities', REFERENCE],
  ['/api/public/places/*/nearby', REFERENCE],
  ['/api/public/places/*/map-context', REFERENCE],
  ['/api/public/festivals', REFERENCE],
  ['/api/public/festivals/*', REFERENCE],
  ['/api/public/trips/catalog', REFERENCE],
  ['/api/public/home', LISTING],
  ['/api/public/places', LISTING],
  ['/api/public/places/*', DETAIL],
];

export function cdnPolicyFor(path: string): string | null {
  for (const [pattern, value] of CDN_RULES) if (matchPattern(pattern, path)) return value;
  return null;
}

function cdnCachePolicy(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' || req.header('authorization')) return next();
  const policy = cdnPolicyFor(req.path);
  if (!policy) return next();
  // Chỉ gắn khi phản hồi 2xx (lỗi 404/500 không bị CDN giữ lại).
  const writeHead = res.writeHead;
  res.writeHead = function patched(this: Response, ...args: any[]) {
    if (res.statusCode >= 200 && res.statusCode < 300) res.setHeader('CDN-Cache-Control', policy);
    return (writeHead as (...a: any[]) => Response).apply(this, args);
  } as typeof res.writeHead;
  next();
}

// ---- ETag (If-None-Match → 304) cho các GET công khai /api/public/* ---------------------------------------------------
function publicEtag(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET') return next();
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const text = JSON.stringify(body);
    if (!res.getHeader('Content-Type')) res.type('application/json');
    if (res.statusCode >= 200 && res.statusCode < 300 && text !== undefined) {
      res.setHeader('ETag', etag(text));
      if (req.fresh) {
        res.status(304).end();
        return res;
      }
    }
    return text === undefined ? originalJson(body) : res.send(text);
  };
  next();
}

// ---- Làm mới cache danh mục sau mỗi request GHI thành công (CatalogChangeInterceptor) ------------------------------
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function catalogChangeHook(req: Request, res: Response, next: NextFunction): void {
  const tracked =
    req.path.startsWith('/api/v1/admin/') ||
    req.path.startsWith('/api/v1/partner/') ||
    matchPattern('/api/public/bookings/*/review', req.path);
  if (!tracked || READ_METHODS.has(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    if (req.path.includes('/notifications') || req.path.includes('/push')) return;
    // Xóa cache NGAY (đồng bộ) để request GET kế tiếp không đọc phải bản cũ trong lúc chờ ghi phiên bản vào DB;
    // lần xóa thứ hai sau bump đảm bảo mục nào vừa nạp lại trong khoảng chờ cũng bị bỏ.
    invalidateAllCaches();
    void bumpCatalogVersion()
      .then(() => invalidateAllCaches())
      .catch((err: Error) => logger.warn('[CatalogCache] Không làm mới được cache danh mục', { error: err.message }));
  });
  next();
}

// ---- Header bảo mật mặc định (Spring Security) ----------------------------------------------------------------------
function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000 ; includeSubDomains');
  next();
}

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.set('query parser', 'simple');
  // Chỉ tin X-Forwarded-For khi kết nối đến từ proxy nội bộ (như RemoteIpValve "native"): client trực tiếp không giả IP được.
  // TRUST_PROXY ghi đè khi hạ tầng khác (vd "1" = tin đúng một lớp proxy, hoặc danh sách CIDR); mặc định chỉ tin dải nội bộ.
  const trustProxy = (process.env.TRUST_PROXY ?? '').trim();
  app.set('trust proxy', trustProxy === '' ? 'loopback, linklocal, uniquelocal' : trustProxy === 'true' ? true : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  app.use(securityHeaders);
  app.use(compression({ filter: (req, res) => /json|text/.test(String(res.getHeader('Content-Type') ?? '')) }));
  app.use(corsMiddleware());
  app.use('/api/public', publicEtag);
  app.use(cdnCachePolicy);
  app.use(express.json({ limit: '5mb' }));
  // Ngữ cảnh request (AsyncLocalStorage) đặt SAU body parser: callback của stream không giữ ngữ cảnh đã mở trước đó.
  app.use((req, _res, next) => {
    runWithContext({ ip: req.ip }, next);
  });
  app.use(catalogChangeHook);
  app.use(authenticate);
  app.use(authorize);

  mountRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** Gốc cấu hình dùng bởi server (cổng, host). */
export function listenOptions(): { port: number; host: string } {
  const cfg = config();
  return { port: cfg.port, host: cfg.host };
}
