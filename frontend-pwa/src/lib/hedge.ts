/**
 * Gửi bản sao cho request ĐỌC (GET) bị chậm bất thường ("hedged request").
 *
 * Backend chạy Vercel Container Images: mỗi container chỉ xử lý ~1 request một lúc. Khi container ấm đang bận phục vụ
 * người dùng khác, request của ta bị đưa sang một container nguội và phải chờ nó khởi động ~16 giây, dù container ấm
 * thường đã rảnh lại sau ~0,25 giây. Request đọc bình thường xong dưới 1 giây; quá HEDGE_AFTER_MS mà chưa có phản hồi thì
 * gần như chắc đang chờ container nguội → gửi thêm một bản sao (nhiều khả năng vào container ấm), dùng bản nào về trước
 * và hủy bản kia. Một lần dính container nguội từ ~16 giây còn ~2 giây.
 *
 * - Chỉ cho GET (đọc, gửi lại không đổi dữ liệu). Ghi (POST/PUT/PATCH/DELETE) không bao giờ gửi bản sao.
 * - Mỗi request tối đa một bản sao. Bản sao mang thêm tham số `_hedge=1` (backend bỏ qua): Chrome giữ request GET thứ
 *   hai cùng URL lại chờ request đầu xong ("cache lock"), nên bản sao phải khác URL mới thoát được.
 * - Bản sao cũng chậm (cả backend đang nguội, vd sau thời gian không ai dùng) thì tạm ngưng gửi bản sao một lúc để không
 *   đánh thức thêm container vô ích.
 */

/** Tham số đánh dấu bản sao (khác URL để không bị "cache lock" của trình duyệt giữ lại). */
export const HEDGE_PARAM = '_hedge';

/** URL của bản sao: thêm `_hedge=1`. Request (đối tượng) giữ nguyên. */
export function withHedgeParam(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === 'string') return `${input}${input.includes('?') ? '&' : '?'}${HEDGE_PARAM}=1`;
  if (input instanceof URL) { const url = new URL(input); url.searchParams.set(HEDGE_PARAM, '1'); return url; }
  return input;
}

/** Chờ chừng này mà chưa xong thì gửi bản sao (request đọc khi container ấm: ~0,25 giây, nặng nhất ~1 giây). */
export const HEDGE_AFTER_MS = 2000;
/** Bản sao cũng không nhanh hơn → backend đang nguội toàn bộ: ngưng gửi bản sao trong khoảng này. */
const HEDGE_PAUSE_MS = 30_000;

let pausedUntil = 0;

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');

/** Signal có thể là bản "tối giản" của axios (không có addEventListener). */
type SignalLike = { aborted: boolean; reason?: unknown; addEventListener?: AbortSignal['addEventListener']; removeEventListener?: AbortSignal['removeEventListener'] };

/**
 * Chạy `run` (một lần gửi request với signal riêng); quá HEDGE_AFTER_MS chưa xong thì chạy thêm một lần nữa song song.
 * Trả kết quả của lần thành công đầu tiên, hủy lần còn lại. `outer` = signal hủy của nơi gọi (hủy cả hai lần).
 */
export function hedged<T>(run: (signal: AbortSignal, isHedge: boolean) => Promise<T>, outer?: SignalLike | null): Promise<T> {
  if (outer?.aborted) return Promise.reject(abortReason(outer as AbortSignal));
  return new Promise<T>((resolve, reject) => {
    const controllers: AbortController[] = [];
    let settled = false;
    let failures = 0;
    let firstError: unknown;
    let hedgeStartedAt = 0;
    let timer: number | undefined;

    const cleanup = () => {
      window.clearTimeout(timer);
      if (onOuterAbort) outer?.removeEventListener?.('abort', onOuterAbort);
    };
    const onOuterAbort = outer?.addEventListener
      ? () => {
          if (settled) return;
          settled = true;
          cleanup();
          controllers.forEach((c) => c.abort());
          reject(abortReason(outer as AbortSignal));
        }
      : undefined;
    if (onOuterAbort) outer?.addEventListener?.('abort', onOuterAbort, { once: true });

    const launch = (isHedge: boolean) => {
      const controller = new AbortController();
      controllers.push(controller);
      run(controller.signal, isHedge).then(
        (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          controllers.forEach((c) => { if (c !== controller) c.abort(); });
          // Đã gửi bản sao mà lần đầu vẫn về trước, hoặc bản sao cũng phải chờ lâu: backend đang nguội toàn bộ.
          if (hedgeStartedAt && (!isHedge || Date.now() - hedgeStartedAt > HEDGE_AFTER_MS)) {
            pausedUntil = Date.now() + HEDGE_PAUSE_MS;
          }
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          failures += 1;
          if (failures === 1) firstError = error;
          // Còn lần kia đang chạy thì chờ nó; hết thì báo lỗi của lần đầu (không gửi bản sao nữa).
          if (failures < controllers.length) return;
          settled = true;
          cleanup();
          reject(firstError);
        },
      );
    };

    launch(false);
    timer = window.setTimeout(() => {
      if (settled || Date.now() < pausedUntil || outer?.aborted) return;
      hedgeStartedAt = Date.now();
      launch(true);
    }, HEDGE_AFTER_MS);
  });
}
