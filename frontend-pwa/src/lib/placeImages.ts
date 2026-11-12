/**
 * Chọn ảnh hiển thị cho địa điểm / homestay / đặc sản.
 *
 * Ảnh luôn lấy từ dữ liệu của chính địa điểm đó (do nhà cung cấp tải lên, hoặc ảnh có giấy phép mở
 * đã kiểm tra cho dữ liệu mẫu — xem trang /nguon-anh). Không đoán ảnh theo tên: ảnh "gần đúng" của
 * nơi khác còn tệ hơn không có ảnh. Khi không có ảnh thật, trả undefined để giao diện hiện ô trống.
 */

/** URL ảnh tạm (picsum, placeholder, svg "ảnh đang cập nhật"...) hoặc rỗng. */
export function isPlaceholderOrGenericUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('picsum.photos') ||
    lower.includes('placeholder') ||
    lower.includes('data:image/svg') ||
    lower.endsWith('.svg') ||
    lower.includes('diem-den.jpg') ||
    lower.includes('dac-san.jpg') ||
    lower.includes('avatar-placeholder')
  );
}

/** Ảnh thật của địa điểm, hoặc undefined nếu chỉ có ảnh tạm. */
export function resolvePlacePhoto(currentUrl?: string | null): string | undefined {
  return currentUrl && !isPlaceholderOrGenericUrl(currentUrl) ? currentUrl : undefined;
}
