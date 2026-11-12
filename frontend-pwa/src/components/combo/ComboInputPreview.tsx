import { CalendarDays, Clock, MapPin, Users, Utensils } from 'lucide-react';
import { formatVnd } from '@/lib/serviceGroups';
import type { ComboInput, PlaceRef } from '@/types/combo';

const lines = (text: string | null) => (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

/** Xem nhanh nội dung combo (bản đang lưu hoặc bản sửa chờ duyệt) để Admin duyệt mà không phải mở form. */
export default function ComboInputPreview({ input, places }: { input: ComboInput; places: PlaceRef[] }) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const days = Array.from({ length: input.days ?? 0 }, (_, i) => i + 1);
  return (
    <div className="space-y-4 text-sm">
      {input.coverImageUrl && <img src={input.coverImageUrl} alt="" className="h-40 w-full rounded-md object-cover" />}
      <div>
        <p className="text-base font-bold text-ink-deep">{input.title}</p>
        <p className="text-muted">{input.summary}</p>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-primary" /><dd>{input.days} ngày {input.nights ? `${input.nights} đêm` : ''}</dd></div>
        <div className="flex items-center gap-1.5"><span className="font-semibold text-ink-deep">Từ {formatVnd(input.priceFrom)}</span>/khách</div>
        {(input.groupSizeMin || input.groupSizeMax) && (
          <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary" />{input.groupSizeMin ?? 1}–{input.groupSizeMax ?? '…'} khách / đoàn</div>
        )}
      </dl>
      {input.priceNote && <p className="text-xs text-muted">Ghi chú giá: {input.priceNote}</p>}
      {input.description && <p className="whitespace-pre-line text-xs text-ink">{input.description}</p>}

      <div className="space-y-2">
        {days.map((day) => (
          <div key={day} className="rounded-md border border-border">
            <p className="border-b border-border bg-canvas/60 px-3 py-1.5 text-xs font-bold text-ink-deep">Ngày {day}</p>
            <ol className="divide-y divide-border">
              {input.stops.filter((s) => s.dayNo === day).map((s, i) => {
                const place = s.placeId != null ? byId.get(s.placeId) : undefined;
                return (
                  <li key={`${day}-${i}`} className="px-3 py-2 text-xs">
                    <p className="font-semibold text-ink-deep">
                      {(s.startTime || s.endTime) && <span className="mr-1.5 inline-flex items-center gap-1 text-primary"><Clock className="h-3 w-3" />{[s.startTime, s.endTime].filter(Boolean).join('–')}</span>}
                      {s.title}
                    </p>
                    {place && <p className="flex items-center gap-1 text-muted"><MapPin className="h-3 w-3" />{place.name}{place.label ? ` · ${place.label}` : ''}{!place.available && ' · đang ẩn với khách'}</p>}
                    {s.note && <p className="mt-0.5 whitespace-pre-line text-muted">{s.note}</p>}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="font-semibold text-ink-deep">Đã bao gồm</p>
          <ul className="mt-1 list-disc pl-4 text-ink">{lines(input.includes).map((l) => <li key={l}>{l}</li>)}{!input.includes && <li className="list-none text-muted">—</li>}</ul>
        </div>
        <div>
          <p className="font-semibold text-ink-deep">Không bao gồm</p>
          <ul className="mt-1 list-disc pl-4 text-ink"><li>Ăn uống</li>{lines(input.excludes).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      </div>
      {input.restaurants.length > 0 && (
        <div className="text-xs">
          <p className="flex items-center gap-1 font-semibold text-ink-deep"><Utensils className="h-3.5 w-3.5" /> Nhà hàng gợi ý</p>
          <ul className="mt-1 space-y-0.5">
            {input.restaurants.map((r) => <li key={r.placeId}>{byId.get(r.placeId)?.name ?? `#${r.placeId}`}{r.note ? ` — ${r.note}` : ''}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
