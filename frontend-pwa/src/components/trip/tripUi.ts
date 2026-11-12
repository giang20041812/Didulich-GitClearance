import { BedDouble, Bus, Camera, Coffee, Flame, MapPin, UserRound, UtensilsCrossed, Wind, Sparkles, type LucideIcon } from 'lucide-react';
import type { ItemKind, ItemOrigin } from '@/types/trip';
import { addDaysKey } from '@/lib/roomAvailability';

/** Ba bước lên lịch trình — sheet "Hướng dẫn" của trang tạo lịch trình (chỉ mở khi khách bấm). */
export const BUILD_STEPS = [
  { title: 'Chọn tiêu chí', text: 'Thời gian (2N1Đ, 3N2Đ…) trước, rồi ăn uống, trải nghiệm — lịch trình gợi ý hiện ngay bên dưới.' },
  { title: 'Sửa theo ý bạn', text: 'Mỗi ngày một trang: thêm, bỏ, đổi giờ từng mục; thêm điểm tham quan từ bản đồ.' },
  { title: 'Lưu, rồi chọn ngày đi', text: 'Miễn phí — lưu xong chọn ngày đi và homestay cho ô Chỗ ở, nhận nhắc giờ, check-in từng điểm.' },
] as const;

// ─── Tag hiển thị + chip chọn (gọn, bo 4–6px) ────────────────────

/** Màu tag hiển thị: green = thời lượng / "Homestay này", amber = giá / "Bắt đầu hôm nay", muted = sở thích, outline = ngày, số người, cham = nhấn tối. */
export type TagTone = 'green' | 'amber' | 'muted' | 'outline' | 'cham';

const TAG_TONES: Record<TagTone, string> = {
  green: 'bg-[#e3f4ec] text-[#06604a]',
  amber: 'bg-[#fdf3d7] text-[#7a5200]',
  muted: 'bg-[#eef2e8] text-[#3d5a52]',
  outline: 'border border-[#e3e8dc] bg-white text-slate-800',
  cham: 'bg-[var(--color-cham)] text-white',
};

/** Tag chỉ để xem (không bấm): cao 22px, chữ 11px đậm, bo 4px — "2N1Đ", "999K/người", "11/10 → 12/10". */
export const tagClass = (tone: TagTone = 'green') =>
  `inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded px-[7px] text-[11px] font-extrabold tabular-nums ${TAG_TONES[tone]}`;

const CHIP_SIZE = {
  /** Cao 40px, vùng chạm 44px, chữ 14px. */
  md: 'min-h-10 gap-1.5 px-3 text-sm before:-inset-y-0.5',
  /** Tag tiêu chí, loại mục: cao 32px, vùng chạm 44px, chữ 13px. */
  sm: 'min-h-8 gap-1 px-2.5 text-[13px] before:-inset-y-1.5',
} as const;

const CHIP_BASE = 'relative inline-flex items-center justify-center rounded-md transition-colors before:absolute before:inset-x-0 '
  + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a7d64]';

/**
 * Chip chọn được (tag tiêu chí, loại mục, dịch vụ), bo 6px. Đang chọn: viền xanh 1.5px + nền xanh nhạt (giao diện thêm icon
 * Check); không chọn được: viền đứt, chữ xám.
 */
export function chipClass(active: boolean, disabled = false, size: keyof typeof CHIP_SIZE = 'md'): string {
  const base = `${CHIP_BASE} ${CHIP_SIZE[size]}`;
  if (disabled) return `${base} cursor-not-allowed border border-dashed border-slate-300 bg-slate-50 font-bold text-slate-400`;
  return active
    ? `${base} cursor-pointer border-[1.5px] border-[#0a7d64] bg-[#e3f4ec] font-extrabold text-[#06604a]`
    : `${base} cursor-pointer border border-[#d6dfd0] bg-white font-bold text-slate-800 hover:border-[#0a7d64] hover:text-[#06604a]`;
}

const BADGE_BASE = 'inline-flex h-[18px] shrink-0 items-center whitespace-nowrap rounded-[3px] px-[5px] text-[10px] font-extrabold';

/** Nhãn nguồn của mục trên lịch trình đã lưu: "Gợi ý" (viền) / "Bạn thêm" (nền chàm). */
export const ORIGIN_BADGE: Record<ItemOrigin, { label: string; className: string }> = {
  SUGGESTED: { label: 'Gợi ý', className: `${BADGE_BASE} border border-[#cfdac8] bg-white text-[#3d5a52]` },
  CUSTOM: { label: 'Bạn thêm', className: `${BADGE_BASE} bg-[var(--color-cham)] text-white` },
};

/**
 * Giao diện chung của lịch trình theo giờ: mỗi loại mục một màu (chàm = di chuyển, san hô = ăn uống, xanh lá = tham
 * quan, nắng = hoạt động, viền đứt = chỗ ở, xám = nghỉ ngơi) và icon; icon dịch vụ thêm.
 */
export const KIND_META: Record<ItemKind, { label: string; Icon: LucideIcon; node: string; chip: string }> = {
  TRANSPORT: { label: 'Di chuyển', Icon: Bus, node: 'bg-[var(--color-cham)] text-white', chip: 'bg-indigo-50 text-[var(--color-cham)]' },
  MEAL: { label: 'Ăn uống', Icon: UtensilsCrossed, node: 'bg-[var(--color-coral)] text-white', chip: 'bg-orange-50 text-orange-700' },
  PLACE: { label: 'Tham quan', Icon: MapPin, node: 'bg-[var(--color-primary)] text-white', chip: 'bg-emerald-50 text-[#06604a]' },
  ACTIVITY: { label: 'Hoạt động', Icon: Flame, node: 'bg-[var(--color-sun)] text-amber-950', chip: 'bg-amber-50 text-amber-800' },
  STAY: { label: 'Chỗ ở', Icon: BedDouble, node: 'border-2 border-dashed border-[var(--color-primary)] bg-white text-[var(--color-primary)]', chip: 'bg-teal-50 text-[#06604a]' },
  FREE: { label: 'Nghỉ ngơi', Icon: Coffee, node: 'bg-slate-200 text-slate-600', chip: 'bg-slate-100 text-slate-600' },
};

/** Thứ tự các loại trong menu "Thêm mục". */
export const ADDABLE_KINDS: ItemKind[] = ['PLACE', 'MEAL', 'ACTIVITY', 'TRANSPORT', 'FREE', 'STAY'];

/** Tên gợi ý khi thêm mục mới theo loại. */
export const DEFAULT_TITLE: Record<ItemKind, string> = {
  PLACE: 'Điểm tham quan',
  MEAL: 'Ăn uống',
  ACTIVITY: 'Hoạt động',
  TRANSPORT: 'Di chuyển',
  STAY: 'Nhận phòng',
  FREE: 'Nghỉ ngơi',
};

const ADDON_ICONS: Record<string, LucideIcon> = {
  FLYCAM: Camera,
  PARAGLIDING: Wind,
  LOCAL_GUIDE: UserRound,
  FOOD_BOOKING: UtensilsCrossed,
  TRANSFER_HN_MCC: Bus,
};

export const addonIcon = (code: string): LucideIcon => ADDON_ICONS[code] ?? Sparkles;

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "T7 17/10" — ngày của "Ngày N" khi lịch trình đã có ngày đi. */
export function dayDateLabel(startDate: string | null, dayIndex: number): string | null {
  if (!startDate) return null;
  const key = addDaysKey(startDate, dayIndex - 1);
  const weekday = WEEKDAYS[new Date(`${key}T12:00:00`).getDay()] ?? '';
  return `${weekday} ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** "17/10 → 18/10" hoặc "Chưa chọn ngày". */
export function tripDatesLabel(startDate: string | null, days: number): string {
  if (!startDate) return 'Chưa chọn ngày đi';
  const end = addDaysKey(startDate, Math.max(1, days) - 1);
  const short = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
  return days > 1 ? `${dayDateLabel(startDate, 1)} → ${short(end)}` : (dayDateLabel(startDate, 1) ?? '');
}
