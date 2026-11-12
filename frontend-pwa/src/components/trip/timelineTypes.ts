import type { DaySession } from '@/types/journey';
import type { ItemKind, ItemOrigin, TripDish } from '@/types/trip';

/**
 * Một dòng của lịch trình theo giờ (mục lịch trình đang lên hoặc đã lưu) — dựng bằng timelineRows.ts. Tách khỏi
 * TripTimeline.tsx để tệp .ts (bản đồ lộ trình, sheet thêm mục…) dùng được kiểu mà không kéo theo component.
 */
export interface TimelineRow {
  key: string;
  kind: ItemKind;
  dayIndex: number;
  startTime: string | null;
  endTime: string | null;
  /** Buổi của mục không có giờ riêng (lịch trình cũ). */
  session: DaySession | null;
  title: string;
  note: string | null;
  place: { id: number; name: string; cover: string | null; regionName?: string | null } | null;
  addons: string[];
  /** Ảnh món của mục ăn uống (món của mục; mục cũ lấy từ gói). */
  dishes: TripDish[];
  /** Điểm có thể đổi nhanh ("Kim Nọi / Sống Lưng Khủng Long"). */
  alternative: { id: number; name: string } | null;
  /** Trang lịch trình đã lưu: đã check-in / điểm tiếp theo hôm nay. */
  status?: 'done' | 'next';
  /** Số thứ tự điểm tham quan trong ngày (1..n) — số trên nút tròn và ghim bản đồ; mục khác không có. */
  order?: number;
  /** Nguồn mục: nhãn "Gợi ý" / "Bạn thêm" (máy chủ cũ, trang chia sẻ: không có). */
  origin?: ItemOrigin;
  /** Mục gốc trong lịch trình gợi ý ("Gợi ý gốc … · Khôi phục"). */
  sourceStopId?: number | null;
  /** Id cho link /destinations/:id trên thẻ (điểm đến công khai); null = không gắn link. */
  placeLinkId?: number | null;
}
