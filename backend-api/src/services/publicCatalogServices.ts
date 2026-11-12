import { groupedValues } from '../lib/collections.js';
import { HttpError } from '../lib/errors.js';
import { today } from '../lib/time.js';
import * as catalog from '../repositories/catalogRepo.js';
import type { DishRow } from '../repositories/catalogRepo.js';
import * as places from '../repositories/placeRepo.js';
import * as publicPlaces from './publicPlaceService.js';

// ---- Món ăn đặc sản (trang "Đặc sản", trang chủ) -----------------------------------------------------------------

/** `kind` của DTO món ăn luôn là "DISH" (giao diện dùng chung thẻ với địa điểm). */
export const DISH_KIND = 'DISH';

const first = <T>(list: T[] | undefined): T | null => (list && list.length > 0 ? list[0] : null);

function dishSummary(d: DishRow, cover: string | null) {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    kind: DISH_KIND,
    regionName: d.regionName,
    coverImageUrl: cover,
    priceRefMin: d.priceMin,
    priceRefMax: d.priceMax,
    priceUnitNote: d.priceUnit,
    tagBadge: d.badge,
    tiktokUrl: d.videoUrl,
  };
}

/** Món đang công khai theo thứ tự hiển thị; limit <= 0 = tất cả. */
export async function listDishes(limit: number) {
  let published = await catalog.publishedDishes();
  if (limit > 0 && published.length > limit) published = published.slice(0, limit);
  if (published.length === 0) return [];
  const media = groupedValues(await catalog.dishImageUrls(published.map((d) => d.id)));
  return published.map((d) => dishSummary(d, first(media.get(d.id))));
}

/** Chi tiết theo slug hoặc id (đường dẫn cũ /specialties/{id}); món chưa công khai thì 404. */
export async function dishDetail(identifier: string) {
  const value = (identifier ?? '').trim();
  let dish: DishRow | null = null;
  if (value) dish = /^\d{1,18}$/.test(value) ? await catalog.dishById(Number(value)) : await catalog.dishBySlug(value);
  if (!dish || dish.visibility !== 'PUBLISHED') throw new HttpError(404, 'Không tìm thấy món ăn.');

  const mediaRows = (await catalog.dishMediaWithAsset(dish.id)).filter((m) => m.publicUrl != null);
  const media = mediaRows.map((m) => ({ id: m.mediaId, publicUrl: m.publicUrl as string, role: m.role, caption: m.caption, sortOrder: m.sortOrder }));
  const images = media.map((m) => m.publicUrl);
  const highlights = (await catalog.dishHighlights(dish.id)).map((h) => ({ id: h.id, type: h.type, content: h.content }));
  const servedAt = (await catalog.placesServingDish(dish.id)).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    kind: p.kind,
    address: p.address,
    signature: p.isSignature === true,
  }));
  return {
    id: dish.id,
    slug: dish.slug,
    name: dish.name,
    kind: DISH_KIND,
    description: dish.description,
    regionName: dish.regionName,
    coverImageUrl: first(images),
    images,
    media,
    origin: dish.origin,
    whereToEat: dish.whereToEat,
    ingredients: dish.ingredients,
    culturalMeaning: dish.culturalMeaning,
    servingNote: dish.servingNote,
    tagBadge: dish.badge,
    priceRefMin: dish.priceMin,
    priceRefMax: dish.priceMax,
    priceUnitNote: dish.priceUnit,
    videoUrl: dish.videoUrl,
    highlights,
    servedAt,
  };
}

// ---- Lễ hội -------------------------------------------------------------------------------------------------------

function extractActivities(exp: string | null): string[] {
  if (!exp) return [];
  const firstLine = exp.split('\n')[0];
  const list: string[] = [];
  for (const p of firstLine.split(';')) {
    const trimmed = p.trim();
    if (trimmed && trimmed.length <= 35) list.push(trimmed);
  }
  return list;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export interface FestivalDto {
  id: number;
  slug: string;
  name: string;
  seasonNote: string | null;
  coreValue?: string | null;
  suitableExperience?: string | null;
  etiquetteDont?: string | null;
  regionName: string | null;
  coverImageUrl: string | null;
  location: string | null;
  highlightTag: string;
  activities: string[];
  suitableDateStart: string | null;
  suitableDateEnd: string | null;
  isCurrentSeason: boolean;
  nextPeriodStart: string | null;
  nextPeriodEnd: string | null;
  timeRange: string | null;
}

export async function getPublishedFestivals(): Promise<FestivalDto[]> {
  const festivals = await catalog.publishedFestivals();
  const occurrences = await catalog.occurrencesOf(festivals.map((f) => f.id));
  const occBy = new Map<number, typeof occurrences>();
  for (const o of occurrences) {
    const list = occBy.get(o.festivalId) ?? [];
    list.push(o);
    occBy.set(o.festivalId, list);
  }
  const todayDate = today();
  return festivals.map((f) => {
    let isCurrent = false;
    let nextStart: string | null = null;
    let nextEnd: string | null = null;
    for (const occ of occBy.get(f.id) ?? []) {
      if (todayDate >= occ.periodStart && todayDate <= occ.periodEnd) {
        isCurrent = true;
        nextStart = occ.periodStart;
        nextEnd = occ.periodEnd;
        break;
      } else if (occ.periodStart > todayDate) {
        if (nextStart == null || occ.periodStart < nextStart) {
          nextStart = occ.periodStart;
          nextEnd = occ.periodEnd;
        }
      }
    }
    let timeRange: string | null = f.seasonNote;
    if (nextStart != null && nextEnd != null) {
      timeRange = `${pad2(Number(nextStart.slice(8, 10)))}/${pad2(Number(nextStart.slice(5, 7)))} – ${pad2(Number(nextEnd.slice(8, 10)))}/${pad2(Number(nextEnd.slice(5, 7)))}/${Number(nextEnd.slice(0, 4))}`;
    }
    return {
      id: f.id,
      slug: f.slug,
      name: f.name,
      seasonNote: f.seasonNote,
      coreValue: f.coreValue,
      suitableExperience: f.suitableExperience,
      etiquetteDont: f.etiquetteDont,
      regionName: f.regionName,
      coverImageUrl: f.coverImageUrl,
      location: f.location,
      highlightTag: isCurrent ? 'Đang Diễn Ra' : 'Di Sản Văn Hóa',
      activities: extractActivities(f.suitableExperience),
      suitableDateStart: f.suitableDateStart != null ? f.suitableDateStart : nextStart,
      suitableDateEnd: f.suitableDateEnd != null ? f.suitableDateEnd : nextEnd,
      isCurrentSeason: isCurrent,
      nextPeriodStart: nextStart,
      nextPeriodEnd: nextEnd,
      timeRange,
    };
  });
}

/** Thẻ danh sách: bỏ phần mô tả dài (giá trị, trải nghiệm, lưu ý) — null thì không có trong JSON. */
export function festivalListCard(f: FestivalDto): FestivalDto {
  const { coreValue: _c, suitableExperience: _s, etiquetteDont: _e, ...card } = f;
  return card;
}

// ---- Trang chủ ----------------------------------------------------------------------------------------------------

/**
 * Dữ liệu trang chủ trong MỘT request: điểm đến (16), homestay (16), đặc sản (16 món ăn). Thẻ điểm đến và đặc sản kèm link
 * video TikTok: điểm đến lấy từ liên hệ TIKTOK, món ăn từ dish.video_url.
 */
export async function getHomeData() {
  // Không giới hạn số thẻ: lấy lần lượt từng trang (tối đa 100/trang) cho tới khi hết.
  const section = async (kind: 'ATTRACTION' | 'HOMESTAY') => {
    const all: Awaited<ReturnType<typeof publicPlaces.getPlaces>>['content'] = [];
    for (let page = 0; page < 50; page++) {
      const { content } = await publicPlaces.getPlaces({ kind, page, size: 100 });
      all.push(...content);
      if (content.length < 100) break;
    }
    return all;
  };
  const attractions = await section('ATTRACTION');
  const homestays = await section('HOMESTAY');
  const specialties = await listDishes(0);

  // Gắn link TikTok đầu tiên (theo thứ tự liên hệ) của mỗi thẻ; thẻ không có link giữ null.
  if (attractions.length > 0) {
    const byPlaceId = new Map<number, string>();
    for (const c of await places.publicContactsByChannel(attractions.map((a) => a.id), 'TIKTOK')) {
      if (!byPlaceId.has(c.placeId)) byPlaceId.set(c.placeId, c.value);
    }
    for (const card of attractions) card.tiktokUrl = byPlaceId.get(card.id) ?? null;
  }
  return { categories: [], featuredDestinations: attractions, homestays, featuredTours: [], specialties };
}
