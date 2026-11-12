import crypto from 'node:crypto';
import { tx } from '../db/pool.js';
import {
  daySessionDefaultStart,
  daySessionOfTime,
  type BookingStatus,
  type DaySession,
  type JourneyItemKind,
  type JourneySource,
  type JourneyStopOrigin,
} from '../domain/enums.js';
import { HttpError, isDataIntegrityViolation } from '../lib/errors.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { addDays, daysBetween, nowLocal, localTimeHm } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import type { AccountRow } from '../repositories/accountRepo.js';
import * as bookingRepo from '../repositories/bookingRepo.js';
import type { BookingWithPlace } from '../repositories/bookingRepo.js';
import type { DishRow } from '../repositories/catalogRepo.js';
import * as journeys from '../repositories/journeyRepo.js';
import type { CheckinRow, DayRow, JourneyAgg, StopAgg } from '../repositories/journeyRepo.js';
import * as places from '../repositories/placeRepo.js';
import type { PlaceRow } from '../repositories/placeRepo.js';
import { query } from '../db/pool.js';

/**
 * Lịch trình của khách du lịch — miễn phí, không phụ thuộc đơn đặt phòng. Khách chỉ đọc / sửa lịch trình của chính mình
 * (lịch trình của người khác trả 404 như không tồn tại). Điểm đến phải là điểm tham quan đang công khai.
 *
 * Gắn với đơn là tùy chọn (mỗi đơn tối đa một lịch trình) — chỉ để hiện trong tab "Lịch trình" của đơn và cho NCC xem;
 * chế độ "Hôm nay" và nhắc giờ chạy theo NGÀY của lịch trình. Chia sẻ công khai qua mã ngẫu nhiên (trang /j/{token}):
 * không lộ mã đơn, giá, SĐT; chuyến chưa đi xong chỉ hiện "Ngày 1, 2".
 *
 * Mục của lịch trình: điểm tham quan (PLACE — check-in, chia sẻ, "Trải nghiệm", nhắc giờ) và các mục ăn uống / hoạt động /
 * di chuyển / chỗ ở / nghỉ ngơi lên từ gói mẫu ở trang /lich-trinh. Gói mẫu là lịch trình gợi ý (source SUGGESTED, không
 * có chủ); ở đây chỉ là gốc khi khách lưu lịch trình lên từ gói.
 */

export const MAX_STOPS = 30;
export const MAX_ITEMS = 80;
const MAX_TITLE_LENGTH = 160;
const MAX_ITEM_TITLE_LENGTH = 160;
const MAX_NOTE_LENGTH = 1000;
const MAX_ADDONS_PER_ITEM = 6;
const MAX_DISHES_PER_ITEM = 8;
const MAX_ALTERNATIVES_PER_ITEM = 8;
export const MAX_GUESTS = 50;
const MAX_TRIP_DAYS = 60;
const MAX_PREFERENCES_LENGTH = 2000;
const SUMMARY_LENGTH = 280;
const MAX_HELPFUL_TOKENS = 60;
const FEED_CHECKINS = 6;

const badRequest = (message: string) => new HttpError(400, message);

// ---- Kiểu đầu vào / đầu ra ------------------------------------------------------------------------------------------

export interface StopInput {
  id?: number | null;
  placeId?: number | null;
  visitDate?: string | null;
  session?: DaySession | null;
  kind?: JourneyItemKind | null;
  title?: string | null;
  dayIndex?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
  addons?: string[] | null;
  sourceStopId?: number | null;
  dishIds?: number[] | null;
  alternativePlaceIds?: number[] | null;
}

export interface DayInput {
  dayIndex?: number | null;
  title?: string | null;
  note?: string | null;
}

export interface JourneyInput {
  basePlaceId?: number | null;
  title?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  stops?: Array<StopInput | null> | null;
  format?: number | null;
  regionId?: number | null;
  guestCount?: number | null;
  templateCode?: string | null;
  preferences?: Record<string, unknown> | null;
  templateId?: number | null;
  days?: Array<DayInput | null> | null;
}

export interface BookingJourneyInput {
  journeyId?: number | null;
  title?: string | null;
  stops?: StopInput[] | null;
}

export interface CopyInput {
  shareToken?: string | null;
  startDate?: string | null;
  guestCount?: number | null;
}

const fullItems = (input: JourneyInput) => input.format != null && input.format >= 2;

// ---- Tiện ích ------------------------------------------------------------------------------------------------------

const trimToNull = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
};

/** Mô tả ngắn cho cẩm nang: tối đa ~280 ký tự, cắt ở khoảng trắng. */
export function summary(description: string | null | undefined): string | null {
  if (description == null) return null;
  const text = description.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= SUMMARY_LENGTH) return text;
  const cut = text.lastIndexOf(' ', SUMMARY_LENGTH);
  return `${text.slice(0, cut > SUMMARY_LENGTH / 2 ? cut : SUMMARY_LENGTH).trim()}…`;
}

export function addonList(codes: string | null | undefined): string[] {
  if (!codes || !codes.trim()) return [];
  return codes
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '');
}

/** Điểm tham quan của lịch trình (check-in, chia sẻ, "Trải nghiệm", nhắc giờ) — không gồm mục ăn uống / hoạt động. */
export const isSight = (stop: StopAgg): boolean => stop.place != null && (stop.kind == null || stop.kind === 'PLACE');

/** Tên mục: tiêu đề khách đặt, không có thì tên địa điểm. */
export const itemName = (stop: StopAgg): string => (stop.title && stop.title.trim() ? stop.title : (stop.place?.name ?? ''));

/** Giờ bắt đầu để xếp thứ tự: giờ riêng của mục, không có thì giờ mặc định của buổi. */
export const startOf = (stop: StopAgg): string => stop.startTime ?? (stop.daySession ? daySessionDefaultStart(stop.daySession) : '00:00:00');

function cmpNullsLast<T extends string | number>(a: T | null | undefined, b: T | null | undefined): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Mục theo ngày rồi theo giờ bắt đầu, cùng giờ giữ thứ tự khách thêm. Khớp sortStops ở frontend (lib/journey). */
export const CHRONOLOGICAL = (a: StopAgg, b: StopAgg): number =>
  cmpNullsLast(a.visitDate, b.visitDate) ||
  cmpNullsLast(a.dayIndex, b.dayIndex) ||
  (startOf(a) < startOf(b) ? -1 : startOf(a) > startOf(b) ? 1 : 0) ||
  a.sortOrder - b.sortOrder;

/** Ngày đầu chuyến: ngày đi khách chọn hoặc ngày tham quan sớm nhất, lấy ngày sớm hơn. */
export function firstDay(j: JourneyAgg): string | null {
  const dates = j.stops.map((s) => s.visitDate).filter((d): d is string => d != null);
  const firstStop = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  if (j.startDate == null) return firstStop;
  return firstStop != null && firstStop < j.startDate ? firstStop : j.startDate;
}

export function lastDay(j: JourneyAgg): string | null {
  const dates = j.stops.map((s) => s.visitDate).filter((d): d is string => d != null);
  const lastStop = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  if (j.endDate == null) return lastStop;
  return lastStop != null && lastStop > j.endDate ? lastStop : j.endDate;
}

const newShareToken = () => crypto.randomBytes(16).toString('base64url');

function givenName(fullName: string | null | undefined): string | null {
  if (!fullName || !fullName.trim()) return null;
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

const isOpenAttraction = (p: PlaceRow | null | undefined): boolean =>
  !!p && !p.isDeleted && p.kind === 'ATTRACTION' && p.visibility === 'PUBLISHED';

const ids = <T extends { id: number }>(items: readonly (T | null | undefined)[]): number[] => items.filter((x): x is T => x != null).map((x) => x.id);

const distinct = <T>(items: readonly T[]): T[] => [...new Set(items)];

const todayVn = () => nowLocal().slice(0, 10);

/** Tài khoản của phiên trang khách theo định danh trong JWT (email, hoặc SĐT với tài khoản không có email). */
export async function traveler(identifier: string): Promise<AccountRow> {
  const account = await accounts.findByIdentifier(identifier);
  if (!account) throw new HttpError(401, 'Vui lòng đăng nhập lại.');
  return account;
}

const travelerId = async (identifier: string) => (await traveler(identifier)).id;

async function owned(identifier: string, id: number): Promise<JourneyAgg> {
  const found = await journeys.findOwned(id, await travelerId(identifier));
  if (!found) throw new HttpError(404, 'Không tìm thấy lịch trình.');
  return found;
}

const notFoundShared = () => new HttpError(404, 'Lịch trình không tồn tại hoặc đã tắt chia sẻ.');

async function sharedJourney(token: string | null | undefined): Promise<JourneyAgg> {
  if (!token || !token.trim() || token.length > 32) throw notFoundShared();
  const found = await journeys.findByShareToken(token.trim());
  if (!found) throw notFoundShared();
  return found;
}

/**
 * Đơn của khách: đặt khi đã đăng nhập (traveler_id), hoặc đơn cũ đặt bằng đúng email tài khoản đã xác minh — cùng quy tắc
 * với "Đơn của tôi". Đơn của người khác trả 404 như không tồn tại.
 */
async function ownedBooking(account: AccountRow, bookingCode: string | null | undefined): Promise<BookingWithPlace> {
  if (!bookingCode || !bookingCode.trim()) throw badRequest('Thiếu mã đơn.');
  const booking = await bookingRepo.findByCodeWithPlace(bookingCode.trim());
  if (!booking || !ownsBooking(account, booking)) throw new HttpError(404, 'Không tìm thấy đơn đặt phòng.');
  return booking;
}

export function ownsBooking(account: AccountRow, booking: { travelerId: number | null; accessTokenHash: string | null; guestEmail: string | null }): boolean {
  if (booking.travelerId != null) return booking.travelerId === account.id;
  const verified = account.emailVerifiedAt != null ? account.email : null;
  return booking.accessTokenHash == null && verified != null && booking.guestEmail != null && booking.guestEmail.trim().toLowerCase() === verified.trim().toLowerCase();
}

async function coversOf(placeIds: readonly number[]): Promise<Map<number, string>> {
  const covers = new Map<number, string>();
  if (placeIds.length === 0) return covers;
  for (const row of await places.publicUrlsByPlaceIds(placeIds)) if (!covers.has(row.id)) covers.set(row.id, row.value);
  return covers;
}

export { coversOf };

/** Link TikTok đầu tiên (theo thứ tự liên hệ) của mỗi địa điểm. */
async function tiktokOf(placeIds: readonly number[]): Promise<Map<number, string>> {
  const byPlace = new Map<number, string>();
  if (placeIds.length === 0) return byPlace;
  for (const c of await places.publicContactsByChannel(placeIds, 'TIKTOK')) if (!byPlace.has(c.placeId)) byPlace.set(c.placeId, c.value);
  return byPlace;
}

async function placeExists(id: number): Promise<boolean> {
  const p = await places.findById(id);
  return !!p && !p.isDeleted;
}

// ---- Views ---------------------------------------------------------------------------------------------------------

export interface CheckinView {
  id: number;
  photoUrl: string | null;
  note: string | null;
  hidden: boolean;
  hiddenReason: string | null;
  createdAt: string;
}

export const checkinView = (c: CheckinRow): CheckinView => ({
  id: c.id,
  photoUrl: c.photoUrl,
  note: c.note,
  hidden: c.hiddenAt != null,
  hiddenReason: c.hiddenReason,
  createdAt: c.createdAt,
});

export interface BasePlaceView {
  id: number;
  name: string;
  slug: string;
  coverImageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}

const dayViews = (j: JourneyAgg) =>
  [...j.days]
    .filter((d) => d.dayIndex != null)
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((d) => ({ dayIndex: d.dayIndex, title: d.title, note: d.note }));

const tagSlugs = (j: JourneyAgg): string[] =>
  j.tags
    .filter((t) => t.isActive !== false)
    .sort((a, b) => a.id - b.id)
    .map((t) => t.slug);

async function views(list: JourneyAgg[]) {
  if (list.length === 0) return [];
  const stopPlaceIds = distinct(list.flatMap((j) => j.stops.map((s) => s.place?.id).filter((x): x is number => x != null)));
  const baseIds = distinct(list.map((j) => j.basePlaceId).filter((x): x is number => x != null));
  const covers = await coversOf(distinct([...stopPlaceIds, ...baseIds]));
  const tiktok = await tiktokOf(stopPlaceIds);
  const bases = new Map((await places.findAllByIds(baseIds)).map((p) => [p.id, p]));
  const bookingIds = distinct(list.map((j) => j.bookingId).filter((x): x is number => x != null));
  const bookingBy = new Map((await bookingRepo.findAllByIds(bookingIds)).map((b) => [b.id, b]));
  const regionIds = distinct(list.map((j) => j.regionId).filter((x): x is number => x != null));
  const regionNames = new Map<number, string>();
  for (const rid of regionIds) {
    const r = await places.findRegionById(rid);
    if (r) regionNames.set(r.id, r.name);
  }
  const journeyIds = list.map((j) => j.id).filter((x) => !!x);
  const checkinByKey = new Map<string, CheckinRow>();
  for (const c of await journeys.checkinsByJourneyIds(journeyIds)) checkinByKey.set(`${c.journeyId}:${c.placeId}`, c);

  return list.map((journey) => {
    const stops = [...journey.stops].sort(CHRONOLOGICAL).map((stop) => {
      const place = stop.place;
      // Check-in chỉ thuộc về điểm tham quan (bữa trưa ở Tú Lệ không mang ảnh check-in của điểm Tú Lệ).
      const c = isSight(stop) ? checkinByKey.get(`${journey.id}:${place!.id}`) : undefined;
      return {
        id: stop.id,
        placeId: place ? place.id : null,
        placeName: place ? place.name : null,
        placeSlug: place ? place.slug : null,
        coverImageUrl: place ? (covers.get(place.id) ?? null) : null,
        latitude: place ? place.latitude : null,
        longitude: place ? place.longitude : null,
        visitDate: stop.visitDate,
        session: stop.daySession,
        tiktokUrl: place ? (tiktok.get(place.id) ?? null) : null,
        accessNote: place ? place.accessNote : null,
        address: place ? place.address : null,
        summary: place ? summary(place.description) : null,
        checkin: c ? checkinView(c) : null,
        kind: stop.kind ?? 'PLACE',
        title: stop.title,
        dayIndex: stop.dayIndex,
        startTime: stop.startTime ? localTimeHm(stop.startTime) : null,
        endTime: stop.endTime ? localTimeHm(stop.endTime) : null,
        note: stop.note,
        addons: addonList(stop.addons),
        origin: stop.origin,
        sourceStopId: stop.sourceStopId,
        dishIds: ids(stop.dishes),
        alternativePlaceIds: ids(stop.alternatives),
      };
    });
    const base = journey.basePlaceId == null ? undefined : bases.get(journey.basePlaceId);
    const baseView: BasePlaceView | null = base
      ? { id: base.id, name: base.name, slug: base.slug, coverImageUrl: covers.get(base.id) ?? null, latitude: base.latitude, longitude: base.longitude }
      : null;
    const booking = journey.bookingId == null ? undefined : bookingBy.get(journey.bookingId);
    return {
      id: journey.id,
      basePlaceId: journey.basePlaceId,
      basePlace: baseView,
      title: journey.title,
      startDate: journey.startDate,
      endDate: journey.endDate,
      bookingCode: booking ? booking.bookingCode : null,
      shareToken: journey.shareToken,
      stops,
      updatedAt: journey.updatedAt,
      publishedAt: journey.publishedAt,
      feedHidden: journey.feedHiddenAt != null,
      feedHiddenReason: journey.feedHiddenReason,
      regionId: journey.regionId,
      regionName: journey.regionId == null ? null : (regionNames.get(journey.regionId) ?? null),
      guestCount: journey.guestCount,
      templateCode: journey.templateCode,
      preferences: journey.preferences,
      bookingStatus: (booking ? booking.status : null) as BookingStatus | null,
      source: journey.source as JourneySource,
      templateId: journey.templateId,
      days: dayViews(journey),
      tags: tagSlugs(journey),
    };
  });
}

export type JourneyView = Awaited<ReturnType<typeof views>>[number];

const view = async (j: JourneyAgg): Promise<JourneyView> => (await views([j]))[0];

// ---- Lịch trình của khách -----------------------------------------------------------------------------------------

export async function list(identifier: string, basePlaceId: number | null | undefined) {
  const id = await travelerId(identifier);
  const owned = basePlaceId == null ? await journeys.findAllForTraveler(id) : await journeys.findForTravelerAndBasePlace(id, basePlaceId);
  return views(owned);
}

export async function get(identifier: string, id: number) {
  return view(await owned(identifier, id));
}

function newJourney(travelerId: number | null): JourneyAgg {
  const now = nowLocal();
  return {
    id: 0,
    travelerId,
    source: 'TRAVELER',
    templateId: null,
    basePlaceId: null,
    title: null,
    startDate: null,
    endDate: null,
    bookingId: null,
    shareToken: null,
    publishedAt: null,
    feedHiddenAt: null,
    feedHiddenReason: null,
    regionId: null,
    guestCount: null,
    templateCode: null,
    preferences: null,
    summary: null,
    dayCount: null,
    nights: null,
    priceFrom: null,
    visibility: null,
    sortOrder: 0,
    packageInfo: null,
    createdAt: now,
    updatedAt: now,
    stops: [],
    days: [],
    tags: [],
  };
}

function newStop(): StopAgg {
  return {
    id: 0,
    journeyId: 0,
    placeId: null,
    kind: 'PLACE',
    title: null,
    visitDate: null,
    dayIndex: null,
    daySession: 'MORNING',
    startTime: null,
    endTime: null,
    note: null,
    addons: null,
    sortOrder: 0,
    origin: 'CUSTOM',
    sourceStopId: null,
    reminderSentAt: null,
    place: null,
    dishes: [],
    alternatives: [],
  };
}

export async function create(identifier: string, input: JourneyInput) {
  return tx(async () => {
    const journey = newJourney(await travelerId(identifier));
    await apply(journey, input);
    return view(await journeys.saveAggregate(journey));
  });
}

export async function update(identifier: string, id: number, input: JourneyInput) {
  return tx(async () => {
    const journey = await owned(identifier, id);
    await apply(journey, input);
    journey.updatedAt = nowLocal();
    return view(await journeys.saveAggregate(journey));
  });
}

export async function remove(identifier: string, id: number): Promise<void> {
  await tx(async () => {
    const journey = await owned(identifier, id);
    await journeys.deleteJourney(journey.id);
  });
}

// ---- Gắn với đơn đặt phòng ---------------------------------------------------------------------------------------

function overlaps(journey: JourneyAgg, checkIn: string | null, checkOut: string | null): boolean {
  const first = firstDay(journey);
  const last = lastDay(journey);
  if (!first || !last || !checkIn || !checkOut) return true;
  return !(last < checkIn) && !(first > checkOut);
}

async function provinceIdOf(place: { regionId: number | null } | null | undefined): Promise<number | null> {
  if (!place || place.regionId == null) return null;
  return (await places.provinceOfRegion(place.regionId))?.id ?? null;
}

/**
 * Tab "Lịch trình" của đơn: lịch trình đang gắn + các lịch trình chưa gắn đơn của khách có thể gắn — cùng chỗ nghỉ, hoặc
 * chưa chọn chỗ ở (lên ở trang /lich-trinh) cùng tỉnh với chỗ nghỉ và trùng ngày ở (hoặc chưa có ngày).
 */
export async function forBooking(identifier: string, bookingCode: string) {
  const account = await traveler(identifier);
  const booking = await ownedBooking(account, bookingCode);
  const linkedAgg = await journeys.findByBookingIdWithStops(booking.id);
  const linked = linkedAgg && linkedAgg.travelerId === account.id ? linkedAgg : null;
  const placeRow = await places.findById(booking.placeId);
  const province = placeRow?.regionId == null ? null : await places.provinceOfRegion(placeRow.regionId);
  const provinceId = province ? province.id : null;
  const candidates = (await journeys.findAllForTraveler(account.id))
    .filter((j) => j.bookingId == null)
    .filter(
      (j) =>
        j.basePlaceId === booking.placeId ||
        (j.basePlaceId == null && (j.regionId == null || j.regionId === provinceId) && overlaps(j, booking.checkIn, booking.checkOut)),
    );
  const all = [...candidates, ...(linked ? [linked] : [])];
  const byId = new Map((await views(all)).map((v) => [v.id, v]));
  return {
    linked: linked ? (byId.get(linked.id) ?? null) : null,
    candidates: candidates.map((j) => byId.get(j.id)!),
    province: province ? province.name : null,
  };
}

/**
 * Gắn đơn vào lịch trình (gỡ khỏi lịch trình cũ của cùng khách nếu có): điền chỗ nghỉ, số người, tỉnh còn trống theo đơn.
 * Ngày: lịch trình chưa có ngày thì lấy ngày ở của đơn; lịch trình xếp theo "Ngày N" mà ngày đi lệch ngày nhận phòng thì
 * dời cả lịch trình theo ngày nhận phòng.
 */
async function attach(journey: JourneyAgg, booking: BookingWithPlace, tid: number): Promise<void> {
  const other = await journeys.findFirstRowByBookingId(booking.id);
  if (other && other.id !== journey.id) {
    if (tid !== other.travelerId) throw new HttpError(409, 'Đơn này đã gắn với lịch trình khác.');
    await journeys.patchJourney(other.id, { bookingId: null });
  }
  journey.bookingId = booking.id;
  if (journey.basePlaceId == null) journey.basePlaceId = booking.placeId;
  if (journey.guestCount == null && booking.guestCount != null && booking.guestCount > 0) {
    journey.guestCount = Math.min(booking.guestCount, MAX_GUESTS);
  }
  if (journey.regionId == null) {
    const placeRow = await places.findById(booking.placeId);
    journey.regionId = await provinceIdOf(placeRow);
  }
  const checkIn = booking.checkIn;
  const byDayIndex = journey.stops.some((s) => s.dayIndex != null);
  if (journey.startDate == null && journey.endDate == null) {
    journey.startDate = checkIn;
    journey.endDate = booking.checkOut;
    if (byDayIndex && checkIn) placeOnDates(journey, checkIn, booking.checkOut);
  } else if (byDayIndex && checkIn && checkIn !== journey.startDate) {
    placeOnDates(journey, checkIn, booking.checkOut);
  }
}

/**
 * Ngày đi của lịch trình = start: mục có "Ngày N" sang đúng ngày của nó, mục chỉ có ngày thì dời cùng khoảng (nhắc giờ lại
 * theo ngày mới). Ngày về = ngày cuối của lịch trình, không sớm hơn ngày trả phòng.
 */
export function placeOnDates(journey: JourneyAgg, start: string, checkOut: string | null): void {
  const oldStart = journey.startDate;
  let lastDayIdx = 1;
  for (const stop of journey.stops) {
    let date = stop.visitDate;
    if (stop.dayIndex != null) {
      date = addDays(start, stop.dayIndex - 1);
      lastDayIdx = Math.max(lastDayIdx, stop.dayIndex);
    } else if (date != null && oldStart != null) {
      date = addDays(date, daysBetween(oldStart, start));
    }
    if (date !== stop.visitDate) {
      stop.visitDate = date;
      stop.reminderSentAt = null;
    }
  }
  const end = addDays(start, lastDayIdx - 1);
  journey.startDate = start;
  journey.endDate = checkOut != null && checkOut > end ? checkOut : end;
}

/** Gắn lịch trình với một đơn của chính khách. Lịch trình chưa có chỗ nghỉ / ngày đi thì lấy theo đơn. */
export async function linkBooking(identifier: string, journeyId: number, bookingCode: string | null | undefined) {
  return tx(async () => {
    const account = await traveler(identifier);
    const journey = await journeys.findOwned(journeyId, account.id);
    if (!journey) throw new HttpError(404, 'Không tìm thấy lịch trình.');
    const booking = await ownedBooking(account, bookingCode);
    if (booking.status === 'CANCELLED') throw badRequest('Đơn đã hủy, không gắn lịch trình được.');
    await attach(journey, booking, account.id);
    journey.updatedAt = nowLocal();
    return view(await journeys.saveAggregate(journey));
  });
}

export async function unlinkBooking(identifier: string, journeyId: number) {
  return tx(async () => {
    const journey = await owned(identifier, journeyId);
    journey.bookingId = null;
    journey.updatedAt = nowLocal();
    return view(await journeys.saveAggregate(journey));
  });
}

/**
 * Khách đã đăng nhập vừa đặt đơn: tự gắn lịch trình chưa gắn đơn mới sửa gần nhất của khách ở cùng chỗ nghỉ, có ngày trùng
 * khoảng ngày ở (hoặc chưa chọn ngày). Không có thì thôi — khách gắn tay ở tab "Lịch trình" của đơn.
 */
export async function autoLinkNewBooking(tid: number | null, bookingCode: string | null): Promise<void> {
  if (tid == null || !bookingCode) return;
  await tx(async () => {
    const booking = await bookingRepo.findByCodeWithPlace(bookingCode);
    if (!booking || booking.travelerId !== tid) return;
    if (await journeys.findFirstRowByBookingId(booking.id)) return;
    const candidate = (await journeys.findForTravelerAndBasePlace(tid, booking.placeId))
      .filter((j) => j.bookingId == null)
      .find((j) => overlaps(j, booking.checkIn, booking.checkOut));
    if (candidate) {
      await attach(candidate, booking, tid);
      await journeys.saveAggregate(candidate);
    }
  });
}

/**
 * Cổng NCC: lịch trình khách gắn với đơn (chỉ đọc, gọn — không có ảnh, lưu bút, ghi chú). Gồm cả mục ăn uống / hoạt động
 * để chủ nhà biết khách định ăn tối ở đâu, đi lúc mấy giờ. Quyền với đơn kiểm ở nơi gọi.
 */
export async function guestJourney(bookingId: number | null) {
  if (bookingId == null) return null;
  const j = await journeys.findByBookingIdWithStops(bookingId);
  if (!j) return null;
  return {
    title: j.title,
    stops: [...j.stops].sort(CHRONOLOGICAL).map((s) => ({
      placeName: itemName(s),
      visitDate: s.visitDate,
      session: s.daySession,
      startTime: s.startTime ? localTimeHm(s.startTime) : null,
    })),
  };
}

// ---- Chia sẻ + sao chép --------------------------------------------------------------------------------------------

export async function share(identifier: string, id: number) {
  return tx(async () => {
    const journey = await owned(identifier, id);
    if (journey.shareToken == null) {
      journey.shareToken = newShareToken();
      await journeys.patchJourney(journey.id, { shareToken: journey.shareToken });
    }
    return { shareToken: journey.shareToken };
  });
}

/** Tắt chia sẻ: link /j/{mã} chết ngay và bài trên trang "Trải nghiệm" (trỏ tới link đó) cũng gỡ theo. */
export async function unshare(identifier: string, id: number): Promise<void> {
  await tx(async () => {
    const journey = await owned(identifier, id);
    await journeys.patchJourney(journey.id, { shareToken: null, publishedAt: null });
  });
}

/** Đăng lịch trình lên trang "Trải nghiệm" cho khách khác xem (tự tạo link chia sẻ nếu chưa có). */
export async function publish(identifier: string, id: number) {
  return tx(async () => {
    const journey = await owned(identifier, id);
    // Trang "Trải nghiệm" chỉ kể các điểm tham quan — lịch trình chỉ có bữa ăn, di chuyển… thì chưa có gì để đăng.
    if (!journey.stops.some(isSight)) throw badRequest('Lịch trình chưa có điểm tham quan nào để đăng.');
    const shareToken = journey.shareToken ?? newShareToken();
    const publishedAt = journey.publishedAt ?? nowLocal();
    await journeys.patchJourney(journey.id, { shareToken, publishedAt });
    return { shareToken, publishedAt };
  });
}

/** Gỡ khỏi trang "Trải nghiệm" (link chia sẻ vẫn giữ). */
export async function unpublish(identifier: string, id: number): Promise<void> {
  await tx(async () => {
    const journey = await owned(identifier, id);
    await journeys.patchJourney(journey.id, { publishedAt: null });
  });
}

// ---- Trang "Trải nghiệm" --------------------------------------------------------------------------------------------

export interface FeedCheckin {
  placeName: string;
  photoUrl: string | null;
  note: string | null;
  dayNumber: number | null;
  session: DaySession;
}

/**
 * Thân bài "Trải nghiệm": check-in đang hiện (có ảnh hoặc lưu bút) theo thứ tự đi của lịch trình, mỗi địa điểm một lần.
 * "Ngày N" tính từ ngày đầu chuyến như trang chia sẻ; không trả ngày cụ thể.
 */
export function feedCheckins(orderedStops: StopAgg[], visible: CheckinRow[], first: string | null): FeedCheckin[] {
  const byPlace = new Map<number, CheckinRow>();
  for (const c of visible) if (!byPlace.has(c.placeId)) byPlace.set(c.placeId, c);
  const entries: FeedCheckin[] = [];
  const seen = new Set<number>();
  for (const stop of orderedStops) {
    const placeId = stop.place!.id;
    const checkin = byPlace.get(placeId);
    if (!checkin || seen.has(placeId)) continue;
    seen.add(placeId);
    const note = checkin.note == null || !checkin.note.trim() ? null : checkin.note.trim();
    if (checkin.photoUrl == null && note == null) continue;
    const dayNumber = first != null && stop.visitDate != null ? daysBetween(first, stop.visitDate) + 1 : null;
    entries.push({ placeName: stop.place!.name, photoUrl: checkin.photoUrl, note, dayNumber, session: stop.daySession });
    if (entries.length === FEED_CHECKINS) break;
  }
  return entries;
}

/**
 * Bài trên trang "Trải nghiệm", mới đăng trước. Cùng quy tắc riêng tư với trang chia sẻ: không mã đơn, giá, SĐT; chỉ ảnh /
 * lưu bút check-in chưa bị Admin ẩn. Lấy dư một bài để biết còn trang sau không.
 */
export async function feed(page: number, size: number) {
  const safePage = Math.max(0, page);
  const safeSize = Math.max(1, Math.min(size, 24));
  const allIds = await journeys.findFeedIds(safeSize + 1, safePage * (safeSize + 1));
  const hasMore = allIds.length > safeSize;
  const pageIds = hasMore ? allIds.slice(0, safeSize) : allIds;
  if (pageIds.length === 0) return { items: [], page: safePage, hasMore: false };

  const byId = new Map((await journeys.findAllWithStopsByIds(pageIds)).map((j) => [j.id, j]));
  const ordered = pageIds.map((id) => byId.get(id)).filter((j): j is JourneyAgg => !!j);

  const placeIds = distinct(
    ordered.flatMap((j) => [...j.stops.filter(isSight).map((s) => s.place!.id), ...(j.basePlaceId != null ? [j.basePlaceId] : [])]),
  );
  const covers = await coversOf(placeIds);
  const baseIds = distinct(ordered.map((j) => j.basePlaceId).filter((x): x is number => x != null));
  const bases = new Map((await places.findAllByIds(baseIds)).map((p) => [p.id, p]));
  const checkinsAll = (await journeys.checkinsByJourneyIds(pageIds))
    .filter((c) => c.hiddenAt == null)
    .sort((a, b) => cmpNullsLast(a.createdAt, b.createdAt));
  const checkinsByJourney = new Map<number, CheckinRow[]>();
  for (const c of checkinsAll) {
    const list = checkinsByJourney.get(c.journeyId!) ?? [];
    list.push(c);
    checkinsByJourney.set(c.journeyId!, list);
  }
  const ownerIds = distinct(ordered.map((j) => j.travelerId).filter((x): x is number => x != null));
  const owners = new Map<number, string>();
  for (const oid of ownerIds) {
    const a = await accounts.findById(oid);
    if (a) owners.set(a.id, givenName(a.fullName) ?? '');
  }
  const helpful = await journeys.helpfulCounts(pageIds);
  const today = todayVn();

  const items = ordered.map((journey) => {
    // Bài "Trải nghiệm" kể theo các điểm tham quan (mục ăn uống / di chuyển không lên bảng tin).
    const stops = journey.stops.filter(isSight).sort(CHRONOLOGICAL);
    const visible = checkinsByJourney.get(journey.id) ?? [];
    const photos = visible.map((c) => c.photoUrl).filter((p): p is string => p != null).slice(0, 4);
    const note = visible.map((c) => c.note).find((n): n is string => n != null && n.trim() !== '') ?? null;
    const base = journey.basePlaceId == null ? undefined : bases.get(journey.basePlaceId);
    const cover =
      photos.length > 0
        ? photos[0]
        : (stops.map((s) => covers.get(s.place!.id)).find((c): c is string => c != null) ?? (base ? (covers.get(base.id) ?? null) : null));
    const first = firstDay(journey);
    const last = lastDay(journey);
    const dayCount = first != null && last != null ? daysBetween(first, last) + 1 : null;
    const baseView: BasePlaceView | null =
      !base || base.isDeleted
        ? null
        : { id: base.id, name: base.name, slug: base.slug, coverImageUrl: covers.get(base.id) ?? null, latitude: base.latitude, longitude: base.longitude };
    const owner = journey.travelerId == null ? undefined : owners.get(journey.travelerId);
    return {
      id: journey.id,
      shareToken: journey.shareToken,
      title: journey.title,
      ownerName: owner == null || owner === '' ? null : owner,
      basePlace: baseView,
      dayCount,
      stopCount: stops.length,
      checkinCount: visible.length,
      completed: last != null && last < today,
      coverImageUrl: cover ?? null,
      photos,
      placeNames: stops.map((s) => s.place!.name).slice(0, 4),
      note,
      publishedAt: journey.publishedAt,
      checkins: feedCheckins(stops, visible, first),
      helpfulCount: helpful.get(journey.id) ?? 0,
    };
  });
  return { items, page: safePage, hasMore };
}

// ---- Nút "Hữu ích" (tim) -------------------------------------------------------------------------------------------

/** Trạng thái nút "Hữu ích" của khách với các bài đang xem (mã chia sẻ): đã bấm bài nào, bài nào là của chính khách. */
export async function helpfulState(identifier: string, tokens: string[] | null | undefined) {
  const tid = await travelerId(identifier);
  const wanted = distinct((tokens ?? []).filter((t) => t && t.trim() && t.length <= 32).map((t) => t.trim())).slice(0, MAX_HELPFUL_TOKENS);
  if (wanted.length === 0) return { helpful: [], own: [] };
  const tokenById = new Map<number, string>();
  const own: string[] = [];
  for (const row of await journeys.findSharedOwners(wanted)) {
    tokenById.set(row.id, row.shareToken);
    if (tid === row.travelerId) own.push(row.shareToken);
  }
  if (tokenById.size === 0) return { helpful: [], own: [] };
  const marked = (await journeys.markedJourneyIds(tid, [...tokenById.keys()])).map((id) => tokenById.get(id)!);
  return { helpful: marked, own };
}

/** Id của hành trình đang chia sẻ theo mã; hành trình của chính khách thì không bấm "Hữu ích" được. */
async function sharedJourneyOf(token: string | null | undefined, tid: number): Promise<number> {
  if (!token || !token.trim() || token.length > 32) throw notFoundShared();
  const [row] = await journeys.findSharedOwners([token.trim()]);
  if (!row) throw notFoundShared();
  if (tid === row.travelerId) throw badRequest('Đây là hành trình của bạn — chỉ du khách khác bấm Hữu ích được.');
  return row.id;
}

/** Khách bấm "Hữu ích" — bấm lại không cộng thêm. Hai lần bấm cùng lúc thì lần sau gặp khóa chính trùng, coi như đã bấm. */
export async function markHelpful(identifier: string, token: string) {
  const tid = await travelerId(identifier);
  const journeyId = await sharedJourneyOf(token, tid);
  if (!(await journeys.helpfulExists(journeyId, tid))) {
    try {
      await journeys.insertHelpful(journeyId, tid);
    } catch (err) {
      if (!isDataIntegrityViolation(err)) throw err;
    }
  }
  return { helpful: true, count: await journeys.helpfulCount(journeyId) };
}

export async function unmarkHelpful(identifier: string, token: string) {
  const tid = await travelerId(identifier);
  const journeyId = await sharedJourneyOf(token, tid);
  await journeys.deleteHelpful(journeyId, tid);
  return { helpful: false, count: await journeys.helpfulCount(journeyId) };
}

// ---- Admin: kiểm duyệt bài ----------------------------------------------------------------------------------------

async function adminFeedItem(j: JourneyAgg, owner: AccountRow | null) {
  return {
    id: j.id,
    shareToken: j.shareToken,
    title: j.title,
    travelerId: j.travelerId,
    travelerName: owner ? owner.fullName : null,
    travelerEmail: owner ? owner.email : null,
    stopCount: j.stops.filter(isSight).length,
    publishedAt: j.publishedAt,
    hiddenAt: j.feedHiddenAt,
    hiddenReason: j.feedHiddenReason,
  };
}

export async function feedModeration(hidden: boolean | null, page: number, size: number): Promise<PageJson<Awaited<ReturnType<typeof adminFeedItem>>>> {
  const p = Math.max(0, page);
  const s = Math.max(1, Math.min(size, 50));
  const { rows, total } = await journeys.findPublishedForModeration(hidden, s, p * s);
  const content = [];
  for (const j of rows) content.push(await adminFeedItem(j, j.travelerId == null ? null : await accounts.findById(j.travelerId)));
  return pageOf(content, p, s, total);
}

/** Bài đã đăng lên trang "Trải nghiệm" (lịch trình của khách) — id khác (chưa đăng, lịch trình gợi ý) trả 404. */
async function feedPost(id: number): Promise<JourneyAgg> {
  const j = await journeys.findById(id);
  if (!j || j.publishedAt == null || j.source !== 'TRAVELER') throw new HttpError(404, 'Không tìm thấy bài trên trang Trải nghiệm.');
  return j;
}

export async function hideFromFeed(id: number, reason: string | null | undefined) {
  return tx(async () => {
    const journey = await feedPost(id);
    const why = !reason || !reason.trim() ? 'Nội dung không phù hợp' : reason.trim();
    journey.feedHiddenAt = nowLocal();
    journey.feedHiddenReason = why.length > 500 ? why.slice(0, 500) : why;
    await journeys.patchJourney(id, { feedHiddenAt: journey.feedHiddenAt, feedHiddenReason: journey.feedHiddenReason });
    return adminFeedItem(journey, journey.travelerId == null ? null : await accounts.findById(journey.travelerId));
  });
}

export async function unhideFromFeed(id: number) {
  return tx(async () => {
    const journey = await feedPost(id);
    journey.feedHiddenAt = null;
    journey.feedHiddenReason = null;
    await journeys.patchJourney(id, { feedHiddenAt: null, feedHiddenReason: null });
    return adminFeedItem(journey, journey.travelerId == null ? null : await accounts.findById(journey.travelerId));
  });
}

// ---- Lưu lịch trình cùng đơn đặt phòng ----------------------------------------------------------------------------

/**
 * Trang đặt phòng: lưu lịch trình khách lên ở trang homestay CÙNG đơn vừa tạo. Nháp đang sửa một lịch trình đã lưu (chưa
 * gắn đơn khác) thì ghi đè lịch trình đó; không thì tạo mới. Chỗ nghỉ + ngày đi / về lấy theo đơn. Trả về id lịch trình.
 */
export async function saveWithBooking(identifier: string, bookingCode: string, input: BookingJourneyInput | null): Promise<number> {
  if (!input || !input.stops || input.stops.length === 0) throw badRequest('Lịch trình chưa có điểm nào.');
  return tx(async () => {
    const account = await traveler(identifier);
    const booking = await ownedBooking(account, bookingCode);
    let journey: JourneyAgg | null = null;
    if (input.journeyId != null) {
      const found = await journeys.findOwned(input.journeyId, account.id);
      if (found && (found.bookingId == null || found.bookingId === booking.id)) journey = found;
    }
    if (!journey) journey = newJourney(account.id);
    const title = input.title && input.title.trim() ? input.title : journey.title;
    await apply(journey, { basePlaceId: booking.placeId, title, startDate: booking.checkIn, endDate: booking.checkOut, stops: input.stops });
    journey.updatedAt = nowLocal();
    await attach(journey, booking, account.id);
    return (await journeys.saveAggregate(journey)).id;
  });
}

// ---- Trang chia sẻ công khai -------------------------------------------------------------------------------------

/**
 * Trang chia sẻ công khai: trọn lịch trình theo giờ (mọi mục, tiêu đề, giờ, ghi chú, dịch vụ thêm — chủ lịch trình chủ động
 * chia sẻ) + lộ trình / nhật ký của các điểm tham quan. Không mã đơn, giá, SĐT; chuyến chưa đi xong chỉ hiện "Ngày 1, 2".
 */
export async function shared(token: string) {
  const journey = await sharedJourney(token);
  const today = todayVn();
  const all = [...journey.stops].sort(CHRONOLOGICAL);
  const stops = all.filter(isSight);
  const first = firstDay(journey);
  const last = lastDay(journey);
  const completed = last != null && last < today;
  const covers = await coversOf(distinct(all.filter((s) => s.place).map((s) => s.place!.id)));
  const tiktok = await tiktokOf(stops.map((s) => s.place!.id));
  const visible = new Map<number, CheckinRow>();
  for (const c of await journeys.checkinsByJourneyIds([journey.id])) if (c.hiddenAt == null) visible.set(c.placeId, c);

  // Chưa có ngày đi (lịch trình theo "Ngày N"): số ngày lấy theo dayIndex.
  const dayNumberOf = (stop: StopAgg): number | null =>
    first != null && stop.visitDate != null ? daysBetween(first, stop.visitDate) + 1 : stop.dayIndex == null ? null : stop.dayIndex;

  const sharedStops = stops.map((stop) => {
    const place = stop.place!;
    const checkin = visible.get(place.id);
    return {
      placeId: place.id,
      placeName: place.name,
      placeSlug: place.slug,
      coverImageUrl: covers.get(place.id) ?? null,
      latitude: place.latitude,
      longitude: place.longitude,
      dayNumber: dayNumberOf(stop),
      visitDate: completed ? stop.visitDate : null,
      session: stop.daySession,
      startTime: stop.startTime ? localTimeHm(stop.startTime) : null,
      tiktokUrl: tiktok.get(place.id) ?? null,
      checkinPhotoUrl: checkin ? checkin.photoUrl : null,
      checkinNote: checkin ? checkin.note : null,
    };
  });
  const items = all.map((stop) => {
    const place = stop.place;
    return {
      kind: stop.kind ?? 'PLACE',
      title: trimToNull(stop.title),
      placeId: place ? place.id : null,
      placeName: place ? place.name : null,
      placeSlug: place ? place.slug : null,
      coverImageUrl: place ? (covers.get(place.id) ?? null) : null,
      dayNumber: dayNumberOf(stop),
      visitDate: completed ? stop.visitDate : null,
      session: stop.daySession,
      startTime: stop.startTime ? localTimeHm(stop.startTime) : null,
      endTime: stop.endTime ? localTimeHm(stop.endTime) : null,
      note: trimToNull(stop.note),
      addons: addonList(stop.addons),
      sourceStopId: stop.sourceStopId,
      dishIds: ids(stop.dishes),
      alternativePlaceIds: ids(stop.alternatives),
    };
  });
  const dayCount = first != null && last != null ? daysBetween(first, last) + 1 : null;
  const ownerAccount = journey.travelerId == null ? null : await accounts.findById(journey.travelerId);
  const owner = ownerAccount ? givenName(ownerAccount.fullName) : null;
  const regionName = journey.regionId == null ? null : ((await places.findRegionById(journey.regionId))?.name ?? null);
  return {
    title: journey.title,
    ownerName: owner,
    basePlace: await basePlace(journey.basePlaceId),
    dayCount,
    completed,
    startDate: completed ? first : null,
    endDate: completed ? last : null,
    stops: sharedStops,
    helpfulCount: await journeys.helpfulCount(journey.id),
    items,
    templateCode: journey.templateCode,
    regionName,
    guestCount: journey.guestCount,
    days: dayViews(journey),
  };
}

async function basePlace(placeId: number | null): Promise<BasePlaceView | null> {
  if (placeId == null) return null;
  const p = await places.findById(placeId);
  if (!p || p.isDeleted) return null;
  return { id: p.id, name: p.name, slug: p.slug, coverImageUrl: (await coversOf([p.id])).get(p.id) ?? null, latitude: p.latitude, longitude: p.longitude };
}

/**
 * "Áp dụng lịch trình này": chép trọn lịch trình được chia sẻ thành lịch trình mới của khách — mọi mục với tiêu đề, giờ, ghi
 * chú, dịch vụ thêm, cùng gói gốc và tag đã chọn. Có ngày bắt đầu thì Ngày 1 rơi vào ngày đó, không có thì chỉ có "Ngày N".
 * Điểm không còn mở cửa giữ thành hoạt động mang tên điểm. Chỗ ở của chuyến gốc không chép làm chỗ nghỉ — homestay đó đứng
 * đầu gợi ý ô "Chỗ ở" (preferences.stay).
 */
export async function copy(identifier: string, input: CopyInput | null) {
  if (!input || !input.shareToken) throw badRequest('Thiếu lịch trình cần áp dụng.');
  if (input.guestCount != null && (input.guestCount < 1 || input.guestCount > MAX_GUESTS)) throw badRequest(`Số người đi từ 1 đến ${MAX_GUESTS}.`);
  return tx(async () => {
    const source = await sharedJourney(input.shareToken);
    const tid = await travelerId(identifier);
    const first = firstDay(source);
    const start = input.startDate ?? null;
    const dup = newJourney(tid);
    dup.title = source.title;
    dup.regionId = source.regionId;
    dup.guestCount = input.guestCount != null ? input.guestCount : source.guestCount;
    dup.templateCode = source.templateCode;
    dup.templateId = source.templateId;
    dup.preferences = await copiedPreferences(source);
    dup.days = copiedDays(source.days);
    dup.tags = [...source.tags];
    let lastIndex = 1;
    for (const stop of [...source.stops].sort(CHRONOLOGICAL)) {
      let dayIndex: number | null = stop.dayIndex ?? (first != null && stop.visitDate != null ? daysBetween(first, stop.visitDate) + 1 : null);
      if (dayIndex != null && dayIndex < 1) dayIndex = null;
      if (dayIndex != null) lastIndex = Math.max(lastIndex, dayIndex);
      let kind: JourneyItemKind = stop.kind ?? 'PLACE';
      const place = isOpenAttraction(stop.place) ? stop.place : null;
      let title = trimToNull(stop.title);
      if (stop.place != null && place == null) {
        if (kind === 'PLACE') kind = 'ACTIVITY';
        if (title == null) title = stop.place.name;
      }
      const row = newStop();
      Object.assign(row, {
        kind,
        place,
        title,
        dayIndex,
        visitDate: start != null && dayIndex != null ? addDays(start, dayIndex - 1) : null,
        daySession: stop.daySession,
        startTime: stop.startTime,
        endTime: stop.endTime,
        note: stop.note,
        addons: stop.addons,
        sortOrder: dup.stops.length,
        origin: (stop.origin ?? 'CUSTOM') as JourneyStopOrigin,
        sourceStopId: stop.sourceStopId,
        dishes: publishedDishes(stop.dishes),
        alternatives: alternativesWithout(openAttractions(stop.alternatives), place, null),
      });
      dup.stops.push(row);
    }
    if (start != null) {
      const last = lastDay(source);
      const span = first != null && last != null ? daysBetween(first, last) + 1 : 1;
      dup.startDate = start;
      dup.endDate = addDays(start, Math.max(span, lastIndex) - 1);
    }
    return view(await journeys.saveAggregate(dup));
  });
}

/** Tag lọc của chuyến gốc; homestay của chuyến gốc (nếu còn) đứng đầu gợi ý ô "Chỗ ở" của bản chép. */
async function copiedPreferences(source: JourneyAgg): Promise<Record<string, unknown> | null> {
  const preferences: Record<string, unknown> = { ...(source.preferences ?? {}) };
  if (source.basePlaceId != null && (await placeExists(source.basePlaceId))) preferences.stay = source.basePlaceId;
  return Object.keys(preferences).length === 0 ? null : preferences;
}

// ---- Ghi lịch trình ----------------------------------------------------------------------------------------------

const kindOf = (stop: StopInput): JourneyItemKind => stop.kind ?? 'PLACE';
const slotKey = (dayIndex: number, start: string) => `${dayIndex}@${start}`;

/** Id khách gửi: bỏ null / trùng, giữ thứ tự; quá số tối đa thì từ chối. */
function wanted(list: number[], max: number, what: string): number[] {
  const unique = distinct(list.filter((x) => x != null));
  if (unique.length > max) throw badRequest(`Mỗi mục tối đa ${max} ${what}.`);
  return unique;
}

const publishedDishes = (list: DishRow[]): DishRow[] => list.filter((d) => d && d.visibility === 'PUBLISHED');
const openAttractions = (list: PlaceRow[]): PlaceRow[] => list.filter((p) => p && isOpenAttraction(p));

/** Điểm đổi được của mục gốc trong gói: điểm của mục + các phương án (chỉ khi mục có phương án), còn mở cửa. */
function optionsOf(source: StopAgg): PlaceRow[] {
  if (source.alternatives.length === 0) return [];
  const options: PlaceRow[] = [];
  if (source.place) options.push(source.place);
  options.push(...source.alternatives);
  return openAttractions(options);
}

/**
 * Điểm đổi được không gồm điểm hiện tại của mục (bỏ trùng, tối đa MAX_ALTERNATIVES_PER_ITEM). Khách vừa đổi sang một điểm
 * trong danh sách thì điểm cũ lên đầu danh sách — đổi qua lại được như phương án của gói.
 */
function alternativesWithout(options: PlaceRow[], current: PlaceRow | null, previous: PlaceRow | null): PlaceRow[] {
  const currentId = current ? current.id : null;
  const kept = new Map<number, PlaceRow>();
  let swapped = false;
  for (const option of options) {
    if (!option) continue;
    if (option.id === currentId) swapped = true;
    else if (!kept.has(option.id)) kept.set(option.id, option);
  }
  const result: PlaceRow[] = [];
  if (swapped && previous && previous.id !== currentId && !kept.has(previous.id)) result.push(previous);
  result.push(...kept.values());
  return result.length > MAX_ALTERNATIVES_PER_ITEM ? result.slice(0, MAX_ALTERNATIVES_PER_ITEM) : result;
}

/** Tên + lời dặn từng ngày khách gửi (thay toàn bộ): Ngày 1..61, ngày trống cả hai thì bỏ, trùng ngày lấy dòng sau. */
function dayRows(input: Array<DayInput | null>): DayRow[] {
  if (input.length > MAX_TRIP_DAYS + 1) throw badRequest(`Lịch trình tối đa ${MAX_TRIP_DAYS + 1} ngày.`);
  const byIndex = new Map<number, DayRow>();
  for (const day of input) {
    if (!day || day.dayIndex == null || day.dayIndex < 1 || day.dayIndex > MAX_TRIP_DAYS + 1) throw badRequest('Ngày của lịch trình không hợp lệ.');
    const title = trimToNull(day.title);
    const note = trimToNull(day.note);
    if (title != null && title.length > MAX_ITEM_TITLE_LENGTH) throw badRequest(`Tên ngày tối đa ${MAX_ITEM_TITLE_LENGTH} ký tự.`);
    if (note != null && note.length > MAX_NOTE_LENGTH) throw badRequest(`Lời dặn của ngày tối đa ${MAX_NOTE_LENGTH} ký tự.`);
    if (title == null && note == null) byIndex.delete(day.dayIndex);
    else byIndex.set(day.dayIndex, { dayIndex: day.dayIndex, title, note });
  }
  return [...byIndex.values()].sort((a, b) => a.dayIndex - b.dayIndex);
}

function copiedDays(days: DayRow[]): DayRow[] {
  return days
    .filter((d) => d.dayIndex != null)
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((d) => ({ dayIndex: d.dayIndex, title: d.title, note: d.note }));
}

/** Mã dịch vụ hợp lệ của một mục, cách nhau dấu phẩy (mã không còn cung cấp thì bỏ qua — không chặn khách lưu). */
export function addonCodes(requested: string[] | null | undefined, active: Set<string>): string | null {
  if (!requested || requested.length === 0) return null;
  const codes = new Set<string>();
  for (const raw of requested) {
    if (!raw || !raw.trim()) continue;
    const code = raw.trim().toUpperCase();
    if (active.has(code)) codes.add(code);
  }
  if (codes.size > MAX_ADDONS_PER_ITEM) throw badRequest(`Mỗi mục tối đa ${MAX_ADDONS_PER_ITEM} dịch vụ.`);
  return codes.size === 0 ? null : [...codes].join(',');
}

/** Gói gốc của lịch trình: lịch trình gợi ý theo templateId (ưu tiên) hoặc theo mã gói. */
async function templateOf(input: JourneyInput): Promise<JourneyAgg | null> {
  if (input.templateId != null) {
    const byId = await journeys.findSuggestedById(input.templateId);
    if (byId) return byId;
  }
  const code = trimToNull(input.templateCode);
  return code == null || code.length > 64 ? null : await journeys.findSuggestedByCode(code);
}

/**
 * Format 2 — nguồn gợi ý, món và điểm đổi được của một mục (gọi sau khi đã ghi địa điểm, Ngày N, giờ của mục).
 *
 * Mục mới nối về mục của gói theo sourceStopId — chỉ nhận mục thuộc gói của lịch trình, id khác coi như mục khách thêm;
 * không gửi sourceStopId thì nối theo Ngày N + giờ bắt đầu. Nối được thì origin = SUGGESTED, không thì CUSTOM. Mục đã lưu giữ
 * nguồn. dishIds / alternativePlaceIds: null = giữ (mục đã lưu) hoặc chép theo mục gốc (mục mới), [] = xóa, danh sách = thay.
 */
function applySuggestion(
  row: StopAgg,
  created: boolean,
  previousPlace: PlaceRow | null,
  stop: StopInput,
  templateStops: Map<number, StopAgg>,
  templateSlots: Map<string, StopAgg>,
  dishById: Map<number, DishRow>,
  placeById: Map<number, PlaceRow>,
): void {
  let source: StopAgg | undefined = stop.sourceStopId == null ? undefined : templateStops.get(stop.sourceStopId);
  if (created) {
    if (stop.sourceStopId == null && row.dayIndex != null && row.startTime != null) {
      source = templateSlots.get(slotKey(row.dayIndex, row.startTime));
    }
    row.origin = source ? 'SUGGESTED' : 'CUSTOM';
    row.sourceStopId = source ? source.id : null;
  } else if (source) {
    row.origin = 'SUGGESTED';
    row.sourceStopId = source.id;
  } else if (row.sourceStopId != null && !templateStops.has(row.sourceStopId)) {
    row.sourceStopId = null;
  }

  if (stop.dishIds != null) {
    const current = new Set(ids(row.dishes));
    row.dishes = wanted(stop.dishIds, MAX_DISHES_PER_ITEM, 'món')
      .map((id) => dishById.get(id))
      .filter((d): d is DishRow => !!d && (d.visibility === 'PUBLISHED' || current.has(d.id)));
  } else if (created && source) {
    row.dishes = publishedDishes(source.dishes);
  }

  let alternatives: PlaceRow[];
  if (stop.alternativePlaceIds != null) {
    const current = new Set(ids(row.alternatives));
    alternatives = wanted(stop.alternativePlaceIds, MAX_ALTERNATIVES_PER_ITEM, 'điểm đổi được')
      .map((id) => placeById.get(id))
      .filter((p): p is PlaceRow => !!p && (isOpenAttraction(p) || (current.has(p.id) && !p.isDeleted)));
  } else if (created) {
    alternatives = source ? optionsOf(source) : [];
  } else {
    alternatives = row.alternatives;
  }
  row.alternatives = alternativesWithout(alternatives, row.place, previousPlace);
}

/**
 * Kiểm tra rồi ghi đè thông tin + các mục của lịch trình theo dữ liệu khách gửi. Mục đã có được giữ nguyên bản ghi (theo id
 * khách gửi, hoặc cùng địa điểm với điểm tham quan) — id trong link thông báo vẫn đúng; đổi ngày / buổi / giờ thì nhắc giờ lại.
 *
 * Client cũ (không gửi format) chỉ biết điểm tham quan theo ngày + buổi: chỉ áp phần điểm tham quan, giữ nguyên các mục khác
 * và tỉnh / số người / gói của lịch trình. Format 2 lên từ gói: lịch trình nhớ gói gốc (template_id); mục mới nối về mục của
 * gói; đổi sang gói khác (hoặc lịch trình mới) thì chép tên từng ngày (khi không gửi days) và tag của gói.
 */
async function apply(journey: JourneyAgg, input: JourneyInput | null): Promise<void> {
  if (!input) throw badRequest('Thiếu dữ liệu lịch trình.');
  const full = fullItems(input);
  const stops = input.stops ?? [];
  if (stops.length > MAX_ITEMS) throw badRequest(`Lịch trình tối đa ${MAX_ITEMS} mục.`);
  if (stops.filter((s) => s != null && kindOf(s) === 'PLACE').length > MAX_STOPS) throw badRequest(`Lịch trình tối đa ${MAX_STOPS} điểm đến.`);
  const title = input.title == null ? null : input.title.trim();
  if (title != null && title.length > MAX_TITLE_LENGTH) throw badRequest(`Tên lịch trình tối đa ${MAX_TITLE_LENGTH} ký tự.`);
  if (input.startDate && input.endDate) {
    if (input.endDate < input.startDate) throw badRequest('Ngày về phải sau ngày đi.');
    if (daysBetween(input.startDate, input.endDate) > MAX_TRIP_DAYS) throw badRequest(`Chuyến đi tối đa ${MAX_TRIP_DAYS} ngày.`);
  }
  if (input.basePlaceId != null && !(await placeExists(input.basePlaceId))) throw badRequest('Không tìm thấy chỗ nghỉ của lịch trình.');
  if (full) {
    if (input.guestCount != null && (input.guestCount < 1 || input.guestCount > MAX_GUESTS)) throw badRequest(`Số người đi từ 1 đến ${MAX_GUESTS}.`);
    if (input.regionId != null && !(await places.findRegionById(input.regionId))) throw badRequest('Không tìm thấy tỉnh / thành của lịch trình.');
    if (input.preferences != null && JSON.stringify(input.preferences).length > MAX_PREFERENCES_LENGTH) throw badRequest('Tiêu chí lịch trình quá dài.');
  }
  const needAddons = full && stops.some((s) => s != null && s.addons != null && s.addons.length > 0);
  const activeAddons = needAddons
    ? new Set((await query<{ code: string }>('SELECT code FROM trip_addon WHERE is_active = TRUE ORDER BY sort_order, id')).map((a) => a.code))
    : new Set<string>();
  const days = full && input.days != null ? dayRows(input.days) : null;

  // Gói gốc (lịch trình gợi ý) và các mục của gói — theo id và theo Ngày N + giờ bắt đầu.
  const template = full ? await templateOf(input) : null;
  const templateStops = new Map<number, StopAgg>();
  const templateSlots = new Map<string, StopAgg>();
  if (template) {
    for (const item of [...template.stops].sort(CHRONOLOGICAL)) {
      templateStops.set(item.id, item);
      if (item.dayIndex != null && item.startTime != null) {
        const key = slotKey(item.dayIndex, item.startTime);
        if (!templateSlots.has(key)) templateSlots.set(key, item);
      }
    }
  }
  const requestedDishes = full ? await loadRequestedDishes(stops) : new Map<number, DishRow>();

  // Điểm đã có trong lịch trình được giữ kể cả khi địa điểm vừa tạm ẩn — khách sửa điểm khác không bị chặn.
  const alreadyIn = new Set<number>();
  const existingById = new Map<number, StopAgg>();
  const existingSights = new Map<number, StopAgg[]>();
  for (const stop of journey.stops) {
    if (stop.id) existingById.set(stop.id, stop);
    if (stop.place) alreadyIn.add(stop.place.id);
    if (isSight(stop)) {
      const queue = existingSights.get(stop.place!.id) ?? [];
      queue.push(stop);
      existingSights.set(stop.place!.id, queue);
    }
  }
  // Địa điểm của các mục + điểm đổi được khách gửi (format 2), nạp một lần.
  const alternativeIds = full
    ? stops.flatMap((s) => (s != null && s.alternativePlaceIds != null ? wanted(s.alternativePlaceIds, MAX_ALTERNATIVES_PER_ITEM, 'điểm đổi được') : []))
    : [];
  const destinationIds = distinct([...stops.map((s) => s?.placeId), ...alternativeIds].filter((x): x is number => x != null));
  const destinations = new Map((await places.findAllByIds(destinationIds)).map((p) => [p.id, p]));

  const used = new Set<StopAgg>();
  const newStops: StopAgg[] = [];
  for (const stop of stops) {
    if (!stop) throw badRequest('Mỗi điểm đến cần có địa điểm và buổi tham quan.');
    const kind = kindOf(stop);
    const start = full ? (stop.startTime ?? null) : null;
    const end = full ? (stop.endTime ?? null) : null;
    const session: DaySession | null = stop.session ?? (start != null ? daySessionOfTime(start) : null);
    if ((kind === 'PLACE' && stop.placeId == null) || session == null) throw badRequest('Mỗi điểm đến cần có địa điểm và buổi tham quan.');
    const place = stop.placeId == null ? null : (destinations.get(stop.placeId) ?? null);
    if (stop.placeId != null) {
      const keep = place != null && alreadyIn.has(place.id) && !place.isDeleted;
      if (!keep && !isOpenAttraction(place)) throw badRequest('Điểm đến không còn mở cho khách tham quan.');
    }
    const itemTitle = full ? trimToNull(stop.title) : null;
    const note = full ? trimToNull(stop.note) : null;
    if (full) {
      if (itemTitle != null && itemTitle.length > MAX_ITEM_TITLE_LENGTH) throw badRequest(`Tên mục tối đa ${MAX_ITEM_TITLE_LENGTH} ký tự.`);
      if (place == null && itemTitle == null) throw badRequest('Mỗi mục của lịch trình cần có tên.');
      if (note != null && note.length > MAX_NOTE_LENGTH) throw badRequest(`Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự.`);
      if (start != null && end != null && end < start) throw badRequest('Giờ kết thúc phải sau giờ bắt đầu.');
    }
    let dayIndex: number | null = full ? (stop.dayIndex ?? null) : null;
    if (dayIndex != null && (dayIndex < 1 || dayIndex > MAX_TRIP_DAYS + 1)) throw badRequest('Ngày của mục không hợp lệ.');
    let visitDate: string | null = stop.visitDate ?? null;
    if (input.startDate) {
      if (visitDate == null && dayIndex != null) {
        visitDate = addDays(input.startDate, dayIndex - 1);
      } else if (visitDate != null) {
        const offset = daysBetween(input.startDate, visitDate);
        if (offset >= 0 && offset <= MAX_TRIP_DAYS) dayIndex = offset + 1;
      }
    }

    let row: StopAgg | null = null;
    if (full && stop.id != null) {
      const candidate = existingById.get(stop.id);
      if (candidate && !used.has(candidate)) {
        used.add(candidate);
        row = candidate;
      }
    }
    if (!row && place && kind === 'PLACE') {
      const reusable = existingSights.get(place.id);
      while (!row && reusable && reusable.length > 0) {
        const candidate = reusable.shift()!;
        if (!used.has(candidate)) {
          used.add(candidate);
          row = candidate;
        }
      }
    }
    const created = row == null;
    if (!row) {
      row = newStop();
      row.journeyId = journey.id;
      used.add(row);
    } else if (row.visitDate !== visitDate || row.daySession !== session || (full && row.startTime !== start)) {
      row.reminderSentAt = null;
    }
    const previousPlace = row.place;
    row.place = place;
    row.kind = kind;
    row.visitDate = visitDate;
    row.daySession = session;
    if (full) {
      row.title = itemTitle;
      row.note = note;
      row.startTime = start;
      row.endTime = end;
      row.addons = addonCodes(stop.addons, activeAddons);
      row.dayIndex = dayIndex;
      applySuggestion(row, created, previousPlace, stop, templateStops, templateSlots, requestedDishes, destinations);
    } else {
      // Client cũ đổi buổi: giờ riêng của mục không còn khớp buổi mới thì bỏ (mục chạy theo giờ của buổi).
      if (row.startTime != null && daySessionOfTime(row.startTime) !== session) {
        row.startTime = null;
        row.endTime = null;
      }
      if (dayIndex != null) row.dayIndex = dayIndex;
    }
    row.sortOrder = newStops.length;
    newStops.push(row);
  }
  if (!full) {
    for (const stop of journey.stops) {
      if (!isSight(stop) && !used.has(stop)) {
        stop.sortOrder = newStops.length;
        newStops.push(stop);
      }
    }
  }

  journey.basePlaceId = input.basePlaceId ?? null;
  journey.title = title == null || title === '' ? null : title;
  journey.startDate = input.startDate ?? null;
  journey.endDate = input.endDate ?? null;
  if (full) {
    journey.regionId = input.regionId ?? null;
    journey.guestCount = input.guestCount ?? null;
    const templateId = template ? template.id : null;
    const templateChanged = journey.templateId !== templateId;
    journey.templateId = templateId;
    const templateCode = template ? template.templateCode : trimToNull(input.templateCode);
    journey.templateCode = templateCode != null && templateCode.length > 64 ? templateCode.slice(0, 64) : templateCode;
    journey.preferences = input.preferences == null || Object.keys(input.preferences).length === 0 ? null : input.preferences;
    if (days != null) journey.days = days;
    else if (templateChanged && template) journey.days = copiedDays(template.days);
    if (templateChanged) journey.tags = template ? [...template.tags] : [];
  }
  journey.stops = newStops;
}

/** Món khách gửi kèm các mục — một câu cho cả lịch trình. */
async function loadRequestedDishes(stops: Array<StopInput | null>): Promise<Map<number, DishRow>> {
  const dishIds = distinct(stops.flatMap((s) => (s != null && s.dishIds != null ? wanted(s.dishIds, MAX_DISHES_PER_ITEM, 'món') : [])));
  if (dishIds.length === 0) return new Map();
  const rows = await query<DishRow>('SELECT d.* FROM dish d WHERE d.id = ANY($1)', [dishIds]);
  return new Map(rows.map((d) => [d.id, d]));
}
