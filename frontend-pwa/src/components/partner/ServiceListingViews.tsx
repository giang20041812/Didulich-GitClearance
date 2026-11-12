import { Bus, Clock, Languages, Loader2, MapPin, Pencil, Users } from 'lucide-react';
import { GUIDE_LANGUAGES, codeLabel } from '@/components/layout/providerServices';
import { formatVnd, minutesText } from '@/lib/serviceGroups';
import type { ListingRow } from '@/services/portalServicesApi';

/** Trạng thái duyệt / hiển thị của một dịch vụ, dùng chung cho bảng tuyến xe và thẻ trải nghiệm. */
export function listingStatus(row: ListingRow['place']): { label: string; cls: string } {
  if (row.approvalStatus === 'PENDING') return { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-800' };
  if (row.approvalStatus === 'REJECTED') return { label: 'Bị từ chối', cls: 'bg-rose-50 text-rose-700' };
  return row.visible ? { label: 'Đang hiển thị', cls: 'bg-emerald-50 text-emerald-700' } : { label: 'Đang ẩn', cls: 'bg-slate-100 text-slate-600' };
}

function StatusChips({ row }: { row: ListingRow }) {
  const status = listingStatus(row.place);
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <span className={`rounded px-1.5 py-0.5 font-semibold ${status.cls}`}>{status.label}</span>
      {row.place.pendingEdit && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">Có thay đổi chờ duyệt</span>}
      {!row.place.hasCoordinates && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">Chưa có vị trí</span>}
    </div>
  );
}

/**
 * Một tuyến của nhà xe dạng "bảng giờ": điểm đi —— điểm đến, giờ chạy thành từng ô, loại xe / số chỗ, giá vé. Dịch vụ không
 * theo tuyến (xe ôm, thuê xe) hiện điểm đón nếu có.
 */
export function RouteRow({ row, busy, onEdit }: { row: ListingRow; busy?: boolean; onEdit?: () => void }) {
  const s = row.service;
  const departures = (s?.departureTimes ?? '').split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  const duration = minutesText(s?.durationMinutes);
  return (
    <li className="rounded-lg border border-border bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{row.serviceGroupLabel ?? 'Dịch vụ'}</p>
          <p className="break-words text-sm font-bold text-ink-deep">{row.place.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {row.priceFrom != null && (
            <p className="text-right text-sm font-extrabold text-ink-deep">{formatVnd(row.priceFrom)}<span className="text-[11px] font-semibold text-muted"> {row.priceUnit ?? ''}</span></p>
          )}
          {onEdit && (
            <button type="button" disabled={busy} onClick={onEdit} aria-label={`Sửa ${row.place.name}`}
              className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm font-semibold hover:bg-hover">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Sửa
            </button>
          )}
        </div>
      </div>

      {s?.routeFrom && s.routeTo ? (
        <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
          <span className="font-semibold text-ink-deep">{s.routeFrom}</span>
          <span aria-hidden className="relative h-px bg-primary-200">
            <Bus className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 bg-white px-0.5 text-primary" />
          </span>
          <span className="font-semibold text-ink-deep">{s.routeTo}</span>
        </div>
      ) : s?.routeFrom ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted"><MapPin className="h-3.5 w-3.5 text-primary" /> Đón tại {s.routeFrom}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        {departures.map((t) => (
          <span key={t} className="rounded-md bg-primary-50 px-2 py-1 font-bold tabular-nums text-primary">{t}</span>
        ))}
        {duration && <span className="inline-flex items-center gap-1 rounded-md bg-canvas px-2 py-1 text-ink"><Clock className="h-3 w-3" /> {duration}</span>}
        {s?.vehicleType && <span className="rounded-md bg-canvas px-2 py-1 text-ink">{s.vehicleType}{s.seats ? ` · ${s.seats} chỗ` : ''}</span>}
      </div>
      <div className="mt-2"><StatusChips row={row} /></div>
      {row.place.approvalStatus === 'REJECTED' && row.place.rejectReason && <p className="mt-1 text-xs text-rose-700">Lý do: {row.place.rejectReason}</p>}
    </li>
  );
}

/** Thẻ trải nghiệm: ảnh lớn, nhóm trải nghiệm, thời lượng, số khách mỗi đoàn, ngôn ngữ hướng dẫn, giá. */
export function ExperienceCard({ row, busy, onEdit }: { row: ListingRow; busy?: boolean; onEdit?: () => void }) {
  const s = row.service;
  const duration = minutesText(s?.durationMinutes);
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-border bg-white">
      <div className="relative aspect-[16/10] bg-canvas">
        {row.place.imageUrl && <img src={row.place.imageUrl} alt="" className="h-full w-full object-cover" />}
        {row.serviceGroupLabel && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white">{row.serviceGroupLabel}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="break-words text-sm font-bold text-ink-deep">{row.place.name}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink">
          {duration && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-primary" /> {duration}</span>}
          {s?.groupSizeMax && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-primary" /> Tối đa {s.groupSizeMax} khách</span>}
          {s?.languages && s.languages.length > 0 && (
            <span className="inline-flex items-center gap-1"><Languages className="h-3.5 w-3.5 text-primary" /> {s.languages.map((l) => codeLabel(GUIDE_LANGUAGES, l)).join(', ')}</span>
          )}
        </div>
        {s?.routeFrom && <p className="flex items-center gap-1 text-xs text-muted"><MapPin className="h-3.5 w-3.5" /> Hẹn tại {s.routeFrom}</p>}
        <StatusChips row={row} />
        {row.place.approvalStatus === 'REJECTED' && row.place.rejectReason && <p className="text-xs text-rose-700">Lý do: {row.place.rejectReason}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
          <span className="text-sm font-extrabold text-ink-deep">
            {row.priceFrom != null ? <>{formatVnd(row.priceFrom)}<span className="text-[11px] font-semibold text-muted"> {row.priceUnit ?? ''}</span></> : <span className="text-xs font-semibold text-muted">Giá liên hệ</span>}
          </span>
          {onEdit && (
            <button type="button" disabled={busy} onClick={onEdit} aria-label={`Sửa ${row.place.name}`}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-3 text-sm font-semibold hover:bg-hover">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Sửa
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
