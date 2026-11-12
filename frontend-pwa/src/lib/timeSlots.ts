import { BedDouble, Coffee, Mountain, Soup, Sun, Sunrise, Sunset, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { NearMeKind } from '@/services/placeService';

/**
 * Khung giờ trong ngày cho "Gợi ý lúc này" ở trang chủ: mỗi khung gợi ý một loại địa điểm (sáng sớm đi ngắm bình minh,
 * giờ ăn thì gợi ý quán, khuya thì tìm chỗ nghỉ). Giờ tính theo đồng hồ máy khách.
 */
export interface TimeSlot {
  id: string;
  /** Phút trong ngày bắt đầu khung (0–1439). */
  start: number;
  kind: NearMeKind;
  Icon: LucideIcon;
  /** Nhãn ngắn của khung giờ. */
  label: string;
  title: string;
  hint: string;
  /** Màu nhấn của khung (nền chip giờ). */
  tone: string;
  /** Quầng sáng nền section theo khung giờ (bình minh vàng cam, hoàng hôn hồng, đêm chàm...). */
  glow: string;
}

const at = (h: number, m = 0) => h * 60 + m;

/** Xếp theo giờ bắt đầu; khung cuối kéo qua nửa đêm tới khung đầu. */
export const TIME_SLOTS: TimeSlot[] = [
  {
    id: 'sunrise', start: at(4, 30), kind: 'ATTRACTION', Icon: Sunrise, label: 'Săn bình minh',
    title: 'Đón bình minh quanh bạn', hint: 'Biển mây, nắng sớm đẹp nhất trước 7 giờ — đi ngay kẻo lỡ.',
    tone: 'from-amber-400 to-orange-500', glow: 'rgb(251 191 36 / 0.3)',
  },
  {
    id: 'breakfast', start: at(7), kind: 'RESTAURANT', Icon: Coffee, label: 'Bữa sáng',
    title: 'Ăn sáng gần bạn', hint: 'Nạp năng lượng trước một ngày khám phá.',
    tone: 'from-orange-400 to-rose-500', glow: 'rgb(249 115 22 / 0.26)',
  },
  {
    id: 'morning', start: at(9), kind: 'ATTRACTION', Icon: Mountain, label: 'Buổi sáng',
    title: 'Đi chơi buổi sáng', hint: 'Sương tan, trời trong — lúc đẹp để đi bộ và chụp ảnh.',
    tone: 'from-emerald-500 to-teal-600', glow: 'rgb(45 212 191 / 0.24)',
  },
  {
    id: 'lunch', start: at(11), kind: 'RESTAURANT', Icon: Soup, label: 'Bữa trưa',
    title: 'Nghỉ trưa, ăn món bản địa', hint: 'Quán gần nhất để nghỉ chân giữa ngày.',
    tone: 'from-orange-400 to-rose-500', glow: 'rgb(249 115 22 / 0.26)',
  },
  {
    id: 'afternoon', start: at(13, 30), kind: 'ATTRACTION', Icon: Sun, label: 'Buổi chiều',
    title: 'Khám phá tiếp buổi chiều', hint: 'Nắng dịu dần — ghé thêm một điểm trước khi về.',
    tone: 'from-emerald-500 to-teal-600', glow: 'rgb(250 204 21 / 0.22)',
  },
  {
    id: 'sunset', start: at(16, 30), kind: 'ATTRACTION', Icon: Sunset, label: 'Hoàng hôn',
    title: 'Ngắm hoàng hôn trên núi', hint: 'Đến sớm 20–30 phút để chọn chỗ đứng đẹp.',
    tone: 'from-rose-500 to-violet-600', glow: 'rgb(244 63 94 / 0.28)',
  },
  {
    id: 'dinner', start: at(18, 30), kind: 'RESTAURANT', Icon: UtensilsCrossed, label: 'Bữa tối',
    title: 'Bữa tối ấm bụng gần bạn', hint: 'Đường đèo tối khó đi — nên chọn quán gần chỗ nghỉ.',
    tone: 'from-orange-500 to-red-600', glow: 'rgb(239 68 68 / 0.24)',
  },
  {
    id: 'night', start: at(21, 30), kind: 'HOMESTAY', Icon: BedDouble, label: 'Nghỉ đêm',
    title: 'Tìm chỗ nghỉ gần bạn', hint: 'Đã muộn — nghỉ ngơi để mai dậy sớm săn mây.',
    tone: 'from-indigo-500 to-slate-700', glow: 'rgb(129 140 248 / 0.3)',
  },
];

/** Khung giờ đang diễn ra và khung kế tiếp. */
export function slotAt(date: Date): { current: TimeSlot; next: TimeSlot } {
  const minutes = date.getHours() * 60 + date.getMinutes();
  let index = TIME_SLOTS.length - 1;
  for (let i = 0; i < TIME_SLOTS.length; i++) {
    if (minutes >= TIME_SLOTS[i]!.start) index = i;
  }
  return { current: TIME_SLOTS[index]!, next: TIME_SLOTS[(index + 1) % TIME_SLOTS.length]! };
}

/** "07:00" từ phút trong ngày. */
export const formatSlotStart = (start: number) =>
  `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
