import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { MediaProvider } from '../domain/enums.js';

/**
 * Lưu trữ ảnh: Cloudinary (client tải thẳng bằng chữ ký) hoặc Supabase Storage (tải QUA backend bằng service key nên key
 * không bao giờ lộ ra trình duyệt). Chọn bằng ACTIVE_MEDIA_PROVIDER.
 */

// 4MB: thấp hơn ngưỡng ~4.5MB của Vercel edge để lỗi vượt kích thước do backend trả (thông báo rõ) thay vì 413 thô.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const REVIEW_IMAGE_FORMATS = 'jpg,png,webp';

export interface StoredObject {
  imageId: string;
  url: string;
}

// ---- Supabase Storage -------------------------------------------------------------------------------------------

export function supabaseConfigured(): boolean {
  const s = config().supabase;
  return !!s.url.trim() && !!s.serviceKey.trim();
}

export function supabaseUploadConfig(): Record<string, unknown> {
  return {
    provider: 'SUPABASE',
    uploadUrl: '/api/v1/partner/media/upload-image',
    maxFileBytes: MAX_BYTES,
    allowedTypes: ALLOWED_TYPES,
  };
}

/**
 * Tải ảnh lên bucket và trả về đường dẫn object + URL công khai.
 * @param folder thư mục logic (vd "partner-media", "reviews/VJ-XXX") — ký tự lạ bị thay bằng "-"
 */
export async function uploadImage(data: Buffer, contentType: string | null | undefined, folder: string | null): Promise<StoredObject> {
  const s = config().supabase;
  if (!supabaseConfigured()) throw new IllegalStateError('Chưa cấu hình Supabase Storage (SUPABASE_URL / SUPABASE_SERVICE_KEY).');
  if (!data || data.length === 0) throw new IllegalArgumentError('File rỗng.');
  if (data.length > MAX_BYTES) throw new IllegalArgumentError('Ảnh vượt quá 4MB.');
  const type = (contentType ?? '').toLowerCase();
  if (!ALLOWED_TYPES.includes(type)) throw new IllegalArgumentError('Chỉ nhận ảnh JPG, PNG hoặc WebP.');

  const safeFolder = (folder ?? 'misc').replace(/[^a-zA-Z0-9/_-]/g, '-').replace(/^\/+|\/+$/g, '');
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const objectPath = `${safeFolder}/${crypto.randomUUID()}.${ext}`;
  const base = s.url.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/storage/v1/object/${s.storageBucket}/${objectPath}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': type },
      body: new Uint8Array(data),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new IllegalStateError(`Không tải được ảnh lên Supabase Storage: ${(err as Error).message}`);
  }
  if (Math.floor(res.status / 100) !== 2) {
    logger.warn('Supabase Storage upload lỗi', { status: res.status });
    throw new IllegalStateError(
      `Dịch vụ lưu trữ ảnh từ chối tệp (HTTP ${res.status}). Kiểm tra bucket '${s.storageBucket}' đã tồn tại và ở chế độ Public.`,
    );
  }
  return { imageId: objectPath, url: `${base}/storage/v1/object/public/${s.storageBucket}/${objectPath}` };
}

// ---- Cloudinary ---------------------------------------------------------------------------------------------------

const sha1Hex = (input: string) => crypto.createHash('sha1').update(input, 'utf8').digest('hex');

export function cloudinaryUploadConfig(): Record<string, unknown> {
  const c = config().cloudinary;
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    provider: 'CLOUDINARY',
    cloudName: c.cloudName,
    apiKey: c.apiKey,
    timestamp,
    signature: sha1Hex(`timestamp=${timestamp}${c.apiSecret}`),
  };
}

/**
 * Chữ ký upload có ràng buộc thêm tham số (vd folder, allowed_formats): Cloudinary chỉ nhận upload khi client gửi ĐÚNG các
 * tham số này. Chuỗi ký: tham số (kể cả timestamp) xếp theo alphabet, nối "k=v" bằng "&", rồi nối api secret, băm SHA-1.
 */
export function cloudinarySignedConfig(signedParams: Record<string, string>): Record<string, unknown> {
  const c = config().cloudinary;
  if (!c.apiSecret.trim() || !c.apiKey.trim() || !c.cloudName.trim()) throw new IllegalStateError('Hệ thống chưa cấu hình dịch vụ lưu trữ ảnh.');
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign: Record<string, string> = { ...signedParams, timestamp: String(timestamp) };
  const joined = Object.keys(toSign)
    .sort()
    .map((k) => `${k}=${toSign[k]}`)
    .join('&');
  return {
    provider: 'CLOUDINARY',
    cloudName: c.cloudName,
    apiKey: c.apiKey,
    timestamp,
    signature: sha1Hex(joined + c.apiSecret),
    params: { ...signedParams },
  };
}

// ---- Facade -------------------------------------------------------------------------------------------------------

function activeProvider(): MediaProvider {
  const name = config().media.activeProvider.toUpperCase();
  if (name !== 'CLOUDINARY' && name !== 'SUPABASE') throw new Error(`Active media provider not found or not supported: ${name}`);
  return name;
}

/** Cấu hình tải ảnh của nhà cung cấp đang dùng. */
export function getActiveUploadConfig(): Record<string, unknown> {
  return activeProvider() === 'SUPABASE' ? supabaseUploadConfig() : cloudinaryUploadConfig();
}

/** Cấu hình tải ảnh đánh giá của khách: chữ ký chỉ hợp lệ cho thư mục `folder` và định dạng ảnh jpg/png/webp. */
export function getReviewImageUploadConfig(folder: string): Record<string, unknown> {
  if (activeProvider() === 'CLOUDINARY') return cloudinarySignedConfig({ folder, allowed_formats: REVIEW_IMAGE_FORMATS });
  // Upload qua backend: FE gửi multipart tới endpoint này (đã kiểm tra quyền với đơn ở route).
  return { provider: 'SUPABASE', uploadUrl: '/api/public/bookings/{bookingCode}/review/image' };
}

/** Upload ảnh đánh giá qua backend khi nhà cung cấp lưu trữ là Supabase Storage. */
export async function uploadReviewImageThroughBackend(file: { buffer: Buffer; mimetype: string }, folder: string): Promise<StoredObject> {
  if (activeProvider() !== 'SUPABASE') throw new IllegalStateError('Endpoint này chỉ dùng cho nhà cung cấp lưu trữ Supabase Storage.');
  return uploadImage(file.buffer, file.mimetype, folder);
}

