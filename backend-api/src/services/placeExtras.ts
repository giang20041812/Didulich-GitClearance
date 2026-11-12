import { SERVICE_GROUP_INFO, parseDaySessions, type DaySession } from '../domain/enums.js';
import { today } from '../lib/time.js';
import * as places from '../repositories/placeRepo.js';
import type { AttractionProfileRow, PlaceRow, PlaceServiceProfileRow } from '../repositories/placeRepo.js';

/**
 * Thông tin bổ sung của địa điểm nằm ngoài bảng place — hồ sơ điểm tham quan (nhu cầu, buổi, mùa đẹp, thời gian tham
 * quan), nhãn loại cảnh quan và thông tin dịch vụ nhà xe / trải nghiệm — nạp theo lô cho danh sách / chi tiết, và bản đồ
 * `attributes` trả cho giao diện.
 */

/** Nhóm nhãn "loại cảnh quan" của điểm tham quan. */
export const SCENIC_TAG_GROUP = 'SCENIC';

const LANGUAGE_LABELS: Record<string, string> = {
  VI: 'Tiếng Việt',
  EN: 'Tiếng Anh',
  HMONG: "Tiếng H'Mông",
  THAI: 'Tiếng Thái',
  OTHER: 'Ngôn ngữ khác',
};

export interface Extras {
  attraction: AttractionProfileRow | null;
  scenicType: string | null;
  service: PlaceServiceProfileRow | null;
}

export const NO_EXTRAS: Extras = { attraction: null, scenicType: null, service: null };

export async function loadExtras(placeIds: readonly number[]): Promise<Map<number, Extras>> {
  const result = new Map<number, Extras>();
  if (placeIds.length === 0) return result;
  const [profiles, tags, services] = await Promise.all([
    places.attractionProfiles(placeIds),
    places.tagNames(placeIds, SCENIC_TAG_GROUP),
    places.serviceProfiles(placeIds),
  ]);
  const profileBy = new Map(profiles.map((p) => [p.placeId, p]));
  const scenic = new Map<number, string>();
  for (const row of tags) if (!scenic.has(row.id)) scenic.set(row.id, row.value);
  const serviceBy = new Map(services.map((s) => [s.placeId, s]));
  for (const id of placeIds) {
    result.set(id, { attraction: profileBy.get(id) ?? null, scenicType: scenic.get(id) ?? null, service: serviceBy.get(id) ?? null });
  }
  return result;
}

export async function loadExtrasOf(placeId: number): Promise<Extras> {
  return (await loadExtras([placeId])).get(placeId) ?? NO_EXTRAS;
}

const notBlank = (v: string | null | undefined): v is string => v != null && v.trim() !== '';

/** "VI,EN" → ["Tiếng Việt", "Tiếng Anh"]; mã lạ bị bỏ qua. */
export function languageLabels(codes: string | null | undefined): string[] {
  if (!codes || !codes.trim()) return [];
  const out = codes
    .split(',')
    .map((c) => c.trim())
    .map((c) => LANGUAGE_LABELS[c])
    .filter((l): l is string => l != null);
  return [...new Set(out)];
}

/** Mỗi dòng một mục, bỏ dòng trống và gạch đầu dòng người nhập tự gõ ("- ", "• "). */
export function lines(text: string | null | undefined): string[] {
  if (!text || !text.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-•*+]\s*/, '').trim())
    .filter((l) => l !== '');
}

/** Số phút → "45 phút", "2 giờ", "2 giờ 30 phút", "2 ngày", "1 ngày 4 giờ"; null nếu không có. */
export function minutesText(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} phút`;
  if (minutes >= 24 * 60) {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    return hours === 0 ? `${days} ngày` : `${days} ngày ${hours} giờ`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`;
}

/**
 * Bản đồ thuộc tính trả cho giao diện: nhãn thẻ (tagBadge), loại cảnh quan (scenicType) và — với dịch vụ nhà xe / trải
 * nghiệm — nhóm dịch vụ, loại xe, tuyến, giờ chạy, thời lượng, số chỗ, số khách mỗi đoàn, ngôn ngữ, mục đã bao gồm, đơn vị
 * giá. Trường chưa khai báo thì không có trong bản đồ.
 */
export function attributes(place: Pick<PlaceRow, 'badge' | 'priceUnitNote'>, extras: Extras | undefined): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (notBlank(place.badge)) attrs.tagBadge = place.badge;
  if (extras?.scenicType != null) attrs.scenicType = extras.scenicType;
  const service = extras?.service;
  if (service && service.serviceGroup) {
    attrs.categoryGroup = service.serviceGroup;
    attrs.categoryGroupName = SERVICE_GROUP_INFO[service.serviceGroup].label;
    const putText = (key: string, value: string | null) => {
      if (notBlank(value)) attrs[key] = value.trim();
    };
    putText('vehicleType', service.vehicleType);
    putText('routeFrom', service.routeFrom);
    putText('routeTo', service.routeTo);
    if (notBlank(service.routeFrom) && notBlank(service.routeTo)) attrs.routeSchedule = `${service.routeFrom.trim()} → ${service.routeTo.trim()}`;
    putText('departureTimes', service.departureTimes);
    const duration = minutesText(service.durationMinutes);
    if (duration != null) attrs.duration = duration;
    if (service.seats != null) attrs.seats = service.seats;
    if (service.groupSizeMax != null) attrs.groupSizeMax = service.groupSizeMax;
    const languages = languageLabels(service.languages);
    if (languages.length > 0) attrs.languages = languages;
    const includes = lines(service.includes);
    if (includes.length > 0) attrs.includes = includes;
    putText('priceDetails', place.priceUnitNote);
  }
  return attrs;
}

export const needs = (extras: Extras | undefined): string | null => extras?.attraction?.needs ?? null;
export const suitableSessions = (extras: Extras | undefined): string | null => extras?.attraction?.suitableSessions ?? null;
export const sessionsOf = (extras: Extras | undefined): DaySession[] => parseDaySessions(suitableSessions(extras));

/** MMDD → "YYYY-MM-DD" của năm cho trước (29/2 lùi về 28/2 ở năm không nhuận). */
export function atYear(mmdd: number, year: number): string {
  const month = Math.floor(mmdd / 100);
  let day = mmdd % 100;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > lastDay) day = lastDay;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const hasSeason = (a: AttractionProfileRow | null | undefined): a is AttractionProfileRow =>
  !!a && a.seasonStartMd != null && a.seasonEndMd != null;

/** Ngày kết thúc mùa đẹp gần nhất chưa qua tính từ todayDate (null nếu không có mùa). */
export function seasonEndOf(a: AttractionProfileRow | null | undefined, todayDate: string = today()): string | null {
  if (!hasSeason(a)) return null;
  const year = Number(todayDate.slice(0, 4));
  const end = atYear(a.seasonEndMd as number, year);
  return end < todayDate ? atYear(a.seasonEndMd as number, year + 1) : end;
}

/** Ngày bắt đầu mùa đẹp gần nhất chưa kết thúc tính từ todayDate (null nếu không có mùa). */
export function seasonStartOf(a: AttractionProfileRow | null | undefined, todayDate: string = today()): string | null {
  if (!hasSeason(a)) return null;
  const end = seasonEndOf(a, todayDate) as string;
  const start = atYear(a.seasonStartMd as number, Number(end.slice(0, 4)));
  return start > end ? atYear(a.seasonStartMd as number, Number(end.slice(0, 4)) - 1) : start;
}

export const seasonStart = (extras: Extras | undefined): string | null => seasonStartOf(extras?.attraction);
export const seasonEnd = (extras: Extras | undefined): string | null => seasonEndOf(extras?.attraction);

/**
 * "45 phút", "2 giờ", "2 giờ 30 phút" — thời gian tham quan gợi ý của điểm tham quan, hoặc thời lượng của dịch vụ nhà
 * xe / trải nghiệm; null nếu chưa có.
 */
export function durationText(extras: Extras | undefined): string | null {
  if (!extras) return null;
  if (extras.attraction?.visitMinutes != null) return minutesText(extras.attraction.visitMinutes);
  return extras.service ? minutesText(extras.service.durationMinutes) : null;
}

