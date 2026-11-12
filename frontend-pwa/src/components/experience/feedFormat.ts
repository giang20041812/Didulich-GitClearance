import type { FeedItem, JourneyView } from '@/types/journey';

/** Tên hiển thị của một bài: tên khách đặt, không có thì "Lịch trình của {tên gọi}". */
export const feedTitle = (item: Pick<FeedItem, 'title' | 'ownerName'>) =>
  item.title?.trim() || (item.ownerName ? `Lịch trình của ${item.ownerName}` : 'Lịch trình Mù Cang Chải');

/**
 * Dòng tóm tắt của bài: "2 ngày · 4 điểm · Nghỉ tại Homestay Anh Túc". Tên bài đã nói số ngày ("… 2 ngày 1 đêm") thì
 * không nhắc lại.
 */
export function feedMeta(item: Pick<FeedItem, 'dayCount' | 'stopCount' | 'basePlace'>, title = ''): string {
  const daysInTitle = !!item.dayCount && title.toLowerCase().includes(`${item.dayCount} ngày`);
  return [
    item.dayCount && !daysInTitle ? `${item.dayCount} ngày` : null,
    `${item.stopCount} điểm`,
    item.basePlace ? `Nghỉ tại ${item.basePlace.name}` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Đoạn trích của bài (như đoạn mở đầu một bài blog): lưu bút đầu tiên; chưa có lưu bút thì các điểm theo thứ tự đi
 * ("Đèo Khau Phạ → Đồi Mâm Xôi → …") — số ngày, số điểm đã nằm ở dòng tóm tắt (feedMeta), không nhắc lại.
 */
export function feedExcerpt(item: Pick<FeedItem, 'note' | 'checkins' | 'stopCount' | 'placeNames'>): string {
  const note = item.note?.trim() || item.checkins?.find((c) => c.note?.trim())?.note?.trim();
  if (note) return note;
  if (item.placeNames.length === 0) return '';
  return `${item.placeNames.join(' → ')}${item.stopCount > item.placeNames.length ? ' → …' : ''}`;
}

/** Chữ cái đầu cho avatar (tên gọi đã là tên cuối, vd. "Hà"). */
export const ownerInitial = (name: string | null | undefined) => (name?.trim().charAt(0) || 'K').toUpperCase();

const AVATAR_TONES = [
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
];

/** Màu avatar cố định theo tên — cùng một người luôn cùng một màu. */
export function avatarTone(name: string | null | undefined): string {
  const key = name?.trim() || '?';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? 'bg-emerald-100 text-emerald-800';
}

const DAY_MS = 86_400_000;

/** "Hôm nay", "Hôm qua", "3 ngày trước", "2 tuần trước", quá 30 ngày thì ngày cụ thể. */
export function relativeDay(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const date = new Date(time);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / DAY_MS);
  if (days <= 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Ảnh đại diện cho lịch trình của tôi (sheet chia sẻ): ảnh check-in đầu tiên → ảnh điểm → ảnh chỗ nghỉ. */
export function journeyThumb(journey: JourneyView): string | null {
  const checkinPhoto = journey.stops.find((s) => s.checkin?.photoUrl && !s.checkin.hidden)?.checkin?.photoUrl;
  return checkinPhoto ?? journey.stops.find((s) => s.coverImageUrl)?.coverImageUrl ?? journey.basePlace?.coverImageUrl ?? null;
}
