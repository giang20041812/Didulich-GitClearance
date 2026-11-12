import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, EyeOff, MapPinned, Mountain } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import type { VisitedPlaceView } from '@/types/journey';
import { fetchVisitedPlaces } from '@/services/journeyService';
import { mediaUrl } from '@/lib/mediaUrl';
import { getApiErrorMessage } from '@/lib/apiError';

const pad = (n: number) => String(n).padStart(2, '0');
/** "08/10/2026". */
const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/**
 * "Nơi bạn đã check-in": mỗi địa điểm khách đã check-in như một tấm ảnh kỷ niệm (ảnh check-in, không có thì ảnh địa điểm)
 * + ngày + lưu bút; bấm mở lại lịch trình của chuyến đó. compact: dải ảnh ngang dưới danh sách lịch trình của tôi — chưa
 * có nơi nào (hoặc đang tải) thì không chiếm chỗ.
 */
export default function VisitedPlaces({ compact = false }: { compact?: boolean }) {
  const [places, setPlaces] = useState<VisitedPlaceView[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchVisitedPlaces()
      .then((list) => { if (alive) setPlaces(list); })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được địa điểm đã đi.')); });
    return () => { alive = false; };
  }, []);

  if (compact) {
    if (error || !places || places.length === 0) return null;
    return (
      <section aria-labelledby="visited-title">
        <h2 id="visited-title" className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900">
          Nơi bạn đã check-in
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{places.length}</span>
        </h2>
        <ul className="scrollbar-hide -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {places.map((place) => {
            const image = place.photoUrl ?? place.coverImageUrl;
            return (
              <li key={place.checkinId} className="w-[132px] shrink-0 snap-start">
                <Link
                  to={place.journeyId ? `/journeys/${place.journeyId}` : `/destinations/${place.placeId}`}
                  className="group relative block aspect-[4/5] overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200"
                >
                  {image
                    ? <img src={mediaUrl(image)} alt={place.placeName} loading="lazy" className="h-full w-full object-cover transition-transform duration-500" />
                    : <ImagePlaceholder Icon={Mountain} />}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2 pb-1.5 pt-6">
                    <span className="line-clamp-2 text-xs font-extrabold leading-snug text-white">{place.placeName}</span>
                    <span className="block text-[10px] font-semibold text-white/80">{dayOf(place.checkedInAt)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  if (error) return <p className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">{error}</p>;
  if (!places) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="status" aria-label="Đang tải">
        {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />)}
      </div>
    );
  }
  if (places.length === 0) {
    return (
      <div className="rounded-3xl bg-white px-6 py-10 text-center ring-1 ring-slate-200">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <MapPinned className="h-7 w-7" />
        </span>
        <p className="mt-4 text-base font-extrabold text-slate-900">Chưa có địa điểm nào</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-600">
          Trong chuyến đi, mở một điểm của lịch trình và bấm <strong>Check-in</strong> — chụp một tấm ảnh, ghi vài dòng lưu bút để lưu lại nơi bạn đã đến.
        </p>
      </div>
    );
  }

  const withPhoto = places.filter((p) => p.photoUrl).length;
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        Bạn đã check-in <strong className="text-slate-900">{places.length}</strong> địa điểm{withPhoto > 0 ? ` · ${withPhoto} tấm ảnh kỷ niệm` : ''}.
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {places.map((place) => {
          const image = place.photoUrl ?? place.coverImageUrl;
          return (
            <li key={place.checkinId}>
              <Link
                to={place.journeyId ? `/journeys/${place.journeyId}` : `/destinations/${place.placeId}`}
                className="group block h-full rounded-2xl bg-white p-1.5 shadow-xs ring-1 ring-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] hover:ring-teal-300"
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-slate-100">
                  {image ? (
                    <img src={mediaUrl(image)} alt={place.placeName} loading="lazy" className="h-full w-full object-cover transition-transform duration-500" />
                  ) : (
                    <ImagePlaceholder Icon={Mountain} />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2.5 pb-2 pt-8">
                    <p className="line-clamp-2 text-sm font-extrabold leading-snug text-white">{place.placeName}</p>
                    <p className="text-[11px] font-semibold text-white/80">{dayOf(place.checkedInAt)}</p>
                  </div>
                  {place.photoUrl && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[#0a7d64] shadow-sm" title="Ảnh check-in của bạn">
                      <Camera className="h-3.5 w-3.5" />
                    </span>
                  )}
                  {place.hidden && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 shadow-sm">
                      <EyeOff className="h-3 w-3" /> Đã bị ẩn
                    </span>
                  )}
                </div>
                {place.note && <p className="line-clamp-2 px-1.5 pb-1 pt-2 text-xs italic leading-relaxed text-slate-600">“{place.note}”</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
