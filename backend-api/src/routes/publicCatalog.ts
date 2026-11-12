import { Router } from 'express';
import { CATEGORY_KINDS } from '../domain/enums.js';
import { errorStyle } from '../lib/errorHandler.js';
import {
  BadParamError,
  dateParam,
  enumParam,
  intParam,
  listParam,
  longListParam,
  numParam,
  springPageable,
  strParam,
} from '../lib/http.js';
import * as placeDetail from '../services/placeDetailService.js';
import * as publicCatalog from '../services/publicCatalogServices.js';
import * as publicPlaces from '../services/publicPlaceService.js';
import { CATALOG_TTL_MS, REFERENCE_TTL_MS, cached } from '../services/catalogCache.js';
import * as notificationService from '../services/notificationService.js';

/**
 * API danh mục công khai (địa điểm, trang chủ, lễ hội, đặc sản, thông báo khách). Dữ liệu như nhau cho mọi người nên đọc
 * qua cache trong bộ nhớ gắn phiên bản danh mục — trừ những gì phụ thuộc tồn phòng theo ngày: lọc theo ngày ở và /rooms.
 */
export const publicCatalogRouter = Router();
publicCatalogRouter.use(errorStyle('default'));

const PLACE_BASES = ['/api/v1/public/places', '/api/public/places'];

publicCatalogRouter.get(PLACE_BASES, async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const kind = enumParam(q.kind, CATEGORY_KINDS);
  const minPrice = numParam(q.minPrice);
  const maxPrice = numParam(q.maxPrice);
  const amenities = listParam(q.amenities);
  const checkIn = dateParam(q.checkIn);
  const checkOut = dateParam(q.checkOut);
  const province = strParam(q.province);
  const district = strParam(q.district);
  const ward = strParam(q.ward);
  const attractions = longListParam(q.attractions);
  const keyword = strParam(q.keyword);
  const needs = strParam(q.needs);
  const guests = intParam(q.guests);
  const pageable = springPageable(q, 12);

  const base = {
    kind: kind ?? null,
    minPrice,
    maxPrice,
    amenities,
    province,
    district,
    ward,
    attractionIds: attractions,
    needs,
    guests,
    sortProperty: pageable.sortProperty,
    sortDirection: pageable.sortDirection,
    page: pageable.page,
    size: pageable.size,
  };

  // Lọc theo ngày ở = còn phòng theo tồn kho từng đêm → luôn tính mới. Từ khóa gõ tự do → không giữ trong cache.
  const cacheable = checkIn == null && checkOut == null && (keyword == null || keyword.trim() === '');
  if (!cacheable) {
    res.json(await publicPlaces.getPlaces({ ...base, checkIn, checkOut, keyword }));
    return;
  }
  const sortedKey = (values: unknown[] | undefined) => (values ? values.map(String).sort().join(',') : '');
  const key = [
    'places',
    kind ?? '',
    minPrice ?? '',
    maxPrice ?? '',
    sortedKey(amenities),
    province ?? '',
    district ?? '',
    ward ?? '',
    sortedKey(attractions),
    needs ?? '',
    guests ?? '',
    pageable.page,
    pageable.size,
    `${pageable.sortProperty ?? ''}:${pageable.sortDirection}`,
  ].join('|');
  res.json(await cached(key, CATALOG_TTL_MS, () => publicPlaces.getPlaces({ ...base, checkIn: null, checkOut: null, keyword: null })));
});

// Khóa cụ thể đứng trước "/:identifier".
publicCatalogRouter.get(PLACE_BASES.map((b) => `${b}/amenities`), async (req, res) => {
  const kind = enumParam(req.query.kind, CATEGORY_KINDS);
  res.json(await cached(`amenities|${kind ?? ''}`, REFERENCE_TTL_MS, () => publicPlaces.getAmenitiesInUse(kind)));
});

publicCatalogRouter.get(PLACE_BASES.map((b) => `${b}/regions`), async (_req, res) => {
  res.json(await cached('regions', REFERENCE_TTL_MS, () => publicPlaces.getPublicRegions()));
});

publicCatalogRouter.get(PLACE_BASES.map((b) => `${b}/:identifier`), async (req, res) => {
  const identifier = String(req.params.identifier);
  const numeric = /^\d+$/.test(identifier);
  res.json(
    await cached(`detail|${identifier}`, CATALOG_TTL_MS, () =>
      numeric ? placeDetail.getPlaceDetailById(Number(identifier)) : placeDetail.getPlaceDetail(identifier),
    ),
  );
});

publicCatalogRouter.get(PLACE_BASES.map((b) => `${b}/:identifier/nearby`), async (req, res) => {
  const identifier = String(req.params.identifier);
  const id = /^\d+$/.test(identifier) ? Number(identifier) : 1;
  const radius = numParam(req.query.radius) ?? 10.0;
  // Làm tròn 0,1 km cho khóa cache; frontend luôn hỏi 30 km rồi tự lọc theo thanh trượt bán kính.
  const rounded = Math.round(radius * 10) / 10;
  res.json(await cached(`nearby|${id}|${rounded}`, REFERENCE_TTL_MS, () => publicPlaces.getNearbyPlaces(id, rounded)));
});

publicCatalogRouter.get(PLACE_BASES.map((b) => `${b}/:identifier/reviews`), async (req, res) => {
  const identifier = String(req.params.identifier);
  const id = /^\d+$/.test(identifier) ? Number(identifier) : 1;
  // Không qua CDN (đánh giá mới hiện ngay); cache bộ nhớ được làm mới khi có đánh giá / phản hồi / kiểm duyệt.
  res.json(await cached(`reviews|${id}`, CATALOG_TTL_MS, () => publicPlaces.getPlaceReviews(id)));
});

publicCatalogRouter.get(PLACE_BASES.map((b) => `${b}/:slug/rooms`), async (req, res) => {
  res.json(await placeDetail.getPlaceRooms(String(req.params.slug)));
});

publicCatalogRouter.get(PLACE_BASES.map((b) => `${b}/:slug/map-context`), async (req, res) => {
  const slug = String(req.params.slug);
  res.json(await cached(`map|${slug}`, REFERENCE_TTL_MS, () => placeDetail.getMapContext(slug)));
});

// ---- Trang chủ -------------------------------------------------------------------------------------------------------

publicCatalogRouter.get('/api/public/home', async (_req, res) => {
  try {
    res.json(await cached('home', CATALOG_TTL_MS, () => publicCatalog.getHomeData()));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || String(err) });
  }
});

// ---- Lễ hội ----------------------------------------------------------------------------------------------------------

const FESTIVAL_BASES = ['/api/public/festivals', '/api/v1/public/festivals'];

/** Danh sách thẻ lễ hội: chỉ tên, ảnh, địa điểm, thời gian — không gửi phần mô tả (giá trị, trải nghiệm, lưu ý). */
publicCatalogRouter.get(FESTIVAL_BASES, async (_req, res) => {
  const cards = await cached('festivals|cards', REFERENCE_TTL_MS, async () => (await allFestivals()).map(publicCatalog.festivalListCard));
  res.json(cards);
});

const allFestivals = () => cached('festivals', REFERENCE_TTL_MS, () => publicCatalog.getPublishedFestivals());

/** Chi tiết một lễ hội theo slug hoặc id, đủ phần mô tả (trường mô tả null thì không có trong JSON). */
publicCatalogRouter.get(FESTIVAL_BASES.map((b) => `${b}/:identifier`), async (req, res) => {
  const identifier = String(req.params.identifier);
  const found = (await allFestivals()).find((f) => identifier === f.slug || identifier === String(f.id));
  if (!found) {
    res.status(404).end();
    return;
  }
  const out: Record<string, unknown> = { ...found };
  for (const k of ['coreValue', 'suitableExperience', 'etiquetteDont']) if (out[k] == null) delete out[k];
  res.json(out);
});

// ---- Đặc sản ---------------------------------------------------------------------------------------------------------

const DISH_BASES = ['/api/public/dishes', '/api/v1/public/dishes'];

publicCatalogRouter.get(DISH_BASES, async (_req, res) => {
  res.json(await cached('dishes', CATALOG_TTL_MS, () => publicCatalog.listDishes(0)));
});

publicCatalogRouter.get(DISH_BASES.map((b) => `${b}/:identifier`), async (req, res) => {
  res.json(await publicCatalog.dishDetail(String(req.params.identifier)));
});

// ---- Thông báo của khách ----------------------------------------------------------------------------------------------

function notificationScope(req: import('express').Request): { email: string | null; accountId: number | null } {
  const p = req.principal;
  return { email: p && p.role === 'TRAVELER' ? p.identifier : null, accountId: p?.accountId ?? null };
}

publicCatalogRouter.get('/api/public/notifications', async (req, res) => {
  if (!req.principal) return void res.status(401).end();
  const s = notificationScope(req);
  res.json(await notificationService.getNotificationsForCustomer(s.email, null, s.accountId));
});

publicCatalogRouter.put('/api/public/notifications/:id/read', async (req, res) => {
  if (!req.principal) return void res.status(401).end();
  const id = intParam(req.params.id);
  if (id === undefined) throw new BadParamError();
  const s = notificationScope(req);
  const own = await notificationService.getNotificationsForCustomer(s.email, null, s.accountId);
  if (!own.some((n) => n.id === id)) return void res.status(404).end();
  res.json(await notificationService.markAsRead(id));
});

publicCatalogRouter.post('/api/public/notifications/mark-all-read', async (req, res) => {
  if (!req.principal) return void res.status(401).end();
  const s = notificationScope(req);
  await notificationService.markAllAsRead(s.email, null, s.accountId);
  res.json({ message: 'Đã đánh dấu tất cả thông báo là đã đọc' });
});

