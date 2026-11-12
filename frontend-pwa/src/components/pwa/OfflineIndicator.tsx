import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Chỉ báo mất kết nối mạng — quan trọng với du khách vùng núi (Mù Cang Chải, Lào Cai)
 * nơi sóng WiFi/4G chập chờn: khi mất mạng, hiện ngay thanh thông báo để khách biết
 * đang xem bản đã lưu và thao tác đặt phòng cần chờ có mạng. Có mạng lại thì báo
 * ngắn rồi tự ẩn sau 3 giây.
 */
export default function OfflineIndicator() {
  const [offline, setOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const [justBackOnline, setJustBackOnline] = useState(false);

  useEffect(() => {
    const goOffline = () => { setOffline(true); setJustBackOnline(false); };
    const goOnline = () => { setOffline(false); setJustBackOnline(true); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    if (!justBackOnline) return;
    const t = setTimeout(() => setJustBackOnline(false), 3000);
    return () => clearTimeout(t);
  }, [justBackOnline]);

  if (!offline && !justBackOnline) return null;

  if (offline) {
    return (
      <div role="alert" aria-live="assertive"
        className="fixed inset-x-0 top-0 z-[999] flex items-center justify-center gap-2 bg-[#1d2d4f] px-4 py-2 text-xs font-bold text-white shadow-lg md:text-sm">
        <WifiOff className="h-4 w-4 shrink-0" />
        Mất kết nối mạng — bạn đang xem nội dung đã lưu. Vui lòng chờ có mạng để đặt phòng.
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-0 top-0 z-[999] flex items-center justify-center gap-2 bg-primary px-4 py-2 text-xs font-bold text-white shadow-lg md:text-sm">
      <Wifi className="h-4 w-4 shrink-0" />
      Đã có mạng trở lại
    </div>
  );
}
