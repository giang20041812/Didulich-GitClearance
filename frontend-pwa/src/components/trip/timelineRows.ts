import type { JourneyView, SharedItemView } from '@/types/journey';
import type { TripCatalog, TripDish, TripItem, TripPlace, TripTemplate } from '@/types/trip';
import { dayNumberOf, journeyRange, sortStops } from '@/lib/journey';
import { sortItems, templateItemFor } from '@/lib/tripPlanner';
import type { TimelineRow } from './timelineTypes';

type Lookups = Pick<TripCatalog, 'places' | 'dishes'> | null | undefined;

/** Danh mục của tỉnh đã đánh chỉ mục (dựng một lần cho cả danh sách dòng). */
interface Index {
  placeById: Map<number, TripPlace>;
  placeBySlug: Map<string, TripPlace>;
  dishById: Map<number, TripDish>;
  dishBySlug: Map<string, TripDish>;
}

const indexOf = (lookups: Lookups): Index | null => (lookups ? {
  placeById: new Map(lookups.places.map((p) => [p.id, p])),
  placeBySlug: new Map(lookups.places.map((p) => [p.slug, p])),
  dishById: new Map(lookups.dishes.map((d) => [d.id, d])),
  dishBySlug: new Map(lookups.dishes.map((d) => [d.slug, d])),
} : null);

const present = <T>(value: T | undefined): value is T => value !== undefined;

/** Trường của mục dùng để lấy ảnh món + phương án đổi điểm (dishIds / alternativeIds null = mục cũ, chưa có). */
interface EnrichSource {
  dayIndex: number;
  startTime: string | null;
  title: string;
  dishIds: number[] | null;
  alternativeIds: number[] | null;
}

/**
 * Ảnh món + phương án đổi điểm của một mục: theo món / phương án của chính mục; mục cũ (chưa có) mới dò mục gốc trong gói
 * theo ngày + giờ (templateItemFor) như trước.
 */
function enrich(index: Index | null, template: TripTemplate | null | undefined, item: EnrichSource, placeId: number | null) {
  if (!index) return { dishes: [], alternative: null };
  const legacy = item.dishIds == null || item.alternativeIds == null ? templateItemFor(template, item) : undefined;
  const dishes = item.dishIds != null
    ? item.dishIds.map((id) => index.dishById.get(id)).filter(present)
    : (legacy?.dishes ?? []).map((slug) => index.dishBySlug.get(slug)).filter(present);
  let options: TripPlace[] = [];
  if (item.alternativeIds != null) options = item.alternativeIds.map((id) => index.placeById.get(id)).filter(present);
  else if (legacy?.alternatives?.length) {
    options = [legacy.place, ...legacy.alternatives].map((slug) => (slug ? index.placeBySlug.get(slug) : undefined)).filter(present);
  }
  const alternative = options.find((p) => p.id !== placeId) ?? null;
  return { dishes, alternative: alternative ? { id: alternative.id, name: alternative.name } : null };
}

/** Đánh số điểm tham quan theo từng ngày (1..n) — số trên nút tròn của dòng thời gian và ghim bản đồ lộ trình. */
function withOrder(rows: TimelineRow[]): TimelineRow[] {
  const counters = new Map<number, number>();
  return rows.map((row) => {
    if (row.kind !== 'PLACE' || !row.place) return row;
    const order = (counters.get(row.dayIndex) ?? 0) + 1;
    counters.set(row.dayIndex, order);
    return { ...row, order };
  });
}

/** Lịch trình đang lên / sửa → dòng của dòng thời gian (ảnh điểm từ danh mục của tỉnh). */
export function rowsFromDraft(items: TripItem[], lookups: Lookups, template: TripTemplate | null | undefined): TimelineRow[] {
  const index = indexOf(lookups);
  return withOrder(sortItems(items).map((item) => {
    const place = item.placeId != null ? index?.placeById.get(item.placeId) : undefined;
    return {
      key: item.uid,
      kind: item.kind,
      dayIndex: item.dayIndex,
      startTime: item.startTime,
      endTime: item.endTime,
      session: item.session,
      title: item.title || place?.name || 'Mục lịch trình',
      note: item.note,
      place: place ? { id: place.id, name: place.name, cover: place.coverImageUrl, regionName: place.regionName } : item.placeId != null ? { id: item.placeId, name: item.title, cover: null } : null,
      addons: item.addons,
      ...enrich(index, template, { ...item, dishIds: item.dishIds ?? null, alternativeIds: item.alternativeIds ?? null }, item.placeId),
      origin: item.origin,
      sourceStopId: item.sourceStopId ?? null,
      // Chỉ điểm có trong danh mục công khai của tỉnh mới có trang /destinations/:id.
      placeLinkId: place?.id ?? null,
    };
  }));
}

/** Trang chia sẻ: trọn lịch trình theo giờ (chỉ xem) — máy chủ đã xếp thứ tự, "Ngày N" theo dayNumber. */
export function rowsFromShared(items: SharedItemView[], lookups: Lookups, template: TripTemplate | null | undefined): TimelineRow[] {
  const index = indexOf(lookups);
  return withOrder(items.map((item, i) => {
    const dayIndex = Math.max(1, item.dayNumber ?? 1);
    const startTime = item.startTime ? item.startTime.slice(0, 5) : null;
    const title = item.title?.trim() || item.placeName || 'Mục lịch trình';
    return {
      key: String(i),
      kind: item.kind ?? 'PLACE',
      dayIndex,
      startTime,
      endTime: item.endTime ? item.endTime.slice(0, 5) : null,
      session: startTime ? null : item.session,
      title,
      note: item.note ?? null,
      place: item.placeId != null ? { id: item.placeId, name: item.placeName ?? title, cover: item.coverImageUrl ?? null } : null,
      addons: item.addons ?? [],
      ...enrich(index, template, {
        dayIndex, startTime, title, dishIds: item.dishIds ?? null, alternativeIds: item.alternativePlaceIds ?? null,
      }, item.placeId),
      sourceStopId: item.sourceStopId ?? null,
      placeLinkId: item.placeId,
    };
  }));
}

/**
 * Lịch trình đã lưu → dòng của dòng thời gian: "Ngày N" theo dayIndex (hoặc theo ngày tham quan), trạng thái check-in của
 * điểm tham quan, điểm tiếp theo hôm nay, nguồn mục (nhãn "Gợi ý" / "Bạn thêm").
 */
export function rowsFromJourney(journey: JourneyView, lookups: Lookups, template: TripTemplate | null | undefined, nextStopId?: number | null): TimelineRow[] {
  const index = indexOf(lookups);
  const { first } = journeyRange(journey);
  return withOrder(sortStops(journey.stops).map((stop) => {
    const dayIndex = Math.max(1, stop.dayIndex ?? dayNumberOf(first, stop.visitDate) ?? 1);
    const startTime = stop.startTime ? stop.startTime.slice(0, 5) : null;
    const title = stop.title?.trim() || stop.placeName || 'Mục lịch trình';
    const kind = stop.kind ?? 'PLACE';
    return {
      key: String(stop.id),
      kind,
      dayIndex,
      startTime,
      endTime: stop.endTime ? stop.endTime.slice(0, 5) : null,
      session: startTime ? null : stop.session,
      title,
      note: stop.note ?? null,
      place: stop.placeId != null ? { id: stop.placeId, name: stop.placeName ?? title, cover: stop.coverImageUrl ?? null } : null,
      addons: stop.addons ?? [],
      ...enrich(index, template, {
        dayIndex, startTime, title, dishIds: stop.dishIds ?? null, alternativeIds: stop.alternativePlaceIds ?? null,
      }, stop.placeId),
      status: kind === 'PLACE' && stop.checkin ? 'done' : nextStopId === stop.id ? 'next' : undefined,
      origin: stop.origin,
      sourceStopId: stop.sourceStopId ?? null,
      placeLinkId: stop.placeId,
    };
  }));
}
