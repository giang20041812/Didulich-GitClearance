import { useMemo, useState } from 'react';
import { Check, MapPin, Mountain, Search } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import type { TripPlace } from '@/types/trip';
import { SESSION_LABEL } from '@/lib/journey';
import { mediaUrl } from '@/lib/mediaUrl';

const fold = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Danh sách điểm tham quan của tỉnh (tìm không dấu) — chọn điểm để thêm / đổi trong lịch trình. */
export default function PlacePicker({ places, selectedIds, onPick }: { places: TripPlace[]; selectedIds: Set<number>; onPick: (place: TripPlace) => void }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? places.filter((p) => fold(`${p.name} ${p.regionName ?? ''}`).includes(q)) : places;
  }, [places, query]);

  return (
    <div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm điểm tham quan…"
          aria-label="Tìm điểm tham quan"
          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-base text-slate-800 outline-none focus:border-[#0a7d64] focus:bg-white"
        />
      </label>
      <ul className="mt-3 max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
        {shown.length === 0 && <li className="px-2 py-6 text-center text-sm text-slate-500">Không tìm thấy điểm nào.</li>}
        {shown.map((place) => {
          const added = selectedIds.has(place.id);
          return (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => onPick(place)}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors cursor-pointer ${added ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-slate-50'}`}
              >
                <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {place.coverImageUrl ? <img src={mediaUrl(place.coverImageUrl, 120)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={Mountain} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-slate-900">{place.name}</span>
                  <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                    {place.regionName && <><MapPin className="h-3 w-3 shrink-0" aria-hidden />{place.regionName}</>}
                    {place.suitableSessions.length > 0 && <span className="truncate"> · nên đi {place.suitableSessions.map((s) => SESSION_LABEL[s].toLowerCase()).join(', ')}</span>}
                  </span>
                </span>
                {added && <Check className="h-4 w-4 shrink-0 text-orange-600" aria-label="Đã có trong lịch trình" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
