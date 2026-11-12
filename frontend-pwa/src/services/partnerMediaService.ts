import axios from 'axios';
import type { MediaDto } from '@/types/partner';

const config = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('portal_token') ?? ''}` } });

/** Chủ thể gắn ảnh: cả Homestay, hoặc một loại phòng của Homestay. */
export type MediaTarget = { placeId: number; roomId?: number };

const base = ({ placeId, roomId }: MediaTarget) =>
  roomId == null ? `/api/v1/partner/homestays/${placeId}/media` : `/api/v1/partner/homestays/${placeId}/rooms/${roomId}/media`;

interface CloudinaryUploadConfig {
  provider: string;
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  signature?: string;
  /** Nhà cung cấp Supabase Storage (mã nguồn mở, miễn phí): upload multipart qua backend. */
  uploadUrl?: string;
}

/**
 * Upload ảnh theo nhà cung cấp lưu trữ đang bật:
 * - CLOUDINARY: đẩy thẳng lên Cloudinary bằng chữ ký backend cấp.
 * - SUPABASE: gửi multipart qua backend (service key không lộ ra trình duyệt).
 */
async function uploadImage(file: File): Promise<{id: string, url: string}> {
  const cfg = (await axios.post<CloudinaryUploadConfig>('/api/v1/partner/media/direct-upload', null, config())).data;

  if (cfg.provider === 'SUPABASE') {
    const form = new FormData();
    form.append('file', file);
    const res = await axios.post<{ imageId: string; url: string }>(cfg.uploadUrl ?? '/api/v1/partner/media/upload-image', form, {
      ...config(),
      headers: { ...config().headers, 'Content-Type': 'multipart/form-data' },
    });
    return { id: res.data.imageId, url: res.data.url };
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', cfg.apiKey!);
  form.append('timestamp', String(cfg.timestamp ?? ''));
  form.append('signature', cfg.signature!);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: form,
  });
  
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as any;
    throw new Error(err?.error?.message || 'Lỗi khi tải ảnh lên dịch vụ lưu trữ.');
  }
  
  const result = await response.json();
  return { id: result.public_id, url: result.secure_url };
}

export const partnerMediaService = {
  /** Chỉ tải ảnh lên kho lưu trữ (chưa gắn vào đâu) — dùng cho luồng đăng Homestay, gắn ảnh khi gửi một lần. */
  async uploadToStorage(file: File): Promise<{ imageId: string; url: string }> {
    const { id, url } = await uploadImage(file);
    return { imageId: id, url };
  },
  async list(target: MediaTarget) {
    return (await axios.get<MediaDto[]>(base(target), config())).data;
  },
  async upload(target: MediaTarget, file: File) {
    const { id, url } = await uploadImage(file);
    return (await axios.post<MediaDto[]>(base(target), { imageId: id, url }, config())).data;
  },
  async setCover(target: MediaTarget, mediaId: number) {
    return (await axios.put<MediaDto[]>(`${base(target)}/${mediaId}/cover`, null, config())).data;
  },
  async remove(target: MediaTarget, mediaId: number) {
    return (await axios.delete<MediaDto[]>(`${base(target)}/${mediaId}`, config())).data;
  },
};
