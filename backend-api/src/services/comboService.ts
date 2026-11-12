import { randomInt } from 'node:crypto';
import { exec, one, query, scalar, tx } from '../db/pool.js';
import { Where, insertRow, json, updateRow } from '../db/sql.js';
import { COMBO_REQUEST_STATUSES, type CategoryKind, type ComboRequestStatus, type ComboStatus } from '../domain/enums.js';
import { HttpError, IllegalArgumentError, IllegalStateError, InvalidFieldsError, type FieldError } from '../lib/errors.js';
import * as recommender from '../lib/comboRecommender.js';
import * as rules from '../lib/exploreRules.js';
import { pageOf, type PageJson } from '../lib/page.js';
import * as labels from '../lib/placeLabels.js';
import { isValidDate, nowLocal, today, addDays } from '../lib/time.js';
import type { AccountWithProvider } from '../repositories/accountRepo.js';
import * as placeRepo from '../repositories/placeRepo.js';
import type { PlaceRow } from '../repositories/placeRepo.js';
import type { UserPrincipal } from '../security/principal.js';
import * as audit from './auditLogService.js';
import { rejectReason } from './explorePlaceService.js';
import { normalizeName } from './explorePlaceWriter.js';
import * as recorder from './notificationRecorder.js';
import { actor } from './partnerHomestayService.js';
import * as extras from './placeExtras.js';

/**
 * Gói combo: khách xem danh sách / chi tiết và gửi yêu cầu đặt; Admin tạo (hiển thị ngay), sửa, duyệt combo NCC, ẩn / hiện; NCC tạo combo
 * (chờ duyệt), sửa (combo đã duyệt → bản sửa chờ duyệt, khách vẫn thấy bản cũ), tạm ngừng bán, xem yêu cầu đặt combo của mình. Combo không
 * bao gồm ăn uống: trang combo gợi ý nhà hàng người tạo chọn và nhà hàng được đánh giá tốt nhất quanh lộ trình ({@link recommender}).
 */

const ADMIN_TARGET = 'combos';
const PARTNER_TARGET = 'combos';
/** Số nhà hàng hệ thống tự gợi ý thêm (ngoài nhà hàng người tạo chọn). */
const AUTO_RESTAURANTS = 3;
const PAGE_MAX = 50;
const CONTACT_NAME_MIN = 2;
const CONTACT_NAME_MAX = 120;
const REQUEST_NOTE_MAX = 1000;
const GUESTS_MAX = 100;
/** Ngày đi tối đa một năm tới. */
const START_DATE_MAX_DAYS = 365;
const VN_PHONE = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;

/** Bộ lọc trạng thái màn quản lý combo của Admin. PENDING gồm cả combo đã duyệt có bản sửa chờ duyệt. */
export const ADMIN_FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'] as const;
export type AdminFilter = (typeof ADMIN_FILTERS)[number];
/** Nguồn combo: OFFICIAL = Admin tạo, PROVIDER = NCC tạo. */
export const SOURCE_FILTERS = ['OFFICIAL', 'PROVIDER'] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export interface StopInput {
  dayNo?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  placeId?: number | null;
  title?: string | null;
  note?: string | null;
}

export interface RestaurantInput {
  placeId?: number | null;
  note?: string | null;
}

export interface ComboInput {
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  days?: number | null;
  nights?: number | null;
  priceFrom?: number | null;
  priceNote?: string | null;
  groupSizeMin?: number | null;
  groupSizeMax?: number | null;
  includes?: string | null;
  excludes?: string | null;
  coverImageUrl?: string | null;
  stops?: Array<StopInput | null> | null;
  restaurants?: Array<RestaurantInput | null> | null;
}

interface ComboRow {
  id: number;
  slug: string;
  title: string;
  summary: string;
  description: string | null;
  days: number;
  nights: number;
  priceFrom: number;
  priceNote: string | null;
  groupSizeMin: number | null;
  groupSizeMax: number | null;
  includes: string | null;
  excludes: string | null;
  coverImageUrl: string | null;
  providerId: number | null;
  providerName: string | null;
  providerStatus: string | null;
  status: ComboStatus;
  visible: boolean;
  paused: boolean;
  rejectReason: string | null;
  pendingPayload: ComboInput | null;
  pendingSubmittedAt: string | null;
  pendingRejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StopRow {
  id: number;
  comboId: number;
  dayNo: number;
  sortOrder: number;
  startTime: string | null;
  endTime: string | null;
  placeId: number | null;
  title: string;
  note: string | null;
}

// ---- Chuẩn hóa văn bản ----------------------------------------------------------------------------------------------------------------

/** Một dòng: chuẩn hóa Unicode, gộp mọi khoảng trắng; rỗng → null. */
export function oneLine(value: string | null | undefined): string | null {
  if (value == null) return null;
  const clean = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  return clean === '' ? null : clean;
}

/** Đoạn văn: giữ xuống dòng, gộp khoảng trắng trong dòng, tối đa một dòng trống liên tiếp; rỗng → null. */
export function block(value: string | null | undefined): string | null {
  if (value == null) return null;
  const out: string[] = [];
  for (const line of value.normalize('NFC').replace(/\r\n/g, '\n').split('\n')) {
    const clean = line.replace(/[ \t\x0B\f\r]+/g, ' ').trim();
    if (clean === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(clean);
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.length === 0 ? null : out.join('\n');
}

/** Danh sách mỗi dòng một mục: bỏ dòng trống và gạch đầu dòng tự gõ; rỗng → null. */
function listLines(value: string | null | undefined): string | null {
  const clean = extras.lines(value == null ? null : value.normalize('NFC')).map(oneLine).filter((l): l is string => l != null);
  return clean.length === 0 ? null : clean.join('\n');
}

/** "HH:mm" (hoặc "H:mm") → "HH:mm:ss"; sai định dạng / rỗng → null. */
function time(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const v = value.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}:00`;
}

const hhmm = (t: string | null): string | null => (t == null ? null : t.slice(0, 5));

/** "Mù Cang Chải 3 ngày 2 đêm" → "mu-cang-chai-3-ngay-2-dem" (tối đa 150 ký tự). */
function slugBase(title: string | null | undefined): string {
  const ascii = (title ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  let slug = ascii.replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  if (slug.length > 150) slug = slug.slice(0, 150).replace(/-+$/, '');
  return slug === '' ? 'combo' : slug;
}

/** "3 ngày 2 đêm", "1 ngày" (đi trong ngày). */
export const durationText = (days: number, nights: number): string => (nights <= 0 ? `${days} ngày` : `${days} ngày ${nights} đêm`);

// ---- Kiểm tra form -----------------------------------------------------------------------------------------------------------------------

const TITLE_MIN = 5;
const TITLE_MAX = 150;
const SUMMARY_MIN = 10;
const SUMMARY_MAX = 300;
const DESCRIPTION_MAX = 5000;
const DAYS_MAX = 15;
const PRICE_MAX = 100_000_000;
const PRICE_NOTE_MAX = 255;
const GROUP_MAX = 100;
const LIST_TEXT_MAX = 2000;
const URL_MAX = 1000;
const STOPS_MAX = 60;
const STOP_TITLE_MIN = 2;
const STOP_TITLE_MAX = 150;
const STOP_NOTE_MAX = 1000;
const RESTAURANTS_MAX = 10;
const RESTAURANT_NOTE_MAX = 255;
const HTTP_URL = /^https?:\/\/\S+$/i;

/** Kiểm form (tra địa điểm được nhắc tới trong DB) và trả bản đã chuẩn hóa để lưu. */
export async function validate(input: ComboInput | null | undefined): Promise<Required<ComboInput>> {
  if (!input) throw new IllegalArgumentError('Thiếu nội dung combo.');
  const ids = new Set<number>();
  for (const s of input.stops ?? []) if (s?.placeId != null) ids.add(s.placeId);
  for (const r of input.restaurants ?? []) if (r?.placeId != null) ids.add(r.placeId);
  const places = new Map<number, PlaceRow>();
  if (ids.size > 0) for (const p of await placeRepo.findAllByIds([...ids])) places.set(p.id, p);
  return check(input, places);
}

function check(input: ComboInput, places: Map<number, PlaceRow>): Required<ComboInput> {
  const errors: FieldError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });
  const title = oneLine(input.title);
  if (title == null) add('title', 'Vui lòng nhập tên combo.');
  else if (title.length < TITLE_MIN || title.length > TITLE_MAX) add('title', `Tên combo từ ${TITLE_MIN} đến ${TITLE_MAX} ký tự.`);
  const summary = oneLine(input.summary);
  if (summary == null) add('summary', 'Vui lòng nhập mô tả ngắn.');
  else if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) add('summary', `Mô tả ngắn từ ${SUMMARY_MIN} đến ${SUMMARY_MAX} ký tự.`);
  const description = block(input.description);
  if (description != null && description.length > DESCRIPTION_MAX) add('description', `Giới thiệu tối đa ${DESCRIPTION_MAX} ký tự.`);

  let days: number | null = input.days ?? null;
  const nights = input.nights ?? null;
  if (days == null || days < 1 || days > DAYS_MAX) {
    add('days', `Số ngày từ 1 đến ${DAYS_MAX}.`);
    days = null;
  }
  if (nights == null || nights < 0 || nights > DAYS_MAX) add('nights', `Số đêm từ 0 đến ${DAYS_MAX}.`);
  else if (days != null && nights > days) add('nights', 'Số đêm không được nhiều hơn số ngày.');

  const price = input.priceFrom ?? null;
  if (price == null) add('priceFrom', 'Vui lòng nhập giá combo mỗi khách.');
  else if (price < 0 || price > PRICE_MAX) add('priceFrom', 'Giá phải từ 0 đến 100.000.000 đ.');
  const priceNote = oneLine(input.priceNote);
  if (priceNote != null && priceNote.length > PRICE_NOTE_MAX) add('priceNote', `Ghi chú giá tối đa ${PRICE_NOTE_MAX} ký tự.`);

  const min = input.groupSizeMin ?? null;
  const max = input.groupSizeMax ?? null;
  if ((min != null && (min < 1 || min > GROUP_MAX)) || (max != null && (max < 1 || max > GROUP_MAX))) add('groupSize', `Số khách mỗi đoàn từ 1 đến ${GROUP_MAX}.`);
  else if (min != null && max != null && min > max) add('groupSize', 'Số khách tối thiểu không được lớn hơn tối đa.');

  const includes = listLines(input.includes);
  if (includes != null && includes.length > LIST_TEXT_MAX) add('includes', `Mục "Đã bao gồm" tối đa ${LIST_TEXT_MAX} ký tự.`);
  const excludes = listLines(input.excludes);
  if (excludes != null && excludes.length > LIST_TEXT_MAX) add('excludes', `Mục "Không bao gồm" tối đa ${LIST_TEXT_MAX} ký tự.`);
  const cover = oneLine(input.coverImageUrl);
  if (cover != null && (!HTTP_URL.test(cover) || cover.length > URL_MAX)) add('coverImageUrl', 'Ảnh bìa không hợp lệ, vui lòng tải lại ảnh.');

  const stops = checkStops(input.stops, days, places, errors);
  const restaurants = checkRestaurants(input.restaurants, places, errors);
  if (errors.length > 0) throw new InvalidFieldsError(errors);
  return {
    title,
    summary,
    description,
    days,
    nights,
    priceFrom: Math.round(price as number),
    priceNote,
    groupSizeMin: min,
    groupSizeMax: max,
    includes,
    excludes,
    coverImageUrl: cover,
    stops,
    restaurants,
  };
}

function checkStops(input: ComboInput['stops'], days: number | null, places: Map<number, PlaceRow>, errors: FieldError[]): StopInput[] {
  const raw = (input ?? []).filter((s): s is StopInput => s != null);
  if (raw.length === 0) {
    errors.push({ field: 'stops', message: 'Vui lòng thêm lịch trình (ít nhất một điểm mỗi ngày).' });
    return [];
  }
  if (raw.length > STOPS_MAX) {
    errors.push({ field: 'stops', message: `Lịch trình tối đa ${STOPS_MAX} điểm.` });
    return [];
  }
  const clean: Array<{ index: number; stop: StopInput }> = [];
  const daysWithStops = new Set<number>();
  raw.forEach((s, i) => {
    const field = `stops.${i}`;
    const where = `Điểm ${i + 1}: `;
    const fail = (message: string) => errors.push({ field, message: where + message });
    const day = s.dayNo ?? null;
    if (day == null || day < 1 || (days != null && day > days)) return fail('ngày không hợp lệ.');
    let place: PlaceRow | null = null;
    if (s.placeId != null) {
      place = places.get(s.placeId) ?? null;
      if (!place || !labels.isPublic(place)) return fail('địa điểm không còn hiển thị với khách, vui lòng chọn lại.');
    }
    let title = oneLine(s.title);
    if (title == null && place) title = place.name;
    if (title == null || title.length < STOP_TITLE_MIN || title.length > STOP_TITLE_MAX) return fail(`nội dung từ ${STOP_TITLE_MIN} đến ${STOP_TITLE_MAX} ký tự.`);
    const note = block(s.note);
    if (note != null && note.length > STOP_NOTE_MAX) return fail(`ghi chú tối đa ${STOP_NOTE_MAX} ký tự.`);
    const start = time(s.startTime);
    const end = time(s.endTime);
    if ((s.startTime != null && s.startTime.trim() !== '' && start == null) || (s.endTime != null && s.endTime.trim() !== '' && end == null)) {
      return fail('giờ phải có dạng HH:mm (vd 05:30).');
    }
    if (start != null && end != null && end <= start) return fail('giờ kết thúc phải sau giờ bắt đầu.');
    daysWithStops.add(day);
    clean.push({ index: i, stop: { dayNo: day, startTime: hhmm(start), endTime: hhmm(end), placeId: s.placeId ?? null, title, note } });
  });
  if (days != null && clean.length === raw.length) {
    const missing: number[] = [];
    for (let d = 1; d <= days; d++) if (!daysWithStops.has(d)) missing.push(d);
    if (missing.length > 0) errors.push({ field: 'stops', message: `Ngày ${missing.join(', ')} chưa có điểm nào trong lịch trình.` });
  }
  // Theo ngày; trong ngày giữ thứ tự người nhập (giờ chỉ để hiển thị, không tự sắp xếp lại).
  return clean.sort((a, b) => (a.stop.dayNo as number) - (b.stop.dayNo as number) || a.index - b.index).map((c) => c.stop);
}

function checkRestaurants(input: ComboInput['restaurants'], places: Map<number, PlaceRow>, errors: FieldError[]): RestaurantInput[] {
  const raw = (input ?? []).filter((r): r is RestaurantInput => r != null);
  if (raw.length > RESTAURANTS_MAX) {
    errors.push({ field: 'restaurants', message: `Tối đa ${RESTAURANTS_MAX} nhà hàng gợi ý.` });
    return [];
  }
  const clean: RestaurantInput[] = [];
  const seen = new Set<number>();
  raw.forEach((r, i) => {
    const field = `restaurants.${i}`;
    const place = r.placeId == null ? null : (places.get(r.placeId) ?? null);
    if (!place || !labels.isPublic(place)) return void errors.push({ field, message: `Nhà hàng ${i + 1} không còn hiển thị với khách, vui lòng chọn lại.` });
    if (place.kind !== 'RESTAURANT') return void errors.push({ field, message: `${place.name} không phải nhà hàng / quán ăn.` });
    const note = oneLine(r.note);
    if (note != null && note.length > RESTAURANT_NOTE_MAX) return void errors.push({ field, message: `Ghi chú nhà hàng tối đa ${RESTAURANT_NOTE_MAX} ký tự.` });
    if (!seen.has(place.id)) {
      seen.add(place.id);
      clean.push({ placeId: place.id, note });
    }
  });
  return clean;
}

// ---- Truy vấn ------------------------------------------------------------------------------------------------------------------------------

const COMBO_SELECT = `SELECT c.*, pr.name AS provider_name, pr.status AS provider_status FROM combo c LEFT JOIN provider pr ON pr.id = c.provider_id`;

const notFoundCombo = () => new HttpError(404, 'Không tìm thấy combo.');

async function find(id: number): Promise<ComboRow> {
  const [row] = await query<ComboRow>(`${COMBO_SELECT} WHERE c.id = $1`, [id]);
  if (!row) throw notFoundCombo();
  return row;
}

async function lock(id: number): Promise<ComboRow> {
  if (!(await one('SELECT id FROM combo WHERE id = $1 FOR UPDATE', [id]))) throw notFoundCombo();
  return find(id);
}

/** Combo của chính NCC; của người khác thì 404 (không lộ là combo có tồn tại). */
function owned(c: ComboRow, account: AccountWithProvider): ComboRow {
  if (c.providerId == null || c.providerId !== account.provider!.id) throw notFoundCombo();
  return c;
}

/** Khách thấy combo: đã duyệt, Admin cho hiển thị, NCC không tạm ngừng; combo NCC thì NCC đang hoạt động. */
export const isPublic = (c: ComboRow): boolean => c.status === 'APPROVED' && c.visible === true && c.paused !== true && (c.providerId == null || c.providerStatus === 'ACTIVE');

async function publicCombo(slug: string | null | undefined): Promise<ComboRow> {
  const [row] = await query<ComboRow>(`${COMBO_SELECT} WHERE c.slug = $1`, [slug == null ? '' : slug.trim()]);
  if (!row || !isPublic(row)) throw notFoundCombo();
  return row;
}

async function stopsOf(comboIds: number[]): Promise<Array<StopRow & { place: PlaceRow | null }>> {
  if (comboIds.length === 0) return [];
  const stops = await query<StopRow>('SELECT * FROM combo_stop WHERE combo_id = ANY($1) ORDER BY combo_id, day_no, sort_order', [comboIds]);
  const placeIds = [...new Set(stops.map((s) => s.placeId).filter((v): v is number => v != null))];
  const places = new Map((await placeRepo.findAllByIds(placeIds)).map((p) => [p.id, p]));
  return stops.map((s) => ({ ...s, place: s.placeId == null ? null : (places.get(s.placeId) ?? null) }));
}

async function coversOf(ids: Iterable<number>): Promise<Map<number, string>> {
  const list = [...ids];
  const covers = new Map<number, string>();
  if (list.length > 0) for (const row of await placeRepo.publicUrlsByPlaceIds(list)) if (!covers.has(row.id)) covers.set(row.id, row.value);
  return covers;
}

const group = <T extends { comboId: number }>(list: T[]): Map<number, T[]> => {
  const map = new Map<number, T[]>();
  for (const item of list) map.set(item.comboId, [...(map.get(item.comboId) ?? []), item]);
  return map;
};

/** Ảnh bìa: ảnh người tạo chọn, không có thì ảnh của điểm dừng đầu tiên có ảnh. */
function cover(c: ComboRow, stops: Array<{ place: PlaceRow | null }>, covers: Map<number, string>): string | null {
  if (c.coverImageUrl != null && c.coverImageUrl.trim() !== '') return c.coverImageUrl;
  for (const s of stops) {
    if (!s.place || !labels.isPublic(s.place)) continue;
    const url = covers.get(s.place.id);
    if (url != null) return url;
  }
  return null;
}

export function ref(p: PlaceRow, covers: Map<number, string>) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    kind: p.kind,
    label: labels.label(p.kind, null),
    imageUrl: covers.get(p.id) ?? null,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    available: labels.isPublic(p),
  };
}

// ---- Phía khách -------------------------------------------------------------------------------------------------------------------------------

export async function publicList() {
  const list = await query<ComboRow>(
    `${COMBO_SELECT} WHERE c.status = 'APPROVED' AND c.visible = TRUE AND c.paused = FALSE AND (pr.id IS NULL OR pr.status = 'ACTIVE')
      ORDER BY c.days ASC, c.price_from ASC, c.id DESC`,
  );
  const stops = group(await stopsOf(list.map((c) => c.id)));
  const covers = await coversOf([...stops.values()].flat().map((s) => s.place?.id).filter((v): v is number => v != null));
  return list.map((c) => {
    const cs = stops.get(c.id) ?? [];
    const highlights = [...new Set(cs.map((s) => s.place).filter((p): p is PlaceRow => p != null && labels.isPublic(p)).map((p) => p.name))].slice(0, 4);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      summary: c.summary,
      days: c.days,
      nights: c.nights,
      durationText: durationText(c.days, c.nights),
      priceFrom: c.priceFrom,
      priceNote: c.priceNote,
      coverImageUrl: cover(c, cs, covers),
      providerName: c.providerName,
      highlights,
      stopCount: cs.length,
    };
  });
}

function restaurantDto(pick: recommender.Recommendation, note: string | null, pinned: boolean, covers: Map<number, string>) {
  const p = pick.place;
  return {
    placeId: p.id,
    slug: p.slug,
    name: p.name,
    imageUrl: covers.get(p.id) ?? null,
    address: p.address,
    priceFrom: p.priceRefMin,
    priceTo: p.priceRefMax,
    note,
    pinned,
    nearStop: pick.nearStop,
    distanceKm: pick.distanceKm,
    distanceText: pick.distanceKm == null ? null : rules.formatDistance(pick.distanceKm),
  };
}

export async function publicDetail(slug: string) {
  const c = await publicCombo(slug);
  const cs = (await stopsOf([c.id])).filter((s) => s.comboId === c.id);
  const pinnedRows = await query<{ placeId: number; note: string | null }>('SELECT place_id, note FROM combo_restaurant WHERE combo_id = $1 ORDER BY sort_order', [c.id]);
  const pinnedPlaces = new Map((await placeRepo.findAllByIds(pinnedRows.map((r) => r.placeId))).map((p) => [p.id, p]));
  const pinned = pinnedRows.filter((r) => labels.isPublic(pinnedPlaces.get(r.placeId)));
  const route: recommender.Stop[] = cs
    .filter((s) => s.place && labels.isPublic(s.place))
    .map((s) => ({ name: (s.place as PlaceRow).name, latitude: (s.place as PlaceRow).latitude, longitude: (s.place as PlaceRow).longitude }));
  const pinnedIds = new Set(pinned.map((r) => r.placeId));
  const candidates = await query<PlaceRow>(
    `SELECT * FROM place WHERE kind = 'RESTAURANT' AND is_deleted = FALSE AND visibility = 'PUBLISHED' AND approval_status = 'APPROVED' AND operation_status = 'OPERATING'`,
  );
  const auto = recommender.recommend(route, candidates, pinnedIds, AUTO_RESTAURANTS);

  const placeIds = new Set<number>([...cs.map((s) => s.place?.id).filter((v): v is number => v != null), ...pinnedIds, ...auto.map((p) => p.place.id)]);
  const covers = await coversOf(placeIds);

  const days = new Map<number, unknown[]>();
  for (const s of cs) {
    const list = days.get(s.dayNo) ?? [];
    list.push({ id: s.id, dayNo: s.dayNo, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime), title: s.title, note: s.note, place: s.place ? ref(s.place, covers) : null });
    days.set(s.dayNo, list);
  }
  const itinerary = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([dayNo, stops]) => ({ dayNo, stops }));
  const food = [
    ...pinned.map((r) => restaurantDto(recommender.nearest(route, pinnedPlaces.get(r.placeId) as PlaceRow), r.note, true, covers)),
    ...auto.map((p) => restaurantDto(p, null, false, covers)),
  ];
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    description: c.description,
    days: c.days,
    nights: c.nights,
    durationText: durationText(c.days, c.nights),
    priceFrom: c.priceFrom,
    priceNote: c.priceNote,
    groupSizeMin: c.groupSizeMin,
    groupSizeMax: c.groupSizeMax,
    includes: extras.lines(c.includes),
    excludes: extras.lines(c.excludes),
    coverImageUrl: cover(c, cs, covers),
    providerName: c.providerName,
    itinerary,
    restaurants: food,
  };
}

export interface RequestInput {
  contactName?: string | null;
  contactPhone?: string | null;
  startDate?: string | null;
  guests?: number | null;
  note?: string | null;
}

/**
 * Khách gửi yêu cầu đặt combo (đăng nhập hay chưa đều được). Báo Admin, và NCC nếu là combo của NCC. Yêu cầu chỉ để liên hệ lại — chưa
 * giữ chỗ, chưa thanh toán.
 */
export function request(slug: string, input: RequestInput | null | undefined, principal: UserPrincipal | undefined) {
  return tx(async () => {
    const c = await publicCombo(slug);
    if (!input) throw new IllegalArgumentError('Thiếu thông tin yêu cầu.');
    const errors: FieldError[] = [];
    const name = oneLine(input.contactName);
    if (name == null || name.length < CONTACT_NAME_MIN || name.length > CONTACT_NAME_MAX) {
      errors.push({ field: 'contactName', message: `Vui lòng nhập họ tên (${CONTACT_NAME_MIN}–${CONTACT_NAME_MAX} ký tự).` });
    }
    const phone = input.contactPhone == null ? '' : input.contactPhone.trim().replace(/[\s.()-]/g, '');
    if (!VN_PHONE.test(phone)) errors.push({ field: 'contactPhone', message: 'Số điện thoại không đúng định dạng (VD: 0912345678).' });
    const now = today();
    const start = input.startDate != null && isValidDate(input.startDate.trim()) ? input.startDate.trim() : null;
    if (start == null) errors.push({ field: 'startDate', message: 'Vui lòng chọn ngày đi.' });
    else if (start < now) errors.push({ field: 'startDate', message: 'Ngày đi không được ở quá khứ.' });
    else if (start > addDays(now, START_DATE_MAX_DAYS)) errors.push({ field: 'startDate', message: 'Chỉ nhận yêu cầu trong vòng một năm tới.' });
    const guests = input.guests ?? null;
    if (guests == null || guests < 1 || guests > GUESTS_MAX) errors.push({ field: 'guests', message: `Số khách từ 1 đến ${GUESTS_MAX}.` });
    else if (c.groupSizeMin != null && guests < c.groupSizeMin) errors.push({ field: 'guests', message: `Combo này nhận từ ${c.groupSizeMin} khách mỗi đoàn.` });
    else if (c.groupSizeMax != null && guests > c.groupSizeMax) errors.push({ field: 'guests', message: `Combo này nhận tối đa ${c.groupSizeMax} khách mỗi đoàn.` });
    const note = block(input.note);
    if (note != null && note.length > REQUEST_NOTE_MAX) errors.push({ field: 'note', message: `Ghi chú tối đa ${REQUEST_NOTE_MAX} ký tự.` });
    if (errors.length > 0) throw new InvalidFieldsError(errors);

    const traveler = principal && principal.role === 'TRAVELER' && principal.accountId != null ? await one<{ id: number }>('SELECT id FROM account WHERE id = $1', [principal.accountId]) : null;
    const saved = await insertRow<{ id: number }>('combo_request', {
      comboId: c.id,
      travelerAccountId: traveler?.id ?? null,
      contactName: name,
      contactPhone: phone,
      startDate: start,
      guests,
      note,
      status: 'NEW',
      createdAt: nowLocal(),
    });
    const [y, m, d] = (start as string).split('-');
    const message = `${c.title}: ${name} gửi yêu cầu đặt combo (${guests} khách, đi ngày ${d}/${m}/${y}).`;
    await recorder.toAdmins('ADMIN_NEW_COMBO_REQUEST', 'Combo', c.id, message, ADMIN_TARGET);
    if (c.providerId != null) await recorder.toProvider(c.providerId, 'PARTNER_NEW_COMBO_REQUEST', 'Combo', c.id, message, PARTNER_TARGET);
    const who = c.providerName ?? 'Đi Du Lịch';
    return { id: saved.id, message: `Đã gửi yêu cầu. ${who} sẽ gọi lại cho bạn để xác nhận lịch đi và giá.` };
  });
}

// ---- Danh sách quản lý & form -------------------------------------------------------------------------------------------------------------------

async function search(status: AdminFilter | undefined, source: SourceFilter | undefined, keyword: string | undefined, providerId: number | null, page: number, size: number) {
  const where = new Where();
  if (providerId != null) where.and('c.provider_id = ?', providerId);
  if (source === 'OFFICIAL') where.and('c.provider_id IS NULL');
  if (source === 'PROVIDER') where.and('c.provider_id IS NOT NULL');
  switch (status) {
    case 'PENDING':
      where.and(`(c.status = 'PENDING' OR c.pending_submitted_at IS NOT NULL)`);
      break;
    case 'APPROVED':
      where.and(`c.status = 'APPROVED'`);
      break;
    case 'REJECTED':
      where.and(`c.status = 'REJECTED'`);
      break;
    case 'HIDDEN':
      where.and('c.visible = FALSE');
      break;
  }
  const kw = oneLine(keyword);
  if (kw != null) where.and(`lower(c.title) LIKE ?`, `%${kw.toLowerCase().replace(/%/g, '')}%`);
  const p = Math.max(page, 0);
  const s = Math.min(Math.max(size, 1), PAGE_MAX);
  const total = (await scalar<number>(`SELECT count(*) FROM combo c ${where.toSql()}`, where.params)) ?? 0;
  const rows = await query<ComboRow>(`${COMBO_SELECT} ${where.toSql()} ORDER BY c.updated_at DESC, c.id DESC LIMIT ${s} OFFSET ${p * s}`, where.params);
  return { rows, page: p, size: s, total };
}

async function rowsOf(found: { rows: ComboRow[]; page: number; size: number; total: number }): Promise<PageJson<unknown>> {
  const ids = found.rows.map((c) => c.id);
  const newRequests = new Map<number, number>();
  if (ids.length > 0) {
    for (const r of await query<{ comboId: number; n: number }>(`SELECT combo_id, count(*) AS n FROM combo_request WHERE combo_id = ANY($1) AND status = 'NEW' GROUP BY combo_id`, [ids])) {
      newRequests.set(r.comboId, Number(r.n));
    }
  }
  const stops = group(await stopsOf(ids));
  const covers = await coversOf([...stops.values()].flat().map((s) => s.place?.id).filter((v): v is number => v != null));
  const content = found.rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    days: c.days,
    nights: c.nights,
    durationText: durationText(c.days, c.nights),
    priceFrom: c.priceFrom,
    coverImageUrl: cover(c, stops.get(c.id) ?? [], covers),
    providerId: c.providerId,
    providerName: c.providerName,
    status: c.status,
    visible: c.visible === true,
    paused: c.paused === true,
    pendingEdit: c.pendingPayload != null,
    rejectReason: c.rejectReason,
    newRequests: newRequests.get(c.id) ?? 0,
    publiclyVisible: isPublic(c),
    updatedAt: c.updatedAt,
  }));
  return pageOf(content, found.page, found.size, found.total, true);
}

const placeIdsOf = (input: ComboInput): number[] => [
  ...(input.stops ?? []).map((s) => s?.placeId).filter((v): v is number => v != null),
  ...(input.restaurants ?? []).map((r) => r?.placeId).filter((v): v is number => v != null),
];

async function form(c: ComboRow) {
  const stops = (await stopsOf([c.id])).filter((s) => s.comboId === c.id);
  const rs = await query<{ placeId: number; note: string | null }>('SELECT place_id, note FROM combo_restaurant WHERE combo_id = $1 ORDER BY sort_order', [c.id]);
  const content: ComboInput = {
    title: c.title,
    summary: c.summary,
    description: c.description,
    days: c.days,
    nights: c.nights,
    priceFrom: c.priceFrom,
    priceNote: c.priceNote,
    groupSizeMin: c.groupSizeMin,
    groupSizeMax: c.groupSizeMax,
    includes: c.includes,
    excludes: c.excludes,
    coverImageUrl: c.coverImageUrl,
    stops: stops.map((s) => ({ dayNo: s.dayNo, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime), placeId: s.place?.id ?? null, title: s.title, note: s.note })),
    restaurants: rs.map((r) => ({ placeId: r.placeId, note: r.note })),
  };
  const pending = c.pendingPayload;
  const ids = new Set<number>([...placeIdsOf(content), ...(pending ? placeIdsOf(pending) : [])]);
  const places = ids.size === 0 ? [] : await placeRepo.findAllByIds([...ids]);
  const covers = await coversOf(ids);
  return {
    id: c.id,
    slug: c.slug,
    status: c.status,
    visible: c.visible === true,
    paused: c.paused === true,
    rejectReason: c.rejectReason,
    providerId: c.providerId,
    providerName: c.providerName,
    content,
    pendingChanges: pending,
    pendingSubmittedAt: c.pendingSubmittedAt,
    pendingRejectReason: c.pendingRejectReason,
    places: places.map((p) => ref(p, covers)),
    publiclyVisible: isPublic(c),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// ---- Ghi ------------------------------------------------------------------------------------------------------------------------------------

/** Combo mới: slug theo tên combo + đuôi ngẫu nhiên, không đổi khi sửa tên (giữ đường link đã chia sẻ). */
async function newCombo(title: string, actorId: number | null, init: Record<string, unknown>): Promise<number> {
  const base = slugBase(title);
  let slug: string;
  do {
    slug = `${base}-${randomInt(36 ** 4, 36 ** 5).toString(36)}`;
  } while (await one('SELECT id FROM combo WHERE slug = $1', [slug]));
  const now = nowLocal();
  const created = await insertRow<{ id: number }>('combo', {
    slug,
    title,
    summary: '',
    days: 1,
    nights: 0,
    priceFrom: 0,
    createdBy: actorId,
    updatedBy: actorId,
    visible: true,
    paused: false,
    createdAt: now,
    updatedAt: now,
    status: 'PENDING',
    ...init,
  });
  return created.id;
}

/** Ghi nội dung (đã qua {@link validate}) vào combo rồi lưu, thay toàn bộ lịch trình và nhà hàng gợi ý. */
async function apply(id: number, clean: Required<ComboInput>, actorId: number | null, extra: Record<string, unknown> = {}): Promise<void> {
  await updateRow('combo', id, {
    title: clean.title,
    summary: clean.summary,
    description: clean.description,
    days: clean.days,
    nights: clean.nights,
    priceFrom: clean.priceFrom,
    priceNote: clean.priceNote,
    groupSizeMin: clean.groupSizeMin,
    groupSizeMax: clean.groupSizeMax,
    includes: clean.includes,
    excludes: clean.excludes,
    coverImageUrl: clean.coverImageUrl,
    updatedBy: actorId,
    updatedAt: nowLocal(),
    ...extra,
  });
  await exec('DELETE FROM combo_stop WHERE combo_id = $1', [id]);
  const order = new Map<number, number>();
  for (const s of clean.stops ?? []) {
    const sort = (order.get(s!.dayNo as number) ?? 0) + 1;
    order.set(s!.dayNo as number, sort);
    await insertRow('combo_stop', { comboId: id, dayNo: s!.dayNo, sortOrder: sort, startTime: time(s!.startTime), endTime: time(s!.endTime), placeId: s!.placeId ?? null, title: s!.title, note: s!.note });
  }
  await exec('DELETE FROM combo_restaurant WHERE combo_id = $1', [id]);
  let sort = 0;
  for (const r of clean.restaurants ?? []) await insertRow('combo_restaurant', { comboId: id, placeId: r!.placeId, sortOrder: sort++, note: r!.note });
}

const snapshot = (c: ComboRow): Record<string, unknown> => ({ title: c.title, status: c.status, visible: c.visible, paused: c.paused, days: c.days, nights: c.nights, priceFrom: c.priceFrom });

const auditCombo = (adminId: number | null, action: string, c: ComboRow, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string | null) =>
  audit.record(adminId, action, 'Combo', c.id, reason, before, after);

async function notifyProvider(c: ComboRow, template: string, message: string): Promise<void> {
  if (c.providerId == null) return;
  await recorder.toProvider(c.providerId, template, 'Combo', c.id, message, PARTNER_TARGET);
}

// ---- Admin ----------------------------------------------------------------------------------------------------------------------------------

export async function adminList(status: AdminFilter | undefined, source: SourceFilter | undefined, keyword: string | undefined, page: number, size: number) {
  return rowsOf(await search(status, source, keyword, null, page, size));
}

export async function adminForm(id: number) {
  return form(await find(id));
}

/** Admin tạo combo: đã duyệt, hiển thị ngay. */
export function adminCreate(input: ComboInput, adminAccountId: number | null) {
  return tx(async () => {
    const clean = await validate(input);
    const now = nowLocal();
    const id = await newCombo(clean.title as string, adminAccountId, { status: 'APPROVED', submittedAt: now, reviewedAt: now, reviewedBy: adminAccountId });
    await apply(id, clean, adminAccountId);
    const c = await find(id);
    await auditCombo(adminAccountId, 'COMBO_CREATED', c, null, snapshot(c), null);
    return form(c);
  });
}

/** Admin sửa — áp dụng ngay (kể cả combo của NCC; bản sửa chờ duyệt của NCC nếu có vẫn giữ để xem xét). */
export function adminUpdate(id: number, input: ComboInput, adminAccountId: number | null) {
  return tx(async () => {
    const clean = await validate(input);
    const before = snapshot(await lock(id));
    await apply(id, clean, adminAccountId);
    const c = await find(id);
    await auditCombo(adminAccountId, 'COMBO_UPDATED', c, before, snapshot(c), null);
    return form(c);
  });
}

const reviewedFields = (adminId: number | null) => ({ reviewedAt: nowLocal(), reviewedBy: adminId, updatedBy: adminId, updatedAt: nowLocal() });

export function approve(id: number, adminAccountId: number | null) {
  return tx(async () => {
    let c = await lock(id);
    if (c.status !== 'PENDING') throw new IllegalStateError('Combo đã được xử lý.');
    const before = snapshot(c);
    await updateRow('combo', id, { status: 'APPROVED', rejectReason: null, ...reviewedFields(adminAccountId) });
    c = await find(id);
    await auditCombo(adminAccountId, 'COMBO_APPROVED', c, before, snapshot(c), null);
    await notifyProvider(c, 'PARTNER_COMBO_APPROVED', `${c.title}: đã được duyệt, khách đã thấy combo.`);
    return form(c);
  });
}

export function reject(id: number, reason: string | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    const clean = rejectReason(reason);
    let c = await lock(id);
    if (c.status !== 'PENDING') throw new IllegalStateError('Combo đã được xử lý.');
    const before = snapshot(c);
    await updateRow('combo', id, { status: 'REJECTED', rejectReason: clean, ...reviewedFields(adminAccountId) });
    c = await find(id);
    await auditCombo(adminAccountId, 'COMBO_REJECTED', c, before, snapshot(c), clean);
    await notifyProvider(c, 'PARTNER_COMBO_REJECTED', `${c.title}: bị từ chối. Lý do: ${clean}`);
    return form(c);
  });
}

/** Duyệt bản sửa của NCC: kiểm lại (địa điểm có thể đã bị ẩn từ lúc gửi) rồi áp dụng. */
export function approveEdit(id: number, adminAccountId: number | null) {
  return tx(async () => {
    let c = await lock(id);
    if (c.pendingPayload == null) throw new IllegalStateError('Không có thay đổi nào đang chờ duyệt.');
    const clean = await validate(c.pendingPayload);
    const before = snapshot(c);
    await apply(id, clean, adminAccountId, { pendingPayload: null, pendingSubmittedAt: null, pendingRejectReason: null, ...reviewedFields(adminAccountId) });
    c = await find(id);
    await auditCombo(adminAccountId, 'COMBO_EDIT_APPROVED', c, before, snapshot(c), null);
    await notifyProvider(c, 'PARTNER_COMBO_APPROVED', `${c.title}: thay đổi đã được duyệt.`);
    return form(c);
  });
}

export function rejectEdit(id: number, reason: string | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    const clean = rejectReason(reason);
    let c = await lock(id);
    if (c.pendingPayload == null) throw new IllegalStateError('Không có thay đổi nào đang chờ duyệt.');
    await updateRow('combo', id, { pendingPayload: null, pendingSubmittedAt: null, pendingRejectReason: clean, ...reviewedFields(adminAccountId) });
    c = await find(id);
    await auditCombo(adminAccountId, 'COMBO_EDIT_REJECTED', c, null, null, clean);
    await notifyProvider(c, 'PARTNER_COMBO_REJECTED', `${c.title}: thay đổi bị từ chối. Lý do: ${clean}`);
    return form(c);
  });
}

export function setVisible(id: number, visible: boolean | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    if (visible == null) throw new IllegalArgumentError('Thiếu trạng thái Hiển thị / Ẩn.');
    let c = await lock(id);
    if (visible !== c.visible) {
      const before = snapshot(c);
      await updateRow('combo', id, { visible, updatedBy: adminAccountId, updatedAt: nowLocal() });
      c = await find(id);
      await auditCombo(adminAccountId, visible ? 'COMBO_SHOWN' : 'COMBO_HIDDEN', c, before, snapshot(c), null);
      if (!visible) await notifyProvider(c, 'PARTNER_COMBO_HIDDEN', `${c.title}: quản trị viên đã ẩn combo.`);
    }
    return form(c);
  });
}

/** Xóa hẳn combo chưa có yêu cầu đặt nào (vd combo nhập thử); đã có yêu cầu thì chỉ ẩn được. */
export function remove(id: number, adminAccountId: number | null) {
  return tx(async () => {
    const c = await lock(id);
    if (await scalar<boolean>('SELECT count(*) > 0 FROM combo_request WHERE combo_id = $1', [id])) {
      throw new IllegalStateError('Combo đã có yêu cầu đặt của khách — hãy ẩn combo thay vì xóa.');
    }
    const before = snapshot(c);
    await exec('DELETE FROM combo_stop WHERE combo_id = $1', [id]);
    await exec('DELETE FROM combo_restaurant WHERE combo_id = $1', [id]);
    await exec('DELETE FROM combo WHERE id = $1', [id]);
    await auditCombo(adminAccountId, 'COMBO_DELETED', c, before, null, null);
    await notifyProvider(c, 'PARTNER_COMBO_HIDDEN', `${c.title}: quản trị viên đã xóa combo.`);
  });
}

/** Ô chọn địa điểm cho lịch trình / nhà hàng (Admin và NCC): tối đa 20 địa điểm khách đang xem được. */
export async function placeOptions(kind: CategoryKind | undefined, keyword: string | undefined) {
  const norm = normalizeName(keyword).replace(/%/g, '');
  const where = new Where();
  where.and(`p.is_deleted = FALSE AND p.visibility = 'PUBLISHED' AND p.approval_status = 'APPROVED'`);
  if (kind) where.and('p.kind = ?', kind);
  if (norm !== '') where.and(`p.name_norm LIKE ? ESCAPE '\\'`, `%${norm.replace(/[\\_]/g, (c) => `\\${c}`)}%`);
  const found = await query<PlaceRow>(`SELECT p.* FROM place p ${where.toSql()} ORDER BY p.name ASC, p.id ASC LIMIT 20`, where.params);
  const covers = await coversOf(found.map((p) => p.id));
  return found.map((p) => ref(p, covers));
}

// ---- Yêu cầu đặt combo -------------------------------------------------------------------------------------------------------------------------

interface RequestRow {
  id: number;
  comboId: number;
  comboTitle: string;
  comboSlug: string;
  contactName: string;
  contactPhone: string;
  startDate: string;
  guests: number;
  note: string | null;
  status: ComboRequestStatus;
  travelerAccountId: number | null;
  createdAt: string;
  handledAt: string | null;
  handlerFullName: string | null;
  handlerEmail: string | null;
}

const REQUEST_SELECT = `SELECT r.id, r.combo_id, c.title AS combo_title, c.slug AS combo_slug, r.contact_name, r.contact_phone, r.start_date, r.guests, r.note, r.status,
       r.traveler_account_id, r.created_at, r.handled_at, h.full_name AS handler_full_name, h.email AS handler_email
  FROM combo_request r JOIN combo c ON c.id = r.combo_id LEFT JOIN account h ON h.id = r.handled_by`;

const requestRow = (r: RequestRow) => ({
  id: r.id,
  comboId: r.comboId,
  comboTitle: r.comboTitle,
  comboSlug: r.comboSlug,
  contactName: r.contactName,
  contactPhone: r.contactPhone,
  startDate: r.startDate,
  guests: r.guests,
  note: r.note,
  status: r.status,
  fromAccount: r.travelerAccountId != null,
  createdAt: r.createdAt,
  handledAt: r.handledAt,
  handledByName: r.handlerFullName ?? r.handlerEmail,
});

async function searchRequests(providerId: number | null, comboId: number | undefined, status: ComboRequestStatus | undefined, page: number, size: number) {
  const where = new Where();
  if (providerId != null) where.and('c.provider_id = ?', providerId);
  if (comboId != null) where.and('c.id = ?', comboId);
  if (status) where.and('r.status = ?', status);
  const p = Math.max(page, 0);
  const s = Math.min(Math.max(size, 1), PAGE_MAX);
  const total = (await scalar<number>(`SELECT count(*) FROM combo_request r JOIN combo c ON c.id = r.combo_id ${where.toSql()}`, where.params)) ?? 0;
  const rows = await query<RequestRow>(`${REQUEST_SELECT} ${where.toSql()} ORDER BY r.created_at DESC, r.id DESC LIMIT ${s} OFFSET ${p * s}`, where.params);
  return pageOf(rows.map(requestRow), p, s, total, true);
}

export const adminRequests = (comboId: number | undefined, status: ComboRequestStatus | undefined, page: number, size: number) => searchRequests(null, comboId, status, page, size);

async function setRequestStatus(id: number, status: ComboRequestStatus | null | undefined, actorId: number | null) {
  if (status == null || !(COMBO_REQUEST_STATUSES as readonly string[]).includes(status)) throw new IllegalArgumentError('Thiếu trạng thái yêu cầu.');
  await updateRow('combo_request', id, {
    status,
    handledBy: status === 'NEW' ? null : actorId,
    handledAt: status === 'NEW' ? null : nowLocal(),
  });
  const [row] = await query<RequestRow>(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
  return requestRow(row);
}

export function adminSetRequestStatus(requestId: number, status: ComboRequestStatus | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    if (!(await one('SELECT id FROM combo_request WHERE id = $1', [requestId]))) throw new HttpError(404, 'Không tìm thấy yêu cầu.');
    return setRequestStatus(requestId, status, adminAccountId);
  });
}

// ---- NCC -------------------------------------------------------------------------------------------------------------------------------------

export async function partnerList(principal: UserPrincipal | undefined, page: number, size: number) {
  const account = await actor(principal, false);
  return rowsOf(await search(undefined, undefined, undefined, account.provider!.id, page, size));
}

export async function partnerForm(principal: UserPrincipal | undefined, id: number) {
  const account = await actor(principal, false);
  return form(owned(await find(id), account));
}

/** NCC tạo combo → Chờ duyệt, khách chưa thấy; báo Admin. */
export function partnerCreate(principal: UserPrincipal | undefined, input: ComboInput) {
  return tx(async () => {
    const account = await actor(principal, true);
    const clean = await validate(input);
    const now = nowLocal();
    const id = await newCombo(clean.title as string, account.id, { providerId: account.provider!.id, status: 'PENDING', submittedAt: now });
    await apply(id, clean, account.id);
    const c = await find(id);
    await recorder.toAdmins('ADMIN_NEW_COMBO', 'Combo', c.id, `${c.title}: ${account.provider!.name} gửi combo mới — đang chờ duyệt.`, ADMIN_TARGET);
    return form(c);
  });
}

/**
 * NCC sửa. Combo chưa duyệt (Chờ duyệt / Bị từ chối) → ghi thẳng, đưa về Chờ duyệt. Đã duyệt → lưu bản sửa chờ duyệt, khách vẫn thấy bản
 * cũ; bản sửa chờ duyệt trước đó (nếu có) bị thay thế.
 */
export function partnerUpdate(principal: UserPrincipal | undefined, id: number, input: ComboInput) {
  return tx(async () => {
    const account = await actor(principal, true);
    const clean = await validate(input);
    let c = owned(await lock(id), account);
    const now = nowLocal();
    if (c.status !== 'APPROVED') {
      await apply(id, clean, account.id, { status: 'PENDING', rejectReason: null, submittedAt: now });
    } else {
      await updateRow('combo', id, { pendingPayload: json(clean), pendingSubmittedAt: now, pendingRejectReason: null });
    }
    c = await find(id);
    await recorder.toAdmins('ADMIN_NEW_COMBO', 'Combo', c.id, `${c.title}: ${account.provider!.name} gửi thay đổi combo — đang chờ duyệt.`, ADMIN_TARGET);
    return form(c);
  });
}

/** NCC tạm ngừng bán / bán lại combo của mình (không cần duyệt). */
export function partnerPause(principal: UserPrincipal | undefined, id: number, paused: boolean | null | undefined) {
  return tx(async () => {
    if (paused == null) throw new IllegalArgumentError('Thiếu trạng thái tạm ngừng.');
    const account = await actor(principal, true);
    owned(await lock(id), account);
    await updateRow('combo', id, { paused, updatedBy: account.id, updatedAt: nowLocal() });
    return form(await find(id));
  });
}

export async function partnerRequests(principal: UserPrincipal | undefined, comboId: number | undefined, status: ComboRequestStatus | undefined, page: number, size: number) {
  const account = await actor(principal, false);
  return searchRequests(account.provider!.id, comboId, status, page, size);
}

export function partnerSetRequestStatus(principal: UserPrincipal | undefined, requestId: number, status: ComboRequestStatus | null | undefined) {
  return tx(async () => {
    const account = await actor(principal, true);
    const found = await one(`SELECT r.id FROM combo_request r JOIN combo c ON c.id = r.combo_id WHERE r.id = $1 AND c.provider_id = $2`, [requestId, account.provider!.id]);
    if (!found) throw new HttpError(404, 'Không tìm thấy yêu cầu.');
    return setRequestStatus(requestId, status, account.id);
  });
}
