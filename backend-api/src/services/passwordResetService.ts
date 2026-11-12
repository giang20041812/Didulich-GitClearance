import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { one, scalar, exec, tx, query } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import { IllegalArgumentError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { compareLocal, nowLocal, plusHours, plusMinutes, plusSeconds } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as passwords from '../security/passwordEncoder.js';
import type { OutgoingMail } from './mailService.js';

/**
 * Quên mật khẩu bằng OTP gửi qua email — dùng chung cho mọi tài khoản (Admin, NCC, khách du lịch).
 *
 * Bảo mật:
 *  - Phản hồi yêu cầu luôn giống nhau dù tài khoản có tồn tại hay không (không lộ tài khoản).
 *  - OTP 6 số, chỉ lưu bản băm, hết hạn sau otpTtlMinutes, tối đa maxAttempts lần nhập sai.
 *  - Giãn cách giữa hai lần gửi và giới hạn số lần gửi mỗi giờ cho mỗi tài khoản.
 *  - Đổi mật khẩu thành công thì mọi OTP còn lại bị vô hiệu.
 */

export const MIN_PASSWORD_LENGTH = 6;

/** OTP sai, hết hạn, hết lượt thử hoặc không tồn tại — thông báo chung để không lộ thông tin. */
export class InvalidResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResetError';
  }
}

/** Tài khoản đã xác định cùng email nhận OTP (NCC đăng nhập bằng SĐT: email liên hệ của cơ sở). */
interface Subject {
  id: number;
  email: string | null;
  displayName: string | null;
  ownEmail: boolean;
}

interface TokenRow {
  id: number;
  accountId: number;
  email: string;
  otpHash: string;
  expiresAt: string;
  attempts: number;
  usedAt: string | null;
  createdAt: string;
}

export const getOtpTtlMinutes = () => config().passwordReset.otpTtlMinutes;
export const getCooldownSeconds = () => config().passwordReset.cooldownSeconds;

/** Tìm tài khoản theo email/SĐT (giống luồng đăng nhập). */
async function resolve(identifier: string | null | undefined): Promise<Subject | null> {
  const id = (identifier ?? '').trim();
  if (!id) return null;
  const account = (await accounts.findByIdentifier(id.toLowerCase())) ?? (await accounts.findByIdentifier(id));
  if (!account) return null;
  let email = account.email;
  const own = email != null && email.trim() !== '';
  if (!own && account.provider) {
    email = account.provider.contactEmail; // NCC đăng nhập bằng SĐT: dùng email liên hệ của cơ sở
  }
  return { id: account.id, email, displayName: account.fullName, ownEmail: own };
}

async function isActive(s: Subject): Promise<boolean> {
  const a = await accounts.findById(s.id);
  return a?.status === 'ACTIVE';
}

async function invalidateAll(accountId: number, now: string): Promise<void> {
  await exec('UPDATE password_reset_token SET used_at = $2 WHERE account_id = $1 AND used_at IS NULL', [accountId, now]);
}

function buildBody(name: string | null, otp: string): string {
  const ttl = getOtpTtlMinutes();
  return (
    `Xin chào ${name && name.trim() ? name : 'bạn'},\n\n` +
    'Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu tài khoản Du Lịch Số.\n\n' +
    `Mã xác nhận của bạn: ${otp}\n\n` +
    `Mã có hiệu lực trong ${ttl} phút và chỉ dùng được một lần. ` +
    'Tuyệt đối không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên Du Lịch Số.\n\n' +
    'Nếu không phải bạn yêu cầu, hãy bỏ qua email này — mật khẩu của bạn vẫn an toàn.\n\n' +
    'Trân trọng,\nDu Lịch Số'
  );
}

/**
 * Phát hành OTP và soạn email chứa OTP. KHÔNG gửi ở đây: trả email đã soạn để bên gọi gửi SAU khi transaction này commit
 * và trả connection về pool (gửi mail có thể mất vài giây). Null khi không có gì để gửi. Không ném lỗi nghiệp vụ và không
 * cho người dùng biết kết quả (tránh dò tài khoản); mọi lý do bỏ qua chỉ được ghi log.
 */
export async function requestReset(identifier: string | null | undefined): Promise<OutgoingMail | null> {
  return tx(async () => {
    const cfg = config().passwordReset;
    const s = await resolve(identifier);
    if (!s) {
      logger.info('Yêu cầu quên mật khẩu cho định danh không tồn tại');
      return null;
    }
    if (!s.email || !s.email.trim()) {
      logger.warn('Tài khoản không có email để gửi OTP', { accountId: s.id });
      return null;
    }
    if (!(await isActive(s))) {
      logger.info('Bỏ qua quên mật khẩu: tài khoản đang bị khóa', { accountId: s.id });
      return null;
    }

    const now = nowLocal();
    const last = await one<TokenRow>('SELECT * FROM password_reset_token WHERE account_id = $1 ORDER BY id DESC LIMIT 1', [s.id]);
    if (last && compareLocal(last.createdAt, plusSeconds(now, -cfg.cooldownSeconds)) > 0) {
      logger.info('Bỏ qua quên mật khẩu: yêu cầu quá nhanh', { accountId: s.id });
      return null;
    }
    const recent = await scalar<number>('SELECT count(*) FROM password_reset_token WHERE account_id = $1 AND created_at > $2', [
      s.id,
      plusHours(now, -1),
    ]);
    if ((recent ?? 0) >= cfg.maxPerHour) {
      logger.warn('Bỏ qua quên mật khẩu: vượt số yêu cầu mỗi giờ', { accountId: s.id, max: cfg.maxPerHour });
      return null;
    }

    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await invalidateAll(s.id, now);
    await insertRow('password_reset_token', {
      accountId: s.id,
      email: s.email,
      otpHash: await passwords.encode(otp),
      expiresAt: plusMinutes(now, cfg.otpTtlMinutes),
      attempts: 0,
      createdAt: now,
    });

    if (cfg.logOtp) logger.warn(`[DEV] OTP đặt lại mật khẩu cho tài khoản #${s.id}: ${otp}`);
    return { to: s.email, subject: 'Mã xác nhận đặt lại mật khẩu — Du Lịch Số', body: buildBody(s.displayName, otp) };
  });
}

/**
 * Đặt lại mật khẩu bằng OTP. Nhập sai được đếm và lưu lại ngay cả khi ném lỗi (tính ở transaction riêng trước khi ném)
 * để không thể thử vô hạn.
 */
export async function resetPassword(identifier: string | null | undefined, otp: string | null | undefined, newPassword: string | null | undefined): Promise<void> {
  const generic = 'Mã OTP không đúng hoặc đã hết hạn. Vui lòng kiểm tra lại hoặc yêu cầu mã mới.';
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new IllegalArgumentError(`Mật khẩu mới tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`);
  }
  const s = await resolve(identifier);
  if (!s) throw new InvalidResetError(generic);

  const maxAttempts = config().passwordReset.maxAttempts;
  const token = await one<TokenRow>('SELECT * FROM password_reset_token WHERE account_id = $1 AND used_at IS NULL ORDER BY id DESC LIMIT 1', [s.id]);
  if (!token) throw new InvalidResetError(generic);

  const now = nowLocal();
  if (compareLocal(token.expiresAt, now) < 0 || token.attempts >= maxAttempts) throw new InvalidResetError(generic);
  const code = (otp ?? '').trim();
  if (!/^\d{6}$/.test(code) || !(await passwords.matches(code, token.otpHash))) {
    await exec('UPDATE password_reset_token SET attempts = attempts + 1 WHERE id = $1', [token.id]);
    throw new InvalidResetError(generic);
  }
  if (!(await isActive(s))) throw new InvalidResetError(generic);

  const hash = await passwords.encode(newPassword);
  await tx(async () => {
    const a = await accounts.findById(s.id);
    if (!a) throw new InvalidResetError(generic);
    const patch: Record<string, unknown> = {
      passwordHash: hash,
      // NFR-SEC-03: đặt lại mật khẩu thu hồi các phiên cũ.
      tokenVersion: a.tokenVersion + 1,
    };
    // OTP gửi tới email của chính tài khoản: nhập đúng OTP chứng minh người dùng giữ email đó.
    if (s.ownEmail && a.emailVerifiedAt == null) patch.emailVerifiedAt = now;
    await updateRow('account', a.id, patch);
    await invalidateAll(s.id, now);
  });
}

/** Dùng trong test: các OTP của một tài khoản. */
export async function _tokensOf(accountId: number): Promise<TokenRow[]> {
  return query<TokenRow>('SELECT * FROM password_reset_token WHERE account_id = $1 ORDER BY id', [accountId]);
}
