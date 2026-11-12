import { Router, type Request } from 'express';
import { z } from 'zod';
import { EXPLORE_CATEGORIES, SERVICE_GROUPS } from '../domain/enums.js';
import { errorStyle } from '../lib/errorHandler.js';
import { BadParamError, boolParam, enumParam, intParam, intParamOr, parseBody, pathId, strParam } from '../lib/http.js';
import { upload } from '../lib/upload.js';
import { CATALOG_TTL_MS, cached } from '../services/catalogCache.js';
import * as homestayConfig from '../services/exploreHomestayConfigService.js';
import * as explorePlaces from '../services/explorePlaceService.js';
import type { PlaceInput } from '../services/explorePlaceWriter.js';
import * as exploreSettings from '../services/exploreSettingsService.js';
import * as explore from '../services/exploreService.js';
import * as storage from '../services/mediaStorage.js';
import * as nearby from '../services/nearbyOfferService.js';
import * as partnerExplore from '../services/partnerExploreService.js';

/**
 * EP02 "Khám phá quanh Homestay": phía khách (không cần đăng nhập), Admin (quản lý địa điểm + cấu hình quanh homestay) và NCC (địa điểm
 * của mình + "Dịch vụ của tôi"). Thân lỗi theo ExploreErrors: {status, message[, fieldErrors]} — cùng kiểu 'admin'.
 */
export const exploreRouter = Router();

const style = errorStyle('admin');

// ---- Khối dựng schema ---------------------------------------------------------------------------------------------------------------

const str = z.string().nullish();

/** BigDecimal / Integer kiểu Jackson: chuỗi số hoặc "" cũng đọc được. */
const lenientNum = z
  .union([
    z.number(),
    z.string().transform((s, ctx) => {
      if (s.trim() === '') return null;
      const n = Number(s.trim());
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.invalid_type, expected: 'number', received: 'string' });
        return z.NEVER;
      }
      return n;
    }),
  ])
  .nullish()
  .transform((v) => v ?? null);

const placeInput = z.object({
  name: str,
  category: z.enum(EXPLORE_CATEGORIES).nullish(),
  summary: str,
  description: str,
  address: str,
  latitude: lenientNum,
  longitude: lenientNum,
  phone: str,
  website: str,
  openingHours: z
    .array(z.object({ dayOfWeek: lenientNum, closed: z.boolean().nullish(), open: str, close: str }).nullable())
    .nullish(),
  images: z.array(z.object({ mediaId: lenientNum, imageId: str, url: str }).nullable()).nullish(),
  coordVerified: z.boolean().nullish(),
  visible: z.boolean().nullish(),
  priceFrom: lenientNum,
  priceUnit: str,
  service: z
    .object({
      serviceGroup: z.enum(SERVICE_GROUPS).nullish(),
      vehicleType: str,
      routeFrom: str,
      routeTo: str,
      departureTimes: str,
      durationMinutes: lenientNum,
      seats: lenientNum,
      groupSizeMax: lenientNum,
      languages: z.array(z.string().nullable()).nullish(),
      includes: str,
    })
    .nullish(),
});

const body = (req: Request): PlaceInput => parseBody(placeInput, req.body) as PlaceInput;

const pageParams = (req: Request, size = 20) => ({ page: intParamOr(req.query.page, 0), size: intParamOr(req.query.size, size) });

const callerId = (req: Request): number | null => req.principal?.accountId ?? null;

// ---- Phía khách (/api/public/explore) ---------------------------------------------------------------------------------------------------

/**
 * Danh sách dùng cache trong bộ nhớ — mọi thao tác ghi của Admin / NCC tự làm mới phiên bản danh mục. Chi tiết KHÔNG cache vì trạng thái
 * mở / đóng cửa đổi theo giờ (BR-C07).
 */
exploreRouter.get('/api/public/explore/homestays/:homestayId', style, async (req, res) => {
  const homestayId = pathId(req, 'homestayId');
  const category = enumParam(req.query.category, EXPLORE_CATEGORIES);
  const page = Math.max(0, intParamOr(req.query.page, 0));
  res.json(await cached(`explore|${homestayId}|${category ?? ''}|${page}`, CATALOG_TTL_MS, () => explore.explore(homestayId, category, page)));
});

exploreRouter.get('/api/public/explore/places/:placeId', style, async (req, res) => {
  res.json(await explore.placeDetail(pathId(req, 'placeId'), intParam(req.query.homestayId)));
});

// ---- Admin (/api/v1/admin/explore) ---------------------------------------------------------------------------------------------------------

const ADMIN = '/api/v1/admin/explore';

exploreRouter.get(`${ADMIN}/places`, style, async (req, res) => {
  const { page, size } = pageParams(req);
  res.json(
    await explorePlaces.list(
      enumParam(req.query.category, EXPLORE_CATEGORIES),
      enumParam(req.query.status, explorePlaces.STATUS_FILTERS),
      enumParam(req.query.coord, explorePlaces.COORD_FILTERS),
      strParam(req.query.keyword),
      null,
      page,
      size,
    ),
  );
});

// Các đường dẫn cố định đứng trước "/:id".
exploreRouter.post(`${ADMIN}/places/coord-verified/bulk`, style, async (req, res) => {
  const input = parseBody(z.object({ ids: z.array(z.number()).nullish() }), req.body);
  res.json(await explorePlaces.bulkVerify(input.ids, callerId(req)));
});

exploreRouter.post(`${ADMIN}/places`, style, async (req, res) => {
  res.json(await explorePlaces.adminCreate(body(req), callerId(req)));
});

exploreRouter.get(`${ADMIN}/places/:id`, style, async (req, res) => {
  res.json(await explorePlaces.form(pathId(req), null));
});

exploreRouter.put(`${ADMIN}/places/:id`, style, async (req, res) => {
  res.json(await explorePlaces.adminUpdate(pathId(req), body(req), callerId(req)));
});

exploreRouter.patch(`${ADMIN}/places/:id/visibility`, style, async (req, res) => {
  const input = parseBody(z.object({ visible: z.boolean().nullish() }), req.body);
  res.json(await explorePlaces.setVisible(pathId(req), input.visible, callerId(req)));
});

exploreRouter.patch(`${ADMIN}/places/:id/coord-verified`, style, async (req, res) => {
  const input = parseBody(z.object({ verified: z.boolean().nullish() }), req.body);
  res.json(await explorePlaces.setCoordVerified(pathId(req), input.verified, callerId(req)));
});

exploreRouter.post(`${ADMIN}/places/:id/approve`, style, async (req, res) => {
  res.json(await explorePlaces.approve(pathId(req), callerId(req)));
});

const reasonInput = z.object({ reason: str });

exploreRouter.post(`${ADMIN}/places/:id/reject`, style, async (req, res) => {
  res.json(await explorePlaces.reject(pathId(req), parseBody(reasonInput, req.body).reason, callerId(req)));
});

exploreRouter.post(`${ADMIN}/places/:id/edit/approve`, style, async (req, res) => {
  res.json(await explorePlaces.approveEdit(pathId(req), callerId(req)));
});

exploreRouter.post(`${ADMIN}/places/:id/edit/reject`, style, async (req, res) => {
  res.json(await explorePlaces.rejectEdit(pathId(req), parseBody(reasonInput, req.body).reason, callerId(req)));
});

// Tải ảnh (Admin chưa có đường tải ảnh riêng): Cloudinary ký sẵn, Supabase tải qua backend.
exploreRouter.post(`${ADMIN}/media/direct-upload`, style, async (_req, res) => {
  res.json(storage.getActiveUploadConfig());
});

exploreRouter.post(`${ADMIN}/media/upload-image`, style, upload.single('file'), async (req, res) => {
  if (!req.file) throw new BadParamError();
  const stored = await storage.uploadImage(req.file.buffer, req.file.mimetype, 'explore-places');
  res.json({ imageId: stored.imageId, url: stored.url });
});

// Cấu hình (AD-03).
exploreRouter.get(`${ADMIN}/settings`, style, async (_req, res) => {
  res.json(await exploreSettings.settings());
});

exploreRouter.put(`${ADMIN}/settings`, style, async (req, res) => {
  const input = parseBody(z.object({ radiusKm: lenientNum }), req.body);
  res.json(await exploreSettings.updateRadius(input.radiusKm, callerId(req)));
});

exploreRouter.get(`${ADMIN}/homestays`, style, async (req, res) => {
  res.json(await homestayConfig.homestays(strParam(req.query.keyword)));
});

exploreRouter.get(`${ADMIN}/homestays/:homestayId`, style, async (req, res) => {
  res.json(await homestayConfig.overview(pathId(req, 'homestayId')));
});

exploreRouter.get(`${ADMIN}/homestays/:homestayId/search`, style, async (req, res) => {
  res.json(await homestayConfig.search(pathId(req, 'homestayId'), strParam(req.query.keyword)));
});

exploreRouter.post(`${ADMIN}/homestays/:homestayId/pins`, style, async (req, res) => {
  const input = parseBody(z.object({ placeId: lenientNum }), req.body);
  res.json(await homestayConfig.pin(pathId(req, 'homestayId'), input.placeId, callerId(req)));
});

exploreRouter.put(`${ADMIN}/homestays/:homestayId/pins/order`, style, async (req, res) => {
  const input = parseBody(z.object({ placeIds: z.array(z.number().nullable()).nullish() }), req.body);
  res.json(await homestayConfig.reorder(pathId(req, 'homestayId'), input.placeIds, callerId(req)));
});

exploreRouter.delete(`${ADMIN}/homestays/:homestayId/pins/:placeId`, style, async (req, res) => {
  res.json(await homestayConfig.unpin(pathId(req, 'homestayId'), pathId(req, 'placeId'), callerId(req)));
});

// ---- NCC: địa điểm khám phá (/api/v1/partner/explore-places) ------------------------------------------------------------------------------

const PARTNER_EXPLORE = '/api/v1/partner/explore-places';

exploreRouter.get(PARTNER_EXPLORE, style, async (req, res) => {
  const { page, size } = pageParams(req);
  res.json(await partnerExplore.list(req.principal, page, size));
});

exploreRouter.post(PARTNER_EXPLORE, style, async (req, res) => {
  res.json(await partnerExplore.create(req.principal, body(req)));
});

exploreRouter.get(`${PARTNER_EXPLORE}/:id`, style, async (req, res) => {
  res.json(await partnerExplore.get(req.principal, pathId(req)));
});

exploreRouter.put(`${PARTNER_EXPLORE}/:id`, style, async (req, res) => {
  res.json(await partnerExplore.update(req.principal, pathId(req), body(req)));
});

// ---- NCC: dịch vụ của tôi (/api/v1/partner/listings) ----------------------------------------------------------------------------------------

const LISTINGS = '/api/v1/partner/listings';

exploreRouter.get(`${LISTINGS}/config`, style, async (req, res) => {
  res.json(await partnerExplore.listingConfig(req.principal));
});

exploreRouter.get(LISTINGS, style, async (req, res) => {
  const { page, size } = pageParams(req);
  res.json(await partnerExplore.listListings(req.principal, strParam(req.query.keyword), page, size));
});

exploreRouter.post(LISTINGS, style, async (req, res) => {
  res.json(await partnerExplore.createListing(req.principal, body(req)));
});

exploreRouter.get(`${LISTINGS}/:id`, style, async (req, res) => {
  res.json(await partnerExplore.getListing(req.principal, pathId(req)));
});

exploreRouter.put(`${LISTINGS}/:id`, style, async (req, res) => {
  res.json(await partnerExplore.updateListing(req.principal, pathId(req), body(req)));
});

// ---- Gợi ý quanh đây (NearbyOfferController) -------------------------------------------------------------------------------------------------

/** Khách (không cần đăng nhập) tải một lần danh sách điểm mốc + gợi ý rồi tự tính khoảng cách trên máy. Cache trong bộ nhớ. */
exploreRouter.get('/api/public/nearby-suggestions', style, async (_req, res) => {
  res.json(await cached('nearby-suggestions', CATALOG_TTL_MS, () => nearby.suggestions()));
});

exploreRouter.get('/api/v1/partner/nearby-offers', style, async (req, res) => {
  res.json(await nearby.partnerList(req.principal));
});

exploreRouter.put('/api/v1/partner/nearby-offers/:placeId', style, async (req, res) => {
  const input = parseBody(z.object({ enabled: z.boolean().nullish(), message: str, radiusKm: lenientNum }), req.body);
  res.json(await nearby.partnerSave(req.principal, pathId(req, 'placeId'), input));
});

/** `hidden`: true = chỉ gợi ý đã bị ẩn, false = chỉ gợi ý đang không bị ẩn, bỏ trống = tất cả. */
exploreRouter.get('/api/v1/admin/nearby-offers', style, async (req, res) => {
  const { page, size } = pageParams(req);
  res.json(await nearby.adminList(boolParam(req.query.hidden), strParam(req.query.keyword), page, size));
});

exploreRouter.post('/api/v1/admin/nearby-offers/:placeId/hide', style, async (req, res) => {
  res.json(await nearby.hide(pathId(req, 'placeId'), parseBody(reasonInput, req.body ?? {}).reason, callerId(req)));
});

exploreRouter.post('/api/v1/admin/nearby-offers/:placeId/show', style, async (req, res) => {
  res.json(await nearby.show(pathId(req, 'placeId'), callerId(req)));
});
