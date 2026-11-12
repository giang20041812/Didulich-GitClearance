import { one, query, tx } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import { HttpError, IllegalArgumentError } from '../lib/errors.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as reviewRepo from '../repositories/reviewRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import * as passwords from '../security/passwordEncoder.js';
import type { UserPrincipal } from '../security/principal.js';
import * as audit from './auditLogService.js';
import { attachRoomsTo } from './bookingModel.js';
import * as bookings from '../repositories/bookingRepo.js';
import { noticeInfo } from './bookingModel.js';
import * as notifications from './notificationService.js';
import * as stays from './bookingStayService.js';
import { actor as actorOf, owned } from './partnerHomestayService.js';

// ===== Dịch vụ thêm của Homestay (HomestayOfferService) ===============================================================================

export interface OfferInput {
  name: string;
  description?: string | null;
  price?: number | null;
  priceUnit?: string | null;
  active: boolean;
}

const offerDto = (s: rooms.HomestayServiceOfferRow) => ({ id: s.id, name: s.name, description: s.description, price: s.price, priceUnit: s.priceUnit, active: s.active });

export async function listOffers(principal: UserPrincipal | undefined, placeId: number) {
  await owned(placeId, await actorOf(principal, false), false);
  return (await rooms.serviceOffers(placeId, false)).map(offerDto);
}

export async function publicOffers(placeId: number) {
  return (await rooms.serviceOffers(placeId, true)).map(offerDto);
}

export function saveOffer(principal: UserPrincipal | undefined, placeId: number, id: number | null, input: OfferInput) {
  return tx(async () => {
    const account = await actorOf(principal, true);
    await owned(placeId, account, true);
    let current: rooms.HomestayServiceOfferRow | null = null;
    if (id != null) {
      current = await one<rooms.HomestayServiceOfferRow>('SELECT * FROM homestay_service_offer WHERE id = $1', [id]);
      if (!current || current.placeId !== placeId) throw new HttpError(404, 'Không tìm thấy dịch vụ.');
    }
    const fields = { placeId, name: input.name.trim(), description: input.description ?? null, price: input.price ?? null, priceUnit: input.priceUnit ?? null, active: input.active };
    const saved = current ? await updateRow<rooms.HomestayServiceOfferRow>('homestay_service_offer', current.id, fields) : await insertRow<rooms.HomestayServiceOfferRow>('homestay_service_offer', fields);
    return offerDto(saved!);
  });
}

// ===== Phản hồi đánh giá (PartnerReviewService) =======================================================================================

interface PartnerReviewRow {
  id: number;
  placeId: number;
  placeName: string;
  bookingId: number | null;
  bookingCode: string | null;
  guestName: string | null;
  rating: number;
  content: string | null;
  status: string;
  createdAt: string;
  providerReply: string | null;
  providerReplyAt: string | null;
  providerId: number | null;
}

const REVIEW_SELECT = `SELECT r.id, r.place_id, p.name AS place_name, r.booking_id, b.booking_code, b.guest_name, r.rating, r.content, r.status, r.created_at,
    r.provider_reply, r.provider_reply_at, p.provider_id FROM review r JOIN place p ON p.id = r.place_id LEFT JOIN booking b ON b.id = r.booking_id`;

const reviewDto = (r: PartnerReviewRow) => ({
  id: r.id,
  placeId: r.placeId,
  placeName: r.placeName,
  bookingCode: r.bookingCode,
  guestName: r.bookingId == null ? 'Khách du lịch' : r.guestName,
  rating: r.rating,
  content: r.content,
  status: r.status,
  createdAt: r.createdAt,
  providerReply: r.providerReply,
  providerReplyAt: r.providerReplyAt,
});

/** UC-NCC-09 (REV-BR-19): chỉ các đánh giá hợp lệ và đang công khai của Homestay thuộc NCC. */
export async function listReviews(principal: UserPrincipal | undefined, placeId: number | undefined) {
  const account = await actorOf(principal, false);
  const rows = await query<PartnerReviewRow>(
    `${REVIEW_SELECT} WHERE p.provider_id = $1 AND r.status = 'VISIBLE' AND ($2::bigint IS NULL OR p.id = $2) ORDER BY r.created_at DESC`,
    [account.provider!.id, placeId ?? null],
  );
  return rows.map(reviewDto);
}

async function ownedReview(id: number, providerId: number): Promise<PartnerReviewRow> {
  const row = await one<PartnerReviewRow>(`${REVIEW_SELECT} WHERE r.id = $1`, [id]);
  if (!row || row.providerId !== providerId) throw new HttpError(404, 'Không có quyền phản hồi đánh giá này.');
  return row;
}

function requireVisible(review: PartnerReviewRow): void {
  if (review.status !== 'VISIBLE') throw new HttpError(409, 'Đánh giá không còn được công khai. Vui lòng tải lại danh sách.');
}

export function replyToReview(principal: UserPrincipal | undefined, id: number, reply: string) {
  return tx(async () => {
    const account = await actorOf(principal, true);
    const review = await ownedReview(id, account.provider!.id);
    requireVisible(review);
    const text = reply.trim();
    if (text === '') throw new HttpError(400, 'Vui lòng nhập nội dung phản hồi.');
    // Gửi lặp cùng nội dung: không ghi lại lần nữa (không tạo phản hồi trùng).
    if (text === review.providerReply) return reviewDto(review);
    const now = nowLocal();
    await reviewRepo.updateReview(id, { providerReply: text, providerReplyAt: now, providerReplyBy: account.id });
    if (review.bookingId != null) {
      const booking = await bookings.findByIdWithPlace(review.bookingId);
      if (booking) await notifications.notifyReviewReply(noticeInfo(await attachRoomsTo(booking)), text);
    }
    return reviewDto({ ...review, providerReply: text, providerReplyAt: now });
  });
}

export function removeReviewReply(principal: UserPrincipal | undefined, id: number) {
  return tx(async () => {
    const account = await actorOf(principal, true);
    const review = await ownedReview(id, account.provider!.id);
    requireVisible(review);
    await reviewRepo.updateReview(id, { providerReply: null, providerReplyAt: null, providerReplyBy: null });
    return reviewDto({ ...review, providerReply: null, providerReplyAt: null });
  });
}

// ===== Đổi mật khẩu NCC (PartnerAccountService) ========================================================================================

/** BCrypt; hash kiểu cũ (không phải BCrypt) so sánh bằng nhau như bản Java. */
async function matchesPassword(plain: string | null | undefined, stored: string | null | undefined): Promise<boolean> {
  if (plain == null || stored == null) return false;
  if (/^\$2[aby]\$/.test(stored)) return passwords.matches(plain, stored);
  return stored === plain;
}

export function changePartnerPassword(accountId: number | null, currentPassword: string, newPassword: string): Promise<void> {
  return tx(async () => {
    if (accountId == null) throw new IllegalArgumentError('Phiên đăng nhập không hợp lệ.');
    const account = await accounts.findByIdForUpdate(accountId);
    if (!account) throw new IllegalArgumentError('Không tìm thấy tài khoản.');
    if (!(await matchesPassword(currentPassword, account.passwordHash))) throw new IllegalArgumentError('Mật khẩu hiện tại không chính xác.');
    if (await matchesPassword(newPassword, account.passwordHash)) throw new IllegalArgumentError('Mật khẩu mới phải khác mật khẩu hiện tại.');
    await accounts.update(account.id, { passwordHash: await passwords.encode(newPassword), tokenVersion: account.tokenVersion + 1 });
    await audit.recordEvent('PROVIDER', account.id, 'CHANGE_PASSWORD', 'Account', account.id, audit.RESULT_SUCCESS, null, 'NCC tự đổi mật khẩu', { email: account.email ?? '' });
  });
}

// ===== Mã QR nhận phòng của Homestay (BookingStayService.qrForPartner) ===========================================================

export async function qrForPartner(principal: UserPrincipal | undefined, placeId: number) {
  const account = await actorOf(principal, false);
  await owned(placeId, account, false);
  return stays.qrFor(placeId);
}
