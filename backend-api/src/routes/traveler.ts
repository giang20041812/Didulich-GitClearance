import { Router, type Request } from 'express';
import { z } from 'zod';
import { HttpError, IllegalArgumentError, DuplicateFieldsError } from '../lib/errors.js';
import { errorStyle } from '../lib/errorHandler.js';
import { BadParamError, boolParam, intParam, listParam, optionalBody, parseBody, pathId } from '../lib/http.js';
import { upload } from '../lib/upload.js';
import { DAY_SESSIONS, JOURNEY_ITEM_KINDS } from '../domain/enums.js';
import * as rateLimiter from '../security/rateLimiter.js';
import { hasRole } from '../security/methodSecurity.js';
import * as accounts from '../repositories/accountRepo.js';
import * as checkinService from '../services/journeyCheckinService.js';
import * as journeyService from '../services/journeyService.js';
import * as mail from '../services/mailService.js';
import * as travelerAuth from '../services/travelerAuthService.js';
import * as activity from '../services/travelerActivityService.js';
import * as webPush from '../services/webPushService.js';
import { nowLocal } from '../lib/time.js';

/** Cổng khách du lịch đã đăng nhập: lịch trình, hồ sơ, hoạt động, thông báo đẩy. Chỉ phiên "ROLE_TRAVELER". */
export const travelerRouter = Router();
travelerRouter.use('/api/v1/traveler', errorStyle('default'), hasRole('TRAVELER'));

const identifier = (req: Request): string => req.principal!.identifier;

// ---- Lịch trình -----------------------------------------------------------------------------------------------------

const idOrNull = z.number().nullish();
const strOrNull = z.string().nullish();
const timeStr = z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/).nullish();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish();

export const stopSchema = z
  .object({
    id: idOrNull,
    placeId: idOrNull,
    visitDate: dateStr,
    session: z.enum(DAY_SESSIONS).nullish(),
    kind: z.enum(JOURNEY_ITEM_KINDS).nullish(),
    title: strOrNull,
    dayIndex: idOrNull,
    startTime: timeStr,
    endTime: timeStr,
    note: strOrNull,
    addons: z.array(z.string()).nullish(),
    sourceStopId: idOrNull,
    dishIds: z.array(z.number()).nullish(),
    alternativePlaceIds: z.array(z.number()).nullish(),
  })
  .nullable();

const dayInputSchema = z.object({ dayIndex: idOrNull, title: strOrNull, note: strOrNull }).nullable();

const journeySchema = z.object({
  basePlaceId: idOrNull,
  title: strOrNull,
  startDate: dateStr,
  endDate: dateStr,
  stops: z.array(stopSchema).nullish(),
  format: idOrNull,
  regionId: idOrNull,
  guestCount: idOrNull,
  templateCode: strOrNull,
  preferences: z.record(z.unknown()).nullish(),
  templateId: idOrNull,
  days: z.array(dayInputSchema).nullish(),
});

/** Giờ khách gửi → "HH:mm:ss" (Jackson đọc LocalTime ISO). */
export function normalizeStops<T extends { startTime?: string | null; endTime?: string | null }>(stops: Array<T | null> | null | undefined): Array<T | null> | null | undefined {
  if (!stops) return stops;
  return stops.map((s) => {
    if (!s) return s;
    const fix = (t?: string | null) => (t == null ? t : t.length <= 5 ? `${t.padStart(5, '0')}:00` : t);
    return { ...s, startTime: fix(s.startTime), endTime: fix(s.endTime) };
  });
}

const journeysBase = '/api/v1/traveler/journeys';

travelerRouter.get(journeysBase, async (req, res) => {
  res.json(await journeyService.list(identifier(req), intParam(req.query.basePlaceId)));
});

// Các đường dẫn cố định đứng trước "/:id".
travelerRouter.get(`${journeysBase}/helpful`, async (req, res) => {
  res.json(await journeyService.helpfulState(identifier(req), listParam(req.query.tokens)));
});

travelerRouter.put(`${journeysBase}/helpful/:token`, async (req, res) => {
  rateLimiter.checkKey('journey-helpful', identifier(req), 300, 60 * 60 * 1000);
  res.json(await journeyService.markHelpful(identifier(req), String(req.params.token)));
});

travelerRouter.delete(`${journeysBase}/helpful/:token`, async (req, res) => {
  rateLimiter.checkKey('journey-helpful', identifier(req), 300, 60 * 60 * 1000);
  res.json(await journeyService.unmarkHelpful(identifier(req), String(req.params.token)));
});

const copySchema = z.object({ shareToken: strOrNull, startDate: dateStr, guestCount: idOrNull });

/** "Áp dụng lịch trình này" từ trang chia sẻ. */
travelerRouter.post(`${journeysBase}/copy`, async (req, res) => {
  const body = parseBody(copySchema, req.body);
  rateLimiter.checkKey('journey-copy', identifier(req), 30, 60 * 60 * 1000);
  res.status(201).json(await journeyService.copy(identifier(req), body));
});

travelerRouter.get(`${journeysBase}/visited-places`, async (req, res) => {
  res.json(await checkinService.visited(identifier(req)));
});

/** Tab "Lịch trình" của đơn: lịch trình đang gắn + lịch trình cùng chỗ nghỉ để gắn. */
travelerRouter.get(`${journeysBase}/for-booking/:bookingCode`, async (req, res) => {
  res.json(await journeyService.forBooking(identifier(req), String(req.params.bookingCode)));
});

travelerRouter.post(journeysBase, async (req, res) => {
  const body = parseBody(journeySchema, req.body);
  res.status(201).json(await journeyService.create(identifier(req), { ...body, stops: normalizeStops(body.stops) as never }));
});

travelerRouter.get(`${journeysBase}/:id`, async (req, res) => {
  res.json(await journeyService.get(identifier(req), pathId(req)));
});

travelerRouter.put(`${journeysBase}/:id`, async (req, res) => {
  const body = parseBody(journeySchema, req.body);
  res.json(await journeyService.update(identifier(req), pathId(req), { ...body, stops: normalizeStops(body.stops) as never }));
});

travelerRouter.delete(`${journeysBase}/:id`, async (req, res) => {
  await journeyService.remove(identifier(req), pathId(req));
  res.status(204).end();
});

travelerRouter.put(`${journeysBase}/:id/booking`, async (req, res) => {
  const body = parseBody(z.object({ bookingCode: strOrNull }), req.body);
  res.json(await journeyService.linkBooking(identifier(req), pathId(req), body.bookingCode));
});

travelerRouter.delete(`${journeysBase}/:id/booking`, async (req, res) => {
  res.json(await journeyService.unlinkBooking(identifier(req), pathId(req)));
});

travelerRouter.post(`${journeysBase}/:id/share`, async (req, res) => {
  res.json(await journeyService.share(identifier(req), pathId(req)));
});

travelerRouter.delete(`${journeysBase}/:id/share`, async (req, res) => {
  await journeyService.unshare(identifier(req), pathId(req));
  res.status(204).end();
});

/** Đăng lịch trình lên trang "Trải nghiệm" cho khách khác xem. */
travelerRouter.post(`${journeysBase}/:id/publish`, async (req, res) => {
  res.json(await journeyService.publish(identifier(req), pathId(req)));
});

travelerRouter.delete(`${journeysBase}/:id/publish`, async (req, res) => {
  await journeyService.unpublish(identifier(req), pathId(req));
  res.status(204).end();
});

/** Check-in một điểm của lịch trình: ảnh (đã nén trên máy) + lưu bút, đều tùy chọn. */
travelerRouter.post(`${journeysBase}/:id/stops/:placeId/checkin`, upload.single('photo'), async (req, res) => {
  rateLimiter.checkKey('journey-checkin', identifier(req), 60, 60 * 60 * 1000);
  const id = pathId(req);
  const placeId = pathId(req, 'placeId');
  const note = typeof req.body?.note === 'string' ? req.body.note : null;
  const removePhoto = boolParam(req.body?.removePhoto) ?? false;
  const file = req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype, size: req.file.size } : null;
  res.json(await checkinService.checkin(identifier(req), id, placeId, file, note, removePhoto));
});

travelerRouter.delete(`${journeysBase}/:id/stops/:placeId/checkin`, async (req, res) => {
  await checkinService.remove(identifier(req), pathId(req), pathId(req, 'placeId'));
  res.status(204).end();
});

// ---- Hồ sơ khách ------------------------------------------------------------------------------------------------------

const accountBase = '/api/v1/traveler/account';

function accountError(res: import('express').Response, status: number, errorCode: string, message: string): void {
  res.status(status).json({ status, errorCode, message });
}

travelerRouter.get(`${accountBase}/me`, async (req, res) => {
  try {
    res.json(await travelerAuth.profile(identifier(req)));
  } catch (err) {
    if (err instanceof IllegalArgumentError) return accountError(res, 404, 'NOT_FOUND', err.message);
    throw err;
  }
});

const sessionBody = (s: travelerAuth.TravelerSession) => ({ token: s.token, email: s.email, fullName: s.fullName, picture: s.picture, phone: s.phone });

/** Khách bổ sung số điện thoại; trả lại phiên (token, tên, SĐT) mới như khi sửa hồ sơ. */
travelerRouter.put(`${accountBase}/phone`, async (req, res) => {
  const body = parseBody(z.object({ phone: strOrNull }), req.body);
  try {
    res.json(sessionBody(await travelerAuth.addPhone(identifier(req), body.phone)));
  } catch (err) {
    if (err instanceof DuplicateFieldsError) return accountError(res, 409, 'DUPLICATE', 'Số điện thoại này đã được đăng ký cho tài khoản khác.');
    if (err instanceof IllegalArgumentError) return accountError(res, 400, 'VALIDATION_ERROR', err.message);
    throw err;
  }
});

/** Khách sửa họ tên / số điện thoại của chính mình; trả lại phiên (token, tên, SĐT) mới. */
travelerRouter.patch(`${accountBase}/profile`, async (req, res) => {
  const body = parseBody(z.object({ fullName: strOrNull, phone: strOrNull }), req.body);
  try {
    res.json(sessionBody(await travelerAuth.updateProfile(identifier(req), body.fullName, body.phone)));
  } catch (err) {
    if (err instanceof DuplicateFieldsError) return accountError(res, 409, 'DUPLICATE', 'Số điện thoại này đã được đăng ký cho tài khoản khác.');
    if (err instanceof IllegalArgumentError) return accountError(res, 400, 'VALIDATION_ERROR', err.message);
    throw err;
  }
});

/**
 * Email báo "mật khẩu vừa được đổi" (khách nhận ra ngay nếu không phải mình đổi). Gửi sau khi đổi mật khẩu đã lưu; chưa cấu
 * hình mail thì bỏ qua, lỗi gửi không ảnh hưởng việc đổi mật khẩu.
 */
async function notifyPasswordChanged(email: string): Promise<void> {
  if (!email || !email.includes('@') || !mail.isConfigured()) return;
  const t = nowLocal();
  const stamp = `${t.slice(11, 16)} ${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
  await mail.send({
    to: email,
    subject: 'Mật khẩu tài khoản Đi Du Lịch đã được thay đổi',
    body:
      `Xin chào,\n\nMật khẩu tài khoản ${email} vừa được thay đổi lúc ${stamp}.\n\n` +
      'Nếu không phải bạn đổi, hãy dùng chức năng "Quên mật khẩu" để đặt lại ngay và liên hệ ban quản trị.\n',
  });
}

travelerRouter.patch(`${accountBase}/password`, async (req, res) => {
  const body = parseBody(z.object({ currentPassword: strOrNull, newPassword: strOrNull }), req.body);
  try {
    await travelerAuth.changePassword(identifier(req), body.currentPassword, body.newPassword);
    await notifyPasswordChanged(identifier(req));
    res.json({ message: 'Đổi mật khẩu thành công.' });
  } catch (err) {
    if (err instanceof IllegalArgumentError) return accountError(res, 400, 'VALIDATION_ERROR', err.message);
    if (err instanceof HttpError || err instanceof BadParamError) throw err;
    accountError(res, 500, 'INTERNAL_SERVER_ERROR', 'Đã xảy ra lỗi hệ thống.');
  }
});

// ---- Hoạt động -----------------------------------------------------------------------------------------------------

travelerRouter.post('/api/v1/traveler/activity/homestays/:placeId/view', async (req, res) => {
  const p = req.principal;
  if (!p) throw new HttpError(401, 'Vui lòng đăng nhập.');
  if (p.role !== 'TRAVELER') throw new HttpError(403, 'Chỉ ghi nhận hoạt động của khách du lịch.');
  await activity.recordHomestayView(p.identifier, pathId(req, 'placeId'));
  res.status(204).end();
});

// ---- Nhắc giờ bằng thông báo đẩy ---------------------------------------------------------------------------------------

const pushSchema = z.object({
  endpoint: strOrNull,
  keys: z.object({ p256dh: strOrNull, auth: strOrNull }).nullish(),
});

async function travelerAccountId(req: Request): Promise<number> {
  const account = await accounts.findByIdentifier(identifier(req));
  if (!account) throw new HttpError(401, 'Vui lòng đăng nhập lại.');
  return account.id;
}

travelerRouter.get('/api/v1/traveler/push/public-key', async (_req, res) => {
  res.json({ publicKey: await webPush.publicKey() });
});

travelerRouter.post('/api/v1/traveler/push/subscribe', async (req, res) => {
  const body = parseBody(pushSchema, optionalBody(req) ?? {});
  if (!body.keys) throw new IllegalArgumentError('Thiếu thông tin đăng ký thông báo đẩy.');
  await webPush.subscribeTraveler(await travelerAccountId(req), body.endpoint ?? '', body.keys.p256dh ?? '', body.keys.auth ?? '', req.header('user-agent'));
  res.status(204).end();
});

travelerRouter.post('/api/v1/traveler/push/unsubscribe', async (req, res) => {
  const body = parseBody(pushSchema, optionalBody(req) ?? {});
  await webPush.unsubscribeTraveler(await travelerAccountId(req), body.endpoint);
  res.status(204).end();
});

travelerRouter.post('/api/v1/traveler/push/test', async (req, res) => {
  res.json({ delivered: await webPush.sendTestToTraveler(await travelerAccountId(req)) });
});
