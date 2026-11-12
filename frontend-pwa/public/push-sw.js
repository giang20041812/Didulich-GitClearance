/*
 * Thông báo đẩy cho cổng Admin, cổng NCC và khách du lịch (nhắc giờ tham quan theo lịch trình) — được service worker do
 * Workbox sinh ra nạp qua importScripts (vite.config.ts). Nhận push từ backend (WebPushService) rồi hiện thông báo hệ
 * thống ngoài màn hình, kể cả khi đã đóng tab.
 * Bấm thông báo: đưa cửa sổ đang mở của đúng nơi (cổng /admin, /partner hoặc trang khách) lên trước và mở trang đích
 * (vd đúng đơn đặt phòng, tab lịch trình kèm cẩm nang điểm đến), không có thì mở cửa sổ mới.
 */
const areaOf = (url) => {
  const path = new URL(url, self.location.origin).pathname;
  if (path.startsWith('/partner')) return 'partner';
  if (path.startsWith('/admin')) return 'admin';
  return 'traveler';
};

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'VietTrek', body: event.data ? event.data.text() : '' };
  }
  const url = data.url || '/admin';
  const area = areaOf(url);
  const title = data.title || (area === 'partner' ? 'VietTrek — Nhà cung cấp' : area === 'admin' ? 'VietTrek — Quản trị' : 'VietTrek');
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: '/pwa-192x192.png',
    badge: '/favicon-32.png',
    vibrate: [180, 80, 180],
    requireInteraction: /sos/i.test(data.tag || ''),
    data: { url },
  };
  event.waitUntil(
    self.registration.showNotification(title, options).then(() =>
      // Báo cho các tab đang mở của khu vực đó tải lại chuông / số đếm ngay.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: area + '-push', payload: data }));
      }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/admin', self.location.origin).href;
  const area = areaOf(target);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => areaOf(c.url) === area);
      if (open) {
        // Cổng Admin tự chuyển mục khi nhận tin nhắn; cổng NCC và trang khách điều hướng thẳng tới trang đích.
        if (area === 'admin') {
          open.postMessage({ type: 'admin-push-open', url: target });
          return open.focus();
        }
        return open.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : self.clients.openWindow(target)));
      }
      return self.clients.openWindow(target);
    }),
  );
});
