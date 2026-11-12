import type { ReactNode } from 'react';
import { Camera, CalendarDays, Check, CheckCircle2, Flag, Home, Mountain } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import type { DaySession } from '@/types/journey';
import { SESSION_LABEL, SESSION_TONE, dayNumberOf, stopTimeLabel } from '@/lib/journey';
import { formatVnDayShort } from '@/lib/roomAvailability';
import { mediaUrl } from '@/lib/mediaUrl';

/** Một điểm trên route (đã sắp theo thứ tự đi). */
export interface RouteStop {
  key: string | number;
  name: string;
  /** Ảnh tròn của điểm: ảnh check-in nếu có, không thì ảnh bìa địa điểm. */
  imageUrl?: string | null;
  session: DaySession;
  /** "HH:mm" — giờ riêng của điểm; không có thì hiện giờ mặc định của buổi. */
  startTime?: string | null;
  /** "YYYY-MM-DD"; null = chưa xếp ngày. */
  visitDate: string | null;
  /**
   * Số ngày (trang chia sẻ chỉ có "Ngày 1, 2" mà không có ngày thật). Bỏ trống thì tính từ visitDate. 0 = ngày nằm
   * ngoài ngày ở: mốc ngày hiện ngày thật kèm nhãn "Ngoài ngày ở" thay vì số ngày.
   */
  dayNumber?: number | null;
  /** done = đã check-in; next = điểm tiếp theo hôm nay (nhấp nháy). */
  status?: 'done' | 'next';
  /** Dòng phụ nhỏ dưới tên (vd "Đã check-in", "Ngoài ngày ở"). */
  note?: string | null;
}

interface JourneyRouteProps {
  stops: RouteStop[];
  /** Chỗ nghỉ: điểm xuất phát + điểm về của route. */
  home?: { name: string } | null;
  /** Ngày đầu chuyến để đánh số "Ngày 1, 2…" (mặc định: ngày sớm nhất trong stops). */
  firstDay?: string | null;
  /** Ẩn ngày thật, chỉ hiện "Ngày 1, 2" (trang chia sẻ chuyến chưa đi xong). */
  hideDates?: boolean;
  /** Bấm một điểm (mở cẩm nang / sửa ngày, buổi). Không truyền = route chỉ để xem. */
  onSelect?: (key: string | number) => void;
  selectedKey?: string | number | null;
  /** compact: route nhỏ gọn. */
  size?: 'compact' | 'regular';
  /** Hiện khi chưa có điểm nào. */
  emptyHint?: ReactNode;
  className?: string;
  /** "YYYY-MM-DD" hôm nay (giờ VN): mốc ngày trùng hôm nay được tô nổi "Hôm nay". */
  today?: string | null;
  /**
   * Lịch trình của chính khách: mỗi điểm có nút "Check-in" lớn ngay dưới tên (điểm đã check-in: "Đã check-in"), ảnh tròn
   * có huy hiệu máy ảnh. Không truyền = route chỉ để xem / lên kế hoạch.
   */
  onCheckin?: (key: string | number) => void;
}

type Row =
  | { kind: 'home'; y: number }
  | { kind: 'day'; y: number; label: string; sub?: string; isToday?: boolean; outside?: boolean }
  | { kind: 'stop'; y: number; stop: RouteStop; order: number; side: 'left' | 'right' }
  | { kind: 'end'; y: number };

type RowInput = Row extends unknown ? (Row extends infer R ? (R extends Row ? Omit<R, 'y'> : never) : never) : never;

/** Hoành độ (đơn vị % bề rộng) của nút trái / phải / giữa — route uốn lượn qua lại như đường mòn trên bản đồ. */
const X = { left: 21, right: 79, center: 50 } as const;

const SIZES = {
  regular: { stop: 112, day: 56, edge: 68, node: 60, home: 40 },
  compact: { stop: 88, day: 48, edge: 56, node: 46, home: 34 },
} as const;
/** Có nút Check-in dưới tên: mỗi điểm cao thêm cho vừa nút. */
const CHECKIN_STOP = { regular: 146, compact: 122 } as const;

const xOf = (row: Row) => (row.kind === 'stop' ? X[row.side] : X.center);

/**
 * Đường nối hai điểm liên tiếp: cung bezier tiếp tuyến dọc ở hai đầu → đường cong chữ S mềm, các đoạn nối nhau thành
 * một con đường uốn lượn (không phải đường thẳng). Tọa độ x tính theo % (viewBox rộng 100), y theo px.
 */
function trailPath(rows: Row[]): string {
  if (rows.length === 0) return '';
  let d = `M ${xOf(rows[0] as Row)} ${(rows[0] as Row).y}`;
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1] as Row;
    const b = rows[i] as Row;
    const dy = b.y - a.y;
    const bend = (xOf(a) === xOf(b) ? 0.35 : 0.6) * dy;
    // Đoạn thẳng đứng (hai nút cùng cột) lượn nhẹ sang một bên cho mềm mại.
    const sway = xOf(a) === xOf(b) ? (i % 2 === 0 ? 6 : -6) : 0;
    d += ` C ${xOf(a) + sway} ${a.y + bend}, ${xOf(b) + sway} ${b.y - bend}, ${xOf(b)} ${b.y}`;
  }
  return d;
}

function dayTitle(stop: RouteStop, first: string | null, hideDates: boolean): { label: string; sub?: string; outside?: boolean } {
  if (stop.dayNumber === 0 && stop.visitDate) return { label: formatVnDayShort(stop.visitDate), sub: 'Ngoài ngày ở', outside: true };
  const number = stop.dayNumber ?? dayNumberOf(first, stop.visitDate);
  if (!stop.visitDate && !number) return { label: 'Chưa xếp ngày' };
  return {
    label: number ? `Ngày ${number}` : 'Ngày đi',
    sub: !hideDates && stop.visitDate ? formatVnDayShort(stop.visitDate) : undefined,
  };
}

/**
 * "Bản đồ kế hoạch" nhỏ của lịch trình: con đường uốn lượn từ chỗ nghỉ qua lần lượt từng điểm (theo ngày → buổi), mỗi
 * điểm là một nút ảnh tròn đánh số, có nhãn buổi + giờ; mốc "Ngày 1, 2…" nằm trên đường. Chỉ thể hiện thứ tự đi, không
 * phải bản đồ địa lý. Dùng ở trang lịch trình (tab "Lộ trình"), tab lịch trình của đơn và trang chia sẻ.
 */
export default function JourneyRoute({
  stops,
  home,
  firstDay,
  hideDates = false,
  onSelect,
  selectedKey,
  size = 'regular',
  emptyHint,
  className = '',
  today = null,
  onCheckin,
}: JourneyRouteProps) {
  const dims = SIZES[size];
  const stopHeight = onCheckin ? CHECKIN_STOP[size] : dims.stop;

  if (stops.length === 0) {
    return (
      <div className={`rounded-2xl border-2 border-dashed border-teal-200 bg-[#f4fbf8] px-5 py-8 text-center text-sm text-slate-600 ${className}`}>
        <Mountain className="mx-auto mb-2 h-6 w-6 text-[#0a7d64]" />
        {emptyHint ?? 'Chưa có điểm nào trong lịch trình.'}
      </div>
    );
  }

  const first = firstDay ?? stops.map((s) => s.visitDate).filter((d): d is string => !!d).sort()[0] ?? null;
  const rows: Row[] = [];
  let y = 0;
  const push = (row: RowInput, height: number) => {
    rows.push({ ...row, y: y + height / 2 } as Row);
    y += height;
  };
  if (home) push({ kind: 'home' }, dims.edge);
  let currentDay: string | undefined;
  stops.forEach((stop, index) => {
    const dayKey = stop.dayNumber ? `n${stop.dayNumber}` : stop.visitDate ?? 'none';
    if (dayKey !== currentDay) {
      currentDay = dayKey;
      push({ kind: 'day', ...dayTitle(stop, first, hideDates), isToday: !!today && stop.visitDate === today }, dims.day);
    }
    push({ kind: 'stop', stop, order: index + 1, side: index % 2 === 0 ? 'left' : 'right' }, stopHeight);
  });
  push({ kind: 'end' }, dims.edge);
  const height = y;
  const path = trailPath(rows);
  const nodeHalf = dims.node / 2;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-teal-100 bg-[#f4fbf8] ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(circle at 12% 18%, rgba(10,125,100,0.10) 0, transparent 38%), radial-gradient(circle at 88% 62%, rgba(245,158,11,0.10) 0, transparent 40%), repeating-radial-gradient(circle at 70% 30%, transparent 0 22px, rgba(10,125,100,0.05) 22px 23px)',
      }}
    >
      <div className="relative mx-auto w-full max-w-[560px]" style={{ height }}>
        {/* Con đường: lớp nền rộng mờ + vạch chấm ở giữa, như đường mòn trên bản đồ */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={path} fill="none" stroke="#cdeee3" strokeWidth={size === 'compact' ? 14 : 18} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={path} fill="none" stroke="#0a7d64" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="0.5 9" vectorEffect="non-scaling-stroke" />
        </svg>

        {rows.map((row, i) => {
          if (row.kind === 'home' || row.kind === 'end') {
            const isHome = row.kind === 'home';
            return (
              <div
                key={`${row.kind}-${i}`}
                className="absolute flex items-center gap-2"
                style={{ left: `${X.center}%`, top: row.y, transform: `translate(-${dims.home / 2}px, -50%)`, maxWidth: `calc(50% + ${dims.home / 2 - 8}px)` }}
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-full border-[3px] border-white shadow-md ${isHome ? 'bg-[#0a7d64] text-white' : 'bg-amber-400 text-white'}`}
                  style={{ width: dims.home, height: dims.home }}
                >
                  {isHome ? <Home className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
                </span>
                <span className="min-w-0 truncate rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm ring-1 ring-black/5">
                  {isHome ? (home ? `Xuất phát · ${home.name}` : 'Xuất phát') : home ? 'Về chỗ nghỉ' : 'Kết thúc hành trình'}
                </span>
              </div>
            );
          }
          if (row.kind === 'day') {
            return (
              <div key={`day-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${X.center}%`, top: row.y }}>
                <span
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold shadow-sm ring-1 ${
                    row.isToday ? 'bg-[#0a7d64] text-white ring-[#0a7d64]' : row.outside ? 'bg-amber-50 text-amber-900 ring-amber-300' : 'bg-white text-[#06604a] ring-teal-200'
                  }`}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  {row.label}
                  {row.isToday ? (
                    <span className="rounded-full bg-amber-300 px-1.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-950">Hôm nay</span>
                  ) : (
                    row.sub && <span className={`font-semibold ${row.outside ? 'text-amber-700' : 'text-slate-500'}`}>· {row.sub}</span>
                  )}
                </span>
              </div>
            );
          }

          const { stop, order, side } = row;
          const tone = SESSION_TONE[stop.session];
          const selected = selectedKey != null && selectedKey === stop.key;
          const left = side === 'left';
          const node = (
              <span className="relative block shrink-0" style={{ width: dims.node, height: dims.node }}>
                {stop.status === 'next' && <span className="absolute -inset-1.5 animate-ping rounded-full bg-amber-300/50" />}
                <span
                  className={`relative block h-full w-full overflow-hidden rounded-full border-[3px] border-white bg-slate-100 shadow-md ring-2 ${selected ? 'ring-[#0a7d64] ring-offset-2' : tone.ring}`}
                >
                  {stop.imageUrl ? (
                    <img src={mediaUrl(stop.imageUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlaceholder Icon={Mountain} />
                  )}
                </span>
                <span className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#0a7d64] text-[11px] font-extrabold text-white shadow">
                  {order}
                </span>
                {stop.status === 'done' && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
                {onCheckin && stop.status !== 'done' && (
                  <span aria-hidden className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-orange-500 text-white shadow">
                    <Camera className="h-3.5 w-3.5" />
                  </span>
                )}
              </span>
          );
          const label = (
              <span className={`block min-w-0 rounded-xl bg-white/85 px-2 py-1 shadow-xs ring-1 ring-black/5 backdrop-blur-[1px] ${left ? 'text-left' : 'text-right'}`}>
                <span className={`line-clamp-2 font-extrabold leading-snug text-slate-900 ${size === 'compact' ? 'text-[13px]' : 'text-sm'}`}>{stop.name}</span>
                <span className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${tone.chip}`}>
                  {SESSION_LABEL[stop.session]} · {stopTimeLabel(stop)}
                </span>
                {stop.note && <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">{stop.note}</span>}
              </span>
          );
          const style = {
            top: row.y,
            ...(left ? { left: `calc(${X.left}% - ${nodeHalf}px)` } : { right: `calc(${100 - X.right}% - ${nodeHalf}px)` }),
            maxWidth: `calc(${X.right - X.left + 21}% + ${nodeHalf}px)`,
          };
          const layout = `absolute flex -translate-y-1/2 items-center gap-2.5 ${left ? '' : 'flex-row-reverse'}`;
          if (onCheckin) {
            // Lịch trình của khách: ảnh + tên mở cẩm nang; nút Check-in riêng ngay dưới tên (không lồng nút trong nút).
            const done = stop.status === 'done';
            const isNext = stop.status === 'next';
            return (
              <div key={`stop-${stop.key}`} className={`${layout} p-1`} style={style}>
                <button
                  type="button"
                  onClick={() => (onSelect ? onSelect(stop.key) : onCheckin(stop.key))}
                  aria-label={`${order}. ${stop.name} — mở cẩm nang`}
                  className="shrink-0 rounded-full transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-[#0a7d64] cursor-pointer"
                >
                  {node}
                </button>
                <span className={`flex min-w-0 flex-col gap-1.5 ${left ? 'items-start' : 'items-end'}`}>
                  <button
                    type="button"
                    onClick={() => (onSelect ? onSelect(stop.key) : onCheckin(stop.key))}
                    className={`min-w-0 rounded-xl text-left transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-[#0a7d64] cursor-pointer ${left ? '' : 'text-right'}`}
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCheckin(stop.key)}
                    aria-label={done ? `Xem check-in ${stop.name}` : `Check-in ${stop.name}`}
                    className={`relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold shadow-md transition-transform active:scale-95 cursor-pointer ${
                      done
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300'
                        : 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-orange-500/30 hover:brightness-105'
                    }`}
                  >
                    {isNext && !done && <span className="absolute -inset-1 animate-ping rounded-full bg-orange-400/40" aria-hidden />}
                    {done ? <CheckCircle2 className="relative h-4 w-4" /> : <Camera className="relative h-4 w-4" />}
                    <span className="relative">{done ? 'Đã check-in' : isNext ? 'Check-in ngay' : 'Check-in'}</span>
                  </button>
                </span>
              </div>
            );
          }
          return onSelect ? (
            <button
              key={`stop-${stop.key}`}
              type="button"
              onClick={() => onSelect(stop.key)}
              aria-label={`${order}. ${stop.name} — ${SESSION_LABEL[stop.session]}`}
              aria-pressed={selected}
              className={`${layout} rounded-2xl p-1 text-left transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-[#0a7d64] cursor-pointer`}
              style={style}
            >
              {node}
              {label}
            </button>
          ) : (
            <div key={`stop-${stop.key}`} className={`${layout} p-1`} style={style}>
              {node}
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
