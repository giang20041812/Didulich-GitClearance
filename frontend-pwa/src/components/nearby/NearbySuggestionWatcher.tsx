import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, X } from 'lucide-react';
import { formatDistance } from '@/lib/distance';
import { mediaUrl } from '@/lib/mediaUrl';
import { suggestionsAt, type NearbyHit } from '@/lib/nearbyMatch';
import { placeDetailPath } from '@/lib/placeRoutes';
import { markShown, setNearbySuggestions, useNearbySuggestions, wasShownToday } from '@/lib/nearbyPrefs';
import { formatVnd } from '@/lib/serviceGroups';
import { fetchNearbySuggestions } from '@/services/publicServicesApi';
import nearbyImage from '@/assets/fluent/nearby.webp';
import type { NearbySuggestions } from '@/types/nearby';

/**
 * "Gợi ý quanh đây": khi khách đã bật (menu ☰), theo dõi vị trí NGAY TRÊN MÁY; tới gần một điểm nổi tiếng (vd Sống Lưng
 * Khủng Long) thì hiện thẻ gợi ý các địa điểm của nhà cung cấp quanh đó — mỗi điểm một lần mỗi ngày. Vị trí không gửi
 * lên máy chủ: ứng dụng chỉ tải danh sách điểm mốc + gợi ý rồi tự tính khoảng cách.
 */
export default function NearbySuggestionWatcher() {
  const enabled = useNearbySuggestions();
  const [hit, setHit] = useState<NearbyHit | null>(null);
  const dataRef = useRef<NearbySuggestions | null>(null);

  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return undefined;
    let alive = true;
    const handle = (pos: GeolocationPosition) => {
      const data = dataRef.current;
      if (!data || !alive) return;
      const found = suggestionsAt({ lat: pos.coords.latitude, lng: pos.coords.longitude }, data);
      if (!found || wasShownToday(found.landmark.id)) return;
      markShown(found.landmark.id);
      setHit(found);
      // Ứng dụng đang chạy nền và khách đã cho phép thông báo: hiện thêm thông báo hệ thống.
      if (document.hidden) {
        const first = found.offers[0]?.offer;
        void import('@/lib/webPush').then(({ showLocalNotification }) => showLocalNotification(
          `Bạn đang ở gần ${found.landmark.name}`,
          `${found.offers.length} gợi ý quanh đây${first ? `: ${first.name}${first.message ? ` — ${first.message}` : ''}` : ''}`,
          first ? placeDetailPath(first.kind, first.placeId) : '/',
          `nearby-${found.landmark.id}`,
        )).catch(() => undefined);
      }
    };
    let watchId: number | null = null;
    fetchNearbySuggestions()
      .then((data) => {
        if (!alive) return;
        dataRef.current = data;
        if (data.landmarks.length === 0 || data.offers.length === 0) return;
        watchId = navigator.geolocation.watchPosition(handle, () => undefined, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  if (!hit) return null;
  return (
    <div role="dialog" aria-label={`Gợi ý quanh ${hit.landmark.name}`}
      className="rise-in fixed inset-x-3 bottom-[calc(0.75rem+var(--safe-bottom))] z-[9990] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-lg)]">
      <div className="flex items-start gap-3">
        <img src={nearbyImage} alt="" aria-hidden width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-deep">Bạn đang ở gần {hit.landmark.name}</p>
          <p className="text-xs text-slate-500">Quanh đây có:</p>
        </div>
        <button type="button" aria-label="Đóng" onClick={() => setHit(null)} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {hit.offers.map(({ offer, km }) => (
          <li key={offer.placeId}>
            <Link to={placeDetailPath(offer.kind, offer.placeId)} onClick={() => setHit(null)} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-slate-50">
              <span className="h-12 w-14 shrink-0 overflow-hidden rounded-lg bg-canvas">
                {offer.imageUrl ? <img src={mediaUrl(offer.imageUrl, 330)} alt="" className="h-full w-full object-cover" /> : <MapPin className="m-auto mt-3.5 h-4 w-4 text-primary" />}
              </span>
              <span className="min-w-0 text-xs">
                <span className="block truncate text-sm font-semibold text-ink-deep">{offer.name}</span>
                <span className="block text-slate-500">
                  {[offer.label, formatDistance(km), offer.priceFrom != null ? `từ ${formatVnd(offer.priceFrom)}${offer.priceUnit ?? ''}` : null].filter(Boolean).join(' · ')}
                </span>
                {offer.message && <span className="block truncate text-ink">{offer.message}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => { setNearbySuggestions(false); setHit(null); }} className="mt-2 text-[11px] font-semibold text-slate-500 underline hover:text-ink-deep">
        Tắt gợi ý quanh đây
      </button>
    </div>
  );
}
