import { logger } from '../lib/logger.js';

/**
 * Làm nóng cache danh mục công khai ngay khi máy chủ khởi động xong (Vercel mở container mới sau mỗi lần deploy hoặc khi tải tăng): tự
 * gọi HTTP vào chính mình cho các endpoint phổ biến nhất — trang chủ, danh sách chỗ nghỉ trang 1, khu vực, tiện ích, lễ hội. Nhờ đó cache
 * danh mục được nạp sẵn (request đầu tiên tới container mới không phải chờ 5–10 câu SQL qua pooler) và pool kết nối được chạy thử với
 * đường dẫn thật. Chạy nền, không chặn khởi động; lỗi ở bước nào cũng bỏ qua (cache trống thì request thật tự nạp như bình thường).
 */

/** Thứ tự theo tần suất bị gọi: trang chủ trước, tham chiếu ít quan trọng hơn sau cùng. */
const WARM_PATHS = ['/api/public/home', '/api/public/places?page=0&size=12', '/api/public/places/regions', '/api/public/places/amenities', '/api/public/festivals'];

export async function warmUpCatalog(port: number): Promise<void> {
  const started = Date.now();
  let ok = 0;
  for (const path of WARM_PATHS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(15_000) });
      if (response.status === 200) ok++;
      else logger.warn('Warm-up trả về trạng thái lạ', { path, status: response.status });
      await response.arrayBuffer();
    } catch (err) {
      logger.warn('Warm-up thất bại', { path, error: (err as Error).message });
    }
  }
  logger.info('Đã làm nóng cache danh mục', { ok, total: WARM_PATHS.length, ms: Date.now() - started });
}
