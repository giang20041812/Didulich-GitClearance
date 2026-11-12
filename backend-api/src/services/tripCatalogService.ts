import { query } from '../db/pool.js';
import { parseDaySessions } from '../domain/enums.js';
import { groupedValues } from '../lib/collections.js';
import { localTimeHm } from '../lib/time.js';
import { normalize } from '../lib/vietnamese.js';
import * as catalog from '../repositories/catalogRepo.js';
import type { DishRow } from '../repositories/catalogRepo.js';
import * as journeys from '../repositories/journeyRepo.js';
import type { JourneyAgg, StopAgg, TagRow } from '../repositories/journeyRepo.js';
import * as places from '../repositories/placeRepo.js';
import type { RegionRow } from '../repositories/placeRepo.js';
import * as extrasSvc from './placeExtras.js';
import { CHRONOLOGICAL, addonList, itemName, summary } from './journeyService.js';

/**
 * Danh mục lên lịch trình của một tỉnh cho trang /lich-trinh: gói mẫu kèm tag lọc (thời lượng, mốc giá, ăn uống, mục tiêu),
 * dịch vụ thêm, mọi điểm tham quan công khai của tỉnh (bản đồ thêm điểm) và món đặc sản (ảnh trong mục ăn uống). Dữ liệu như
 * nhau với mọi người nên route đọc qua cache.
 *
 * Gói là lịch trình gợi ý (journey, source SUGGESTED), trả về đúng dạng content cũ của bảng trip_template. Gói chưa chép sang
 * lịch trình gợi ý thì đọc thẳng từ trip_template như phase 1.
 */

export const DINING_GROUP = 'TRIP_DINING';
export const GOAL_GROUP = 'TRIP_GOAL';
const TAG_GROUPS = new Set([DINING_GROUP, GOAL_GROUP]);
/** Khóa "thông tin gói" (journey.package_info) chép nguyên vào content. */
const PACKAGE_KEYS = ['included', 'addons', 'highlights'];

interface TagView {
  slug: string;
  group: string;
  name: string;
}

interface TemplateRow {
  id: number;
  code: string;
  regionId: number;
  title: string;
  summary: string | null;
  days: number;
  nights: number;
  priceFrom: number | null;
  content: Record<string, unknown>;
  visibility: string;
  sortOrder: number;
}

/** Tỉnh có tên khớp (không phân biệt dấu, hoa / thường); không khớp thì null. */
export function pickProvince(provinces: RegionRow[], wanted: string | null | undefined): RegionRow | null {
  const key = normalize(wanted);
  if (!key) return null;
  return provinces.find((p) => normalize(p.name) === key) ?? null;
}

/** Tag lọc của gói (đang dùng, nhóm ăn uống / mục tiêu) theo thứ tự tạo; ghi thêm vào danh sách tag của trang. */
function ownTags(all: readonly TagRow[], seen: Map<string, TagView>): string[] {
  const own = all.filter((t) => t.isActive !== false && TAG_GROUPS.has(t.groupCode)).sort((a, b) => a.id - b.id);
  for (const tag of own) if (!seen.has(tag.slug)) seen.set(tag.slug, { slug: tag.slug, group: tag.groupCode, name: tag.name });
  return own.map((t) => t.slug);
}

function dayCountOf(suggested: JourneyAgg): number {
  if (suggested.dayCount != null) return suggested.dayCount;
  const max = suggested.stops.map((s) => s.dayIndex).filter((d): d is number => d != null);
  return max.length ? Math.max(...max) : 1;
}

function item(stop: StopAgg): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.id = stop.id;
  if (stop.dayIndex != null) out.day = stop.dayIndex;
  if (stop.startTime != null) out.start = localTimeHm(stop.startTime);
  if (stop.endTime != null) out.end = localTimeHm(stop.endTime);
  out.kind = stop.kind ?? 'PLACE';
  out.title = itemName(stop);
  if (stop.note && stop.note.trim()) out.note = stop.note;
  const place = stop.place;
  if (place) {
    out.place = place.slug;
    out.placeId = place.id;
  }
  const stopDishes = stop.dishes.filter(Boolean);
  if (stopDishes.length > 0) {
    out.dishes = stopDishes.map((d) => d.slug);
    out.dishIds = stopDishes.map((d) => d.id);
  }
  const codes = addonList(stop.addons);
  if (codes.length > 0) out.addons = codes;
  const alternatives = stop.alternatives.filter(Boolean);
  if (alternatives.length > 0) {
    out.alternatives = alternatives.map((p) => p.slug);
    out.alternativePlaceIds = alternatives.map((p) => p.id);
  }
  return out;
}

/**
 * content của gói dựng từ lịch trình gợi ý — cùng dạng JSON với trip_template.content (dayTitles, dayNotes, included, addons,
 * highlights, items) để client cũ đọc như trước. Mỗi mục giữ các khóa cũ và thêm id (gửi lại làm sourceStopId), placeId,
 * dishIds, alternativePlaceIds.
 */
export function content(suggested: JourneyAgg): Record<string, unknown> {
  const days = dayCountOf(suggested);
  const dayTitles: Array<string | null> = Array.from({ length: days }, () => null);
  const dayNotes: Array<string | null> = Array.from({ length: days }, () => null);
  for (const day of suggested.days) {
    if (day.dayIndex == null || day.dayIndex < 1 || day.dayIndex > days) continue;
    dayTitles[day.dayIndex - 1] = day.title;
    dayNotes[day.dayIndex - 1] = day.note;
  }
  const out: Record<string, unknown> = { dayTitles, dayNotes };
  const info = suggested.packageInfo ?? {};
  for (const key of PACKAGE_KEYS) if (info[key] != null) out[key] = info[key];
  out.items = [...suggested.stops].sort(CHRONOLOGICAL).map(item);
  return out;
}

/** Dịch vụ theo điểm của một gói còn đọc từ trip_template (items[].place + items[].addons). */
function collectAddons(contentJson: Record<string, unknown> | null, addonsByPlace: Map<string, Set<string>>): void {
  const items = contentJson?.items;
  if (!Array.isArray(items)) return;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    if (typeof it.place !== 'string' || !Array.isArray(it.addons)) continue;
    for (const code of it.addons) {
      if (typeof code === 'string') {
        const set = addonsByPlace.get(it.place) ?? new Set<string>();
        set.add(code);
        addonsByPlace.set(it.place, set);
      }
    }
  }
}

const first = <T>(list: T[] | undefined): T | null => (list && list.length > 0 ? list[0] : null);

function belongsTo(dish: DishRow, province: RegionRow): boolean {
  const path = dish.regionPath;
  const root = province.name;
  return dish.regionId === province.id || (path != null && (path === root || path.startsWith(`${root}/`)));
}

/**
 * `province`: tên tỉnh khách chọn ở SearchHub (không phân biệt dấu). Không có / không khớp thì lấy tỉnh đầu tiên có gói công
 * khai (không tỉnh nào có gói thì tỉnh đầu tiên).
 */
export async function catalogFor(province: string | null | undefined) {
  const active = await places.findActiveRegions();
  const provinces = active.filter((r) => r.level === 1).sort((a, b) => a.id - b.id);
  let region = pickProvince(provinces, province);
  if (!region) {
    const withTemplates = new Set(await journeys.findRegionIdsWithSuggested());
    for (const r of await query<{ regionId: number }>(`SELECT DISTINCT region_id FROM trip_template WHERE visibility = 'PUBLISHED'`)) {
      withTemplates.add(r.regionId);
    }
    region = pickProvince(provinces, 'Lào Cai') ?? provinces.find((p) => withTemplates.has(p.id)) ?? (provinces.length ? provinces[0] : null);
  }
  if (!region) return { region: null, templates: [], tags: [], addons: [], places: [], dishes: [] };
  const chosen = region;

  const areas = active
    .filter((r) => r.level === 2 && r.parentId != null && r.parentId === chosen.id)
    .sort((a, b) => a.id - b.id)
    .map((r) => r.name);

  const tags = new Map<string, TagView>();
  // Slug điểm → mã dịch vụ các gói dùng ở điểm đó (chọn sẵn dịch vụ khi khách thêm mục ở điểm này).
  const addonsByPlace = new Map<string, Set<string>>();
  const templateViews: Array<Record<string, unknown>> = [];
  for (const suggested of await journeys.findSuggestedPublishedByRegion(chosen.id)) {
    templateViews.push({
      code: suggested.templateCode,
      title: suggested.title,
      summary: suggested.summary,
      days: dayCountOf(suggested),
      nights: suggested.nights == null ? 0 : suggested.nights,
      priceFrom: suggested.priceFrom,
      tags: ownTags(suggested.tags, tags),
      content: content(suggested),
      id: suggested.id,
    });
    for (const stop of suggested.stops) {
      if (stop.place) {
        const set = addonsByPlace.get(stop.place.slug) ?? new Set<string>();
        for (const code of addonList(stop.addons)) set.add(code);
        addonsByPlace.set(stop.place.slug, set);
      }
    }
  }
  const converted = new Set(await journeys.findSuggestedCodes());
  const legacy = await query<TemplateRow>(
    `SELECT * FROM trip_template WHERE region_id = $1 AND visibility = 'PUBLISHED' ORDER BY sort_order ASC, id ASC`,
    [chosen.id],
  );
  for (const t of legacy) {
    if (converted.has(t.code)) continue;
    const legacyTags = await query<TagRow>(
      'SELECT t.* FROM trip_template_tag tt JOIN tag t ON t.id = tt.tag_id WHERE tt.template_id = $1 ORDER BY t.id',
      [t.id],
    );
    templateViews.push({
      code: t.code,
      title: t.title,
      summary: t.summary,
      days: t.days,
      nights: t.nights,
      priceFrom: t.priceFrom,
      tags: ownTags(legacyTags, tags),
      content: t.content,
      id: null,
    });
    collectAddons(t.content, addonsByPlace);
  }

  const addons = (await query<{ code: string; name: string; description: string | null; note: string | null }>(
    'SELECT code, name, description, note FROM trip_addon WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC',
  )).map((a) => ({ code: a.code, name: a.name, description: a.description, note: a.note }));

  return {
    region: { id: chosen.id, name: chosen.name, areas },
    templates: templateViews,
    tags: [...tags.values()].sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : 0)),
    addons,
    places: await placesOf(chosen, addons.map((a) => a.code), addonsByPlace),
    dishes: await dishesOf(chosen),
  };
}

/**
 * Điểm tham quan công khai của tỉnh: ảnh bìa, buổi nên đi, loại cảnh quan và dịch vụ các gói dùng ở điểm (theo thứ tự danh
 * sách dịch vụ, chỉ dịch vụ đang cung cấp).
 */
async function placesOf(province: RegionRow, addonOrder: string[], addonsByPlace: Map<string, Set<string>>) {
  const attractions = await places.findPublicPlacesInProvince(province.id, 'ATTRACTION');
  if (attractions.length === 0) return [];
  const ids = attractions.map((p) => p.id);
  const media = groupedValues(await places.publicUrlsByPlaceIds(ids));
  const extras = await extrasSvc.loadExtras(ids);
  return attractions.map((p) => {
    const extra = extras.get(p.id);
    const used = addonsByPlace.get(p.slug) ?? new Set<string>();
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      regionName: p.regionName,
      coverImageUrl: first(media.get(p.id)),
      description: summary(p.description),
      latitude: p.latitude,
      longitude: p.longitude,
      suitableSessions: parseDaySessions(extrasSvc.suitableSessions(extra)),
      scenicType: extra ? extra.scenicType : null,
      suggestedAddons: addonOrder.filter((c) => used.has(c)),
    };
  });
}

/** Món công khai thuộc tỉnh (khu vực của món là tỉnh hoặc vùng con của tỉnh — so theo đường dẫn khu vực). */
async function dishesOf(province: RegionRow) {
  const inProvince = (await catalog.publishedDishes()).filter((d) => d.regionId == null || belongsTo(d, province));
  if (inProvince.length === 0) return [];
  const media = groupedValues(await catalog.dishImageUrls(inProvince.map((d) => d.id)));
  return inProvince.map((d) => ({ id: d.id, slug: d.slug, name: d.name, coverImageUrl: first(media.get(d.id)) }));
}
