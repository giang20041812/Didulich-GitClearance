import { Router, type Request } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { errorStyle } from '../lib/errorHandler.js';
import { BadParamError, dateParam, intParamOr, optionalBody, parseBody, pathId, strParam } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { upload } from '../lib/upload.js';
import { date, int, optDate, optInt, optText, text, whenMissing } from '../lib/validation.js';
import * as accounts from '../repositories/accountRepo.js';
import * as rateLimiter from '../security/rateLimiter.js';
import * as bookingService from '../services/bookingService.js';
import type { BookingResponse, Credentials } from '../services/bookingService.js';
import { MAX_TOKEN_LENGTH } from '../services/bookingAccessTokens.js';
import * as journeyService from '../services/journeyService.js';
import * as mail from '../services/mailService.js';
import * as media from '../services/mediaStorage.js';
import * as notifications from '../services/notificationService.js';
import * as stayService from '../services/bookingStayService.js';
import { normalizeStops, stopSchema } from './traveler.js';

/**
 * API đặt phòng công khai. Mọi thao tác đọc / ghi theo mã đơn (/{bookingCode}/**) yêu cầu chứng minh quyền với đơn: header
 * X-Booking-Token (mã truy cập trả một lần lúc đặt) HOẶC JWT của khách du lịch đã đặt đơn. Riêng xem chi tiết còn cho tra cứu
 * CHỈ ĐỌC bằng mã đơn + SĐT đặt phòng (giới hạn tần suất theo mã đơn). Sai / thiếu quyền và không tồn tại đều trả cùng một 404.
 *
 * Giới hạn tần suất: request qua rewrite "/api" của frontend có thể đến với IP của hạ tầng thay vì IP người dùng (mọi người
 * chung một IP). Vì vậy giới hạn chặt đặt theo khóa riêng (mã đơn, SĐT, tài khoản khách), giới hạn theo IP chỉ là trần cao
 * chặn lạm dụng hàng loạt.
 */
export const bookingRouter = Router();
bookingRouter.use('/api/public/bookings', errorStyle('booking'));

export const ACCESS_TOKEN_HEADER = 'X-Booking-Token';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

// ---- Bean Validation của các DTO ------------------------------------------------------------------------------------------

const PHONE_PATTERN = /^(?:(?:\+84|\+840|0)[35789][0-9]{8}|\+(?!84)[1-9][0-9]{6,14})$/;
/** Rỗng = không có email; có thì phải đúng dạng ten@mien.duoi (đuôi 2-24 chữ cái). */
const EMAIL_PATTERN = /^$|^[^\s@]+@[^\s@]+\.[A-Za-z]{2,24}$/;

const roomSelectionSchema = z.object({
  roomTypeId: int({ required: 'roomTypeId không được để trống' }),
  roomCount: int({ required: 'roomCount không được để trống', min: [1, 'roomCount tối thiểu là 1'], max: [20, 'Mỗi đơn đặt tối đa 20 phòng'] }),
});

const roomsField = z.array(roomSelectionSchema.nullable()).max(10, 'Mỗi đơn tối đa 10 loại phòng').nullish();

const createBookingSchema = z.object({
  placeId: int({ required: 'placeId không được để trống' }),
  rooms: roomsField,
  roomTypeId: z.number().nullish(),
  checkIn: date('checkIn không được để trống'),
  checkOut: date('checkOut không được để trống'),
  roomCount: optInt({ min: [1, 'roomCount tối thiểu là 1'], max: [20, 'Mỗi đơn đặt tối đa 20 phòng'] }),
  guestCount: int({ required: 'guestCount không được để trống', min: [1, 'guestCount tối thiểu là 1'], max: [100, 'Mỗi đơn tối đa 100 khách'] }),
  guestName: text({ notBlank: 'guestName không được để trống', max: [255, 'Họ tên khách tối đa 255 ký tự'] }),
  guestPhone: text({
    notBlank: 'Vui lòng nhập số điện thoại',
    max: [32, 'Số điện thoại tối đa 32 ký tự'],
    pattern: [PHONE_PATTERN, 'Số điện thoại không hợp lệ. Số Việt Nam gồm 10 chữ số, VD: 0912 345 678.'],
  }),
  guestEmail: optText({ max: [255, 'Email tối đa 255 ký tự'], pattern: [EMAIL_PATTERN, 'Email không hợp lệ, VD: ten@gmail.com'] }),
  guestNote: optText({ max: [1000, 'Ghi chú tối đa 1000 ký tự'] }),
  specialRequests: z
    .array(optText({ max: [255, 'Mỗi yêu cầu đặc biệt tối đa 255 ký tự'] }))
    .max(20, 'Tối đa 20 yêu cầu đặc biệt')
    .nullish(),
  journey: z
    .object({
      journeyId: z.number().nullish(),
      title: z.string().nullish(),
      stops: z.array(stopSchema).nullish(),
    })
    .nullish(),
  journeyId: z.number().nullish(),
});

const updateBookingSchema = z.object({
  guestName: optText({ max: [255, 'Họ tên khách tối đa 255 ký tự'] }),
  guestPhone: optText({ max: [32, 'Số điện thoại tối đa 32 ký tự'] }),
  guestEmail: optText({ max: [255, 'Email tối đa 255 ký tự'] }),
  guestNote: optText({ max: [1000, 'Ghi chú tối đa 1000 ký tự'] }),
  checkIn: optDate(),
  checkOut: optDate(),
  rooms: roomsField,
  roomCount: optInt({ min: [1, 'Số lượng phòng tối thiểu là 1'], max: [20, 'Mỗi đơn đặt tối đa 20 phòng'] }),
  guestCount: optInt({ min: [1, 'Số lượng khách tối thiểu là 1'] }),
  reason: optText({ max: [500, 'Lý do tối đa 500 ký tự'] }),
});

const lookupSchema = z.object({
  bookings: z
    .array(
      z.object(
        {
          code: text({ notBlank: 'Thiếu mã đơn', max: [32, 'Mã đơn không hợp lệ'] }),
          token: text({ notBlank: 'Thiếu mã truy cập đơn', max: [MAX_TOKEN_LENGTH, 'Mã truy cập đơn không hợp lệ'] }),
        },
        whenMissing('Thiếu thông tin đơn'),
      ),
      whenMissing('Danh sách đơn không được để trống'),
    )
    .max(50, 'Tra cứu tối đa 50 đơn mỗi lần'),
});

const reviewSchema = z.object({
  rating: int({ required: 'Số sao đánh giá không được để trống', min: [1, 'Đánh giá tối thiểu là 1 sao'], max: [5, 'Đánh giá tối đa là 5 sao'] }),
  content: text({ notBlank: 'Nội dung nhận xét không được để trống', min: [5, 'Nội dung đánh giá phải từ 5 đến 2000 ký tự'], max: [2000, 'Nội dung đánh giá phải từ 5 đến 2000 ký tự'] }),
  images: z.array(optText({ max: [1000, 'Đường dẫn ảnh quá dài'] })).max(8, 'Tối đa 8 hình ảnh cho một đánh giá').nullish(),
});

// ---- Tiện ích dùng chung ---------------------------------------------------------------------------------------------------

/** Tài khoản của phiên trang khách (vai trò TRAVELER), còn tồn tại và đang hoạt động; null nếu không có. */
async function currentTraveler(req: Request): Promise<accounts.AccountWithProvider | null> {
  const principal = req.principal;
  if (!principal || principal.role !== 'TRAVELER' || !principal.identifier || principal.identifier.trim() === '') return null;
  const account = await accounts.findByIdentifier(principal.identifier.trim());
  return account && account.status === 'ACTIVE' ? account : null;
}

/** Email tài khoản khách chỉ khi đã xác minh (Google / OTP) — email tự khai lúc đăng ký không chứng minh gì. */
const verifiedEmail = (traveler: accounts.AccountRow | null): string | null => (traveler && traveler.emailVerifiedAt != null ? traveler.email : null);

/** Mã truy cập trong header + khách du lịch đang đăng nhập (nếu có) — service quyết định có quyền với đơn hay không. */
async function credentials(req: Request): Promise<Credentials> {
  let token = req.header(ACCESS_TOKEN_HEADER) ?? null;
  if (token != null && (token.trim() === '' || token.length > MAX_TOKEN_LENGTH)) token = null;
  const traveler = await currentTraveler(req);
  return { accessToken: token != null ? token.trim() : null, travelerId: traveler ? traveler.id : null, travelerEmail: verifiedEmail(traveler) };
}

const normalizeKey = (value: string | null | undefined): string => (value == null ? '' : value.trim().toUpperCase());

/** SĐT chỉ còn chữ số, +84/84 → 0; null nếu không có. */
function normalizePhoneKey(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits === '' ? null : digits;
}

/** "+840912…" (khách gõ cả số 0 đầu sau mã +84) → "+84912…"; giữ nguyên các dạng khác. */
export function normalizeGuestPhone(phone: string): string {
  const clean = phone.trim().replace(/[\s.()-]/g, '');
  return clean.startsWith('+840') ? `+84${clean.slice(4)}` : clean;
}

const code = (req: Request): string => String(req.params.bookingCode);

const requireDate = (raw: unknown): string => {
  const d = dateParam(raw);
  if (d === undefined) throw new BadParamError();
  return d;
};

// ---- Sau khi đơn đã commit: email NCC, thông báo khách, lịch trình --------------------------------------------------------

/**
 * Báo NCC qua email khi có đơn mới / khách sửa đơn. Chạy SAU khi transaction đã commit: gửi mail mất tới vài giây không được
 * giữ connection của pool nhỏ. Lỗi soạn / gửi không ảnh hưởng đơn; chưa cấu hình mail thì bỏ qua, không truy vấn gì thêm.
 */
async function notifyPartner(booking: BookingResponse, updated: boolean): Promise<void> {
  if (!mail.isConfigured()) return;
  try {
    await mail.send(updated ? await bookingService.partnerUpdatedBookingMail(booking) : await bookingService.partnerNewBookingMail(booking));
  } catch (err) {
    logger.warn('Không gửi được email báo đơn cho NCC', { bookingCode: booking.bookingCode, error: (err as Error).message });
  }
}

/** Thông báo "Đã đặt phòng thành công" vào chuông của khách. Lỗi ghi thông báo không được làm mất đơn vừa tạo. */
async function notifyGuest(booking: BookingResponse): Promise<void> {
  try {
    await notifications.notifyBookingCreated({
      id: booking.id,
      bookingCode: booking.bookingCode,
      placeName: booking.placeName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      totalAmount: booking.totalAmount,
      confirmedAt: booking.confirmedAt,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
    });
  } catch (err) {
    logger.warn('Không tạo được thông báo đặt phòng cho khách', { bookingCode: booking.bookingCode, error: (err as Error).message });
  }
}

/**
 * Khách đặt phòng cho một lịch trình đã lưu (chọn chỗ ở từ ô "Chỗ ở" của lịch trình): gắn đơn vào lịch trình đó. Giao dịch
 * riêng sau khi đơn đã commit — gắn lỗi thì đơn vẫn giữ, phản hồi kèm câu báo để khách gắn lại ở đơn.
 */
async function attachJourney(identifier: string, response: BookingResponse, journeyId: number): Promise<void> {
  try {
    response.journeyId = (await journeyService.linkBooking(identifier, journeyId, response.bookingCode)).id;
  } catch (err) {
    if (err instanceof HttpError) {
      response.journeyWarning = `Đơn đã đặt nhưng chưa gắn được vào lịch trình: ${err.reason} Bạn có thể gắn lại ở tab "Lịch trình" của đơn.`;
    } else {
      logger.warn('Không gắn được đơn vào lịch trình', { bookingCode: response.bookingCode, journeyId, error: (err as Error).message });
      response.journeyWarning = 'Đơn đã đặt nhưng chưa gắn được vào lịch trình. Bạn có thể gắn lại ở tab "Lịch trình" của đơn.';
    }
  }
}

/**
 * Lịch trình khách lên ở trang homestay, gửi kèm khi đặt phòng: lưu cùng đơn (một lần bấm). Lịch trình lỗi (vd điểm đến vừa
 * đóng) thì đơn vẫn giữ, phản hồi kèm câu báo để khách lưu lại sau.
 */
async function saveJourney(identifier: string, response: BookingResponse, journey: journeyService.BookingJourneyInput): Promise<void> {
  try {
    response.journeyId = await journeyService.saveWithBooking(identifier, response.bookingCode, journey);
  } catch (err) {
    if (err instanceof HttpError) {
      response.journeyWarning = `Đơn đã đặt nhưng lịch trình chưa lưu được: ${err.reason} Bạn có thể lên lại lịch trình ở tab "Lịch trình" của đơn.`;
    } else {
      logger.warn('Không lưu được lịch trình kèm đơn', { bookingCode: response.bookingCode, error: (err as Error).message });
      response.journeyWarning = 'Đơn đã đặt nhưng lịch trình chưa lưu được. Bạn có thể lên lại lịch trình ở tab "Lịch trình" của đơn.';
    }
  }
}

// ---- Ảnh đánh giá ----------------------------------------------------------------------------------------------------------

/** Chữ ký tải ảnh đánh giá: chỉ cho người có quyền với đơn đã thanh toán (từ ngày trả phòng), ảnh vào thư mục riêng của đơn. */
bookingRouter.get('/api/public/bookings/:bookingCode/review/upload-config', async (req, res) => {
  rateLimiter.check(req.ip, 'booking-review-upload', 300, HOUR);
  await bookingService.assertReviewMediaUploadAllowed(code(req), await credentials(req));
  // Đếm theo đơn sau khi đã kiểm tra quyền: người không có quyền không làm cạn lượt của chủ đơn.
  rateLimiter.checkKey('booking-review-upload:code', normalizeKey(code(req)), 30, HOUR);
  res.json(media.getReviewImageUploadConfig(`reviews/${code(req).trim()}`));
});

/**
 * Upload ảnh đánh giá qua backend (ACTIVE_MEDIA_PROVIDER=SUPABASE): cùng quyền như upload-config (mã truy cập đơn / tài khoản
 * khách đã đặt đơn, đơn đã thanh toán), ảnh vào thư mục riêng của đơn.
 */
bookingRouter.post('/api/public/bookings/:bookingCode/review/image', upload.single('file'), async (req, res) => {
  rateLimiter.check(req.ip, 'booking-review-upload', 300, HOUR);
  await bookingService.assertReviewMediaUploadAllowed(code(req), await credentials(req));
  rateLimiter.checkKey('booking-review-upload:code', normalizeKey(code(req)), 30, HOUR);
  if (!req.file) throw new BadParamError();
  res.status(201).json(await media.uploadReviewImageThroughBackend(req.file, `reviews/${code(req).trim()}`));
});

// ---- Đặt phòng -------------------------------------------------------------------------------------------------------------

bookingRouter.post('/api/public/bookings', async (req, res) => {
  const body = parseBody(createBookingSchema, req.body);
  const principal = req.principal;
  // Admin / NCC được xem trang khách nhưng không được tạo đơn thật bằng tài khoản cổng.
  if (principal && (principal.role === 'ADMIN' || principal.role === 'PROVIDER')) {
    throw new HttpError(403, 'Tài khoản quản trị / nhà cung cấp không thể đặt phòng. Hãy dùng tài khoản khách.');
  }
  // Mỗi đơn giữ tồn kho phòng tới khi Admin / NCC xử lý hoặc khách hủy: chặn tạo hàng loạt đơn làm "kín phòng" giả — 10
  // đơn/giờ cho mỗi SĐT khách và mỗi tài khoản khách; theo IP chỉ là trần cao (IP có thể là của proxy).
  rateLimiter.check(req.ip, 'booking-create', 100, HOUR);
  const input: bookingService.CreateBookingInput = {
    ...body,
    guestPhone: normalizeGuestPhone(body.guestPhone),
    guestEmail: body.guestEmail != null ? body.guestEmail.trim() : body.guestEmail,
    rooms: body.rooms as bookingService.CreateBookingInput['rooms'],
    journey: body.journey as bookingService.CreateBookingInput['journey'],
  };
  const phoneKey = normalizePhoneKey(input.guestPhone);
  if (phoneKey != null) rateLimiter.checkKey('booking-create:phone', phoneKey, 10, HOUR);
  const traveler = await currentTraveler(req);
  if (traveler) rateLimiter.checkKey('booking-create:traveler', String(traveler.id), 10, HOUR);
  // Admin và NCC được báo đơn mới ngay trong createBooking (trong cổng + đẩy ra màn hình sau khi commit).
  const response = await bookingService.createBooking(input, traveler ? traveler.id : null);
  await notifyPartner(response, false);
  await notifyGuest(response);
  if (traveler) {
    const identifier = req.principal!.identifier.trim();
    if (input.journeyId != null) {
      await attachJourney(identifier, response, input.journeyId);
    } else if (input.journey && input.journey.stops && input.journey.stops.length > 0) {
      await saveJourney(identifier, response, {
        journeyId: input.journey.journeyId,
        title: input.journey.title,
        stops: normalizeStops(input.journey.stops as never) as never,
      });
    } else {
      try {
        await journeyService.autoLinkNewBooking(traveler.id, response.bookingCode);
      } catch (err) {
        logger.warn('Không tự gắn lịch trình cho đơn', { bookingCode: response.bookingCode, error: (err as Error).message });
      }
    }
  }
  res.status(201).json(response);
});

/** Đơn của khách du lịch đang đăng nhập — danh tính lấy từ JWT, không nhận email/SĐT từ tham số. */
bookingRouter.get('/api/public/bookings/my-bookings', async (req, res) => {
  const traveler = await currentTraveler(req);
  if (!traveler) {
    res.status(401).end();
    return;
  }
  res.json(await bookingService.findMyBookings(traveler.id, verifiedEmail(traveler)));
});

/**
 * Trạng thái các đơn của khách đang đăng nhập (mã đơn + trạng thái, 1 truy vấn 2 cột). Trình duyệt hỏi vài giây một lần khi
 * khách còn đơn chờ xác nhận — Admin / NCC vừa xác nhận là màn hình của khách tự chuyển tới chi tiết đơn.
 */
bookingRouter.get('/api/public/bookings/my-bookings/statuses', async (req, res) => {
  const traveler = await currentTraveler(req);
  if (!traveler) {
    res.status(401).end();
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(await bookingService.findMyBookingStatuses(traveler.id, verifiedEmail(traveler)));
});

/** Khách không đăng nhập nạp lại các đơn lưu trên thiết bị: mỗi mã đơn phải kèm đúng mã truy cập của đơn. */
bookingRouter.post('/api/public/bookings/lookup', async (req, res) => {
  const body = parseBody(lookupSchema, req.body);
  // Mã truy cập 256 bit không dò được; giới hạn chỉ để chặn spam (trần cao vì IP có thể là của proxy).
  rateLimiter.check(req.ip, 'booking-lookup-token', 300, 10 * MINUTE);
  const tokensByCode = new Map<string, string>();
  for (const item of body.bookings) tokensByCode.set(item.code.trim(), item.token.trim());
  res.json(await bookingService.findBookingsByAccessTokens(tokensByCode));
});

// Lịch trống / báo giá theo loại phòng, homestay (đứng trước "/:bookingCode").
bookingRouter.get('/api/public/bookings/rooms/:roomTypeId/booked-dates', async (req, res) => {
  res.json(await bookingService.getBookedDatesByRoomType(pathId(req, 'roomTypeId'), dateParam(req.query.startDate), dateParam(req.query.endDate)));
});

bookingRouter.get('/api/public/bookings/places/:placeId/booked-dates', async (req, res) => {
  res.json(await bookingService.getBookedDatesByPlace(pathId(req, 'placeId'), dateParam(req.query.startDate), dateParam(req.query.endDate)));
});

bookingRouter.get('/api/public/bookings/rooms/:roomTypeId/check-availability', async (req, res) => {
  const roomTypeId = pathId(req, 'roomTypeId');
  const checkIn = requireDate(req.query.checkIn);
  const checkOut = requireDate(req.query.checkOut);
  const roomCount = intParamOr(req.query.roomCount, 1);
  const excludeCode = strParam(req.query.excludeBookingCode);
  // Chỉ trừ phòng của đơn đang sửa khi người gọi có quyền với đơn đó — không để endpoint này thành công cụ dò mã đơn.
  const exclude = excludeCode && excludeCode.trim() !== '' && (await bookingService.canAccess(excludeCode, await credentials(req))) ? excludeCode.trim() : null;
  res.json(await bookingService.checkAvailability(roomTypeId, checkIn, checkOut, roomCount, exclude));
});

bookingRouter.get('/api/public/bookings/rooms/:roomTypeId/quote', async (req, res) => {
  res.json(
    await bookingService.quote(pathId(req, 'roomTypeId'), requireDate(req.query.checkIn), requireDate(req.query.checkOut), intParamOr(req.query.roomCount, 1), intParamOr(req.query.guestCount, 1)),
  );
});

// ---- Theo mã đơn -----------------------------------------------------------------------------------------------------------

bookingRouter.get('/api/public/bookings/:bookingCode', async (req, res) => {
  const phone = strParam(req.query.phone);
  const phoneLookup = phone !== undefined && phone.trim() !== '';
  if (phoneLookup) {
    // Tra cứu bằng mã đơn + SĐT là bí mật yếu (SĐT dễ đoán): giới hạn mọi lần thử theo MÃ ĐƠN (dò SĐT của một đơn) và một trần
    // cao theo IP (dò hàng loạt mã đơn).
    rateLimiter.check(req.ip, 'booking-lookup-phone', 100, 15 * MINUTE);
    rateLimiter.checkKey('booking-lookup-phone:code', normalizeKey(code(req)), 10, 15 * MINUTE);
  }
  res.json(await bookingService.getBookingByCode(code(req), phoneLookup ? phone! : null, await credentials(req)));
});

bookingRouter.post('/api/public/bookings/:bookingCode/review', async (req, res) => {
  const body = parseBody(reviewSchema, req.body);
  res.status(201).json(await bookingService.createBookingReview(code(req), body, await credentials(req)));
});

bookingRouter.put('/api/public/bookings/:bookingCode/review', async (req, res) => {
  const body = parseBody(reviewSchema, req.body);
  res.json(await bookingService.updateBookingReview(code(req), body, await credentials(req)));
});

bookingRouter.delete('/api/public/bookings/:bookingCode/review', async (req, res) => {
  await bookingService.deleteBookingReview(code(req), await credentials(req));
  res.status(204).end();
});

bookingRouter.get('/api/public/bookings/:bookingCode/review', async (req, res) => {
  const review = await bookingService.getBookingReview(code(req), await credentials(req));
  if (review === null) res.status(200).end();
  else res.json(review);
});

bookingRouter.post('/api/public/bookings/:bookingCode/cancel', async (req, res) => {
  const body = optionalBody(req);
  let reason = typeof body?.reason === 'string' ? body.reason : 'Khách yêu cầu hủy phòng';
  let note = typeof body?.note === 'string' ? body.note : null;
  if (reason.length > 500) reason = reason.slice(0, 500);
  if (note != null && note.length > 1000) note = note.slice(0, 1000);
  res.json(await bookingService.cancelBooking(code(req), reason, note, await credentials(req)));
});

bookingRouter.put('/api/public/bookings/:bookingCode', async (req, res) => {
  const body = parseBody(updateBookingSchema, req.body);
  const response = await bookingService.updateBookingDetails(code(req), body as bookingService.UpdateBookingInput, await credentials(req));
  await notifyPartner(response, true);
  res.json(response);
});

// ---- Nhận phòng bằng mã QR tĩnh dán tại homestay (bookingStayService) ------------------------------------------------------

/**
 *  - GET  /api/public/qr/{mã} — tên / ảnh homestay của mã (trang /qr/{mã} hiện cả khi khách chưa đăng nhập);
 *  - GET  /api/v1/traveler/stays/qr/{mã} — đơn của khách đang đăng nhập tại homestay đó;
 *  - POST /api/v1/traveler/stays/qr/{mã}/check-in — khách bấm "Nhận phòng" (cũng dùng khi khách gõ mã in dưới QR).
 * Mã 8 ký tự ngẫu nhiên (31 ký tự, ~10^12 khả năng) nên không dò được; giới hạn tần suất chỉ để chặn spam.
 */
export const stayRouter = Router();
stayRouter.use(['/api/public/qr', '/api/v1/traveler/stays'], errorStyle('default'));

/** Tài khoản của phiên trang khách, còn tồn tại và đang hoạt động — không thì 401 để trang mời đăng nhập. */
async function stayTraveler(req: Request): Promise<accounts.AccountWithProvider> {
  const principal = req.principal;
  if (!principal || !principal.identifier || principal.identifier.trim() === '') {
    throw new HttpError(401, 'Vui lòng đăng nhập tài khoản đã đặt phòng.');
  }
  if (principal.role !== 'TRAVELER') throw new HttpError(403, 'Chỉ tài khoản khách du lịch mới nhận phòng được.');
  const account = await accounts.findByIdentifier(principal.identifier.trim());
  if (!account || account.status !== 'ACTIVE') throw new HttpError(401, 'Vui lòng đăng nhập tài khoản đã đặt phòng.');
  return account;
}

stayRouter.get('/api/public/qr/:code', async (req, res) => {
  rateLimiter.check(req.ip, 'qr-place', 600, 10 * MINUTE);
  res.setHeader('Cache-Control', 'no-store');
  res.json(await stayService.placeOf(String(req.params.code)));
});

stayRouter.get('/api/v1/traveler/stays/qr/:code', async (req, res) => {
  const traveler = await stayTraveler(req);
  rateLimiter.checkKey('qr-stays:traveler', String(traveler.id), 120, 10 * MINUTE);
  res.setHeader('Cache-Control', 'no-store');
  res.json(await stayService.staysAt(String(req.params.code), traveler.id, verifiedEmail(traveler)));
});

stayRouter.post('/api/v1/traveler/stays/qr/:code/check-in', async (req, res) => {
  const traveler = await stayTraveler(req);
  // Gõ tay mã in dưới QR: chặn thử mã liên tục (mỗi khách 30 lần / 10 phút).
  rateLimiter.checkKey('qr-checkin:traveler', String(traveler.id), 30, 10 * MINUTE);
  const body = optionalBody(req);
  res.json(await stayService.selfCheckIn(String(req.params.code), typeof body?.bookingCode === 'string' ? body.bookingCode : null, traveler.id, verifiedEmail(traveler)));
});
