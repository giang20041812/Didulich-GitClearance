import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Mã truy cập riêng của từng đơn đặt phòng (API công khai /api/public/bookings/{code}/**). Mã gốc (32 byte ngẫu nhiên,
 * base64url) chỉ trả cho khách một lần lúc đặt; DB chỉ lưu SHA-256 dạng hex.
 */

const TOKEN_BYTES = 32;
/** Độ dài tối đa chấp nhận từ header — chặn chuỗi rác quá dài trước khi băm. */
export const MAX_TOKEN_LENGTH = 128;

export const generate = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

export const hash = (rawToken: string): string => createHash('sha256').update(rawToken, 'utf8').digest('hex');

/** So khớp mã khách gửi với hash đã lưu, thời gian so sánh không phụ thuộc vị trí ký tự sai. */
export function matches(rawToken: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!rawToken || rawToken.trim() === '' || rawToken.length > MAX_TOKEN_LENGTH || !storedHash || storedHash.trim() === '') return false;
  const expected = Buffer.from(storedHash.toLowerCase(), 'ascii');
  const actual = Buffer.from(hash(rawToken.trim()), 'ascii');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
