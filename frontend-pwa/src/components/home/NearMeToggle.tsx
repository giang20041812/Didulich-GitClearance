import { LocateFixed, X } from 'lucide-react';

interface NearMeToggleProps {
  active: boolean;
  onToggle: () => void;
  /** "điểm đến" | "homestay" — dùng cho dòng phụ và nhãn trình đọc màn hình. */
  noun: string;
  className?: string;
}

/**
 * Nút "Gần tôi" nổi bật ở trang chủ: viên thuốc tô màu thương hiệu, icon định vị trong vòng trắng kèm chấm vàng nhấp
 * nháy (gợi "vị trí trực tiếp"), dòng phụ nói rõ sẽ tìm gì. Đang bật thì đổi sang nền đậm, icon vàng và dấu × để tắt.
 */
export default function NearMeToggle({ active, onToggle, noun, className = '' }: NearMeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? `Tắt "Gần tôi", quay lại gợi ý ${noun}` : `Tìm ${noun} gần vị trí của tôi`}
      className={`${className} group relative inline-flex shrink-0 items-center gap-2.5 rounded-full py-1.5 pl-1.5 text-left transition-all duration-200 active:scale-[0.97] cursor-pointer ${
        active
          ? 'bg-[#054d3d] pr-2 text-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.25)] ring-2 ring-[var(--color-sun)]/70'
          : 'bg-gradient-to-r from-[#052620] to-[#0d4a3c] pr-4 text-white shadow-[0_6px_16px_-6px_rgba(5,38,32,0.65)] ring-1 ring-[#0a3a31]/30 hover:-translate-y-px hover:shadow-[0_10px_22px_-8px_rgba(5,38,32,0.75)]'
      }`}
    >
      <span
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
          active ? 'bg-[var(--color-sun)] text-[#0a2e26]' : 'bg-white text-[#052620]'
        }`}
      >
        <LocateFixed className="h-[18px] w-[18px]" strokeWidth={2.4} />
        {!active && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-[#052620]" />
          </span>
        )}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[13.5px] font-extrabold tracking-tight">Gần tôi</span>
        <span className={`text-[11px] font-semibold ${active ? 'text-[var(--color-sun-light)]' : 'text-white/85'}`}>
          {active ? 'Đang xem quanh bạn' : `${noun.charAt(0).toUpperCase()}${noun.slice(1)} quanh bạn`}
        </span>
      </span>
      {active && (
        <span className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/15 transition-colors group-hover:bg-white/25" aria-hidden>
          <X className="h-3.5 w-3.5" strokeWidth={2.6} />
        </span>
      )}
    </button>
  );
}
