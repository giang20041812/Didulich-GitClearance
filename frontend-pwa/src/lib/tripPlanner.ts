/**
 * Lên lịch trình (/lich-trinh/tao, phần gợi ý của trang homestay): chọn tiêu chí lần lượt (thời gian → ăn uống → trải
 * nghiệm), lịch trình gợi ý theo tiêu chí chép thành lịch trình bình thường để khách sửa tiếp, chuyển qua lại giữa nháp trên
 * máy và API lịch trình. Hàm thuần — kiểm thử bằng scripts/test-trip-planner.mjs.
 */
import type { DaySession, JourneyInput, JourneyItemInput, JourneyStopView, JourneyView } from '@/types/journey';
import type {
  ItemKind, ItemOrigin, TemplateItem, TripCatalog, TripDay, TripDish, TripDraft, TripFilters, TripItem, TripPlace, TripTag, TripTemplate,
} from '@/types/trip';
import { addDaysKey, isDateKey, nightsBetween } from '@/lib/roomAvailability';

export const DINING_GROUP = 'TRIP_DINING';
export const GOAL_GROUP = 'TRIP_GOAL';

export const EMPTY_FILTERS: TripFilters = { duration: null, dining: null, goals: [] };

// ─── Thời gian của lịch trình gợi ý ─────────────────────────────

export const durationKey = (t: { days: number; nights: number }) => `${t.days}-${t.nights}`;

export const durationLabel = (t: { days: number; nights: number }) =>
  t.nights > 0 ? `${t.days} ngày ${t.nights} đêm` : `${t.days} ngày`;

export const durationShort = (t: { days: number; nights: number }) => (t.nights > 0 ? `${t.days}N${t.nights}Đ` : `${t.days}N`);

export const parseDurationKey = (key: string | null | undefined): { days: number; nights: number } | null => {
  const match = key ? /^(\d+)-(\d+)$/.exec(key) : null;
  return match ? { days: Number(match[1]), nights: Number(match[2]) } : null;
};

/** Tiêu chí khách đã chọn (journey.preferences) → nhãn: "3N2Đ", "Đặc sản địa phương", "Săn mây, bình minh"… */
export function preferenceLabels(preferences: Record<string, unknown> | null | undefined, tags: TripTag[]): string[] {
  if (!preferences) return [];
  const names = new Map(tags.map((t) => [t.slug, t.name]));
  const labels: string[] = [];
  const duration = parseDurationKey(typeof preferences.duration === 'string' ? preferences.duration : null);
  if (duration) labels.push(durationShort(duration));
  const slugs = [preferences.dining, ...(Array.isArray(preferences.goals) ? preferences.goals : [])];
  for (const slug of slugs) {
    const name = typeof slug === 'string' ? names.get(slug) : undefined;
    if (name) labels.push(name);
  }
  return labels;
}

type Criteria = Partial<TripFilters>;

const matches = (t: TripTemplate, c: Criteria) =>
  (!c.duration || durationKey(t) === c.duration)
  && (!c.dining || t.tags.includes(c.dining))
  && (c.goals ?? []).every((goal) => t.tags.includes(goal));

/** Lịch trình gợi ý khớp mọi tiêu chí đã chọn (trải nghiệm: phải có đủ các tag đã chọn), giữ thứ tự danh mục. */
export const matchTemplates = (templates: TripTemplate[], filters: Criteria) => templates.filter((t) => matches(t, filters));

export interface FacetOption<V> {
  value: V;
  label: string;
  /** Số lịch trình gợi ý còn khớp nếu chọn tag này (cùng các tag đã chọn) — 0 thì giao diện làm mờ tag. */
  count: number;
}

/** Tag thời gian: các thời lượng có trong lịch trình gợi ý của tỉnh, nhãn gọn "2N1Đ", ngắn trước. */
export function durationOptions(templates: TripTemplate[]): FacetOption<string>[] {
  const seen = new Map<string, FacetOption<string> & { days: number; nights: number }>();
  for (const t of templates) {
    const key = durationKey(t);
    const option = seen.get(key);
    if (option) option.count += 1;
    else seen.set(key, { value: key, label: durationShort(t), count: 1, days: t.days, nights: t.nights });
  }
  return [...seen.values()]
    .sort((a, b) => a.days - b.days || a.nights - b.nights)
    .map(({ value, label, count }) => ({ value, label, count }));
}

/**
 * Tag ăn uống (của các lịch trình khớp thời gian) hoặc tag trải nghiệm (khớp thêm ăn uống), theo thứ tự danh mục tag.
 * count = số lịch trình còn khớp nếu chọn thêm tag đó.
 */
export function tagOptions(templates: TripTemplate[], tags: TripTag[], filters: Criteria, group: string): FacetOption<string>[] {
  const base = group === DINING_GROUP
    ? matchTemplates(templates, { duration: filters.duration })
    : matchTemplates(templates, { duration: filters.duration, dining: filters.dining });
  const present = new Set(base.flatMap((t) => t.tags));
  return tags
    .filter((tag) => tag.group === group && present.has(tag.slug))
    .map((tag) => {
      const goals = group === GOAL_GROUP
        ? (filters.goals?.includes(tag.slug) ? filters.goals : [...(filters.goals ?? []), tag.slug])
        : filters.goals ?? [];
      const criteria = group === DINING_GROUP ? { ...filters, dining: tag.slug, goals: [] } : { ...filters, goals };
      return { value: tag.slug, label: tag.name, count: matchTemplates(templates, criteria).length };
    });
}

// ─── Tiêu chí: thời gian → ăn uống → trải nghiệm ────────────────

export type CriterionKey = keyof TripFilters;

export interface CriterionDef {
  key: CriterionKey;
  label: string;
  /** Chọn nhiều tag (trải nghiệm) hay một (thời gian, ăn uống). */
  multi: boolean;
  /** Bắt buộc (thời gian — dựng số ngày của lịch trình): bấm lại tag đang chọn không bỏ chọn. */
  required: boolean;
  /** Nhóm tag của tiêu chí (thời gian lấy theo số ngày / đêm của lịch trình gợi ý). */
  group: string | null;
}

/** Thứ tự chọn tiêu chí — hàng sau chỉ hiện khi hàng trước đã chọn. */
export const TRIP_CRITERIA: readonly CriterionDef[] = [
  { key: 'duration', label: 'Thời gian', multi: false, required: true, group: null },
  { key: 'dining', label: 'Ăn uống', multi: false, required: false, group: DINING_GROUP },
  { key: 'goals', label: 'Trải nghiệm', multi: true, required: false, group: GOAL_GROUP },
];

export interface CriterionRow extends CriterionDef {
  options: FacetOption<string>[];
  /** Tag đang chọn (còn hợp lệ) của hàng. */
  selected: string[];
}

const selectedOf = (filters: Criteria, key: CriterionKey): string[] =>
  key === 'goals' ? filters.goals ?? [] : [filters[key]].filter((v): v is string => typeof v === 'string' && v !== '');

/**
 * Các hàng tiêu chí đang hiện, đẩy vào tuần tự: hàng thời gian luôn hiện; hàng sau chỉ hiện khi hàng trước đã chọn (tiêu
 * chí không có tag nào thì bỏ qua, hàng sau hiện luôn). Mỗi hàng chỉ có tag của các lịch trình gợi ý khớp các hàng trước;
 * tag đã chọn không còn trong hàng thì coi như chưa chọn. Tỉnh chưa có lịch trình gợi ý → không có hàng nào.
 */
export function criteriaRows(templates: TripTemplate[], tags: TripTag[], filters: Criteria): CriterionRow[] {
  const rows: CriterionRow[] = [];
  const chosen: TripFilters = { ...EMPTY_FILTERS };
  for (const def of TRIP_CRITERIA) {
    const options = def.group == null
      ? durationOptions(templates)
      : tagOptions(templates, tags, def.key === 'goals' ? { ...chosen, goals: filters.goals ?? [] } : chosen, def.group);
    if (options.length === 0) {
      if (def.required) break;
      continue;
    }
    const selected = selectedOf(filters, def.key).filter((value, i, all) => all.indexOf(value) === i && options.some((o) => o.value === value));
    rows.push({ ...def, options, selected });
    if (def.key === 'goals') chosen.goals = selected;
    else chosen[def.key] = selected[0] ?? null;
    if (selected.length === 0) break;
  }
  return rows;
}

/** Tiêu chí còn hợp lệ: chỉ giữ tag của các hàng đang hiện (bỏ chọn ăn uống thì trải nghiệm cũng bỏ theo). */
export function cleanFilters(templates: TripTemplate[], tags: TripTag[], filters: Criteria): TripFilters {
  const rows = criteriaRows(templates, tags, filters);
  const pick = (key: CriterionKey) => rows.find((r) => r.key === key)?.selected ?? [];
  return { duration: pick('duration')[0] ?? null, dining: pick('dining')[0] ?? null, goals: pick('goals') };
}

/** Bấm một tag: thời gian chọn một (bấm lại không bỏ), ăn uống chọn / bỏ, trải nghiệm bật / tắt từng tag. Chưa làm sạch. */
export function toggleCriterion(filters: TripFilters, key: CriterionKey, value: string): TripFilters {
  if (key === 'duration') return { ...filters, duration: value };
  if (key === 'dining') return { ...filters, dining: filters.dining === value ? null : value };
  return { ...filters, goals: filters.goals.includes(value) ? filters.goals.filter((g) => g !== value) : [...filters.goals, value] };
}

/**
 * Lịch trình gợi ý theo tiêu chí: lịch trình đầu tiên (thứ tự danh mục) khớp mọi tag; không có thì nới dần (bỏ trải nghiệm,
 * rồi ăn uống) — đã chọn thời gian là có lịch trình. Chưa chọn thời gian → null.
 */
export function suggestTemplate(templates: TripTemplate[], filters: Criteria): TripTemplate | null {
  if (!filters.duration) return null;
  return matchTemplates(templates, filters)[0]
    ?? matchTemplates(templates, { duration: filters.duration, dining: filters.dining })[0]
    ?? matchTemplates(templates, { duration: filters.duration })[0]
    ?? null;
}

/** Tiêu chí trên đường dẫn (?d=, ?an=, ?mt=); không có gì → null. */
export function filtersFromParams(params: URLSearchParams): TripFilters | null {
  const filters: TripFilters = {
    duration: parseDurationKey(params.get('d')) ? params.get('d') : null,
    dining: params.get('an') || null,
    goals: (params.get('mt') ?? '').split(',').map((g) => g.trim()).filter(Boolean),
  };
  return filters.duration || filters.dining || filters.goals.length > 0 ? filters : null;
}

// ─── Ngày đi / về ↔ thời gian ───────────────────────────────────

/** Số ngày của chuyến theo ngày đi / về: n đêm → n + 1 ngày; đi về trong ngày / thiếu / ngày lạ → null (coi như chưa chọn ngày). */
export function tripDaysBetween(checkIn: string | null | undefined, checkOut: string | null | undefined): number | null {
  const nights = isDateKey(checkIn) && isDateKey(checkOut) ? nightsBetween(checkIn, checkOut) : 0;
  return nights > 0 ? nights + 1 : null;
}

/**
 * Thời gian chọn sẵn theo ngày đi / về có sẵn trên đường dẫn (SearchHub, đơn đặt phòng): đúng số đêm, không có thì lịch
 * trình dài nhất không vượt số đêm; chưa có ngày → null (khách tự chọn).
 */
export function durationForStay(templates: TripTemplate[], checkIn: string | null, checkOut: string | null): string | null {
  const tripDays = tripDaysBetween(checkIn, checkOut);
  if (!tripDays) return null;
  const nights = tripDays - 1;
  const fit = templates.filter((t) => t.days <= tripDays);
  const exact = fit.find((t) => t.nights === nights);
  if (exact) return durationKey(exact);
  const shorter = fit.filter((t) => t.nights < nights).sort((a, b) => b.nights - a.nights || b.days - a.days)[0];
  return shorter ? durationKey(shorter) : null;
}

// ─── Giờ, buổi, thứ tự ───────────────────────────────────────────

/** Giờ bắt đầu mặc định của buổi (phút trong ngày) — khớp backend DaySession.defaultStart / lib/journey SESSION_START. */
const SESSION_MINUTES: Record<DaySession, number> = { MORNING: 7 * 60, NOON: 11 * 60, AFTERNOON: 14 * 60, EVENING: 18 * 60 };
/** Mục không có giờ kết thúc coi như kéo dài 1 tiếng (như lib/journey stopEndsAt). */
const DEFAULT_ITEM_MINUTES = 60;

export const normalizeTime = (value: string | null | undefined): string | null => {
  const match = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** "HH:mm" → phút trong ngày. */
export const timeToMinutes = (time: string) => {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
};

/** Phút trong ngày → "HH:mm" (kẹp trong 00:00–23:59). */
export const minutesToTime = (minutes: number) => {
  const clamped = Math.min(23 * 60 + 59, Math.max(0, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

/** Buổi của một giờ: trước 11:00 sáng, trước 14:00 trưa, trước 18:00 chiều, còn lại tối (khớp backend DaySession.ofTime). */
export function sessionOfTime(time: string | null | undefined): DaySession | null {
  const clean = normalizeTime(time);
  if (!clean) return null;
  const minutes = timeToMinutes(clean);
  if (minutes < 11 * 60) return 'MORNING';
  if (minutes < 14 * 60) return 'NOON';
  if (minutes < 18 * 60) return 'AFTERNOON';
  return 'EVENING';
}

/** Giờ bắt đầu để xếp thứ tự: giờ của mục, không có thì giờ mặc định của buổi. */
export const itemStartMinutes = (item: Pick<TripItem, 'startTime' | 'session'>) =>
  item.startTime ? timeToMinutes(item.startTime) : item.session ? SESSION_MINUTES[item.session] : 0;

/** Giờ kết thúc (phút): giờ kết thúc của mục, thiếu / không sau giờ bắt đầu thì giờ bắt đầu + 1 tiếng. */
export function itemEndMinutes(item: Pick<TripItem, 'startTime' | 'endTime' | 'session'>): number {
  const start = itemStartMinutes(item);
  const end = item.endTime ? timeToMinutes(item.endTime) : Number.NaN;
  return end > start ? end : start + DEFAULT_ITEM_MINUTES;
}

/** Theo ngày rồi giờ bắt đầu; cùng giờ giữ thứ tự cũ. */
export function sortItems<T extends Pick<TripItem, 'dayIndex' | 'startTime' | 'session'>>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.dayIndex - b.item.dayIndex || itemStartMinutes(a.item) - itemStartMinutes(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/** Giờ gợi ý cho điểm vừa thêm vào một ngày: buổi phù hợp đầu tiên của điểm (không có dữ liệu thì buổi sáng). */
export function suggestedStart(sessions: DaySession[]): string {
  return minutesToTime(SESSION_MINUTES[sessions[0] ?? 'MORNING'] + (sessions[0] ? 0 : 60));
}

/** Trường của mục đủ để tính khung giờ trong ngày. */
type SlotItem = Pick<TripItem, 'uid' | 'dayIndex' | 'startTime' | 'endTime' | 'session'>;

/** Ngày trống: mục đầu tiên bắt đầu 07:00. Không bắt đầu mục mới từ 23:00. */
const EMPTY_DAY_START = 7 * 60;
const LAST_START = 23 * 60;
const DAY_END = 23 * 60 + 59;

/**
 * Khung giờ cho mục chèn vào một ngày (sheet thêm mục, bước "Thời gian"): bắt đầu ngay khi mục đứng trước kết thúc
 * (afterUid null = sau mục kết thúc muộn nhất của ngày; ngày trống = 07:00), kết thúc sau `durationMin` phút nhưng không
 * lấn sang mục kế tiếp. Chỗ đó không đủ (dưới 30 phút) thì tìm khoảng trống kế tiếp trước 23:00; hết chỗ thì null.
 * Vd sau "Ăn sáng" 06:30–07:30, Kim Nọi 08:30 → 07:30–08:30.
 */
export function slotAfter(items: SlotItem[], dayIndex: number, afterUid: string | null, durationMin = DEFAULT_ITEM_MINUTES): { startTime: string; endTime: string } | null {
  const duration = Math.max(1, Math.round(durationMin));
  const blocks = items.filter((i) => i.dayIndex === dayIndex).map((i) => ({ uid: i.uid, start: itemStartMinutes(i), end: itemEndMinutes(i) }));
  const anchor = afterUid ? blocks.find((b) => b.uid === afterUid) : undefined;
  let cursor = anchor ? anchor.end : blocks.length > 0 ? Math.max(...blocks.map((b) => b.end)) : EMPTY_DAY_START;
  const minRoom = Math.min(30, duration);
  while (cursor < LAST_START) {
    const covering = blocks.find((b) => b.start <= cursor && cursor < b.end);
    if (covering) {
      cursor = covering.end;
      continue;
    }
    const next = Math.min(DAY_END, ...blocks.filter((b) => b.start > cursor).map((b) => b.start));
    if (next - cursor >= minRoom) return { startTime: minutesToTime(cursor), endTime: minutesToTime(Math.min(cursor + duration, next)) };
    cursor = next;
  }
  return null;
}

/**
 * Mục trùng giờ với khung [start, end) trong một ngày (chạm mép không tính trùng); end thiếu = start + 1 tiếng. exceptUid:
 * bỏ qua chính mục đang sửa. Trả mục trùng sớm nhất, không trùng thì null.
 */
export function findOverlap<T extends SlotItem>(items: T[], dayIndex: number, start: string | null, end: string | null, exceptUid?: string | null): T | null {
  const startTime = normalizeTime(start);
  if (!startTime) return null;
  const from = timeToMinutes(startTime);
  const endTime = normalizeTime(end);
  const to = endTime && timeToMinutes(endTime) > from ? timeToMinutes(endTime) : from + DEFAULT_ITEM_MINUTES;
  return sortItems(items.filter((i) => i.dayIndex === dayIndex && i.uid !== exceptUid))
    .find((i) => from < itemEndMinutes(i) && itemStartMinutes(i) < to) ?? null;
}

/** Khung giờ ăn (phút, nửa mở): sáng 06:00–07:30, trưa 11:00–13:00, tối 18:30–20:00. */
const MEAL_WINDOWS = [
  { from: 6 * 60, to: 7 * 60 + 30, meal: 'ăn sáng' },
  { from: 11 * 60, to: 13 * 60, meal: 'ăn trưa' },
  { from: 18 * 60 + 30, to: 20 * 60, meal: 'ăn tối' },
];

/**
 * Loại mục chọn sẵn theo giờ (sheet thêm mục, bước "Loại"): giờ ăn → Ăn uống (vừa ăn xong thì Tham quan); từ 20:00 →
 * Hoạt động; từ 22:00 → Nghỉ ngơi; còn lại → Tham quan. reason: lý do ngắn, giao diện ghép "{reason} — chọn sẵn {loại}".
 */
export function kindForTime(time: string | null | undefined, prevKind?: ItemKind | null): { kind: ItemKind; reason: string } {
  const clean = normalizeTime(time);
  if (!clean) return { kind: 'PLACE', reason: '' };
  const minutes = timeToMinutes(clean);
  if (minutes >= 22 * 60) return { kind: 'FREE', reason: 'Đã khuya, nên nghỉ sớm cho chặng mai' };
  if (minutes >= 20 * 60) return { kind: 'ACTIVITY', reason: 'Buổi tối, hợp giao lưu văn hóa bản địa' };
  const mealWindow = MEAL_WINDOWS.find((w) => minutes >= w.from && minutes < w.to);
  if (prevKind === 'MEAL') {
    const meal = minutes < 11 * 60 ? 'Vừa ăn sáng xong, trời còn mát' : minutes < 18 * 60 ? 'Vừa ăn trưa xong' : 'Vừa ăn tối xong';
    return { kind: 'PLACE', reason: meal };
  }
  if (mealWindow) return { kind: 'MEAL', reason: `Đúng giờ ${mealWindow.meal}` };
  if (minutes < 6 * 60) return { kind: 'PLACE', reason: 'Sáng sớm, hợp săn bình minh, săn mây' };
  if (minutes < 11 * 60) return { kind: 'PLACE', reason: 'Buổi sáng trời mát, hợp tham quan' };
  if (minutes < 17 * 60) return { kind: 'PLACE', reason: 'Hợp tham quan, dạo bản' };
  return { kind: 'PLACE', reason: 'Chiều muộn, hợp ngắm hoàng hôn' };
}

/** Tên gợi ý của mục mới theo loại + giờ: "Ăn sáng" / "Ăn trưa" / "Cà phê, ăn nhẹ" / "Ăn tối", "Nghỉ trưa", "Nhận phòng"… */
export function defaultTitleFor(kind: ItemKind, time?: string | null): string {
  const clean = normalizeTime(time);
  const minutes = clean ? timeToMinutes(clean) : null;
  switch (kind) {
    case 'MEAL':
      if (minutes == null) return 'Ăn uống';
      if (minutes < 10 * 60 + 30) return 'Ăn sáng';
      if (minutes < 14 * 60 + 30) return 'Ăn trưa';
      if (minutes < 17 * 60 + 30) return 'Cà phê, ăn nhẹ';
      return 'Ăn tối';
    case 'ACTIVITY':
      return minutes != null && minutes >= 18 * 60 ? 'Hoạt động buổi tối' : 'Hoạt động';
    case 'TRANSPORT':
      return 'Di chuyển';
    case 'FREE':
      return minutes != null && minutes >= 11 * 60 && minutes < 14 * 60 ? 'Nghỉ trưa' : 'Nghỉ ngơi';
    case 'STAY':
      return minutes != null && minutes < 12 * 60 ? 'Trả phòng' : 'Nhận phòng';
    default:
      return 'Điểm tham quan';
  }
}

let uidSeq = 0;
export const newUid = () => `i${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

// ─── Gói → lịch trình ────────────────────────────────────────────

export interface InstantiateOptions {
  startDate: string | null;
  guests: number;
  province: string | null;
  filters: TripFilters | null;
  stayPlaceId?: number | null;
  forBooking?: string | null;
  /** Số ngày của chuyến (tripDaysBetween): chuyến dài hơn gói thì lịch trình có thêm ngày trống ở cuối. */
  tripDays?: number | null;
}

type CatalogLookups = Pick<TripCatalog, 'places' | 'addons'> & Partial<Pick<TripCatalog, 'dishes'>>;

interface TemplateIndex {
  placeBySlug: Map<string, TripPlace>;
  placeById: Map<number, TripPlace>;
  /** null = danh mục không kèm món (chưa đổi được slug món → id). */
  dishBySlug: Map<string, TripDish> | null;
  addonCodes: Set<string>;
}

const indexCatalog = (catalog: CatalogLookups): TemplateIndex => ({
  placeBySlug: new Map(catalog.places.map((p) => [p.slug, p])),
  placeById: new Map(catalog.places.map((p) => [p.id, p])),
  dishBySlug: catalog.dishes ? new Map(catalog.dishes.map((d) => [d.slug, d])) : null,
  addonCodes: new Set(catalog.addons.map((a) => a.code)),
});

const uniqueIds = (ids: (number | null | undefined)[]) => [...new Set(ids.filter((id): id is number => id != null))];

/**
 * Một mục của gói → mục lịch trình (nguồn SUGGESTED): đủ giờ, ghi chú, dịch vụ đúng như gói; món + phương án đổi điểm lấy
 * theo id của gói, gói cũ (chỉ có slug) thì đổi slug qua danh mục. Điểm chưa có trên hệ thống thành hoạt động có tên.
 */
function itemFromTemplate(item: TemplateItem, index: TemplateIndex): TripItem {
  const place = (item.placeId != null ? index.placeById.get(item.placeId) : undefined) ?? (item.place ? index.placeBySlug.get(item.place) : undefined);
  const kind: ItemKind = item.kind === 'PLACE' && !place ? 'ACTIVITY' : item.kind;
  const dishBySlug = index.dishBySlug;
  const dishIds = item.dishIds ?? (dishBySlug ? uniqueIds((item.dishes ?? []).map((slug) => dishBySlug.get(slug)?.id)) : null);
  const alternativeIds = (item.alternativePlaceIds ?? uniqueIds((item.alternatives ?? []).map((slug) => index.placeBySlug.get(slug)?.id)))
    .filter((id) => id !== place?.id);
  return {
    uid: newUid(),
    id: null,
    kind,
    dayIndex: Math.max(1, item.day),
    startTime: normalizeTime(item.start),
    endTime: normalizeTime(item.end),
    session: null,
    title: item.title,
    note: item.note ?? null,
    placeId: place?.id ?? null,
    addons: (item.addons ?? []).filter((code) => index.addonCodes.has(code)),
    origin: 'SUGGESTED',
    sourceStopId: item.id ?? null,
    dishIds,
    alternativeIds,
  };
}

/** Tên + lời dặn từng ngày của gói (bỏ ngày không có gì); null = gói không đặt tên ngày. */
function templateDays(template: TripTemplate): TripDay[] | null {
  const titles = template.content.dayTitles ?? [];
  const notes = template.content.dayNotes ?? [];
  const days: TripDay[] = [];
  for (let i = 0; i < Math.max(titles.length, notes.length); i += 1) {
    const title = titles[i]?.trim() || null;
    const note = notes[i]?.trim() || null;
    if (title || note) days.push({ dayIndex: i + 1, title, note });
  }
  return days.length > 0 ? days : null;
}

/**
 * Chép gói thành lịch trình thường (chưa lưu): đủ các mục, giờ, ghi chú, dịch vụ đúng như gói, mỗi mục nhớ mục gốc
 * (sourceStopId) để sau này "Khôi phục". Điểm của gói chưa có trên hệ thống (chưa công khai) thì giữ thành hoạt động có tên
 * — lịch vẫn đủ, chỉ không có ảnh / bản đồ. Chuyến dài hơn gói (options.tripDays) thì thêm ngày trống ở cuối.
 */
export function instantiateTemplate(template: TripTemplate, catalog: CatalogLookups & Pick<TripCatalog, 'region'>, options: InstantiateOptions): TripDraft {
  const index = indexCatalog(catalog);
  const items = template.content.items.map((item) => itemFromTemplate(item, index));
  return {
    version: 1,
    journeyId: null,
    province: catalog.region?.name ?? options.province,
    regionId: catalog.region?.id ?? null,
    regionName: catalog.region?.name ?? null,
    templateCode: template.code,
    templateId: template.id ?? null,
    title: template.title,
    startDate: isDateKey(options.startDate) ? options.startDate : null,
    days: Math.max(1, template.days, options.tripDays ?? 0),
    guests: Math.max(1, options.guests),
    basePlaceId: null,
    filters: options.filters,
    items: sortItems(items),
    stayPlaceId: options.stayPlaceId ?? null,
    forBooking: options.forBooking ?? null,
    dayInfo: templateDays(template),
  };
}

/** Nội dung một mục (bỏ uid / id / nguồn) — so lịch trình đang lên với lịch trình gợi ý. */
const itemSignature = (item: TripItem) => [
  item.dayIndex, item.startTime ?? '', item.endTime ?? '', item.kind, item.title.trim(), item.placeId ?? '', (item.note ?? '').trim(),
  [...item.addons].sort().join(','),
].join('|');

/**
 * Lịch trình còn y như lịch trình gợi ý (chưa thêm / bỏ / sửa / đổi mục nào; không có gợi ý thì còn trống) — đổi tiêu chí
 * thì thay luôn, không cần hỏi trước.
 */
export function sameAsTemplate(items: TripItem[], template: TripTemplate | null | undefined, catalog: CatalogLookups): boolean {
  if (!template) return items.length === 0;
  if (items.length !== template.content.items.length) return false;
  const index = indexCatalog(catalog);
  const original = template.content.items.map((item) => itemSignature(itemFromTemplate(item, index))).sort();
  const current = items.map(itemSignature).sort();
  return current.every((signature, i) => signature === original[i]);
}

/** "Tự lên lịch trình" (tỉnh chưa có gói phù hợp): lịch trình trống theo số ngày, thêm điểm từ bản đồ. */
export function blankDraft(catalog: Pick<TripCatalog, 'region'>, options: InstantiateOptions & { days: number }): TripDraft {
  return {
    version: 1,
    journeyId: null,
    province: catalog.region?.name ?? options.province,
    regionId: catalog.region?.id ?? null,
    regionName: catalog.region?.name ?? null,
    templateCode: null,
    templateId: null,
    title: catalog.region ? `Chuyến đi ${catalog.region.name}` : 'Lịch trình của tôi',
    startDate: isDateKey(options.startDate) ? options.startDate : null,
    days: Math.max(1, options.days),
    guests: Math.max(1, options.guests),
    basePlaceId: null,
    filters: options.filters,
    items: [],
    stayPlaceId: options.stayPlaceId ?? null,
    forBooking: options.forBooking ?? null,
    dayInfo: null,
  };
}

/** Gói của lịch trình trong danh mục: theo id lịch trình gợi ý, không có thì theo mã gói. */
export function templateFor(templates: TripTemplate[] | null | undefined, ref: { templateId?: number | null; templateCode?: string | null }): TripTemplate | null {
  const list = templates ?? [];
  return (ref.templateId != null ? list.find((t) => t.id === ref.templateId) : undefined)
    ?? (ref.templateCode ? list.find((t) => t.code === ref.templateCode) : undefined)
    ?? null;
}

/**
 * Mục gốc trong gói của một mục lịch trình cũ (chưa có sourceStopId / món / phương án riêng) — so theo ngày + giờ, không có
 * thì theo tên. Chỉ dùng làm dự phòng: mục có dishIds / alternativeIds thì dùng của chính mục.
 */
export function templateItemFor(template: TripTemplate | undefined | null, item: Pick<TripItem, 'dayIndex' | 'startTime' | 'title'>): TemplateItem | undefined {
  if (!template) return undefined;
  const sameDay = template.content.items.filter((t) => t.day === item.dayIndex);
  return sameDay.find((t) => normalizeTime(t.start) === item.startTime) ?? sameDay.find((t) => t.title === item.title);
}

/** Mục gốc theo sourceStopId ("Gợi ý gốc: 19:00–20:30 … · Khôi phục"); gói cũ chưa có id mục thì không tìm được. */
export function templateItemById(template: TripTemplate | null | undefined, sourceStopId: number | null | undefined): TemplateItem | undefined {
  if (!template || sourceStopId == null) return undefined;
  return template.content.items.find((t) => t.id === sourceStopId);
}

/** "Khôi phục": đưa mục về đúng như mục gốc của gói (giữ uid, id bản ghi). */
export function restoreFromSource(item: TripItem, source: TemplateItem, catalog: CatalogLookups): TripItem {
  return { ...itemFromTemplate(source, indexCatalog(catalog)), uid: item.uid, id: item.id };
}

/** Mục đã sửa khác mục gốc của gói (giờ, ngày, tên, ghi chú, địa điểm, dịch vụ) — hiện dòng "Gợi ý gốc … · Khôi phục". */
export function differsFromSource(item: TripItem, source: TemplateItem, catalog: CatalogLookups): boolean {
  const original = itemFromTemplate(source, indexCatalog(catalog));
  return original.kind !== item.kind
    || original.dayIndex !== item.dayIndex
    || original.startTime !== item.startTime
    || original.endTime !== item.endTime
    || original.title.trim() !== item.title.trim()
    || (original.note ?? '').trim() !== (item.note ?? '').trim()
    || original.placeId !== item.placeId
    || [...original.addons].sort().join() !== [...item.addons].sort().join();
}

/**
 * Dòng "Gợi ý gốc … · Khôi phục" của một mục: mục gốc trong gói (theo sourceStopId) khi mục đã sửa khác bản gốc; không có
 * mục gốc / chưa sửa gì thì null. label: "Ngày 2 · 19:00–20:30 Đêm văn hóa" (bỏ "Ngày N" khi cùng ngày).
 */
export function sourceRestore(item: TripItem, template: TripTemplate | null | undefined, catalog: CatalogLookups | null | undefined): { label: string; restored: TripItem } | null {
  if (!catalog || item.origin === 'CUSTOM') return null;
  const source = templateItemById(template, item.sourceStopId);
  if (!source || !differsFromSource(item, source, catalog)) return null;
  const time = `${normalizeTime(source.start) ?? ''}${source.end ? `–${normalizeTime(source.end)}` : ''}`;
  const day = source.day !== item.dayIndex ? `Ngày ${source.day} · ` : '';
  return { label: `${day}${time} ${source.title}`.trim(), restored: restoreFromSource(item, source, catalog) };
}

/** Trường của mục khách tự thêm: loại + ngày bắt buộc, còn lại tùy chọn. */
export type CustomItemFields = Pick<TripItem, 'kind' | 'dayIndex'> & Partial<Omit<TripItem, 'uid' | 'origin' | 'kind' | 'dayIndex'>>;

/**
 * Mục khách tự thêm (nguồn CUSTOM — nhãn "Bạn thêm"): thiếu tên thì đặt theo loại + giờ (defaultTitleFor). Món / phương án
 * là danh sách rỗng (không phải null) để dòng thời gian không dò nhầm mục gốc của gói trùng giờ.
 */
export function newCustomItem(fields: CustomItemFields): TripItem {
  const startTime = fields.startTime ?? null;
  return {
    uid: newUid(),
    id: null,
    endTime: null,
    session: null,
    note: null,
    placeId: null,
    addons: [],
    sourceStopId: null,
    dishIds: [],
    alternativeIds: [],
    ...fields,
    dayIndex: Math.max(1, fields.dayIndex),
    startTime,
    title: fields.title ?? defaultTitleFor(fields.kind, startTime),
    origin: 'CUSTOM',
  };
}

/** Đổi nhanh sang điểm phương án ("Kim Nọi → Sống Lưng Khủng Long"): điểm cũ thành phương án để đổi lại được. */
export function swapToPlace(item: TripItem, place: Pick<TripPlace, 'id' | 'name'>): TripItem {
  const alternativeIds = item.alternativeIds
    ? uniqueIds([item.placeId, ...item.alternativeIds]).filter((id) => id !== place.id)
    : null;
  return { ...item, kind: 'PLACE', placeId: place.id, title: place.name, alternativeIds };
}

/**
 * Tên + lời dặn từng ngày cho dòng thời gian (chỉ số = dayIndex - 1): theo lịch trình (journey.days / draft.dayInfo),
 * chưa có thì theo gói.
 */
export function dayTexts(days: TripDay[] | null | undefined, template?: Pick<TripTemplate, 'content'> | null): { titles: (string | null)[]; notes: (string | null)[] } {
  if (days && days.length > 0) {
    const titles: (string | null)[] = [];
    const notes: (string | null)[] = [];
    for (const day of days) {
      if (day.dayIndex < 1) continue;
      titles[day.dayIndex - 1] = day.title?.trim() || null;
      notes[day.dayIndex - 1] = day.note?.trim() || null;
    }
    return { titles: Array.from(titles, (t) => t ?? null), notes: Array.from(notes, (n) => n ?? null) };
  }
  return { titles: template?.content.dayTitles ?? [], notes: template?.content.dayNotes ?? [] };
}

/** Số ngày thực của lịch trình: theo khai báo, nới ra nếu có mục ở ngày sau. */
export const draftDays = (draft: Pick<TripDraft, 'days' | 'items'>) =>
  Math.max(1, draft.days, ...draft.items.map((i) => i.dayIndex));

/** Ngày nhận / trả phòng của chuyến: ngày đầu → ngày cuối (tối thiểu 1 đêm). */
export function stayRange(startDate: string | null, days: number): { checkIn: string; checkOut: string } | null {
  if (!isDateKey(startDate)) return null;
  return { checkIn: startDate, checkOut: addDaysKey(startDate, Math.max(1, days - 1)) };
}

// ─── Gợi ý khi thêm mục ──────────────────────────────────────────

type TemplateUse = Pick<TemplateItem, 'place' | 'placeId' | 'addons'>;

/** Mục của các gói diễn ra ở một điểm (theo id, gói cũ theo slug). */
const usesAt = (templates: TripTemplate[], place: Pick<TripPlace, 'id' | 'slug'>): TemplateUse[] =>
  templates.flatMap((t) => t.content.items).filter((item) => item.placeId === place.id || (!!item.place && item.place === place.slug));

/**
 * Dịch vụ chọn sẵn khi thêm một điểm (sheet thêm mục, bước "Dịch vụ"): dịch vụ máy chủ gợi ý cho điểm (suggestedAddons) ∪
 * dịch vụ các gói dùng ở điểm đó; không có mà điểm là điểm ngắm cảnh (scenicType) thì flycam. Theo thứ tự danh mục dịch
 * vụ, bỏ mã không còn cung cấp. reason: "Chọn sẵn: hay đi kèm Đồi Móng Ngựa" (null khi không chọn sẵn gì).
 */
export function addonsForPlace(catalog: Pick<TripCatalog, 'places' | 'templates' | 'addons'>, placeId: number | null | undefined): { codes: string[]; reason: string | null } {
  const place = placeId != null ? catalog.places.find((p) => p.id === placeId) : undefined;
  if (!place) return { codes: [], reason: null };
  const found = new Set<string>(place.suggestedAddons ?? []);
  for (const use of usesAt(catalog.templates, place)) for (const code of use.addons ?? []) found.add(code);
  let reason = `Chọn sẵn: hay đi kèm ${place.name}`;
  if (found.size === 0 && place.scenicType) {
    found.add('FLYCAM');
    reason = `Chọn sẵn: ${place.name} là điểm ngắm cảnh`;
  }
  const known = catalog.addons.map((a) => a.code);
  const codes = known.length > 0 ? known.filter((code) => found.has(code)) : [...found];
  return { codes, reason: codes.length > 0 ? reason : null };
}

/** Dịch vụ chỉ làm được ở vài điểm (dù lượn — chỉ đèo Khau Phạ); dịch vụ khác đi kèm điểm nào cũng được. */
const PLACE_BOUND_ADDONS = new Set(['PARAGLIDING']);

/** Các điểm mà lịch trình gợi ý dùng một dịch vụ (suggestedAddons của điểm hoặc mục của gói ở điểm đó). */
export function addonPlaces(catalog: Pick<TripCatalog, 'places' | 'templates'>, code: string): TripPlace[] {
  return catalog.places.filter((place) => (place.suggestedAddons ?? []).includes(code)
    || usesAt(catalog.templates, place).some((use) => (use.addons ?? []).includes(code)));
}

/**
 * Lý do khóa một dịch vụ cho điểm đang thêm: dịch vụ chỉ có ở vài điểm mà điểm này không thuộc số đó → "Chỉ có ở Đèo
 * Khau Phạ"; dùng được thì null (chưa có dữ liệu điểm nào cũng coi là dùng được).
 */
export function addonUnavailableReason(catalog: Pick<TripCatalog, 'places' | 'templates'>, code: string, placeId: number | null | undefined): string | null {
  if (!PLACE_BOUND_ADDONS.has(code)) return null;
  const places = addonPlaces(catalog, code);
  if (places.length === 0 || places.some((p) => p.id === placeId)) return null;
  return `Chỉ có ở ${places.map((p) => p.name).join(', ')}`;
}

/**
 * Điểm gợi ý cho khung giờ đang thêm (sheet thêm mục, bước "Chi tiết"): điểm đã có trong chuyến xuống cuối (đã có trong
 * chính ngày đó cuối cùng), rồi hợp buổi trước (chưa có dữ liệu buổi đứng giữa), điểm có trong các gói gợi ý trước, cuối
 * cùng giữ thứ tự danh mục. Điểm đầu danh sách là điểm chọn sẵn.
 */
export function suggestPlaces(
  catalog: Pick<TripCatalog, 'places' | 'templates'>,
  items: Pick<TripItem, 'dayIndex' | 'placeId'>[],
  dayIndex: number,
  startTime: string | null,
): TripPlace[] {
  const session = sessionOfTime(startTime);
  const sameDay = new Set(items.filter((i) => i.dayIndex === dayIndex).map((i) => i.placeId));
  const inTrip = new Set(items.map((i) => i.placeId));
  const templateIds = new Set<number>();
  const templateSlugs = new Set<string>();
  for (const item of catalog.templates.flatMap((t) => t.content.items)) {
    if (item.placeId != null) templateIds.add(item.placeId);
    if (item.place) templateSlugs.add(item.place);
    for (const id of item.alternativePlaceIds ?? []) templateIds.add(id);
    for (const slug of item.alternatives ?? []) templateSlugs.add(slug);
  }
  const rank = (place: TripPlace, index: number) => [
    sameDay.has(place.id) ? 2 : inTrip.has(place.id) ? 1 : 0,
    !session || !place.suitableSessions?.length ? 1 : place.suitableSessions.includes(session) ? 0 : 2,
    templateIds.has(place.id) || templateSlugs.has(place.slug) ? 0 : 1,
    index,
  ];
  return catalog.places
    .map((place, index) => ({ place, key: rank(place, index) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i += 1) {
        const diff = (a.key[i] ?? 0) - (b.key[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    })
    .map(({ place }) => place);
}

// ─── Nháp ↔ API lịch trình ───────────────────────────────────────

const dayGap = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Mục lịch trình đã lưu → mục sửa được (uid = String(stop.id), trùng khóa dòng của rowsFromJourney). "Ngày N" theo dayIndex,
 * không có thì theo ngày tham quan so với firstDay (ngày đầu của chuyến). Mục cũ chỉ có buổi giữ buổi.
 */
export function itemOfStop(stop: JourneyStopView, firstDay: string | null): TripItem {
  const fromDate = firstDay && stop.visitDate ? dayGap(firstDay, stop.visitDate) + 1 : null;
  const startTime = normalizeTime(stop.startTime);
  const sourceStopId = stop.sourceStopId ?? null;
  return {
    uid: String(stop.id),
    id: stop.id,
    kind: stop.kind ?? 'PLACE',
    dayIndex: Math.max(1, stop.dayIndex ?? fromDate ?? 1),
    startTime,
    endTime: normalizeTime(stop.endTime),
    session: startTime ? null : stop.session,
    title: stop.title ?? stop.placeName ?? '',
    note: stop.note ?? null,
    placeId: stop.placeId,
    addons: stop.addons ?? [],
    origin: stop.origin ?? (sourceStopId != null ? 'SUGGESTED' : 'CUSTOM'),
    sourceStopId,
    dishIds: stop.dishIds ?? null,
    alternativeIds: stop.alternativePlaceIds ?? null,
  };
}

/**
 * Mục sửa được → mục gửi lên (format 2). Buổi tính lại theo giờ bắt đầu, ngày tham quan tính lại theo "Ngày N" — máy chủ
 * ưu tiên buổi / ngày gửi lên hơn giờ / dayIndex, gửi lại giá trị cũ thì việc đổi giờ / ngày bị mất. Giờ kết thúc trước giờ
 * bắt đầu thì bỏ (máy chủ từ chối). dishIds / alternativeIds null = để máy chủ giữ / chép theo mục gốc.
 */
export function stopInputOf(item: TripItem, startDate: string | null): JourneyItemInput {
  const endTime = item.endTime && item.startTime && item.endTime < item.startTime ? null : item.endTime;
  return {
    id: item.id,
    placeId: item.placeId,
    kind: item.kind,
    title: item.title.trim() || null,
    dayIndex: item.dayIndex,
    startTime: item.startTime,
    endTime,
    note: item.note?.trim() || null,
    addons: item.addons,
    session: sessionOfTime(item.startTime) ?? item.session ?? 'MORNING',
    visitDate: startDate ? addDaysKey(startDate, item.dayIndex - 1) : null,
    sourceStopId: item.sourceStopId ?? null,
    dishIds: item.dishIds ?? null,
    alternativePlaceIds: item.alternativeIds ?? null,
  };
}

/** Dữ liệu lưu lịch trình kiểu mới (format 2 — gửi đủ mọi mục, gói đã chép, tên từng ngày). */
export function draftToInput(draft: TripDraft): JourneyInput {
  const days = draftDays(draft);
  return {
    basePlaceId: draft.basePlaceId,
    title: draft.title.trim() || null,
    startDate: draft.startDate,
    endDate: draft.startDate ? addDaysKey(draft.startDate, days - 1) : null,
    format: 2,
    regionId: draft.regionId,
    guestCount: draft.guests,
    templateCode: draft.templateCode,
    // Tag đã chọn + homestay khách đang xem khi lên lịch trình (ô "Chỗ ở" đưa lên đầu gợi ý).
    preferences: draft.filters || draft.stayPlaceId
      ? { ...(draft.filters ?? {}), ...(draft.stayPlaceId ? { stay: draft.stayPlaceId } : {}) }
      : null,
    templateId: draft.templateId ?? null,
    // null = máy chủ giữ nguyên (lịch trình mới lên từ gói thì chép tên ngày của gói).
    days: draft.dayInfo ? draft.dayInfo.filter((d) => d.dayIndex >= 1 && d.dayIndex <= days) : null,
    stops: sortItems(draft.items).map((item) => stopInputOf(item, draft.startDate)),
  };
}

/** Lịch trình đã lưu → nháp để sửa ở /lich-trinh/:id (lịch trình cũ chỉ có điểm tham quan theo buổi vẫn sửa được). */
export function draftFromJourney(journey: JourneyView, catalog?: Pick<TripCatalog, 'region'> | null): TripDraft {
  const dates = journey.stops.map((s) => s.visitDate).filter((d): d is string => !!d).sort();
  const start = journey.startDate && (!dates[0] || journey.startDate <= dates[0]) ? journey.startDate : dates[0] ?? null;
  const items = journey.stops.map((stop) => itemOfStop(stop, start));
  const lastDate = [journey.endDate, dates[dates.length - 1]].filter((d): d is string => !!d).sort().pop();
  const daysFromDates = start && lastDate ? dayGap(start, lastDate) + 1 : 1;
  const prefs = (journey.preferences ?? null) as (Partial<TripFilters> & { stay?: unknown }) | null;
  return {
    version: 1,
    journeyId: journey.id,
    province: journey.regionName ?? catalog?.region?.name ?? null,
    regionId: journey.regionId ?? catalog?.region?.id ?? null,
    regionName: journey.regionName ?? catalog?.region?.name ?? null,
    templateCode: journey.templateCode ?? null,
    templateId: journey.templateId ?? null,
    title: journey.title ?? '',
    startDate: start,
    days: Math.max(daysFromDates, ...items.map((i) => i.dayIndex), 1),
    guests: journey.guestCount ?? 2,
    basePlaceId: journey.basePlaceId,
    filters: prefs ? {
      duration: typeof prefs.duration === 'string' ? prefs.duration : null,
      dining: typeof prefs.dining === 'string' ? prefs.dining : null,
      goals: Array.isArray(prefs.goals) ? prefs.goals.filter((g): g is string => typeof g === 'string') : [],
    } : null,
    items: sortItems(items),
    stayPlaceId: preferredStayOf(journey),
    forBooking: null,
    dayInfo: journey.days ?? null,
  };
}

/** Homestay khách đang xem khi lên lịch trình (journey.preferences.stay) — chưa đặt, chỉ để gợi ý chỗ ở. */
export function preferredStayOf(journey: Pick<JourneyView, 'preferences'>): number | null {
  const stay = journey.preferences?.stay;
  return typeof stay === 'number' && Number.isInteger(stay) && stay > 0 ? stay : null;
}

// ─── Nháp trên máy ───────────────────────────────────────────────

const DRAFT_KEY = 'trip_draft_v1';

/**
 * Nháp lưu từ bản trước (thiếu nguồn mục, món, phương án, id gói, tên ngày) → đủ trường. Giữ version 1 để nháp đang dở
 * (đăng nhập giữa chừng) không bị bỏ; trường thiếu = chưa biết (dòng thời gian dò theo gói như trước).
 */
export function normalizeTripDraft(draft: TripDraft): TripDraft {
  const legacyOrigin: ItemOrigin = draft.templateCode ? 'SUGGESTED' : 'CUSTOM';
  const filters = draft.filters && typeof draft.filters === 'object' ? draft.filters : null;
  return {
    ...draft,
    // Chỉ giữ tiêu chí (nháp bản trước còn "price" — mốc giá của gói, không phải tiêu chí).
    filters: filters ? {
      duration: typeof filters.duration === 'string' ? filters.duration : null,
      dining: typeof filters.dining === 'string' ? filters.dining : null,
      goals: Array.isArray(filters.goals) ? filters.goals.filter((g): g is string => typeof g === 'string') : [],
    } : null,
    templateId: typeof draft.templateId === 'number' ? draft.templateId : null,
    stayPlaceId: draft.stayPlaceId ?? null,
    forBooking: draft.forBooking ?? null,
    dayInfo: Array.isArray(draft.dayInfo) ? draft.dayInfo : null,
    items: draft.items.map((item) => ({
      ...item,
      title: typeof item.title === 'string' ? item.title : '',
      addons: Array.isArray(item.addons) ? item.addons : [],
      origin: item.origin === 'SUGGESTED' || item.origin === 'CUSTOM' ? item.origin : legacyOrigin,
      sourceStopId: typeof item.sourceStopId === 'number' ? item.sourceStopId : null,
      dishIds: Array.isArray(item.dishIds) ? item.dishIds : null,
      alternativeIds: Array.isArray(item.alternativeIds) ? item.alternativeIds : null,
    })),
  };
}

/** Nháp lịch trình đang lên (giữ qua lần đăng nhập giữa chừng); bộ nhớ trình duyệt bị chặn thì coi như không có. */
export function loadTripDraft(): TripDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TripDraft>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items) || typeof parsed.days !== 'number') return null;
    return normalizeTripDraft(parsed as TripDraft);
  } catch {
    return null;
  }
}

export function saveTripDraft(draft: TripDraft | null): void {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Chế độ riêng tư / bộ nhớ đầy: nháp chỉ còn trong trang đang mở.
  }
}
