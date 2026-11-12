import type { GuestJourneyView } from '@/types/journey';
import { SESSION_LABEL, sortStops } from '@/lib/journey';
import { formatVnDayShort } from '@/lib/roomAvailability';

/**
 * Lịch trình khách gắn với đơn — cổng NCC chỉ XEM (gọn: ngày, buổi, điểm đến) để chủ nhà biết khách định đi đâu, buổi
 * nào mà tư vấn / chuẩn bị; không có thao tác nào.
 */
export default function GuestJourneyList({ journey }: { journey: GuestJourneyView }) {
  const groups = new Map<string, GuestJourneyView['stops']>();
  for (const stop of sortStops(journey.stops)) groups.set(stop.visitDate ?? '', [...(groups.get(stop.visitDate ?? '') ?? []), stop]);
  if (journey.stops.length === 0) return <p className="text-sm text-muted">Khách đã tạo lịch trình nhưng chưa chọn điểm nào.</p>;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {journey.title && <p className="font-semibold text-ink-deep">{journey.title}</p>}
      {[...groups.entries()].map(([day, stops]) => (
        <div key={day || 'none'}>
          <p className="text-xs font-bold text-muted">{day ? formatVnDayShort(day) : 'Chưa chọn ngày'}</p>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {stops.map((stop, i) => (
              <li key={`${stop.placeName}-${i}`} className="flex gap-2 text-ink">
                <span className="w-10 shrink-0 font-semibold text-primary">{SESSION_LABEL[stop.session]}</span>
                <span className="min-w-0">{stop.placeName}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
