import { Check, Flag, Home } from 'lucide-react';
import type { DaySession } from '@/types/journey';
import { SESSION_TONE } from '@/lib/journey';
import { mediaUrl } from '@/lib/mediaUrl';

export interface MiniRouteStop {
  key: string | number;
  imageUrl?: string | null;
  session: DaySession;
  done?: boolean;
}

interface MiniRouteProps {
  stops: MiniRouteStop[];
  /** Hiện tối đa chừng này điểm, còn lại gộp "+N". */
  max?: number;
  className?: string;
}

/** Nút lệch lên / xuống xen kẽ (px) để con đường uốn lượn như route lớn, không thành một hàng thẳng. */
const LIFT = 7;

/**
 * Lộ trình thu nhỏ trên thẻ chuyến đi: chỗ nghỉ → các điểm (ảnh tròn / số thứ tự, viền màu buổi, dấu tích nếu đã
 * check-in) → về; các nút so le lên xuống, nối bằng đường chấm uốn lượn — gợi hình "bản đồ kế hoạch" của trang lịch trình.
 */
export default function MiniRoute({ stops, max = 5, className = '' }: MiniRouteProps) {
  const shown = stops.slice(0, max);
  const more = stops.length - shown.length;
  const nodes = shown.length + (more > 0 ? 1 : 0) + 2;
  // Khung cao 52px (viewBox cao 52): nút thứ k nằm ở y = 26 ∓ LIFT; đường cong chữ S nối tâm các nút liên tiếp.
  const yOf = (k: number) => 26 + (k % 2 === 0 ? -LIFT : LIFT);
  const xOf = (k: number) => (k / (nodes - 1)) * 100;
  const trail = Array.from({ length: nodes - 1 }, (_, i) => {
    const mid = (xOf(i) + xOf(i + 1)) / 2;
    return `C ${mid} ${yOf(i)}, ${mid} ${yOf(i + 1)}, ${xOf(i + 1)} ${yOf(i + 1)}`;
  }).join(' ');
  const shift = (k: number) => ({ transform: `translateY(${k % 2 === 0 ? -LIFT : LIFT}px)` });

  return (
    <div className={`relative h-[52px] ${className}`} aria-hidden>
      <svg className="absolute inset-x-[14px] top-0 h-full w-[calc(100%-28px)]" viewBox="0 0 100 52" preserveAspectRatio="none">
        <path d={`M 0 ${yOf(0)} ${trail}`} fill="none" stroke="#cdeee3" strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={`M 0 ${yOf(0)} ${trail}`} fill="none" stroke="#0a7d64" strokeWidth={2} strokeLinecap="round" strokeDasharray="0.5 5" vectorEffect="non-scaling-stroke" opacity={0.7} />
      </svg>
      <div className="relative flex h-full items-center justify-between">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#0a7d64] text-white shadow-sm" style={shift(0)}>
          <Home className="h-3.5 w-3.5" />
        </span>
        {shown.map((stop, i) => (
          <span key={stop.key} style={shift(i + 1)} className={`relative h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-white bg-white shadow-sm ring-2 ${SESSION_TONE[stop.session].ring}`}>
            {stop.imageUrl ? (
              <img src={mediaUrl(stop.imageUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[#f4fbf8] text-[11px] font-extrabold text-[#06604a]">{i + 1}</span>
            )}
            {stop.done && (
              <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/80 text-white">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
            )}
          </span>
        ))}
        {more > 0 && (
          <span style={shift(shown.length + 1)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[11px] font-extrabold text-slate-600 shadow-sm">+{more}</span>
        )}
        <span style={shift(nodes - 1)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white bg-amber-400 text-white shadow-sm">
          <Flag className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}
