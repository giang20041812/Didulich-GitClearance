import { ChevronRight, Heart, Mountain } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import type { SightStopView } from '@/types/journey';
import { mediaUrl } from '@/lib/mediaUrl';

/**
 * "Kỷ niệm chuyến đi" (chuyến đã đi): các điểm đã check-in kèm ảnh + lưu bút, bấm mở lại cẩm nang của điểm đó. Không có
 * check-in nào thì không hiện.
 */
export default function JourneyMemories({ stops, onOpen }: { stops: SightStopView[]; onOpen: (stopId: number) => void }) {
  const items = stops.filter((s) => s.checkin);
  if (items.length === 0) return null;
  return (
    <section aria-label="Kỷ niệm chuyến đi" className="rounded-3xl bg-white p-4 shadow-xs ring-1 ring-slate-200">
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
          <Heart className="h-4 w-4" />
        </span>
        Kỷ niệm chuyến đi
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{items.length}</span>
      </h3>
      <ul className="mt-3 divide-y divide-slate-100">
        {items.map((stop) => {
          const image = stop.checkin?.photoUrl ?? stop.coverImageUrl;
          return (
            <li key={stop.id}>
              <button type="button" onClick={() => onOpen(stop.id)} className="flex w-full items-center gap-3 py-2.5 text-left cursor-pointer">
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {image ? <img src={mediaUrl(image)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={Mountain} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">{stop.placeName}</span>
                  {stop.checkin?.note ? (
                    <span className="mt-0.5 line-clamp-2 block text-xs italic leading-relaxed text-slate-600">“{stop.checkin.note}”</span>
                  ) : (
                    <span className="mt-0.5 block text-xs text-slate-400">{stop.checkin?.photoUrl ? 'Ảnh check-in' : 'Đã check-in'}</span>
                  )}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
