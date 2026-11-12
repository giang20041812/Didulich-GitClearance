import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, LocateFixed, MapPinOff, Mountain, Tent } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { useCurrentPosition } from '@/hooks/useCurrentPosition';
import { formatDistance, haversineKm, MU_CANG_CHAI_CENTER } from '@/lib/distance';
import { mediaUrl } from '@/lib/mediaUrl';
import { placeDetailPath } from '@/lib/placeRoutes';
import { fetchNearMeCandidates, type NearMePlace } from '@/services/placeService';
import { prefetchHomestay } from '@/services/homestayService';

interface NearMePanelProps {
  kind: 'ATTRACTION' | 'HOMESTAY';
}

const MAX_RADIUS_KM = 30;
const MAX_RESULTS = 12;

/**
 * "Gần tôi" ở trang chủ: điểm đến / homestay gần khách nhất trong bán kính khách chọn (1–30 km), khoảng cách đường chim
 * bay tính ngay trên máy. Khách ở xa (đa số xem trang khi còn ở Hà Nội...) hoặc không cho lấy vị trí thì gợi ý xem quanh
 * thị trấn Mù Cang Chải thay vì để trống. Đóng bằng dấu × trên nút "Gần tôi" (một chỗ đóng duy nhất).
 */
export default function NearMePanel({ kind }: NearMePanelProps) {
  const { state, retry } = useCurrentPosition();
  const [aroundTown, setAroundTown] = useState(false);
  const [radius, setRadius] = useState(10);
  const [places, setPlaces] = useState<NearMePlace[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const noun = kind === 'HOMESTAY' ? 'homestay' : 'điểm đến';

  useEffect(() => {
    let alive = true;
    fetchNearMeCandidates(kind)
      .then((list) => { if (alive) setPlaces(list); })
      .catch(() => { if (alive) setLoadFailed(true); });
    return () => { alive = false; };
  }, [kind]);

  const anchor = aroundTown ? MU_CANG_CHAI_CENTER : state.status === 'ready' ? state.position : null;
  const ranked = useMemo(() => {
    if (!anchor || !places) return [];
    return places
      .map((place) => ({ place, km: haversineKm(anchor, { lat: place.latitude, lng: place.longitude }) }))
      .sort((a, b) => a.km - b.km);
  }, [anchor, places]);
  const nearest = ranked[0];
  const farAway = !aroundTown && !!nearest && nearest.km > MAX_RADIUS_KM;
  const results = ranked.filter((item) => item.km <= radius).slice(0, MAX_RESULTS);
  const kmToTown = state.status === 'ready' ? haversineKm(state.position, MU_CANG_CHAI_CENTER) : null;

  const townButton = (
    <button
      type="button"
      onClick={() => setAroundTown(true)}
      className="rounded-lg bg-[#052620] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#0a3a31] cursor-pointer"
    >
      Xem quanh thị trấn Mù Cang Chải
    </button>
  );

  let body;
  if (!anchor && state.status === 'locating') {
    body = (
      <p className="flex items-center gap-2 py-6 text-sm font-medium text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-[#052620]" /> Đang xác định vị trí của bạn…
      </p>
    );
  } else if (!anchor) {
    body = (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="flex items-start gap-2 text-sm text-slate-700">
          <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          {state.status === 'error' && state.reason === 'denied'
            ? 'Bạn chưa cho phép trang dùng vị trí. Bật quyền vị trí cho trang trong cài đặt trình duyệt rồi thử lại.'
            : 'Không lấy được vị trí của bạn. Kiểm tra GPS / kết nối rồi thử lại.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border-2 border-teal-600/30 bg-white px-3.5 py-2 text-xs font-bold text-[#052620] transition-colors hover:border-[#052620] cursor-pointer"
          >
            Thử lại
          </button>
          {townButton}
        </div>
      </div>
    );
  } else if (loadFailed) {
    body = <p className="py-6 text-sm text-slate-600">Chưa tải được danh sách {noun}. Vui lòng thử lại sau.</p>;
  } else if (!places) {
    body = (
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((n) => <div key={n} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
      </div>
    );
  } else if (farAway) {
    body = (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-sm text-slate-700">
          {kmToTown != null && kmToTown > MAX_RADIUS_KM
            ? `Bạn đang cách Mù Cang Chải khoảng ${Math.round(kmToTown).toLocaleString('vi-VN')} km — `
            : ''}
          chưa có {noun} nào trong {MAX_RADIUS_KM} km quanh bạn.
        </p>
        {townButton}
      </div>
    );
  } else if (results.length === 0) {
    body = (
      <p className="py-4 text-sm text-slate-700">
        Chưa có {noun} nào trong {radius} km.
        {nearest && <> Gần nhất: <strong>{nearest.place.name}</strong> — {formatDistance(nearest.km)}. Kéo bán kính lên để xem.</>}
      </p>
    );
  } else {
    body = (
      <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {results.map(({ place, km }) => (
          <li key={place.id}>
            <Link
              to={placeDetailPath(place.kind, place.id)}
              onPointerEnter={kind === 'HOMESTAY' ? () => prefetchHomestay(place.id) : undefined}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 pr-3 transition-all hover:border-teal-500/50 hover:shadow-sm"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {place.coverImageUrl ? (
                  <img src={mediaUrl(place.coverImageUrl, 500)} alt={place.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlaceholder Icon={kind === 'HOMESTAY' ? Tent : Mountain} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{place.name}</p>
                {place.regionName && <p className="truncate text-xs text-slate-500">{place.regionName}</p>}
                <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-600">
                  {kind === 'HOMESTAY' && place.priceRefMin != null && place.priceRefMin > 0 && (
                    <span className="font-semibold text-[#052620]">từ {place.priceRefMin.toLocaleString('vi-VN')}đ</span>
                  )}
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-[#edfbf7] px-2 py-1 text-xs font-bold text-[#052620]">{formatDistance(km)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-teal-600/15 bg-white p-4 shadow-xs md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <LocateFixed className="h-4 w-4 shrink-0 text-[#052620]" />
            {aroundTown ? 'Quanh thị trấn Mù Cang Chải' : `${kind === 'HOMESTAY' ? 'Homestay' : 'Điểm đến'} gần bạn`}
          </p>
          {aroundTown && state.status === 'ready' && (
            <button
              type="button"
              onClick={() => setAroundTown(false)}
              className="ml-6 mt-0.5 text-xs font-semibold text-[#052620] underline underline-offset-2 cursor-pointer"
            >
              Dùng vị trí của tôi
            </button>
          )}
        </div>
      </div>

      {anchor && !farAway && places && (
        <label className="mt-3 flex items-center gap-3">
          <span className="shrink-0 text-xs font-semibold text-slate-600">Bán kính</span>
          <input
            type="range"
            min={1}
            max={MAX_RADIUS_KM}
            step={1}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            aria-label={`Bán kính tìm ${noun}`}
            className="h-1.5 flex-1 cursor-pointer accent-[#052620]"
          />
          <span className="w-12 shrink-0 text-right text-xs font-bold text-[#052620]">{radius} km</span>
        </label>
      )}

      <div className="mt-4">{body}</div>

      <p className="mt-3 text-[11px] text-slate-400">
        Khoảng cách theo đường chim bay · Vị trí của bạn chỉ dùng trên máy này, không gửi đi.
      </p>
    </div>
  );
}
