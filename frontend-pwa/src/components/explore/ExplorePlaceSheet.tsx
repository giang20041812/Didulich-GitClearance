import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Clock, Globe, Loader2, MapPin, Navigation, Phone, X } from 'lucide-react';
import ImageLightbox from '@/components/common/ImageLightbox';
import ExploreMap, { type ExploreMarker } from '@/components/explore/ExploreMap';
import { EXPLORE_CATEGORY_UI } from '@/components/explore/exploreCategoryUi';
import { fetchExplorePlace } from '@/services/exploreService';
import { openDirections } from '@/lib/mapProvider';
import { getApiErrorMessage } from '@/lib/apiError';
import type { ExplorePlaceDetail } from '@/types/explore';

/** Thứ hôm nay theo giờ Việt Nam (BR-C07), 1 = thứ Hai … 7 = Chủ nhật — không theo múi giờ thiết bị của khách. */
function todayInVietnam(): number {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(new Date());
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday) + 1;
}

/**
 * KH-02 — chi tiết địa điểm (US02.04): bảng trượt từ đáy trên điện thoại, hộp thoại giữa màn hình trên máy tính. Trường
 * không có dữ liệu thì ẩn cả dòng (BR-C08); trạng thái mở / đóng do backend tính theo giờ Việt Nam (BR-C07); Chỉ đường
 * chỉ hiện khi tọa độ đã xác minh, điểm đi là homestay đang xem (BR-02.08).
 */
export default function ExplorePlaceSheet({ placeId, homestayId, onClose }: { placeId: number; homestayId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<ExplorePlaceDetail | null>(null);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchExplorePlace(placeId, homestayId)
      .then((d) => { if (alive) setDetail(d); })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được thông tin địa điểm.')); });
    return () => { alive = false; };
  }, [placeId, homestayId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && lightbox === null) onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, lightbox]);

  const hasPin = detail?.latitude != null && detail?.longitude != null;
  const origin = detail?.homestay?.latitude != null && detail?.homestay?.longitude != null
    ? { lat: detail.homestay.latitude, lng: detail.homestay.longitude } : null;
  const markers: ExploreMarker[] = [];
  if (detail && hasPin) {
    if (origin && detail.homestay) markers.push({ id: detail.homestay.id, lat: origin.lat, lng: origin.lng, label: detail.homestay.name, kind: 'homestay' });
    markers.push({ id: detail.id, lat: detail.latitude as number, lng: detail.longitude as number, label: detail.name, kind: 'place' });
  }
  const today = todayInVietnam();

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={detail?.name ?? 'Chi tiết địa điểm'}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="min-w-0 truncate text-base font-bold text-[var(--color-ink-deep)]">{detail?.name ?? 'Chi tiết địa điểm'}</p>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {!detail && !error && (
            <p className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</p>
          )}
          {error && <p role="alert" className="py-8 text-center text-sm text-slate-600">{error}</p>}
          {detail && (
            <div className="flex flex-col gap-3 text-sm text-slate-700">
              {detail.images.length > 0 && (
                <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
                  {detail.images.map((url, i) => (
                    <button key={url} type="button" onClick={() => setLightbox(i)} aria-label={`Phóng to ảnh ${i + 1}`}
                      className="h-36 w-56 shrink-0 snap-start overflow-hidden rounded-xl bg-slate-100">
                      <img src={url} alt={`${detail.name} – ảnh ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--color-primary-50)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-primary-700)]">
                  {EXPLORE_CATEGORY_UI[detail.category]?.label ?? detail.categoryLabel}
                </span>
                {detail.distanceText && (
                  <span className="text-xs text-slate-500">{detail.distanceText} · khoảng cách tham khảo</span>
                )}
              </div>

              {detail.openStatus && (
                <p className={`flex items-center gap-1.5 font-semibold ${detail.openStatus.open ? 'text-emerald-700' : 'text-rose-700'}`}>
                  <Clock className="h-4 w-4 shrink-0" aria-hidden /> {detail.openStatus.text}
                </p>
              )}

              {detail.summary && <p className="font-medium text-slate-800">{detail.summary}</p>}
              {detail.description && detail.description !== detail.summary && (
                <p className="whitespace-pre-line leading-relaxed">{detail.description}</p>
              )}

              {detail.address && (
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /> {detail.address}</p>
              )}
              {detail.phone && (
                <a href={`tel:${detail.phone}`} className="flex items-center gap-2 text-[var(--color-primary)] hover:underline">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden /> {detail.phone}
                </a>
              )}
              {detail.website && (
                <a href={detail.website} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-2 text-[var(--color-primary)] hover:underline">
                  <Globe className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{detail.website}</span>
                </a>
              )}

              {detail.openingHours.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Giờ mở cửa</p>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 text-xs">
                    {detail.openingHours.map((h) => (
                      <li key={h.dayOfWeek} className={`flex justify-between px-3 py-1.5 ${h.dayOfWeek === today ? 'font-bold text-slate-900' : ''}`}>
                        <span>{h.dayName.charAt(0).toUpperCase() + h.dayName.slice(1)}</span>
                        <span>{h.closed ? 'Nghỉ' : `${h.open} – ${h.close}`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasPin && <ExploreMap markers={markers} className="h-48" />}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={onClose} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" /> Quay lại homestay
          </button>
          {detail && hasPin && (
            <button
              type="button"
              onClick={() => openDirections({ lat: detail.latitude as number, lng: detail.longitude as number }, origin)}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] text-sm font-bold text-white hover:opacity-90"
            >
              <Navigation className="h-4 w-4" /> Chỉ đường
            </button>
          )}
        </div>
      </div>

      {lightbox !== null && detail && (
        <ImageLightbox images={detail.images} index={lightbox} alt={detail.name} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>,
    document.body,
  );
}
