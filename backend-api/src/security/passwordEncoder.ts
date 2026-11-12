import bcrypt from 'bcryptjs';

/** BCrypt (cost 10) — cùng định dạng hash với BCryptPasswordEncoder của Spring Security, nên mật khẩu hiện có vẫn đăng nhập được. */
const COST = 10;

export function encode(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function matches(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Chỉ chấp nhận BCrypt. Tài khoản seed chưa có mật khẩu / bị vô hiệu mang marker ("{seed-pending}", "{disabled}") không
 * bao giờ so khớp như plain text.
 */
export async function checkPassword(plain: string | null | undefined, storedHash: string | null | undefined): Promise<boolean> {
  if (!storedHash || plain == null) return false;
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    return matches(plain, storedHash);
  }
  return false;
}
