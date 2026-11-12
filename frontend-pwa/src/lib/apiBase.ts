import { acquireApiSlot } from './requestQueue';
import { hedged, withHedgeParam } from './hedge';

/**
 * Origin của backend khi frontend gọi API KHÁC domain (vd chạy dev: VITE_API_URL=http://localhost:58080).
 * Bản build production để trống VITE_API_URL / VITE_API_ORIGIN: frontend gọi đường dẫn tương đối "/api/..."
 * cùng domain và vercel.json chuyển tiếp sang backend — không CORS, không preflight OPTIONS.
 * Dev không đặt biến nào thì dùng proxy "/api" của Vite.
 *
 * File này NẠP LÚC BOOT nên tuyệt đối không import axios (service phía traveler dùng fetch; cấu hình axios
 * cho cổng NCC / Admin nằm ở lib/axiosBoot.ts, chỉ tải khi vào portal).
 */
export const API_ORIGIN: string = (
  (import.meta.env.VITE_API_URL as string | undefined) ??
  (import.meta.env.VITE_API_ORIGIN as string | undefined) ??
  ''
).replace(/\/+$/, '').replace(/\/api$/, '');

/** Origin dùng để dựng URL tuyệt đối tới API (cùng domain với trang khi API_ORIGIN trống). */
export const apiOrigin = (): string => API_ORIGIN || window.location.origin;

/** Request có nhắm vào backend của mình không (đường dẫn tương đối, API_ORIGIN hoặc cùng domain). */
export const isTargetingOurApi = (url?: string): boolean => {
  if (!url) return false;
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//')) {
    return true;
  }
  if (API_ORIGIN && url.startsWith(API_ORIGIN)) {
    return true;
  }
  return url.startsWith(window.location.origin);
};

/**
 * Container backend có thể đang khởi động (~15s) hoặc vừa bị thay: lỗi mạng, hết thời gian chờ,
 * 502/503/504 là lỗi tạm thời. Chỉ GET (không đổi dữ liệu) được tự gửi lại, đúng một lần.
 */
export const RETRY_STATUSES = new Set([502, 503, 504]);
export const RETRY_DELAY_MS = 1500;

export const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const isAbortError = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError';

/**
 * fetch trả về ngay khi có header, còn thân phản hồi vẫn đang tải: giữ lượt hàng đợi tới khi tải xong (đọc bản sao) —
 * container backend còn bận gửi tới lúc đó, request kế tiếp gửi sớm hơn sẽ bị đưa sang container nguội.
 */
const bodyDownloaded = async (response: Response): Promise<Response> => {
  try {
    await response.clone().arrayBuffer();
  } catch {
    // Lỗi đọc thân (hủy, mạng) để nơi gọi tự xử lý khi đọc response.
  }
  return response;
};

export const installApiBase = () => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let urlStr = '';
    if (typeof input === 'string') urlStr = input;
    else if (input instanceof URL) urlStr = input.toString();
    else if (input && typeof (input as Request).url === 'string') urlStr = (input as Request).url;

    const target = API_ORIGIN && typeof input === 'string' && input.startsWith('/api/') ? `${API_ORIGIN}${input}` : input;
    if (!isTargetingOurApi(urlStr)) return nativeFetch(target, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    // Request gửi lúc đóng trang (keepalive, vd thu hồi phiên) không chờ hàng: trang có thể đã đóng trước khi tới lượt.
    if (init?.keepalive) return nativeFetch(target, init);

    const release = await acquireApiSlot(init?.priority === 'low' ? 'low' : 'high', signal);
    try {
      if (method !== 'GET') return await bodyDownloaded(await nativeFetch(target, init));
      // GET chậm bất thường (đang chờ container nguội) → gửi thêm một bản sao, dùng bản về trước (lib/hedge.ts).
      // Bản thắng đã tải xong thân phản hồi (bodyDownloaded) trước khi hủy bản kia.
      const getOnce = () => hedged((s, isHedge) =>
        nativeFetch(isHedge ? withHedgeParam(target) : target, { ...init, signal: s }).then(bodyDownloaded), signal);
      try {
        const response = await getOnce();
        if (!RETRY_STATUSES.has(response.status) || signal?.aborted) return response;
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) throw err;
      }
      await wait(RETRY_DELAY_MS);
      return await getOnce();
    } finally {
      release();
    }
  };
};
