import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AccountRole } from '../domain/enums.js';
import * as accounts from '../repositories/accountRepo.js';
import { effectiveAdminLevel } from '../repositories/accountRepo.js';
import { currentContext } from '../lib/requestContext.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { nowLocal, plusSeconds, compareLocal } from '../lib/time.js';
import * as audit from '../services/auditLogService.js';
import { decide, requiresAuthentication } from './accessRules.js';
import { parseToken } from './jwt.js';
import type { UserPrincipal } from './principal.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Người dùng đã xác thực (undefined = khách vãng lai). */
      principal?: UserPrincipal;
      /** Mã phiên thiết bị ("sid") của token cổng đã xác thực — dùng khi đăng xuất. */
      portalSessionId?: string;
    }
  }
}

/** Chỉ ghi lại hoạt động nếu lần ghi trước đã quá khoảng này, tránh UPDATE trên mỗi request. */
const TOUCH_INTERVAL_SECONDS = 60;

const MSG_INVALID = 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.';

/**
 * Endpoint tự xác thực bằng secret riêng trong header Authorization (không phải JWT): Vercel Cron gửi
 * "Bearer <CRON_SECRET>", SEPay gửi "Apikey ...". Không parse như JWT.
 */
function shouldNotFilter(path: string): boolean {
  return path.startsWith('/api/internal/cron/') || path.startsWith('/api/v1/webhooks/');
}

/** Vai trò trong claim "role" (dạng "ROLE_ADMIN"); token trang khách cũ mang "ROLE_GUEST" vẫn hiểu là TRAVELER. */
export function roleOf(roleStr: string): AccountRole {
  const name = roleStr.startsWith('ROLE_') ? roleStr.slice(5) : roleStr;
  if (name === 'GUEST') return 'TRAVELER';
  if (name === 'ADMIN' || name === 'PROVIDER' || name === 'TRAVELER') return name;
  throw new Error(`Vai trò không hợp lệ: ${roleStr}`);
}

function reject(res: Response, status: number, errorCode: string, message: string): void {
  res.status(status).type('application/json; charset=UTF-8').send(JSON.stringify({ status, errorCode, message }));
}

const rejectSession = (res: Response, message = MSG_INVALID) => reject(res, 401, 'SESSION_REVOKED', message);
const rejectInactive = (res: Response) =>
  reject(res, 403, 'ACCOUNT_INACTIVE', 'Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ ban quản trị hệ thống.');
const rejectSuspended = (res: Response) =>
  reject(res, 403, 'PROVIDER_SUSPENDED', 'Tài khoản của bạn đang bị đình chỉ. Vui lòng liên hệ để được mở lại.');

function extractToken(req: Request): string | null {
  const header = req.header('authorization');
  if (header && header.trim() && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Middleware chạy 1 lần mỗi request để xác thực JWT từ header Authorization. Token hợp lệ thì gắn `req.principal`.
 *
 * NFR-SEC-03: phiên của Admin/NCC bị từ chối khi tài khoản bị khóa, đổi quyền hoặc đổi phiên bản token (đặt lại mật khẩu
 * — mọi thiết bị), hoặc khi chính thiết bị đó đã đăng xuất (bảng account_session). Phiên KHÔNG tự hết hạn.
 *
 * Token hỏng (sai chữ ký, sai định dạng) hoặc token Admin/NCC không còn khớp tài khoản nào: trên đường dẫn cần đăng nhập
 * trả 401 kèm errorCode SESSION_REVOKED (frontend xóa phiên và về trang đăng nhập); trên đường dẫn công khai thì bỏ qua
 * token, xử lý như khách vãng lai.
 */
export const authenticate: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (shouldNotFilter(req.path)) return next();
    const token = extractToken(req);
    if (token !== null && !(await authenticateToken(token, req, res))) return; // đã ghi phản hồi lỗi 401/403
    next();
  } catch (err) {
    next(err);
  }
};

/** @returns false nếu đã ghi phản hồi lỗi (dừng chuỗi); true để đi tiếp (đã xác thực hoặc là khách vãng lai) */
async function authenticateToken(token: string, req: Request, res: Response): Promise<boolean> {
  const parsed = parseToken(token);
  if (!parsed.valid) {
    if (!requiresAuthentication(req.method, req.path)) return true;
    rejectSession(res);
    return false;
  }

  try {
    const claims = parsed.claims;
    const username = claims.sub;
    const role = roleOf(claims.role ?? '');
    const ctx = currentContext();

    // Phiên trang khách (TRAVELER) không tra bảng account mỗi request: service tự nạp tài khoản theo định danh và kiểm
    // tra trạng thái khi cần. Không bao giờ được dùng làm phiên cổng Admin / NCC.
    if (role === 'TRAVELER') {
      req.principal = { accountId: null, identifier: username, role, providerId: null, adminLevel: null };
      if (ctx) ctx.principal = req.principal;
      return true;
    }

    // Token có mã phiên thiết bị ("sid"): tài khoản + "thiết bị còn phiên không" lấy trong CÙNG một câu SQL.
    const sessionId = claims.sid;
    let account: accounts.AccountWithProvider | null;
    let sessionActive = true;
    if (sessionId) {
      const lookup = await accounts.findByIdentifierWithSession(username, sessionId);
      account = lookup?.account ?? null;
      sessionActive = lookup?.sessionActive ?? false;
    } else {
      account = await accounts.findByIdentifier(username);
    }

    // Token ADMIN/NCC ký đúng secret nhưng không trùng tài khoản nào KHÔNG BAO GIỜ được thành Admin/NCC.
    if (!account) {
      if (!requiresAuthentication(req.method, req.path)) return true;
      rejectSession(res);
      return false;
    }

    if (account.status !== 'ACTIVE') {
      if (role === 'PROVIDER') rejectSuspended(res);
      else rejectInactive(res);
      return false;
    }
    if (role === 'PROVIDER' && (account.provider === null || account.provider.status !== 'ACTIVE')) {
      rejectSuspended(res);
      return false;
    }

    // Quyền lấy từ DB, không tin claim trong token: đổi quyền có hiệu lực ngay.
    const tokenVersion = claims.tv;
    if (account.role !== role || tokenVersion == null || tokenVersion !== account.tokenVersion) {
      rejectSession(res, 'Phiên đăng nhập không còn hiệu lực do thay đổi tài khoản hoặc quyền. Vui lòng đăng nhập lại.');
      return false;
    }
    // Phiên theo thiết bị: thiết bị này đã đăng xuất thì token của nó hết dùng được.
    if (sessionId) {
      if (!sessionActive) {
        rejectSession(res);
        return false;
      }
      req.portalSessionId = sessionId;
    }
    // Chỉ ghi lại lần hoạt động gần nhất (để quản trị xem), không dùng để đăng xuất.
    const now = nowLocal();
    if (!account.lastActivityAt || compareLocal(plusSeconds(account.lastActivityAt, TOUCH_INTERVAL_SECONDS), now) < 0) {
      await accounts.touchActivity(account.id, now);
    }

    const principal: UserPrincipal = {
      accountId: account.id,
      identifier: username,
      role,
      providerId: account.provider?.id ?? null,
      adminLevel: effectiveAdminLevel(account),
    };
    req.principal = principal;
    if (ctx) {
      ctx.principal = principal;
      ctx.account = account;
    }
    return true;
  } catch (err) {
    // Claim lạ, lỗi DB...: không xác thực, đi tiếp như khách vãng lai (đường dẫn cần đăng nhập sẽ bị chặn).
    logger.warn('Không thể set authentication từ JWT token', { error: (err as Error).message });
    return true;
  }
}

/**
 * Phân quyền theo bảng accessRules (thay cho authorizeHttpRequests). Chưa đăng nhập → 403 (như Http403ForbiddenEntryPoint);
 * đã đăng nhập mà thiếu quyền → ghi audit log ACCESS_DENIED (NFR-SEC-05) rồi 403.
 */
export const authorize: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = decide(req.method, req.path, req.principal);
    if (decision === 'allow') return next();
    if (decision === 'forbidden' && req.principal) {
      const p = req.principal;
      await audit.recordEvent(
        p.role === 'PROVIDER' ? 'PROVIDER' : 'ADMIN',
        p.accountId,
        'ACCESS_DENIED',
        'Endpoint',
        null,
        audit.RESULT_DENIED,
        req.ip,
        `${req.method} ${req.path}`,
        { role: p.role },
      );
    }
    res.status(403).json({
      timestamp: new Date().toISOString(),
      status: 403,
      error: 'Forbidden',
      errorCode: 'FORBIDDEN',
      message: 'Bạn không có quyền thực hiện thao tác này.',
      path: req.path,
    });
  } catch (err) {
    next(err);
  }
};

/** Bắt buộc có principal (đã qua {@link authorize}, nên chỉ thiếu khi route bị gắn nhầm ngoài vùng bảo vệ). */
export function requirePrincipal(req: Request): UserPrincipal {
  if (!req.principal) throw new HttpError(403, 'Bạn không có quyền thực hiện thao tác này.');
  return req.principal;
}

/** accountId của principal; null nếu không có (phiên khách chưa gắn tài khoản). */
export function callerId(req: Request): number | null {
  return req.principal?.accountId ?? null;
}
