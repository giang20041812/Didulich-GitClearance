import { Router, type Request } from 'express';
import { z } from 'zod';
import { AMENITY_VALUES, BOOKING_STATUSES, CHANGE_REQUEST_STATUSES, PLACE_OPERATION_STATUSES, PLACE_VISIBILITIES, PROVIDER_SERVICE_TYPES, REFUND_TYPES } from '../domain/enums.js';
import { HttpError } from '../lib/errors.js';
import { errorStyle } from '../lib/errorHandler.js';
import { BadParamError, dateParam, enumParam, intParam, intParamOr, longListParam, optionalBody, parseBody, pathId, required, strParam } from '../lib/http.js';
import { upload } from '../lib/upload.js';
import { date, each, int, num, optNum, optText, std, text, whenMissing } from '../lib/validation.js';
import * as rateLimiter from '../security/rateLimiter.js';
import * as bookingAdmin from '../services/adminBookingService.js';
import type { Action } from '../services/bookingWorkflowService.js';
import * as changeRequests from '../services/changeRequestService.js';
import * as geocoding from '../services/geocodingService.js';
import * as homestays from '../services/partnerHomestayService.js';
import * as media from '../services/partnerMediaService.js';
import * as misc from '../services/partnerMiscServices.js';
import * as onboarding from '../services/partnerOnboardingService.js';
import * as partnerBookings from '../services/partnerBookingService.js';
import * as dashboard from '../services/partnerDashboardService.js';
import * as providerApplications from '../services/providerApplicationService.js';
import * as roomService from '../services/partnerRoomService.js';
import * as units from '../services/roomUnitService.js';
import * as notifications from '../services/adminNotificationService.js';
import { mountNotificationRoutes } from './notificationRoutes.js';

/**
 * Cổng nhà cung cấp (/api/v1/partner/**). Kiểu thân lỗi theo từng controller của bản Java: PartnerOperationErrors ('partner') áp
 * cho phòng, dịch vụ, đơn, đánh giá, ảnh, lịch, yêu cầu thay đổi, tài khoản, địa chỉ; Homestay có @ExceptionHandler riêng
 * ('partnerHomestay'); còn lại (tổng quan, thông báo, lịch tổng hợp) đi qua GlobalApiExceptionHandler ('default').
 */
export const partnerRouter = Router();

const partner = errorStyle('partner');
const plain = errorStyle('default');
const homestay = errorStyle('partnerHomestay');

const BASE = '/api/v1/partner';
const HS = `${BASE}/homestays`;

// ---- Khối dựng schema -------------------------------------------------------------------------------------------------------------

const str = z.string().nullish();
const flag = z.boolean().nullish().transform((v) => v === true);

/** Số nguyên / thực kiểu Jackson: chuỗi số hoặc "" cũng đọc được. */
const lenient = z
  .union([z.number(), z.string().transform((s, ctx) => {
    if (s.trim() === '') return null;
    const n = Number(s.trim());
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.invalid_type, expected: 'number', received: 'string' });
      return z.NEVER;
    }
    return n;
  })])
  .nullish()
  .transform((v) => v ?? null);

const enumOr = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).nullish();

const photoRef = (path: string) =>
  z.object({
    imageId: text({ notBlank: std.blank(`${path}.imageId`), max: [500, std.size(`${path}.imageId`, 0, 500)] }),
    url: text({ notBlank: std.blank(`${path}.url`), max: [1000, std.size(`${path}.url`, 0, 1000)] }),
  });

const bed = (path: string) =>
  z.object({
    bedType: text({ notBlank: std.blank(`${path}.bedType`), max: [32, std.size(`${path}.bedType`, 0, 32)] }),
    quantity: int({ required: std.nul(`${path}.quantity`), min: [1, std.min(`${path}.quantity`, 1)], max: [100, std.max(`${path}.quantity`, 100)] }),
  });

const MONEY_MAX = 999999999999;
const PRICE_POSITIVE = 'Giá phòng phải lớn hơn 0';

function roomInput(prefix: string) {
  const f = (name: string) => (prefix ? `${prefix}.${name}` : name);
  return z.object({
    name: text({ notBlank: 'Nhập tên loại phòng', max: [255, 'Tên loại phòng tối đa 255 ký tự'] }),
    description: optText({ max: [10000, 'Mô tả phòng tối đa 10.000 ký tự'] }),
    maxOccupancy: int({ required: 'Nhập số khách tối đa mỗi phòng', min: [1, 'Mỗi phòng ở được ít nhất 1 khách'], max: [1000, 'Số khách mỗi phòng tối đa 1000'] }),
    totalRoomCount: int({ required: 'Nhập số phòng', min: [1, 'Loại phòng phải có ít nhất 1 phòng'], max: [10000, 'Số phòng tối đa 10.000'] }),
    privateBathroom: z.enum(AMENITY_VALUES, whenMissing(std.nul(f('privateBathroom')))),
    areaSqm: optNum({ min: [0.01, std.min(f('areaSqm'), 0.01)], max: [9999.99, std.max(f('areaSqm'), 9999.99)] }),
    basePrice: num({
      required: 'Nhập giá phòng',
      gt: [0, PRICE_POSITIVE],
      max: [MONEY_MAX, std.max(f('basePrice'), MONEY_MAX)],
      digits: [12, std.digits(f('basePrice'), 12, 0)],
    }),
    weekendPrice: optNum({
      gt: [0, PRICE_POSITIVE],
      max: [MONEY_MAX, std.max(f('weekendPrice'), MONEY_MAX)],
      digits: [12, std.digits(f('weekendPrice'), 12, 0)],
    }),
    status: text({ required: std.nul(f('status')), pattern: [/^(ACTIVE|INACTIVE)$/, std.pattern(f('status'), 'ACTIVE|INACTIVE')] }),
    viewDescription: optText({ max: [500, std.size(f('viewDescription'), 0, 500)] }),
    beds: each(f('beds'), bed, { required: std.nul(f('beds')), max: [30, std.size(f('beds'), 0, 30)] }),
    amenityIds: z
      .array(z.number().int(), whenMissing(std.nul(f('amenityIds'))))
      .max(100, std.size(f('amenityIds'), 0, 100)),
    otherAmenities: optText({ max: [2000, 'Tiện ích khác tối đa 2.000 ký tự'] }),
    photos: each(f('photos'), photoRef, { max: [media.MAX_IMAGES_PER_OWNER, `Mỗi loại phòng tối đa ${media.MAX_IMAGES_PER_OWNER} ảnh`] }),
  });
}

const priceInput = z.object({
  name: text({ notBlank: std.blank('name'), max: [255, std.size('name', 0, 255)] }),
  periodStart: date(std.nul('periodStart')),
  periodEnd: date(std.nul('periodEnd')),
  price: num({ required: std.nul('price'), gt: [0, PRICE_POSITIVE], max: [MONEY_MAX, std.max('price', MONEY_MAX)], digits: [12, std.digits('price', 12, 0)] }),
});

const expectedDay = (path: string) =>
  z.object({
    stayDate: date(std.nul(`${path}.stayDate`)),
    totalRooms: z.number().int().nullish().transform((v) => v ?? 0),
    stopSell: flag,
  });

const inventoryInput = z.object({
  startDate: date(std.nul('startDate')),
  endDate: date(std.nul('endDate')),
  totalRooms: int({ required: std.nul('totalRooms'), min: [0, std.min('totalRooms', 0)], max: [10000, std.max('totalRooms', 10000)] }),
  stopSell: z.boolean(whenMissing(std.nul('stopSell'))),
  reason: optText({ max: [255, std.size('reason', 0, 255)] }),
  expected: each('expected', expectedDay, { max: [400, std.size('expected', 0, 400)] }),
});

const lockInput = z.object({
  startDate: date(std.nul('startDate')),
  endDate: date(std.nul('endDate')),
  lockedRooms: z.number().int().min(0, std.min('lockedRooms', 0)).max(10000, std.max('lockedRooms', 10000)).nullish(),
  closed: flag,
  reason: optText({ max: [255, std.size('reason', 0, 255)] }),
  expected: each('expected', expectedDay, { max: [400, std.size('expected', 0, 400)] }),
});

const unitInput = z.object({ stayDate: date(std.nul('stayDate')), locked: flag });

const blockInput = z.object({
  startDate: date(std.nul('startDate')),
  endDate: date(std.nul('endDate')),
  stopSell: z.boolean(whenMissing(std.nul('stopSell'))),
  reason: optText({ max: [255, std.size('reason', 0, 255)] }),
});

const offerInput = z.object({
  name: text({ notBlank: std.blank('name'), max: [255, std.size('name', 0, 255)] }),
  description: optText({ max: [10000, std.size('description', 0, 10000)] }),
  price: optNum({ min: [0, std.min('price', 0)], digits: [12, std.digits('price', 12, 0)] }),
  priceUnit: optText({ max: [64, std.size('priceUnit', 0, 64)] }),
  active: flag,
});

const attachInput = z.object({
  imageId: text({ notBlank: std.blank('imageId'), max: [500, std.size('imageId', 0, 500)] }),
  url: text({ notBlank: std.blank('url'), max: [1000, std.size('url', 0, 1000)] }),
  caption: optText({ max: [500, std.size('caption', 0, 500)] }),
});

const replyInput = z.object({
  reply: text({ notBlank: std.blank('reply'), max: [2000, std.size('reply', 0, 2000)] }),
});

const actionInput = z.object({ note: optText({ max: [500, std.size('note', 0, 500)] }) });

const passwordInput = z.object({
  currentPassword: text({ notBlank: 'Mật khẩu hiện tại không được để trống' }),
  newPassword: text({
    notBlank: 'Mật khẩu mới không được để trống',
    min: [6, 'Mật khẩu mới phải từ 6 đến 72 ký tự'],
    max: [72, 'Mật khẩu mới phải từ 6 đến 72 ký tự'],
  }),
});

/** PartnerHomestayDetailDto — không khai báo ràng buộc; kiểm tra nghiệp vụ nằm trong service. Trường chỉ-đọc bị bỏ qua. */
const homestayShape = {
  id: lenient,
  code: str,
  slug: str,
  name: str,
  description: str,
  contactPhone: str,
  contactEmail: str,
  reviewVideoUrl: str,
  regionName: str,
  regionId: lenient,
  address: str,
  latitude: lenient,
  longitude: lenient,
  googleMapLink: str,
  facebookUrl: str,
  accessNote: str,
  coverImageUrl: str,
  galleryUrls: z.array(z.string()).nullish(),
  amenities: z.array(z.string()).nullish(),
  otherAmenities: str,
  checkInFrom: str,
  checkOutUntil: str,
  processingStartTime: str,
  processingEndTime: str,
  houseRules: str,
  cancellationPolicy: str,
  policyName: str,
  freeCancelCutoffHours: lenient,
  refundOnLateCancel: enumOr(REFUND_TYPES),
  surchargeNote: str,
  childrenPolicy: str,
  petsPolicy: str,
  viewHighlight: str,
  suitability: str,
  visibility: enumOr(PLACE_VISIBILITIES),
  operationStatus: enumOr(PLACE_OPERATION_STATUSES),
};
const homestayDto = z.object(homestayShape);

const statusInput = z.object({
  visibility: enumOr(PLACE_VISIBILITIES),
  operationStatus: enumOr(PLACE_OPERATION_STATUSES),
  reason: str,
});

const transferInput = z.object({ targetProviderId: lenient });

const onboardRequest = z.object({
  // @NotNull: thiếu → "Dữ liệu không hợp lệ: homestay must not be null".
  homestay: z.object(homestayShape, whenMissing(std.nul('homestay'))),
  photos: each('photos', photoRef, { max: [30, std.size('photos', 0, 30)] }),
  rooms: each(
    'rooms',
    (path) => z.object({ room: roomInput(`${path}.room`), photos: each(`${path}.photos`, photoRef, { max: [30, std.size(`${path}.photos`, 0, 30)] }) }),
    { max: [20, std.size('rooms', 0, 20)] },
  ),
  submit: flag,
});

const onboardInput = (raw: unknown): onboarding.OnboardRequest => parseBody(onboardRequest, raw) as unknown as onboarding.OnboardRequest;

// ---- Tiện ích -----------------------------------------------------------------------------------------------------------------------

const principalOf = (req: Request) => req.principal;
const startEnd = (req: Request) => ({
  start: required(dateParam(req.query.startDate)),
  end: required(dateParam(req.query.endDate)),
});

/** Thao tác lưu: đã ghi (200 + dữ liệu) hoặc chờ Admin duyệt (202 + thông tin yêu cầu). */
function respond<T>(res: import('express').Response, outcome: changeRequests.Outcome<T>): void {
  if (outcome.pending) res.status(202).json(outcome.pending);
  else res.json(outcome.saved);
}

// ---- Tài khoản ---------------------------------------------------------------------------------------------------------------------

partnerRouter.patch(`${BASE}/account/password`, partner, async (req, res) => {
  const body = parseBody(passwordInput, req.body);
  await misc.changePartnerPassword(req.principal?.accountId ?? null, body.currentPassword, body.newPassword);
  res.json({ message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' });
});

// ---- Tổng quan ---------------------------------------------------------------------------------------------------------------------

partnerRouter.get(`${BASE}/dashboard/summary`, plain, async (req, res) => {
  res.json(await dashboard.getDashboardSummary(principalOf(req), intParam(req.query.year), intParam(req.query.month), intParam(req.query.homestayId)));
});

// ---- Đơn đặt phòng -----------------------------------------------------------------------------------------------------------------

const providerIdOf = (req: Request): number | null => (req.principal?.role === 'PROVIDER' ? (req.principal.providerId ?? null) : null);

partnerRouter.get(`${BASE}/bookings`, partner, async (req, res) => {
  const status = enumParam(req.query.status, BOOKING_STATUSES);
  const checkInFrom = dateParam(req.query.checkInFrom);
  const checkInTo = dateParam(req.query.checkInTo);
  const createdFrom = dateParam(req.query.createdFrom);
  const createdTo = dateParam(req.query.createdTo);
  const page = intParamOr(req.query.page, 0);
  const size = intParamOr(req.query.size, 20);
  const providerId = providerIdOf(req);
  if (providerId == null) {
    res.status(403).end();
    return;
  }
  const result = await bookingAdmin.search({
    statuses: status ? [status] : null,
    keyword: strParam(req.query.keyword),
    providerId,
    checkInFrom,
    checkInTo,
    createdFrom,
    createdTo,
    sortBy: strParam(req.query.sortBy) ?? 'createdAt',
    sortDir: strParam(req.query.sortDir) ?? 'desc',
    page,
    size,
  });
  res.json(partnerBookings.rows(result));
});

partnerRouter.get(`${BASE}/bookings/summary`, partner, async (req, res) => {
  const providerId = providerIdOf(req);
  if (providerId == null) {
    res.status(403).end();
    return;
  }
  res.json(await bookingAdmin.countByStatus(providerId));
});

partnerRouter.get(`${BASE}/bookings/:id`, partner, async (req, res) => {
  res.json(await partnerBookings.detail(principalOf(req), pathId(req)));
});

const BOOKING_ACTIONS: Array<[string, Action]> = [
  ['confirm', 'CONFIRM'],
  ['reject', 'REJECT'],
  ['pay', 'PAY'],
  ['cancel', 'CANCEL'],
  ['check-in', 'CHECK_IN'],
];
for (const [path, action] of BOOKING_ACTIONS) {
  partnerRouter.post(`${BASE}/bookings/:id/${path}`, partner, async (req, res) => {
    const raw = optionalBody(req);
    const input = raw === undefined ? undefined : parseBody(actionInput, raw);
    res.json(await partnerBookings.act(principalOf(req), pathId(req), action, input?.note));
  });
}

// ---- Lịch tổng hợp (một lượt gọi) -------------------------------------------------------------------------------------------------

partnerRouter.get(`${BASE}/calendar`, plain, async (req, res) => {
  const { start, end } = startEnd(req);
  res.json(await units.bootstrap(principalOf(req), longListParam(req.query.prefer), start, end));
});

// ---- Yêu cầu thay đổi --------------------------------------------------------------------------------------------------------------

partnerRouter.get(`${BASE}/change-requests`, partner, async (req, res) => {
  res.json(
    await changeRequests.listForPartner(
      principalOf(req),
      enumParam(req.query.status, CHANGE_REQUEST_STATUSES),
      intParam(req.query.placeId),
      intParamOr(req.query.page, 0),
      intParamOr(req.query.size, 20),
    ),
  );
});

partnerRouter.delete(`${BASE}/change-requests/:id`, partner, async (req, res) => {
  res.json(await changeRequests.cancelRequest(principalOf(req), pathId(req)));
});

// ---- Địa chỉ → tọa độ --------------------------------------------------------------------------------------------------------------

partnerRouter.get(`${BASE}/geocode`, partner, async (req, res) => {
  const address = strParam(req.query.address);
  if (address === undefined) throw new BadParamError();
  if (address.trim() === '' || address.trim().length < 5 || address.length > 500) throw new HttpError(400, 'Địa chỉ phải có từ 5 đến 500 ký tự.');
  rateLimiter.check(req.ip, 'partner-geocode', 30, 10 * 60 * 1000);
  const found = await geocoding.geocode(address);
  if (!found) throw new HttpError(404, 'Không tìm thấy tọa độ cho địa chỉ này. Hãy ghi rõ xã/huyện/tỉnh hoặc nhập tọa độ thủ công.');
  res.json(found);
});

// ---- Homestay ----------------------------------------------------------------------------------------------------------------------

partnerRouter.get(HS, homestay, async (req, res) => {
  res.json(await homestays.getHomestays(principalOf(req), strParam(req.query.keyword), strParam(req.query.visibility), strParam(req.query.operationStatus)));
});

// Các đường dẫn cố định đứng trước "/:id".
partnerRouter.get(`${HS}/names`, homestay, async (req, res) => {
  res.json(await homestays.names(principalOf(req)));
});

partnerRouter.get(`${HS}/options`, homestay, async (req, res) => {
  res.json(await homestays.options(principalOf(req)));
});

partnerRouter.post(`${HS}/onboard/check`, homestay, async (req, res) => {
  await onboarding.check(principalOf(req), onboardInput(req.body));
  res.status(204).end();
});

partnerRouter.post(`${HS}/onboard`, homestay, async (req, res) => {
  res.status(201).json(await onboarding.onboard(principalOf(req), onboardInput(req.body)));
});

partnerRouter.post(HS, homestay, async (req, res) => {
  res.status(201).json(await homestays.createHomestay(principalOf(req), parseBody(homestayDto, req.body) as homestays.HomestayDto));
});

partnerRouter.get(`${HS}/:id`, homestay, async (req, res) => {
  res.json(await homestays.getHomestayDetail(principalOf(req), pathId(req)));
});

partnerRouter.get(`${HS}/:id/checkin-qr`, homestay, async (req, res) => {
  res.json(await misc.qrForPartner(principalOf(req), pathId(req)));
});

partnerRouter.put(`${HS}/:id`, homestay, async (req, res) => {
  respond(res, await changeRequests.saveHomestay(principalOf(req), pathId(req), parseBody(homestayDto, req.body) as homestays.HomestayDto));
});

partnerRouter.patch(`${HS}/:id/status`, homestay, async (req, res) => {
  respond(res, await changeRequests.updateStatus(principalOf(req), pathId(req), parseBody(statusInput, req.body)));
});

partnerRouter.post(`${HS}/:id/transfer-request`, homestay, async (req, res) => {
  const body = parseBody(transferInput, req.body);
  res.status(202).json(await changeRequests.requestTransfer(principalOf(req), pathId(req), body.targetProviderId));
});

// ---- Lịch phòng của Homestay -------------------------------------------------------------------------------------------------------

partnerRouter.get(`${HS}/:placeId/units`, partner, async (req, res) => {
  const { start, end } = startEnd(req);
  res.json(await units.units(principalOf(req), pathId(req, 'placeId'), start, end));
});

partnerRouter.get(`${HS}/:placeId/availability`, partner, async (req, res) => {
  const { start, end } = startEnd(req);
  res.json(await roomService.availability(principalOf(req), pathId(req, 'placeId'), start, end));
});

/** Trả về số ngày-loại phòng đã có đơn trong khoảng bị đóng (các đơn đó vẫn giữ nguyên). */
partnerRouter.put(`${HS}/:placeId/calendar-block`, partner, async (req, res) => {
  const body = parseBody(blockInput, req.body);
  res.json({ bookedDays: await roomService.blockHomestay(principalOf(req), pathId(req, 'placeId'), body) });
});

partnerRouter.get(`${HS}/:placeId/change-log`, partner, async (req, res) => {
  res.json(await roomService.changeLog(principalOf(req), pathId(req, 'placeId')));
});

// ---- Loại phòng ----------------------------------------------------------------------------------------------------------------------

const ROOMS = `${HS}/:placeId/rooms`;
const placeIdOf = (req: Request) => pathId(req, 'placeId');

partnerRouter.get(ROOMS, partner, async (req, res) => {
  res.json(await roomService.list(principalOf(req), placeIdOf(req)));
});

partnerRouter.get(`${ROOMS}/options`, partner, async (req, res) => {
  res.json(await roomService.options(principalOf(req)));
});

partnerRouter.post(ROOMS, partner, async (req, res) => {
  const body = parseBody(roomInput(''), req.body) as roomService.RoomInput;
  respond(res, await changeRequests.saveRoom(principalOf(req), placeIdOf(req), null, body));
});

partnerRouter.put(`${ROOMS}/:id`, partner, async (req, res) => {
  const body = parseBody(roomInput(''), req.body) as roomService.RoomInput;
  respond(res, await changeRequests.saveRoom(principalOf(req), placeIdOf(req), pathId(req), body));
});

partnerRouter.get(`${ROOMS}/:id/prices`, partner, async (req, res) => {
  res.json(await roomService.prices(principalOf(req), placeIdOf(req), pathId(req)));
});

partnerRouter.post(`${ROOMS}/:id/prices`, partner, async (req, res) => {
  const body = parseBody(priceInput, req.body);
  respond(res, await changeRequests.savePrice(principalOf(req), placeIdOf(req), pathId(req), null, body));
});

partnerRouter.put(`${ROOMS}/:id/prices/:priceId`, partner, async (req, res) => {
  const body = parseBody(priceInput, req.body);
  respond(res, await changeRequests.savePrice(principalOf(req), placeIdOf(req), pathId(req), pathId(req, 'priceId'), body));
});

partnerRouter.delete(`${ROOMS}/:id/prices/:priceId`, partner, async (req, res) => {
  const pending = await changeRequests.deletePrice(principalOf(req), placeIdOf(req), pathId(req), pathId(req, 'priceId'));
  if (pending == null) res.status(200).end();
  else res.status(202).json(pending);
});

partnerRouter.get(`${ROOMS}/:id/calendar`, partner, async (req, res) => {
  const { start, end } = startEnd(req);
  res.json(await roomService.calendarOf(principalOf(req), placeIdOf(req), pathId(req), start, end));
});

partnerRouter.get(`${ROOMS}/:id/upcoming-stays`, partner, async (req, res) => {
  res.json(await roomService.upcomingStays(principalOf(req), placeIdOf(req), pathId(req)));
});

partnerRouter.put(`${ROOMS}/:id/locks`, partner, async (req, res) => {
  const body = parseBody(lockInput, req.body);
  res.json(await roomService.lockRooms(principalOf(req), placeIdOf(req), pathId(req), body));
});

partnerRouter.put(`${ROOMS}/:id/calendar`, partner, async (req, res) => {
  const body = parseBody(inventoryInput, req.body);
  await roomService.inventory(principalOf(req), placeIdOf(req), pathId(req), body);
  res.status(200).end();
});

partnerRouter.put(`${ROOMS}/:id/units/:unitNo`, partner, async (req, res) => {
  const body = parseBody(unitInput, req.body);
  res.json(await units.setUnit(principalOf(req), placeIdOf(req), pathId(req), pathId(req, 'unitNo'), body));
});

partnerRouter.get(`${ROOMS}/:id/quote`, partner, async (req, res) => {
  const { start, end } = startEnd(req);
  const roomCount = required(intParam(req.query.roomCount));
  const guestCount = required(intParam(req.query.guestCount));
  res.json(await roomService.quote(principalOf(req), placeIdOf(req), pathId(req), start, end, roomCount, guestCount));
});

// ---- Dịch vụ thêm của Homestay -------------------------------------------------------------------------------------------------------

const OFFERS = `${HS}/:placeId/services`;

partnerRouter.get(OFFERS, partner, async (req, res) => {
  res.json(await misc.listOffers(principalOf(req), placeIdOf(req)));
});

partnerRouter.post(OFFERS, partner, async (req, res) => {
  res.json(await misc.saveOffer(principalOf(req), placeIdOf(req), null, parseBody(offerInput, req.body)));
});

partnerRouter.put(`${OFFERS}/:id`, partner, async (req, res) => {
  res.json(await misc.saveOffer(principalOf(req), placeIdOf(req), pathId(req), parseBody(offerInput, req.body)));
});

// ---- Ảnh -----------------------------------------------------------------------------------------------------------------------------

/** Lấy cấu hình upload của nhà cung cấp lưu trữ đang bật (Cloudinary: chữ ký; Supabase: upload qua backend). */
partnerRouter.post(`${BASE}/media/direct-upload`, partner, async (req, res) => {
  res.json(await media.directUpload(principalOf(req)));
});

/** Upload ảnh qua backend (ACTIVE_MEDIA_PROVIDER=SUPABASE): trả {imageId, url} để gắn vào Homestay / loại phòng. */
partnerRouter.post(`${BASE}/media/upload-image`, partner, upload.single('file'), async (req, res) => {
  if (!req.file) throw new BadParamError();
  res.json(await media.uploadThroughBackend(principalOf(req), req.file));
});

partnerRouter.get(`${HS}/:placeId/media`, partner, async (req, res) => {
  res.json(await media.placeMedia(principalOf(req), placeIdOf(req)));
});

partnerRouter.post(`${HS}/:placeId/media`, partner, async (req, res) => {
  res.json(await media.attachToPlace(principalOf(req), placeIdOf(req), parseBody(attachInput, req.body)));
});

partnerRouter.put(`${HS}/:placeId/media/:mediaId/cover`, partner, async (req, res) => {
  res.json(await media.setPlaceCover(principalOf(req), placeIdOf(req), pathId(req, 'mediaId')));
});

partnerRouter.delete(`${HS}/:placeId/media/:mediaId`, partner, async (req, res) => {
  res.json(await media.removeFromPlace(principalOf(req), placeIdOf(req), pathId(req, 'mediaId')));
});

partnerRouter.get(`${ROOMS}/:roomId/media`, partner, async (req, res) => {
  res.json(await media.roomMedia(principalOf(req), placeIdOf(req), pathId(req, 'roomId')));
});

partnerRouter.post(`${ROOMS}/:roomId/media`, partner, async (req, res) => {
  res.json(await media.attachToRoom(principalOf(req), placeIdOf(req), pathId(req, 'roomId'), parseBody(attachInput, req.body)));
});

partnerRouter.put(`${ROOMS}/:roomId/media/:mediaId/cover`, partner, async (req, res) => {
  res.json(await media.setRoomCover(principalOf(req), placeIdOf(req), pathId(req, 'roomId'), pathId(req, 'mediaId')));
});

partnerRouter.delete(`${ROOMS}/:roomId/media/:mediaId`, partner, async (req, res) => {
  res.json(await media.removeFromRoom(principalOf(req), placeIdOf(req), pathId(req, 'roomId'), pathId(req, 'mediaId')));
});

// ---- Đánh giá -----------------------------------------------------------------------------------------------------------------------

partnerRouter.get(`${BASE}/reviews`, partner, async (req, res) => {
  res.json(await misc.listReviews(principalOf(req), intParam(req.query.placeId)));
});

partnerRouter.put(`${BASE}/reviews/:id/reply`, partner, async (req, res) => {
  res.json(await misc.replyToReview(principalOf(req), pathId(req), parseBody(replyInput, req.body).reply));
});

partnerRouter.delete(`${BASE}/reviews/:id/reply`, partner, async (req, res) => {
  res.json(await misc.removeReviewReply(principalOf(req), pathId(req)));
});

// ---- Thông báo -----------------------------------------------------------------------------------------------------------------------

/** /api/v1/partner/** cho cả ADMIN — thông báo NCC thì chỉ tài khoản NCC (Admin có hộp thông báo riêng). */
function providerAccountId(req: Request): number {
  const p = req.principal;
  if (!p || p.role !== 'PROVIDER' || p.accountId == null) throw new HttpError(403, 'Chỉ nhà cung cấp được sử dụng chức năng này.');
  return p.accountId;
}

const NOTIFICATIONS = `${BASE}/notifications`;

/**
 * Chuông thông báo của cổng NCC trong MỘT lượt gọi (làm mới mỗi 20 giây): thông báo đơn đặt phòng + các yêu cầu chỉnh sửa gần
 * nhất của NCC. Lỗi đọc yêu cầu chỉnh sửa không làm mất thông báo đơn (changes = null).
 */
partnerRouter.get(`${NOTIFICATIONS}/inbox`, plain, async (req, res) => {
  const limit = intParamOr(req.query.changeLimit, 20);
  const notices = await notifications.feed(providerAccountId(req));
  let recent: unknown = null;
  try {
    recent = (await changeRequests.listForPartner(principalOf(req), undefined, undefined, 0, Math.max(1, Math.min(limit, 50)))).content;
  } catch {
    recent = null;
  }
  res.json({ feed: notices, changes: recent });
});

mountNotificationRoutes(partnerRouter, NOTIFICATIONS, [plain], providerAccountId, '/partner/bookings');

// ---- Đăng ký nhà cung cấp (/api/v1/auth/provider) ---------------------------------------------------------------------------------

/** UC-NCC-08: NCC tự đăng ký, hồ sơ chờ Admin duyệt. Cùng kiểu lỗi 'partner' (ProviderApplicationController thuộc PartnerOperationErrors). */
export const providerApplicationRouter = Router();

const registerInput = z.object({
  businessName: text({ notBlank: std.blank('businessName'), max: [255, std.size('businessName', 0, 255)] }),
  contactName: text({ notBlank: std.blank('contactName'), max: [255, std.size('contactName', 0, 255)] }),
  contactPhone: text({
    notBlank: std.blank('contactPhone'),
    pattern: [/^(0|\+84)[35789][0-9]{8}$/, 'Số điện thoại không đúng định dạng (VD: 0912345678 hoặc +84912345678).'],
  }),
  contactEmail: optText({ max: [255, std.size('contactEmail', 0, 255)], pattern: [/^$|^[^\s@]+@[^\s@]+$/, std.email('contactEmail')] }),
  password: text({ notBlank: std.blank('password'), min: [8, std.size('password', 8, 72)], max: [72, std.size('password', 8, 72)] }),
  address: text({ notBlank: std.blank('address'), max: [500, std.size('address', 0, 500)] }),
  businessLicenseNo: str,
  description: optText({ max: [5000, std.size('description', 0, 5000)] }),
  serviceType: z.enum(PROVIDER_SERVICE_TYPES).nullish(),
  details: z.record(z.unknown()).nullish(),
});

const applicationStatusInput = z.object({
  applicationId: z.number(whenMissing(std.nul('applicationId'))).int(),
  contactPhone: text({ notBlank: std.blank('contactPhone'), pattern: [/^[+0-9() .-]{8,20}$/, 'không hợp lệ'] }),
});

providerApplicationRouter.post('/api/v1/auth/provider/register', partner, async (req, res) => {
  const body = parseBody(registerInput, req.body);
  rateLimiter.check(req.ip, 'provider-register', 5, 60 * 60 * 1000);
  res.status(201).json(await providerApplications.register(body));
});

/** UC-NCC-01: xem trạng thái hồ sơ (POST để số điện thoại không nằm trên URL/log). */
providerApplicationRouter.post('/api/v1/auth/provider/application-status', partner, async (req, res) => {
  const body = parseBody(applicationStatusInput, req.body);
  rateLimiter.check(req.ip, 'provider-application-status', 20, 60 * 60 * 1000);
  res.json(await providerApplications.status(body.applicationId, body.contactPhone));
});
