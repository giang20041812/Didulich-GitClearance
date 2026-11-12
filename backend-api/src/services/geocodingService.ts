import { config } from '../config/env.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Tra tọa độ từ địa chỉ. Hai provider, cấu hình qua app.geocoding.provider:
 *  - VIETMAP (mặc định khi có VIETMAP_API_KEY): Search v3 + Place v3, dữ liệu Việt Nam tốt nhất.
 *  - NOMINATIM (fallback tự động khi chưa có key): OpenStreetMap Nominatim — miễn phí, không cần API key. Theo chính sách của
 *    Nominatim: tối đa 1 yêu cầu/giây, phải gửi User-Agent nhận diện ứng dụng, và phải cache kết quả (cache 500 mục + giới hạn
 *    1 giây giữa các lần gọi đã có sẵn ở lớp này).
 * AUTO (mặc định): dùng VietMap nếu có key, ngược lại dùng Nominatim.
 */

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

const CACHE_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 8000;
const cache = new Map<string, GeocodeResult | null>();
let lastCallAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function activeProvider(): 'VIETMAP' | 'NOMINATIM' {
  const g = config().geocoding;
  const hasKey = g.vietmapApiKey.trim() !== '';
  switch ((g.provider || 'AUTO').trim().toUpperCase()) {
    case 'VIETMAP':
      return 'VIETMAP';
    case 'NOMINATIM':
      return 'NOMINATIM';
    default:
      return hasKey ? 'VIETMAP' : 'NOMINATIM';
  }
}

/** null khi không tìm thấy địa chỉ. */
export async function geocode(address: string): Promise<GeocodeResult | null> {
  const key = address.trim().replace(/\s+/g, ' ').toLowerCase();
  if (cache.has(key)) {
    const hit = cache.get(key)!;
    // Làm mới thứ tự LRU.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  // Mỗi lần gọi nhà cung cấp được tuần tự hóa (synchronized trong bản Java) để tôn trọng giới hạn 1 yêu cầu/giây.
  const run = queue.then(() => call(address.trim()));
  queue = run.catch(() => undefined);
  const result = await run;
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return result;
}

async function call(address: string): Promise<GeocodeResult | null> {
  return activeProvider() === 'VIETMAP' ? callVietMap(address) : callNominatim(address);
}

async function waitForSlot(): Promise<void> {
  const wait = 1000 - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

const invalidResponse = () => new HttpError(502, 'Dịch vụ bản đồ trả về dữ liệu tọa độ không hợp lệ. Bạn có thể nhập tọa độ thủ công.');

async function getJson(url: URL, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: await res.json() };
}

async function callVietMap(address: string): Promise<GeocodeResult | null> {
  const g = config().geocoding;
  if (g.vietmapApiKey.trim() === '') {
    logger.warn('Chưa cấu hình VIETMAP_API_KEY');
    throw new HttpError(503, 'Dịch vụ bản đồ chưa được cấu hình. Bạn có thể nhập tọa độ thủ công.');
  }
  await waitForSlot();
  try {
    const search = new URL(g.vietmapUrl);
    search.searchParams.set('apikey', g.vietmapApiKey);
    search.searchParams.set('text', address);
    const first = await getJson(search, {});
    if (first.status >= 400) return vietMapStatus(first.status);
    const body = first.body;
    if (!Array.isArray(body)) throw invalidResponse();
    if (body.length === 0) return null;
    const hit = body[0] as Record<string, unknown>;
    // Search v3 trả ref_id; tọa độ lấy từ Place v3.
    const refId = typeof hit.ref_id === 'string' ? hit.ref_id : '';
    if (refId.trim() === '') throw invalidResponse();
    const placeUrl = new URL(g.vietmapPlaceUrl);
    placeUrl.searchParams.set('apikey', g.vietmapApiKey);
    placeUrl.searchParams.set('refid', refId);
    const second = await getJson(placeUrl, {});
    if (second.status >= 400) return vietMapStatus(second.status);
    const place = second.body as Record<string, unknown> | null;
    if (place && typeof place.lat === 'number' && typeof place.lng === 'number') {
      const display = typeof hit.display === 'string' ? hit.display : typeof hit.name === 'string' ? hit.name : address;
      if (place.lat >= -90 && place.lat <= 90 && place.lng >= -180 && place.lng <= 180) return { latitude: place.lat, longitude: place.lng, displayName: display };
    }
    throw invalidResponse();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Thông báo lỗi có thể chứa URL (kèm API key) nên chỉ ghi loại lỗi.
    logger.warn('Không gọi được Vietmap API', { type: (err as Error).name });
    throw new HttpError(503, 'Không kết nối được dịch vụ bản đồ. Bạn có thể nhập tọa độ thủ công.');
  } finally {
    lastCallAt = Date.now();
  }
}

function vietMapStatus(status: number): never {
  logger.warn('VietMap API', { status });
  const message =
    status === 401 || status === 403
      ? 'VietMap từ chối quyền truy cập. Hãy kiểm tra API key và quyền Search/Place của key.'
      : status === 423
        ? 'VietMap chưa bật API cho key này hoặc đã hết hạn mức. Hãy dùng Services key có quyền Search/Place và kiểm tra hạn mức trong VietMap Console.'
        : status === 429
          ? 'Dịch vụ bản đồ đang giới hạn lượt gọi. Vui lòng thử lại sau.'
          : `Dịch vụ bản đồ từ chối yêu cầu (HTTP ${status}). Bạn có thể nhập tọa độ thủ công.`;
  throw new HttpError(503, message);
}

/** Nominatim (OpenStreetMap): 1 req/s, User-Agent nhận diện, cache kết quả. accept-language=vi để tên hiển thị tiếng Việt khi có. */
async function callNominatim(address: string): Promise<GeocodeResult | null> {
  const g = config().geocoding;
  await waitForSlot();
  try {
    const url = new URL(g.nominatimUrl);
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('accept-language', 'vi');
    const res = await getJson(url, { 'User-Agent': g.nominatimUserAgent });
    if (res.status >= 400) {
      logger.warn('Nominatim', { status: res.status });
      if (res.status === 429) throw new HttpError(503, 'Dịch vụ bản đồ đang giới hạn lượt gọi. Vui lòng thử lại sau.');
      throw new HttpError(502, `Dịch vụ bản đồ từ chối yêu cầu (HTTP ${res.status}). Bạn có thể nhập tọa độ thủ công.`);
    }
    const body = res.body;
    if (!Array.isArray(body)) throw invalidResponse();
    if (body.length === 0) return null;
    const first = body[0] as Record<string, unknown>;
    if (typeof first.lat !== 'string' || typeof first.lon !== 'string') throw invalidResponse();
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw invalidResponse();
    return { latitude: lat, longitude: lon, displayName: typeof first.display_name === 'string' ? first.display_name : address };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    logger.warn('Không gọi được Nominatim', { type: (err as Error).name });
    throw new HttpError(503, 'Không kết nối được dịch vụ bản đồ. Bạn có thể nhập tọa độ thủ công.');
  } finally {
    lastCallAt = Date.now();
  }
}

/** Chỉ dùng trong test: đặt lại cache và bộ đếm nhịp gọi. */
export function resetGeocoding(): void {
  cache.clear();
  lastCallAt = 0;
}
