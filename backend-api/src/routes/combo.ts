import { Router, type Request } from 'express';
import { z } from 'zod';
import { CATEGORY_KINDS, COMBO_REQUEST_STATUSES } from '../domain/enums.js';
import { errorStyle } from '../lib/errorHandler.js';
import { enumParam, intParam, intParamOr, parseBody, pathId, strParam } from '../lib/http.js';
import * as rateLimiter from '../security/rateLimiter.js';
import { CATALOG_TTL_MS, cached } from '../services/catalogCache.js';
import * as combos from '../services/comboService.js';
import type { ComboInput } from '../services/comboService.js';

/**
 * Gói combo. Khách: danh sách, chi tiết (cache trong bộ nhớ, Admin / NCC lưu là tự làm mới), gửi yêu cầu đặt (giới hạn 10 lần / giờ /
 * IP). Admin: quản lý, duyệt combo NCC, yêu cầu đặt (GET Admin mọi cấp, ghi cấp 1–2 theo accessRules). NCC: combo của mình (tạo / sửa qua
 * Admin duyệt), tạm ngừng bán, yêu cầu đặt combo của mình. Thân lỗi theo ExploreErrors: {status, message[, fieldErrors]}.
 */
export const comboRouter = Router();

const style = errorStyle('admin');
const str = z.string().nullish();
const lenient = z
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

const comboInput = z.object({
  title: str,
  summary: str,
  description: str,
  days: lenient,
  nights: lenient,
  priceFrom: lenient,
  priceNote: str,
  groupSizeMin: lenient,
  groupSizeMax: lenient,
  includes: str,
  excludes: str,
  coverImageUrl: str,
  stops: z.array(z.object({ dayNo: lenient, startTime: str, endTime: str, placeId: lenient, title: str, note: str }).nullable()).nullish(),
  restaurants: z.array(z.object({ placeId: lenient, note: str }).nullable()).nullish(),
});

const body = (req: Request): ComboInput => parseBody(comboInput, req.body) as ComboInput;
const callerId = (req: Request): number | null => req.principal?.accountId ?? null;
const paging = (req: Request) => ({ page: intParamOr(req.query.page, 0), size: intParamOr(req.query.size, 20) });
const requestStatusInput = z.object({ status: z.enum(COMBO_REQUEST_STATUSES).nullish() });
const reasonInput = z.object({ reason: str });

// ---- Khách ----------------------------------------------------------------------------------------------------------------------

comboRouter.get('/api/public/combos', style, async (_req, res) => {
  res.json(await cached('combos', CATALOG_TTL_MS, () => combos.publicList()));
});

comboRouter.get('/api/public/combos/:slug', style, async (req, res) => {
  const slug = String(req.params.slug);
  res.json(await cached(`combo|${slug}`, CATALOG_TTL_MS, () => combos.publicDetail(slug)));
});

comboRouter.post('/api/public/combos/:slug/requests', style, async (req, res) => {
  const input = parseBody(
    z.object({ contactName: str, contactPhone: str, startDate: str, guests: lenient, note: str }),
    req.body,
  );
  rateLimiter.check(req.ip, 'combo-request', 10, 60 * 60 * 1000);
  res.json(await combos.request(String(req.params.slug), input, req.principal));
});

// ---- Admin ------------------------------------------------------------------------------------------------------------------------

const ADMIN = '/api/v1/admin/combos';

comboRouter.get(ADMIN, style, async (req, res) => {
  const { page, size } = paging(req);
  res.json(await combos.adminList(enumParam(req.query.status, combos.ADMIN_FILTERS), enumParam(req.query.source, combos.SOURCE_FILTERS), strParam(req.query.keyword), page, size));
});

// Các đường dẫn cố định đứng trước "/:id".
comboRouter.get(`${ADMIN}/place-options`, style, async (req, res) => {
  res.json(await combos.placeOptions(enumParam(req.query.kind, CATEGORY_KINDS), strParam(req.query.keyword)));
});

comboRouter.get(`${ADMIN}/requests`, style, async (req, res) => {
  const { page, size } = paging(req);
  res.json(await combos.adminRequests(intParam(req.query.comboId), enumParam(req.query.status, COMBO_REQUEST_STATUSES), page, size));
});

comboRouter.patch(`${ADMIN}/requests/:requestId`, style, async (req, res) => {
  const input = parseBody(requestStatusInput, req.body ?? {});
  res.json(await combos.adminSetRequestStatus(pathId(req, 'requestId'), input.status, callerId(req)));
});

comboRouter.get(`${ADMIN}/:id`, style, async (req, res) => {
  res.json(await combos.adminForm(pathId(req)));
});

comboRouter.post(ADMIN, style, async (req, res) => {
  res.json(await combos.adminCreate(body(req), callerId(req)));
});

comboRouter.put(`${ADMIN}/:id`, style, async (req, res) => {
  res.json(await combos.adminUpdate(pathId(req), body(req), callerId(req)));
});

comboRouter.post(`${ADMIN}/:id/approve`, style, async (req, res) => {
  res.json(await combos.approve(pathId(req), callerId(req)));
});

comboRouter.post(`${ADMIN}/:id/reject`, style, async (req, res) => {
  res.json(await combos.reject(pathId(req), parseBody(reasonInput, req.body ?? {}).reason, callerId(req)));
});

comboRouter.post(`${ADMIN}/:id/approve-edit`, style, async (req, res) => {
  res.json(await combos.approveEdit(pathId(req), callerId(req)));
});

comboRouter.post(`${ADMIN}/:id/reject-edit`, style, async (req, res) => {
  res.json(await combos.rejectEdit(pathId(req), parseBody(reasonInput, req.body ?? {}).reason, callerId(req)));
});

comboRouter.post(`${ADMIN}/:id/visibility`, style, async (req, res) => {
  const input = parseBody(z.object({ visible: z.boolean().nullish() }), req.body ?? {});
  res.json(await combos.setVisible(pathId(req), input.visible, callerId(req)));
});

comboRouter.delete(`${ADMIN}/:id`, style, async (req, res) => {
  await combos.remove(pathId(req), callerId(req));
  res.json({ deleted: true });
});

// ---- NCC ----------------------------------------------------------------------------------------------------------------------------

const PARTNER = '/api/v1/partner/combos';

comboRouter.get(PARTNER, style, async (req, res) => {
  const { page, size } = paging(req);
  res.json(await combos.partnerList(req.principal, page, size));
});

comboRouter.get(`${PARTNER}/place-options`, style, async (req, res) => {
  res.json(await combos.placeOptions(enumParam(req.query.kind, CATEGORY_KINDS), strParam(req.query.keyword)));
});

comboRouter.get(`${PARTNER}/requests`, style, async (req, res) => {
  const { page, size } = paging(req);
  res.json(await combos.partnerRequests(req.principal, intParam(req.query.comboId), enumParam(req.query.status, COMBO_REQUEST_STATUSES), page, size));
});

comboRouter.patch(`${PARTNER}/requests/:requestId`, style, async (req, res) => {
  const input = parseBody(requestStatusInput, req.body ?? {});
  res.json(await combos.partnerSetRequestStatus(req.principal, pathId(req, 'requestId'), input.status));
});

comboRouter.get(`${PARTNER}/:id`, style, async (req, res) => {
  res.json(await combos.partnerForm(req.principal, pathId(req)));
});

comboRouter.post(PARTNER, style, async (req, res) => {
  res.json(await combos.partnerCreate(req.principal, body(req)));
});

comboRouter.put(`${PARTNER}/:id`, style, async (req, res) => {
  res.json(await combos.partnerUpdate(req.principal, pathId(req), body(req)));
});

comboRouter.post(`${PARTNER}/:id/pause`, style, async (req, res) => {
  const input = parseBody(z.object({ paused: z.boolean().nullish() }), req.body ?? {});
  res.json(await combos.partnerPause(req.principal, pathId(req), input.paused));
});
