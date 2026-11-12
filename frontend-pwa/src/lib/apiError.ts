import type { FieldError } from '@/types/user';

/**
 * Nhận dạng lỗi axios mà KHÔNG import axios: file này nằm trên đường tải của trang đăng ký / đăng nhập
 * (bundle chính) còn axios chỉ còn ở chunk cổng NCC / Admin. Lỗi axios luôn có isAxiosError === true
 * (axios tự gắn cờ này khi tạo lỗi), còn Response fetch không bao giờ có.
 */
const isAxiosErrorLike = (err: unknown): err is { response?: { status?: number; data?: unknown } } =>
  !!err && typeof err === 'object' && (err as { isAxiosError?: unknown }).isAxiosError === true;

/** Lấy thông báo lỗi do server trả về ({message}) để hiển thị; rơi về câu mặc định nếu không có. */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosErrorLike(err)) {
    const data: unknown = err.response?.data;
    if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
    if (!err.response) return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng.';
  }
  return fallback;
}

/** Đọc danh sách lỗi theo trường ({fieldErrors: [{field, message}]}) từ body lỗi; bỏ qua phần tử sai định dạng. */
export function parseFieldErrors(data: unknown): FieldError[] {
  if (!data || typeof data !== 'object' || !('fieldErrors' in data)) return [];
  const list = (data as { fieldErrors?: unknown }).fieldErrors;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const { field, message } = item as { field?: unknown; message?: unknown };
    return typeof field === 'string' && typeof message === 'string' ? [{ field, message }] : [];
  });
}

/** Lỗi theo trường từ một lỗi gọi API (axios); rỗng nếu server không trả về. */
export function getApiFieldErrors(err: unknown): FieldError[] {
  return isAxiosErrorLike(err) ? parseFieldErrors(err.response?.data) : [];
}
