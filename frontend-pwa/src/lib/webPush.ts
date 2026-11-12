/**
 * API đăng ký đẩy của một loại tài khoản (Admin: /api/v1/admin/notifications/push, NCC: /api/v1/partner/notifications/push,
 * khách du lịch — nhắc giờ lịch trình: /api/v1/traveler/push).
 */
export interface PushApi {
  getPushPublicKey(): Promise<string>;
  subscribePush(subscription: PushSubscriptionJSON): Promise<void>;
  unsubscribePush(endpoint: string): Promise<void>;
}

/**
 * Thông báo đẩy (Web Push qua service worker — public/push-sw.js) cho cổng Admin, cổng NCC và khách du lịch. Mỗi thiết
 * bị một đăng ký, gắn với tài khoản đang đăng nhập của API truyền vào {@code api}.
 * - on: thiết bị này đã đăng ký, thông báo hiện ra ngoài màn hình kể cả khi đóng tab.
 * - off: hỗ trợ nhưng chưa bật · denied: người dùng đã chặn quyền thông báo trong trình duyệt.
 * - ios-install: iPhone/iPad chỉ nhận thông báo đẩy khi web được "Thêm vào màn hình chính".
 * - unsupported: trình duyệt không hỗ trợ.
 */
export type PushState = 'on' | 'off' | 'denied' | 'ios-install' | 'unsupported';

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Service worker đang hoạt động (chờ tối đa 4 giây — dev server có thể đăng ký chậm). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getPushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Xin quyền rồi đăng ký nhận đẩy cho thiết bị này. Trả về trạng thái sau cùng. */
export async function enablePush(api: PushApi): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) throw new Error('Trình duyệt chưa sẵn sàng (service worker). Hãy tải lại trang rồi thử lại.');

  const publicKey = await api.getPushPublicKey();
  const key = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Đăng ký cũ gắn với khóa máy chủ khác (máy chủ đổi khóa VAPID) thì đăng ký lại.
  const oldKey = sub?.options.applicationServerKey;
  if (sub && oldKey && !sameBytes(new Uint8Array(oldKey), key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.subscribePush(sub.toJSON());
  return 'on';
}

export async function disablePush(api: PushApi): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.unsubscribePush(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe();
  }
  return getPushState();
}

/**
 * Chỉ gỡ đăng ký của thiết bị này khỏi tài khoản của {@code api} — giữ đăng ký của trình duyệt vì cùng một đăng ký có thể
 * đang nhận thông báo của tài khoản khác trên máy này (vd khách du lịch tắt nhắc giờ không làm mất đẩy của cổng NCC).
 */
export async function disablePushRegistration(api: PushApi): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await api.unsubscribePush(sub.endpoint);
}

/**
 * Hiện thông báo hệ thống từ chính trang (dùng khi thiết bị chưa bật đẩy nhưng đã cho phép thông báo).
 * Android chỉ cho hiện qua service worker nên ưu tiên registration.showNotification.
 */
export async function showLocalNotification(title: string, body: string, url: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, tag, icon: '/pwa-192x192.png', badge: '/favicon-32.png', data: { url } };
  const reg = await registration();
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
