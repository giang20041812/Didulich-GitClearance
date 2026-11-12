import type { LucideIcon } from 'lucide-react';

/**
 * Placeholder ảnh vắng — vẽ phong cảnh ruộng bậc thang theo bảng màu brand
 * (sương sớm → lúa non → lúa chín → chàm) thay vì ô xám chết. Khi homestay
 * chưa có ảnh, thẻ vẫn trông được thiết kế có chủ đích chứ không "lỗi".
 */
export default function ImagePlaceholder({
  label,
  Icon,
  className = '',
  variant = 'card',
}: {
  /** Chú thích nhỏ dưới chân, vd "Ảnh đang được cập nhật". */
  label?: string;
  Icon?: LucideIcon;
  className?: string;
  /** card = đậm dày (thẻ danh sách); hero = mỏng nhẹ (gallery lớn). */
  variant?: 'card' | 'hero';
}) {
  const iconSize = variant === 'hero' ? 'h-10 w-10' : 'h-7 w-7';
  const labelClass = variant === 'hero' ? 'text-[13px]' : 'text-[11px]';

  return (
    <div className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-[#eef3e2] ${className}`} aria-hidden={!label}>
      {/* Nền phong cảnh: mặt trời + 3 tầng ruộng bậc thang */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="ip-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f6f8ec" />
            <stop offset="100%" stopColor="#edf2dd" />
          </linearGradient>
        </defs>
        <rect width="200" height="120" fill="url(#ip-sky)" />
        {/* Mặt trời lúa chín */}
        <circle cx="152" cy="34" r="12" fill="#facc15" opacity="0.85" />
        <circle cx="152" cy="34" r="18" fill="#facc15" opacity="0.2" />
        {/* Tầng ruộng bậc thang */}
        <path d="M0,78 Q30,64 60,76 T120,72 T200,80 L200,120 L0,120 Z" fill="#bfe3c4" />
        <path d="M0,92 Q36,78 72,90 T148,86 T200,94 L200,120 L0,120 Z" fill="#7fc9a1" />
        <path d="M0,106 Q42,94 84,104 T160,100 T200,108 L200,120 L0,120 Z" fill="#0a7d64" />
        {/* Đường ruộng uốn lượn gợi dáng bậc thang */}
        <path d="M0,92 Q36,78 72,90 T148,86 T200,94" fill="none" stroke="#eaf4ea" strokeWidth="1.6" opacity="0.9" />
        <path d="M0,106 Q42,94 84,104 T160,100 T200,108" fill="none" stroke="#d7ecdf" strokeWidth="1.4" opacity="0.8" />
      </svg>

      {/* Lớp mây mù nhẹ */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent" />

      {/* Icon + nhãn giữa */}
      <div className="relative z-10 flex flex-col items-center gap-1.5 px-3 text-center">
        {Icon && <Icon className={`${iconSize} text-[#0a7d64]`} strokeWidth={1.7} />}
        {label && <span className={`${labelClass} font-bold text-[#3d5a4e]`}>{label}</span>}
      </div>
    </div>
  );
}
