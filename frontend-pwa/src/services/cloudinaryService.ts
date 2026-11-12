import { apiOrigin } from '@/lib/apiBase';
import { bookingAuthHeaders } from '@/services/bookingService';

export interface CloudinaryUploadConfig {
  provider: string;
  /** Nhà cung cấp Supabase Storage: upload multipart qua backend thay vì chữ ký Cloudinary. */
  uploadUrl?: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  /** Tham số đã được ký (vd folder, allowed_formats) — phải gửi nguyên văn, nếu không Cloudinary từ chối chữ ký. */
  params?: Record<string, string>;
}

/**
 * Tải ảnh đánh giá của một đơn lên Cloudinary bằng chữ ký do backend cấp.
 * Backend chỉ cấp chữ ký cho người có quyền với đơn (mã truy cập đơn hoặc tài khoản khách đã đặt đơn).
 */
export async function uploadReviewImageToCloudinary(file: File, bookingCode: string): Promise<{id: string, url: string}> {
  // 1. Get upload config from backend
  const configUrl = new URL(
    `/api/public/bookings/${encodeURIComponent(bookingCode)}/review/upload-config`,
    apiOrigin()
  );
  const res = await fetch(configUrl.toString(), { headers: bookingAuthHeaders(bookingCode) });
  if (!res.ok) {
    let message = 'Không thể lấy cấu hình tải ảnh từ hệ thống.';
    try {
      const err = (await res.json()) as { message?: string };
      if (err.message) message = err.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const config = (await res.json()) as CloudinaryUploadConfig;

  // Supabase Storage (mã nguồn mở): upload multipart qua backend, kèm chứng minh quyền với đơn.
  if (config.provider === 'SUPABASE') {
    const uploadUrl = new URL(
      (config.uploadUrl ?? '/api/public/bookings/{bookingCode}/review/image')
        .replace('{bookingCode}', encodeURIComponent(bookingCode)),
      apiOrigin()
    ).toString();
    const form = new FormData();
    form.append('file', file);
    const upRes = await fetch(uploadUrl, { method: 'POST', body: form, headers: bookingAuthHeaders(bookingCode) });
    if (!upRes.ok) {
      let msg = `Upload ảnh thất bại (HTTP ${upRes.status})`;
      try { msg = ((await upRes.json()) as { message?: string }).message ?? msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const out = (await upRes.json()) as { imageId: string; url: string };
    return { id: out.imageId, url: out.url };
  }

  const { cloudName, apiKey, timestamp, signature } = config;

  if (!cloudName || !apiKey || !signature) {
    throw new Error('Cấu hình Cloudinary không hợp lệ.');
  }

  // 2. Prepare FormData
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  for (const [key, value] of Object.entries(config.params ?? {})) {
    formData.append(key, value);
  }

  // 3. Upload directly to Cloudinary
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    let errMsg = `Upload ảnh thất bại (HTTP ${uploadRes.status})`;
    try {
      const errJson = (await uploadRes.json()) as { error?: { message?: string } };
      if (errJson?.error?.message) {
        errMsg = errJson.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const result = (await uploadRes.json()) as { public_id: string; secure_url: string };
  return { id: result.public_id, url: result.secure_url };
}
