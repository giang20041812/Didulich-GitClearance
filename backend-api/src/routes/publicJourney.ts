import { Router } from 'express';
import { errorStyle } from '../lib/errorHandler.js';
import { boolParam, intParamOr, optionalBody, strParam } from '../lib/http.js';
import { normalize } from '../lib/vietnamese.js';
import * as rateLimiter from '../security/rateLimiter.js';
import * as audit from '../services/auditLogService.js';
import { CATALOG_TTL_MS, cached } from '../services/catalogCache.js';
import * as checkinService from '../services/journeyCheckinService.js';
import * as journeyService from '../services/journeyService.js';
import * as tripCatalog from '../services/tripCatalogService.js';
import { callerId } from '../security/auth.js';
import { pathId } from '../lib/http.js';

/**
 * Lịch trình công khai, không cần đăng nhập: trang chia sẻ (/j/{token}) và trang "Trải nghiệm" (hành trình khách tự đăng);
 * danh mục lên lịch trình (/lich-trinh); và các màn kiểm duyệt của Admin.
 */
export const journeyRouter = Router();

const TEN_MINUTES = 10 * 60 * 1000;

journeyRouter.get('/api/public/journeys/shared/:token', errorStyle('default'), async (req, res) => {
  rateLimiter.check(req.ip, 'journey-shared', 300, TEN_MINUTES);
  // Chủ lịch trình tắt chia sẻ thì link phải chết ngay: không cho CDN / trình duyệt giữ bản cũ.
  res.setHeader('Cache-Control', 'no-store');
  res.json(await journeyService.shared(String(req.params.token)));
});

/** Trang "Trải nghiệm": bài mới đăng trước, mỗi trang tối đa 24 bài. Gỡ / ẩn bài thì biến mất ngay (no-store). */
journeyRouter.get('/api/public/journeys/feed', errorStyle('default'), async (req, res) => {
  rateLimiter.check(req.ip, 'journey-feed', 600, TEN_MINUTES);
  res.setHeader('Cache-Control', 'no-store');
  res.json(await journeyService.feed(intParamOr(req.query.page, 0), intParamOr(req.query.size, 12)));
});

/** Danh mục lên lịch trình: gói mẫu + tag lọc, dịch vụ thêm, điểm tham quan, món của một tỉnh. */
journeyRouter.get(['/api/v1/public/trips/catalog', '/api/public/trips/catalog'], errorStyle('default'), async (req, res) => {
  const province = strParam(req.query.province);
  res.json(await cached(`trips|${normalize(province)}`, CATALOG_TTL_MS, () => tripCatalog.catalogFor(province)));
});

// ---- Admin: kiểm duyệt ------------------------------------------------------------------------------------------------

/** Admin kiểm duyệt ảnh + lưu bút check-in địa điểm của khách: ẩn nội dung không phù hợp / bỏ ẩn. */
journeyRouter.get('/api/v1/admin/journey-checkins', errorStyle('default'), async (req, res) => {
  res.json(await checkinService.moderation(boolParam(req.query.hidden) ?? null, intParamOr(req.query.page, 0), intParamOr(req.query.size, 20)));
});

journeyRouter.post('/api/v1/admin/journey-checkins/:id/hide', errorStyle('default'), async (req, res) => {
  const body = optionalBody(req);
  res.json(await checkinService.hide(pathId(req), (body?.reason as string | undefined) ?? null, callerId(req)));
});

journeyRouter.post('/api/v1/admin/journey-checkins/:id/unhide', errorStyle('default'), async (req, res) => {
  res.json(await checkinService.unhide(pathId(req), callerId(req)));
});

/** Admin kiểm duyệt bài trên trang "Trải nghiệm" (hành trình khách đăng): ẩn bài không phù hợp / bỏ ẩn. */
journeyRouter.get('/api/v1/admin/journey-feed', errorStyle('default'), async (req, res) => {
  res.json(await journeyService.feedModeration(boolParam(req.query.hidden) ?? null, intParamOr(req.query.page, 0), intParamOr(req.query.size, 20)));
});

journeyRouter.post('/api/v1/admin/journey-feed/:id/hide', errorStyle('default'), async (req, res) => {
  const body = optionalBody(req);
  const id = pathId(req);
  const item = await journeyService.hideFromFeed(id, (body?.reason as string | undefined) ?? null);
  await audit.record(callerId(req), 'JOURNEY_FEED_HIDDEN', 'Journey', id, item.hiddenReason, { hidden: false }, { hidden: true });
  res.json(item);
});

journeyRouter.post('/api/v1/admin/journey-feed/:id/unhide', errorStyle('default'), async (req, res) => {
  const id = pathId(req);
  const item = await journeyService.unhideFromFeed(id);
  await audit.record(callerId(req), 'JOURNEY_FEED_UNHIDDEN', 'Journey', id, null, { hidden: true }, { hidden: false });
  res.json(item);
});
