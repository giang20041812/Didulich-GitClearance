import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../config/env.js';

/**
 * CORS khai báo một nơi duy nhất (thay cho CorsConfigurationSource của SecurityConfig):
 * origin được phép = CORS_ALLOWED_ORIGINS + CORS_ALLOWED_ORIGIN_PATTERNS (+ localhost khi dev). Không bao giờ chấp nhận "*".
 * Token đi trong header Authorization (không dùng cookie) nên không cần credentials.
 */

const ALLOWED_METHODS = 'GET,POST,PUT,DELETE,PATCH,OPTIONS';
const EXPOSED_HEADERS = 'Authorization, Content-Disposition, ngrok-skip-browser-warning';
const MAX_AGE_SECONDS = 3600;

/** Danh sách mẫu origin hiệu lực. */
export function originPatterns(origins: string[], patterns: string[], devWildcards: boolean): string[] {
  const result = new Set<string>();
  if (devWildcards) {
    result.add('http://localhost:*');
    result.add('http://127.0.0.1:*');
  }
  for (const list of [origins, patterns]) {
    for (const value of list ?? []) {
      const trimmed = (value ?? '').trim();
      // "*" mở cho mọi site — không bao giờ chấp nhận, kể cả khi đặt nhầm trong biến môi trường.
      if (trimmed && trimmed !== '*') result.add(trimmed);
    }
  }
  return [...result];
}

function patternToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\/+$/, '');
  // Cổng "*" (http://localhost:*) = cổng bất kỳ hoặc không có cổng.
  const withPort = normalized.endsWith(':*');
  const base = withPort ? normalized.slice(0, -2) : normalized;
  const escaped = base.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${withPort ? '(?::\\d+)?' : ''}$`, 'i');
}

export function buildOriginMatcher(patterns: string[]): (origin: string) => boolean {
  const regexes = patterns.map(patternToRegex);
  return (origin: string) => regexes.some((re) => re.test(origin.replace(/\/+$/, '')));
}

function isSameOrigin(req: Request, origin: string): boolean {
  const host = req.header('x-forwarded-host') ?? req.header('host');
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function corsMiddleware(): RequestHandler {
  const cfg = config().cors;
  const allowed = buildOriginMatcher(originPatterns(cfg.allowedOrigins, cfg.originPatterns, cfg.devWildcards));

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (!origin) return next();
    // Request cùng nguồn (Origin trùng Host) không phải CORS.
    if (isSameOrigin(req, origin)) return next();

    if (!allowed(origin)) {
      res.status(403).type('text/plain').send('Invalid CORS request');
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.vary('Origin');
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);

    const isPreflight = req.method === 'OPTIONS' && req.header('access-control-request-method');
    if (isPreflight) {
      res.vary('Access-Control-Request-Method');
      res.vary('Access-Control-Request-Headers');
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      const requested = req.header('access-control-request-headers');
      if (requested) res.setHeader('Access-Control-Allow-Headers', requested);
      res.setHeader('Access-Control-Max-Age', String(MAX_AGE_SECONDS));
      res.status(200).end();
      return;
    }
    next();
  };
}
