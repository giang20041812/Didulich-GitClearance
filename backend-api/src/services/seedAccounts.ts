import { config } from '../config/env.js';
import { tx } from '../db/pool.js';
import { isDataIntegrityViolation } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as passwords from '../security/passwordEncoder.js';

/**
 * Đặt mật khẩu cho tài khoản được nạp bằng script SQL.
 *
 * Script SQL không chứa hash BCrypt nào. Thay vào đó tài khoản được insert với {@link PENDING_HASH}; khi ứng dụng khởi
 * động với biến môi trường APP_SEED_INITIAL_PASSWORD, các tài khoản này được băm bằng BCrypt, nên mật khẩu đăng nhập luôn
 * đúng bằng giá trị đã cấu hình. Chưa cấu hình thì tài khoản không đăng nhập được (marker không phải BCrypt).
 *
 * Nếu DB chưa có ADMIN nào đang hoạt động và tài khoản APP_SEED_ADMIN_EMAIL chưa tồn tại, tạo ADMIN đó với mật khẩu khởi
 * tạo. Hai instance khởi động cùng lúc có thể cùng thấy "chưa có ADMIN": bản ghi tạo sau vi phạm unique email, được bỏ qua.
 * Mật khẩu không bao giờ được ghi ra log. Mọi lỗi ở đây chỉ ghi log, không chặn ứng dụng khởi động.
 */

/** Giá trị password_hash của tài khoản seed chưa được đặt mật khẩu. Không phải định dạng BCrypt. */
export const PENDING_HASH = '{seed-pending}';
const MIN_LENGTH = 8;

export async function runSeedAccounts(): Promise<void> {
  try {
    await seed();
  } catch (err) {
    // Tiến trình có thể bị dừng giữa lúc khởi động hoặc DB tạm lỗi: lần khởi động sau thử lại.
    logger.warn('[SeedAccount] Bỏ qua bước khởi tạo tài khoản', { error: (err as Error).message });
  }
}

async function seed(): Promise<void> {
  const { initialPassword, adminEmail } = config().seed;
  const pending = await accounts.findAllByPasswordHash(PENDING_HASH);
  const needsAdmin = (await accounts.countByRoleAndStatus('ADMIN', 'ACTIVE')) === 0;
  if (pending.length === 0 && !needsAdmin) return;

  if (!initialPassword.trim()) {
    logger.warn(
      `[SeedAccount] ${pending.length} tài khoản seed chưa có mật khẩu${needsAdmin ? ' và DB chưa có ADMIN đang hoạt động' : ''}. ` +
        `Đặt APP_SEED_INITIAL_PASSWORD (tối thiểu ${MIN_LENGTH} ký tự) rồi khởi động lại.`,
    );
    return;
  }
  if (initialPassword.length < MIN_LENGTH) {
    logger.warn(`[SeedAccount] APP_SEED_INITIAL_PASSWORD phải có tối thiểu ${MIN_LENGTH} ký tự; bỏ qua việc đặt mật khẩu.`);
    return;
  }

  if (pending.length > 0) {
    await tx(async () => {
      for (const account of pending) await accounts.update(account.id, { passwordHash: await passwords.encode(initialPassword) });
    });
    logger.info('[SeedAccount] Đã đặt mật khẩu khởi tạo', {
      count: pending.length,
      accounts: pending.map((a) => a.email ?? a.phone),
    });
  }

  if (needsAdmin) await createBootstrapAdmin(adminEmail.trim().toLowerCase(), initialPassword);
}

/** Tạo ADMIN khởi tạo; đã tồn tại / instance khác vừa tạo thì bỏ qua. */
async function createBootstrapAdmin(adminEmail: string, initialPassword: string): Promise<void> {
  if (!adminEmail) return;
  if (await accounts.existsByEmail(adminEmail)) {
    // Không tự mở khóa / đặt lại mật khẩu cho tài khoản đã có — chỉ cảnh báo để người vận hành xử lý.
    logger.warn(`[SeedAccount] DB không còn ADMIN nào đang hoạt động nhưng ${adminEmail} đã tồn tại (bị khóa?) — không tạo mới.`);
    return;
  }
  const hash = await passwords.encode(initialPassword);
  try {
    await accounts.insert({
      email: adminEmail,
      passwordHash: hash,
      role: 'ADMIN',
      adminLevel: 1,
      status: 'ACTIVE',
      fullName: 'Quản trị viên',
      tokenVersion: 0,
      createdAt: nowLocal(),
    });
    logger.info(`[SeedAccount] DB chưa có ADMIN đang hoạt động, đã tạo ${adminEmail}. Đăng nhập, đổi mật khẩu rồi xóa APP_SEED_INITIAL_PASSWORD.`);
  } catch (err) {
    if (!isDataIntegrityViolation(err)) throw err;
    // Instance khác khởi động cùng lúc đã tạo trước (vi phạm unique email) — kết quả như mong muốn.
    logger.info(`[SeedAccount] ${adminEmail} vừa được tạo bởi tiến trình khác; bỏ qua.`);
  }
}
