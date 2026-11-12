/**
 * Hàng đợi request tới backend của mình (/api/...).
 *
 * Backend chạy Vercel Container Images: request ĐỒNG THỜI được đưa vào container riêng, container mới khởi động
 * nguội ~15 giây (đo trên production: 6 request song song → 1 request 0,4 giây, 5 request 16–18 giây). Gửi lần lượt thì
 * mọi request đi vào container đang ấm (~0,25 giây mỗi request; bản CDN đã cache ~0,15 giây).
 *
 * - 07/10/2026: backend-api/vercel.json có 2 cron giữ ấm mỗi phút (/cron/tick + /keepalive-b) nên thường có
 *   ≥ 2 container ấm; đo trên production 2 request song song tới API chưa cache đều 0,3–0,8 giây — vì vậy cho
 *   phép MAX_IN_FLIGHT = 2 (các trang cần nhiều API như cổng NCC / Admin nhanh gần gấp đôi). Vượt 2 request
 *   đồng thời vẫn rơi vào container nguội; lib/hedge.ts (bản sao sau 2 giây) che phần còn lại.
 * - Request ưu tiên thấp (prefetch, polling, dữ liệu phụ) chỉ được gửi khi không còn request thường nào chờ.
 * - Request bị hủy (AbortSignal) khi đang chờ thì rời hàng ngay.
 * - Một request giữ lượt quá HOLD_LIMIT_MS (upload chậm, mạng treo) thì trả lượt cho request sau, không chặn cả trang.
 */

export type ApiPriority = 'high' | 'low';

declare module 'axios' {
  // Phải khai báo đúng tham số kiểu như axios để gộp interface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface AxiosRequestConfig<D = any, P = any> {
    /** 'low' = chỉ gửi khi không còn request thường đang chờ (prefetch, polling, dữ liệu phụ). */
    apiPriority?: ApiPriority;
    /** false = không gửi bản sao khi GET chậm (lib/hedge.ts), vd API gọi dịch vụ ngoài có giới hạn tần suất. */
    apiHedge?: boolean;
  }
}

const MAX_IN_FLIGHT = 2;
const HOLD_LIMIT_MS = 20_000;

interface Waiter {
  grant: (release: () => void) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal | null;
  onAbort?: () => void;
}

let inFlight = 0;
const queues: Record<ApiPriority, Waiter[]> = { high: [], low: [] };

const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');

function grant(waiter: Waiter) {
  if (waiter.onAbort) waiter.signal?.removeEventListener?.('abort', waiter.onAbort);
  inFlight += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    window.clearTimeout(timer);
    inFlight -= 1;
    pump();
  };
  const timer = window.setTimeout(release, HOLD_LIMIT_MS);
  waiter.grant(release);
}

function pump() {
  while (inFlight < MAX_IN_FLIGHT) {
    const next = queues.high.shift() ?? queues.low.shift();
    if (!next) return;
    grant(next);
  }
}

/** Chờ tới lượt gửi request; gọi hàm trả về khi đã nhận phản hồi (hoặc lỗi) để nhường lượt. */
export function acquireApiSlot(priority: ApiPriority = 'high', signal?: AbortSignal | null): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const waiter: Waiter = { grant: resolve, reject, signal };
    // axios cho phép signal "tối giản" không có addEventListener: khi đó chỉ không rời hàng sớm được.
    if (signal && typeof signal.addEventListener === 'function') {
      waiter.onAbort = () => {
        const queue = queues[priority];
        const index = queue.indexOf(waiter);
        if (index >= 0) queue.splice(index, 1);
        reject(abortError(signal));
      };
      signal.addEventListener('abort', waiter.onAbort, { once: true });
    }
    queues[priority].push(waiter);
    // Request ưu tiên thấp nhường một nhịp: request thường mà trang gửi cùng lúc (cùng lượt render) được đi trước,
    // dù component gửi request phụ (chuông thông báo, bộ lọc...) chạy effect sớm hơn.
    if (priority === 'low') window.setTimeout(pump, 0);
    else pump();
  });
}
