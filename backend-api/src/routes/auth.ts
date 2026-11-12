import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config/env.js';
import { DuplicateFieldsError, HttpError, IllegalArgumentError } from '../lib/errors.js';
import { errorStyle } from '../lib/errorHandler.js';
import { parseBody } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { nowLocal } from '../lib/time.js';
import * as rateLimiter from '../security/rateLimiter.js';
import * as accountAuth from '../services/accountAuthService.js';
import * as google from '../services/googleTokenVerifier.js';
import * as mail from '../services/mailService.js';
import * as passwordReset from '../services/passwordResetService.js';
import * as travelerAuth from '../services/travelerAuthService.js';

/**
 * /api/v1/auth — đăng nhập cổng Admin/NCC, đăng ký / đăng nhập khách (email, Google), quên / đặt lại mật khẩu.
 *
 * Giới hạn số lần thử (chống dò mật khẩu / spam OTP). Bộ đếm nằm trong bộ nhớ từng instance.
 *  - Theo IP: trần cao, đếm mọi lần gọi (request qua rewrite "/api" của frontend có thể mang IP của hạ tầng Vercel).
 *  - Đăng nhập: chỉ đếm lần SAI mật khẩu; khóa theo định danh + IP (10 lần sai / 15 phút), cộng một trần chung cao theo
 *    định danh (100 lần sai / 15 phút) chặn dò phân tán. Đăng nhập đúng xóa bộ đếm định danh + IP.
 *  - Quên mật khẩu: chỉ trần theo IP; giới hạn theo tài khoản nằm trong DB (PasswordResetService).
 *  - Đặt lại mật khẩu: theo định danh + IP; mỗi OTP còn giới hạn số lần nhập sai riêng.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_PER_IP = 300;
const LOGIN_FAILURES_PER_IDENTIFIER_IP = 10;
const LOGIN_FAILURES_PER_IDENTIFIER = 100;
const RESET_WINDOW_MS = 60 * 60 * 1000;
const FORGOT_PER_IP = 100;
const RESET_PER_IP = 200;
const RESET_PER_IDENTIFIER_IP = 10;

export const authRouter = Router();
authRouter.use(errorStyle('default'));

interface AuthErrorBody {
  status: number;
  errorCode: string;
  message: string;
  fieldErrors?: unknown;
  googleProfile?: unknown;
  timestamp: string;
}

function authError(res: Response, status: number, errorCode: string, message: string, extra: Partial<AuthErrorBody> = {}): void {
  const body: AuthErrorBody = { status, errorCode, message, ...extra, timestamp: nowLocal() };
  res.status(status).json(body);
}

const tooManyRequests = (res: Response) =>
  authError(res, 429, 'TOO_MANY_REQUESTS', 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.');

const identifierKey = (identifier: string | null | undefined) => (identifier ?? '').trim().toLowerCase();

/** Khóa "định danh|IP" — mỗi IP có bộ đếm riêng cho một định danh. */
const identifierIpKey = (identifier: string | null | undefined, req: Request) => `${identifierKey(identifier)}|${req.ip}`;

/**
 * Trước khi kiểm tra mật khẩu: trần theo IP (đếm mọi lần) và chặn khi định danh đã sai quá nhiều lần. Trả true nếu bị chặn
 * (đã ghi phản hồi 429).
 */
function loginThrottled(req: Request, res: Response, action: string, identifier: string | null | undefined): boolean {
  try {
    rateLimiter.check(req.ip, action, LOGIN_PER_IP, LOGIN_WINDOW_MS);
  } catch {
    tooManyRequests(res);
    return true;
  }
  const id = identifierKey(identifier);
  if (!id) return false;
  if (
    rateLimiter.isBlocked(`${action}:fail-id-ip`, identifierIpKey(identifier, req), LOGIN_FAILURES_PER_IDENTIFIER_IP) ||
    rateLimiter.isBlocked(`${action}:fail-id`, id, LOGIN_FAILURES_PER_IDENTIFIER)
  ) {
    tooManyRequests(res);
    return true;
  }
  return false;
}

function loginFailed(req: Request, action: string, identifier: string | null | undefined): void {
  const id = identifierKey(identifier);
  if (!id) return;
  rateLimiter.recordFailure(`${action}:fail-id-ip`, identifierIpKey(identifier, req), LOGIN_WINDOW_MS);
  rateLimiter.recordFailure(`${action}:fail-id`, id, LOGIN_WINDOW_MS);
}

function loginSucceeded(req: Request, action: string, identifier: string | null | undefined): void {
  if (identifierKey(identifier)) rateLimiter.reset(`${action}:fail-id-ip`, identifierIpKey(identifier, req));
}

// ---- Cổng Admin / NCC ------------------------------------------------------------------------------------------------

const portalLoginSchema = z.object({
  identifier: z.string({ required_error: 'Email hoặc Số điện thoại là bắt buộc' }).trim().min(1, 'Email hoặc Số điện thoại là bắt buộc'),
  password: z.string({ required_error: 'Mật khẩu là bắt buộc' }).trim().min(1, 'Mật khẩu là bắt buộc'),
});

/** UC-08: Đăng nhập Cổng Quản Trị dành cho Admin và NCC (Provider). */
authRouter.post('/portal/login', async (req, res) => {
  const body = parseBody(portalLoginSchema, req.body);
  if (loginThrottled(req, res, 'portal-login', body.identifier)) return;
  try {
    const response = await accountAuth.login(body.identifier, body.password);
    loginSucceeded(req, 'portal-login', body.identifier);
    res.json(response);
  } catch (err) {
    if (err instanceof accountAuth.BadCredentialsError) {
      loginFailed(req, 'portal-login', body.identifier);
      return authError(res, 401, 'AUTH_INVALID_CREDENTIALS', err.message);
    }
    if (err instanceof accountAuth.AccountInactiveError) return authError(res, 403, 'ACCOUNT_INACTIVE', err.message);
    if (err instanceof accountAuth.ProviderSuspendedError) return authError(res, 403, 'PROVIDER_SUSPENDED', err.message);
    logger.error('Đăng nhập cổng thất bại', { error: (err as Error).message });
    authError(res, 500, 'INTERNAL_SERVER_ERROR', (err as Error).message || 'Lỗi hệ thống máy chủ nội bộ. Vui lòng thử lại sau.');
  }
});

/**
 * Đăng xuất Cổng Quản Trị/NCC: chỉ thu hồi phiên của thiết bị gửi request (mã phiên "sid" trong token), thiết bị khác vẫn
 * đăng nhập. Luôn trả 204 để không lộ trạng thái token. Chỉ token cổng (ADMIN/PROVIDER) mới thu hồi phiên; phiên trang
 * khách (TRAVELER) không thu hồi phiên cổng.
 */
authRouter.post('/portal/logout', async (req, res) => {
  const p = req.principal;
  if (p && p.role !== 'TRAVELER' && p.accountId != null) {
    await accountAuth.logout(p.accountId, req.portalSessionId);
  }
  res.status(204).end();
});

// ---- Trang khách -----------------------------------------------------------------------------------------------------

function toAuthResponse(s: travelerAuth.TravelerSession) {
  return { token: s.token, email: s.email, fullName: s.fullName, picture: s.picture, phone: s.phone };
}

const looseString = z.string().nullish();

const googleLoginSchema = z.object({ idToken: looseString });
const googleRegisterSchema = z.object({
  idToken: looseString,
  firstName: looseString,
  lastName: looseString,
  phone: looseString,
});
const travelerRegisterSchema = z.object({
  fullName: looseString,
  email: looseString,
  phone: looseString,
  password: looseString,
  confirmPassword: looseString,
});
const travelerLoginSchema = z.object({ identifier: looseString, password: looseString });

/** Đăng nhập khách du lịch bằng Google: xác minh ID token phía server rồi cấp JWT hệ thống. */
authRouter.post('/google/login', async (req, res) => {
  const body = parseBody(googleLoginSchema, req.body);
  try {
    const profile = await google.verify(body.idToken);
    res.json(toAuthResponse(await travelerAuth.loginWithGoogle(profile)));
  } catch (err) {
    if (err instanceof travelerAuth.GoogleSignupRequiredError) {
      // 4xx (không phải 200) để bản giao diện cũ còn trong cache báo lỗi thay vì lưu phiên không có token.
      const prefill = travelerAuth.signupPrefill(err.profile);
      return authError(res, 409, 'GOOGLE_SIGNUP_REQUIRED', err.message, {
        googleProfile: { email: prefill.email, firstName: prefill.firstName, lastName: prefill.lastName, picture: prefill.picture },
      });
    }
    if (err instanceof travelerAuth.TravelerInactiveError) return authError(res, 403, 'ACCOUNT_INACTIVE', err.message);
    if (err instanceof travelerAuth.GoogleLinkRefusedError) return authError(res, 409, 'GOOGLE_LINK_REFUSED', err.message);
    if (err instanceof google.InvalidGoogleTokenError) return authError(res, 401, 'GOOGLE_TOKEN_INVALID', err.message);
    logger.error('Đăng nhập Google thất bại', { error: (err as Error).message });
    authError(res, 500, 'GOOGLE_LOGIN_FAILED', 'Không thể đăng nhập bằng Google lúc này. Vui lòng thử lại sau.');
  }
});

/**
 * Bước 2 của lần đầu đăng nhập Google: tạo tài khoản từ form (họ, tên, số điện thoại) rồi cấp JWT. Xác minh lại cùng ID
 * token Google (hiệu lực khoảng 1 giờ) nên không cần mã tạm riêng giữa hai bước.
 */
authRouter.post('/google/register', async (req, res) => {
  const body = parseBody(googleRegisterSchema, req.body);
  try {
    const profile = await google.verify(body.idToken);
    const session = await travelerAuth.registerWithGoogle(profile, body.firstName, body.lastName, body.phone);
    res.status(201).json(toAuthResponse(session));
  } catch (err) {
    if (err instanceof google.InvalidGoogleTokenError) {
      return authError(res, 401, 'GOOGLE_TOKEN_INVALID', 'Phiên đăng nhập Google đã hết hạn. Vui lòng chọn lại tài khoản Google để tiếp tục.');
    }
    if (err instanceof travelerAuth.InvalidRegistrationError) return authError(res, 400, 'VALIDATION_ERROR', err.message);
    if (err instanceof DuplicateFieldsError) return authError(res, 409, 'ACCOUNT_EXISTS', err.reason, { fieldErrors: err.fieldErrors });
    if (err instanceof travelerAuth.TravelerInactiveError) return authError(res, 403, 'ACCOUNT_INACTIVE', err.message);
    if (err instanceof travelerAuth.GoogleLinkRefusedError) return authError(res, 409, 'GOOGLE_LINK_REFUSED', err.message);
    logger.error('Đăng ký Google thất bại', { error: (err as Error).message });
    authError(res, 500, 'GOOGLE_REGISTER_FAILED', 'Không thể tạo tài khoản lúc này. Vui lòng thử lại sau.');
  }
});

/** Đăng ký khách du lịch bằng email + mật khẩu. */
authRouter.post('/traveler/register', async (req, res) => {
  const body = parseBody(travelerRegisterSchema, req.body);
  try {
    const session = await travelerAuth.register(body.fullName, body.email, body.phone, body.password, body.confirmPassword);
    res.status(201).json(toAuthResponse(session));
  } catch (err) {
    if (err instanceof travelerAuth.InvalidRegistrationError) return authError(res, 400, 'VALIDATION_ERROR', err.message);
    if (err instanceof DuplicateFieldsError) return authError(res, 409, 'ACCOUNT_EXISTS', err.reason, { fieldErrors: err.fieldErrors });
    throw err;
  }
});

authRouter.post('/traveler/login', async (req, res) => {
  const body = parseBody(travelerLoginSchema, req.body);
  if (loginThrottled(req, res, 'traveler-login', body.identifier)) return;
  try {
    const session = await travelerAuth.login(body.identifier, body.password);
    loginSucceeded(req, 'traveler-login', body.identifier);
    res.json(toAuthResponse(session));
  } catch (err) {
    if (err instanceof travelerAuth.InvalidTravelerCredentialsError) {
      loginFailed(req, 'traveler-login', body.identifier);
      return authError(res, 401, 'AUTH_INVALID_CREDENTIALS', err.message);
    }
    if (err instanceof travelerAuth.TravelerInactiveError) return authError(res, 403, 'ACCOUNT_INACTIVE', err.message);
    throw err;
  }
});

// ---- Quên / đặt lại mật khẩu -----------------------------------------------------------------------------------------

const forgotSchema = z.object({ identifier: looseString });
const resetSchema = z.object({ identifier: looseString, otp: looseString, newPassword: looseString });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Quên mật khẩu: gửi OTP 6 số qua email. Luôn trả cùng một thông báo dù tài khoản có tồn tại hay không. */
authRouter.post('/forgot-password', async (req, res) => {
  const body = parseBody(forgotSchema, req.body);
  if (!body.identifier || !body.identifier.trim()) {
    return authError(res, 400, 'VALIDATION_ERROR', 'Vui lòng nhập email hoặc số điện thoại tài khoản.');
  }
  try {
    rateLimiter.check(req.ip, 'forgot-password', FORGOT_PER_IP, RESET_WINDOW_MS);
  } catch {
    return tooManyRequests(res);
  }
  // Chưa cấu hình gửi email: nói thật thay vì trả "đã gửi OTP" khiến người dùng chờ email không bao giờ tới. Trả cùng
  // phản hồi cho mọi định danh nên không dò được tài khoản có tồn tại hay không.
  if (!mail.isConfigured()) {
    return void res.status(503).json({
      status: 503,
      errorCode: 'MAIL_NOT_CONFIGURED',
      message:
        'Hệ thống chưa kết nối dịch vụ gửi email nên không gửi được mã OTP. ' +
        'Vui lòng liên hệ quản trị viên hoặc chủ nhà để được đặt lại mật khẩu.',
    });
  }
  const started = Date.now();
  try {
    // requestReset lưu OTP (transaction đã commit khi trả về) rồi trả email đã soạn; gửi ở đây — sau khi connection đã trả
    // về pool — đồng bộ trong request (container serverless không chạy việc nền sau khi trả phản hồi).
    const outgoing = await passwordReset.requestReset(body.identifier);
    await mail.send(outgoing);
  } catch (err) {
    // Không lộ lỗi nội bộ; chỉ ghi log để tránh dò tài khoản qua phản hồi.
    logger.error('forgot-password lỗi', { error: (err as Error).message });
  }
  // Mọi nhánh trả về sau cùng một khoảng tối thiểu, để thời gian phản hồi không cho biết định danh có tồn tại hay không.
  const minMs = Math.max(0, config().passwordReset.minResponseMs);
  const remaining = minMs - (Date.now() - started);
  if (remaining > 0) await sleep(remaining);
  res.json({
    message: `Nếu tài khoản tồn tại và có email, mã OTP đã được gửi. Mã có hiệu lực ${passwordReset.getOtpTtlMinutes()} phút.`,
    otpTtlMinutes: passwordReset.getOtpTtlMinutes(),
    resendAfterSeconds: passwordReset.getCooldownSeconds(),
  });
});

/** Đặt lại mật khẩu bằng OTP đã nhận qua email. */
authRouter.post('/reset-password', async (req, res) => {
  const body = parseBody(resetSchema, req.body);
  try {
    rateLimiter.check(req.ip, 'reset-password', RESET_PER_IP, RESET_WINDOW_MS);
    if (identifierKey(body.identifier)) {
      rateLimiter.checkKey('reset-password:id-ip', identifierIpKey(body.identifier, req), RESET_PER_IDENTIFIER_IP, RESET_WINDOW_MS);
    }
  } catch (err) {
    if (err instanceof HttpError) return tooManyRequests(res);
    throw err;
  }
  try {
    await passwordReset.resetPassword(body.identifier, body.otp, body.newPassword);
    res.json({ message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' });
  } catch (err) {
    if (err instanceof passwordReset.InvalidResetError) return authError(res, 400, 'INVALID_OTP', err.message);
    if (err instanceof IllegalArgumentError) return authError(res, 400, 'VALIDATION_ERROR', err.message);
    throw err;
  }
});
