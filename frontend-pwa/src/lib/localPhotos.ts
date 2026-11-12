import { useEffect, useRef } from 'react';
import { compressImage, photoProblem } from '@/lib/imageCompress';

/** Ảnh mới chọn, mới chỉ nằm trên máy (xem trước bằng object URL) — chưa tải lên kho lưu trữ. */
export interface LocalPhoto { key: string; file: File; preview: string }

let seq = 0;

/** Thu nhỏ + kiểm tra các tệp vừa chọn; tệp lỗi báo qua onError và bị bỏ qua. */
export async function toLocalPhotos(files: FileList | File[], onError: (message: string) => void): Promise<LocalPhoto[]> {
  const out: LocalPhoto[] = [];
  for (const original of Array.from(files)) {
    const file = await compressImage(original);
    const problem = photoProblem(file);
    if (problem) { onError(problem); continue; }
    seq += 1;
    out.push({ key: `${Date.now()}-${seq}`, file, preview: URL.createObjectURL(file) });
  }
  return out;
}

export function releasePhotos(photos: LocalPhoto[]) {
  photos.forEach((p) => URL.revokeObjectURL(p.preview));
}

/** Giải phóng ảnh xem trước còn lại khi rời màn hình (tránh rò bộ nhớ trên điện thoại). */
export function usePhotoCleanup(photos: LocalPhoto[]) {
  const latest = useRef(photos);
  useEffect(() => { latest.current = photos; }, [photos]);
  useEffect(() => () => releasePhotos(latest.current), []);
}
