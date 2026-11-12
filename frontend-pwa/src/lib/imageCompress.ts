/**
 * Thu nhỏ ảnh ngay trên máy trước khi tải lên: ảnh chụp điện thoại thường 3-8MB, vượt giới hạn tải lên (~4MB) và tốn
 * 3G/4G của chủ nhà vùng cao. Cạnh dài tối đa 1920px, JPEG chất lượng 0.82 (~300-800KB) — vẫn nét trên trang khách.
 * Ảnh đã nhỏ giữ nguyên; trình duyệt không đọc được ảnh (VD: HEIC trên Chrome máy tính) thì trả về tệp gốc.
 */
const MAX_EDGE = 1920;
const QUALITY = 0.82;
const ALREADY_SMALL = 700 * 1024;

/** Giới hạn tải lên phía máy chủ (dưới ngưỡng edge Vercel ~4.5MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function decode(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    return { width: bitmap.width, height: bitmap.height, draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h), close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function compressImage(file: File): Promise<File> {
  if (file.size <= ALREADY_SMALL && (file.type === 'image/jpeg' || file.type === 'image/webp')) return file;
  try {
    const image = await decode(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { image.close(); return file; }
    // Ảnh PNG trong suốt: nền trắng thay vì nền đen khi chuyển sang JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    image.draw(ctx, width, height);
    image.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || (blob.size >= file.size && PHOTO_TYPES.includes(file.type))) return file;
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'anh'}.jpg`;
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Lỗi của một ảnh sau khi đã thu nhỏ (sai định dạng / vẫn quá lớn), hoặc null. */
export function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return `“${file.name}” không phải ảnh JPG, PNG hoặc WEBP.`;
  if (file.size > MAX_UPLOAD_BYTES) return `“${file.name}” vẫn lớn hơn 4MB sau khi thu nhỏ — hãy chọn ảnh khác.`;
  return null;
}
