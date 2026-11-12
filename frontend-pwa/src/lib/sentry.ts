/**
 * Sentry cho frontend — nạp LƯỜI (dynamic import) và chỉ khi có biến VITE_SENTRY_DSN:
 * - Không đặt biến → không tải SDK, không gửi gì, không tốn byte lượt tải đầu (chunk riêng).
 * - Đặt biến (Vercel → Settings → Environment Variables → VITE_SENTRY_DSN) → SDK tải nền sau khi trang
 *   hiện xong, bắt lỗi JS + hiệu năng (web vitals).
 *
 * Sentry backend (Spring): xem loadtest/README.md mục Giám sát — cần SENTRY_DSN của server, cân nhắc
 * thêm dependency sentry-spring-boot-starter-jakarta khi cần lỗi backend về Sentry.
 */
export function initSentryLazy(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || typeof window === 'undefined') return;

  const init = () => {
    void import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        // SPA: bám theo router để phân tích hiệu năng theo trang.
        integrations: [Sentry.browserTracingIntegration()],
        tracesSampleRate: 0.2,
      });
    }).catch(() => undefined);
  };

  if (document.readyState === 'complete') {
    window.setTimeout(init, 0);
  } else {
    window.addEventListener('load', () => window.setTimeout(init, 0), { once: true });
  }
}
