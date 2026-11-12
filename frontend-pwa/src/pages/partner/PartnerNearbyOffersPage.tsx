import { useEffect, useState } from 'react';
import { CheckCircle2, EyeOff, Loader2, MapPin, ShieldAlert } from 'lucide-react';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { getApiErrorMessage } from '@/lib/apiError';
import { nearbyPartnerApi } from '@/services/portalServicesApi';
import nearbyImage from '@/assets/fluent/nearby.webp';
import type { PartnerOffer, PartnerOffers } from '@/types/nearby';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

/**
 * "Gợi ý quanh đây" của NCC: bật gợi ý cho từng địa điểm (homestay, tuyến xe, trải nghiệm…), viết lời mời ngắn và chọn
 * bán kính. Khách đã bật gợi ý đi tới gần một điểm nổi tiếng thì ứng dụng hiện thông báo gợi ý các địa điểm trong bán kính.
 * Vị trí của khách chỉ được tính trên máy của khách — NCC không nhận được vị trí của ai.
 */
export default function PartnerNearbyOffersPage() {
  const [data, setData] = useState<PartnerOffers | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    nearbyPartnerApi.list()
      .then((res) => { if (alive) setData(res); })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được danh sách địa điểm.')); });
    return () => { alive = false; };
  }, []);

  const replace = (offer: PartnerOffer) =>
    setData((d) => (d ? { ...d, places: d.places.map((p) => (p.placeId === offer.placeId ? offer : p)) } : d));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <img src={nearbyImage} alt="" aria-hidden width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />
        <div>
          <h1 className="text-lg font-bold text-ink-deep">Gợi ý quanh đây</h1>
          <p className="text-sm text-muted">
            Khi khách đã bật gợi ý đi tới gần một điểm nổi tiếng (vd Sống Lưng Khủng Long, Đồi Mâm Xôi), ứng dụng hiện thông báo
            gợi ý các địa điểm của bạn trong bán kính bạn chọn. Vị trí của khách chỉ được tính trên điện thoại của khách — bạn
            và hệ thống không nhận được vị trí của ai.
          </p>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!data ? (
        !error && <ListSkeleton rows={3} />
      ) : data.places.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Bạn chưa có địa điểm nào. Địa điểm (homestay, tuyến xe, trải nghiệm…) được duyệt sẽ hiện ở đây để bật gợi ý.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.places.map((offer) => (
            <OfferCard key={offer.placeId} offer={offer} limits={data} onSaved={replace} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OfferCard({ offer, limits, onSaved }: {
  offer: PartnerOffer;
  limits: Pick<PartnerOffers, 'radiusMinKm' | 'radiusMaxKm' | 'messageMax'>;
  onSaved: (offer: PartnerOffer) => void;
}) {
  const [enabled, setEnabled] = useState(offer.configured ? offer.enabled : offer.eligible);
  const [message, setMessage] = useState(offer.message ?? '');
  const [radius, setRadius] = useState(offer.radiusKm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = enabled !== (offer.configured ? offer.enabled : false) || message !== (offer.message ?? '') || radius !== offer.radiusKm
    || !offer.configured;
  const titleId = `offer-${offer.placeId}`;

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      onSaved(await nearbyPartnerApi.save(offer.placeId, { enabled, message: message.trim() || null, radiusKm: radius }));
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không lưu được cài đặt gợi ý.'));
    } finally {
      setSaving(false);
    }
  };

  const live = offer.configured && offer.enabled && offer.eligible && !offer.hiddenByAdmin;

  return (
    <li className="rounded-lg border border-border bg-white p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="h-14 w-16 shrink-0 overflow-hidden rounded-md bg-canvas">
          {offer.imageUrl ? <img src={offer.imageUrl} alt="" className="h-full w-full object-cover" /> : <MapPin className="m-auto mt-4 h-5 w-5 text-muted" />}
        </span>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="break-words text-sm font-bold text-ink-deep">{offer.placeName}</p>
          <p className="text-xs text-muted">{offer.label}</p>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {offer.hiddenByAdmin ? (
              <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-rose-700"><EyeOff className="h-3 w-3" /> Quản trị viên đã ẩn gợi ý</span>
            ) : !offer.eligible ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Chưa thể gợi ý</span>
            ) : live ? (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Đang gợi ý cho khách</span>
            ) : (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Đang tắt</span>
            )}
          </div>
        </div>
        {offer.eligible && (
          <ToggleSwitch checked={enabled} labelledBy={titleId} onChange={(v) => { setEnabled(v); setSaved(false); }} />
        )}
      </div>

      {offer.hiddenByAdmin && offer.hiddenReason && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Lý do: {offer.hiddenReason}. Sửa lời mời theo lý do trên rồi liên hệ quản trị viên để được hiển thị lại.</span>
        </p>
      )}
      {!offer.eligible && offer.notEligibleReason && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{offer.notEligibleReason}</p>
      )}

      {offer.eligible && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_220px]">
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`${titleId}-message`} className="mb-1 block text-xs font-semibold text-ink-deep">Lời mời ngắn (không bắt buộc)</label>
              <span className={`text-[11px] tabular-nums ${message.trim().length > limits.messageMax ? 'font-semibold text-danger' : 'text-muted'}`}>
                {message.trim().length}/{limits.messageMax}
              </span>
            </div>
            <textarea id={`${titleId}-message`} rows={2} value={message} maxLength={limits.messageMax + 20}
              onChange={(e) => { setMessage(e.target.value); setSaved(false); }}
              placeholder="VD: Còn phòng view ruộng bậc thang tối nay"
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm" />
            <p className="mt-1 text-[11px] text-muted">Không chứa đường link hay tên trang web. Bỏ trống thì ứng dụng tự ghi loại địa điểm và khoảng cách.</p>
          </div>
          <div>
            <label htmlFor={`${titleId}-radius`} className="mb-1 block text-xs font-semibold text-ink-deep">
              Gợi ý cho khách cách địa điểm tối đa <span className="text-primary">{radius} km</span>
            </label>
            <input id={`${titleId}-radius`} type="range" min={limits.radiusMinKm} max={limits.radiusMaxKm} step={1} value={radius}
              onChange={(e) => { setRadius(Number(e.target.value)); setSaved(false); }} className="w-full accent-[var(--color-primary)]" />
            <div className="flex justify-between text-[10px] text-muted"><span>{limits.radiusMinKm} km</span><span>{limits.radiusMaxKm} km</span></div>
          </div>
        </div>
      )}

      {offer.eligible && (
        <div className="mt-3 rounded-md bg-canvas/60 px-3 py-2 text-xs text-ink">
          {offer.landmarks.length > 0 ? (
            <>
              <span className="font-semibold">Điểm nổi tiếng trong {offer.radiusKm} km: </span>
              {offer.landmarks.map((l) => `${l.name} (${l.distanceText})`).join(' · ')}
            </>
          ) : (
            <span className="text-muted">Chưa có điểm nổi tiếng nào trong {offer.radiusKm} km — tăng bán kính để khách ở các điểm xa hơn cũng thấy gợi ý.</span>
          )}
          {radius !== offer.radiusKm && <span className="block text-[11px] text-muted">Lưu để cập nhật danh sách theo bán kính mới.</span>}
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
      {offer.eligible && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {saved && !dirty && <span role="status" className="text-xs font-semibold text-emerald-700">Đã lưu</span>}
          <button type="button" disabled={saving || (!dirty && offer.configured) || message.trim().length > limits.messageMax}
            onClick={() => { void save(); }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </button>
        </div>
      )}
    </li>
  );
}
