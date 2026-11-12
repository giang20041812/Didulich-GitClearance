import { query, scalar, tx } from '../db/pool.js';
import { Where, escapeLike } from '../db/sql.js';
import type { ReviewStatus } from '../domain/enums.js';
import { IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { nowLocal } from '../lib/time.js';
import * as placeRepo from '../repositories/placeRepo.js';
import * as reviewRepo from '../repositories/reviewRepo.js';
import * as audit from './auditLogService.js';
import * as recorder from './notificationRecorder.js';

/**
 * FR-AD-15: Admin kiểm tra đánh giá và giữ nguyên / ẩn / gỡ đánh giá vi phạm, ghi nhận lý do và kết quả xử lý. Đánh giá không còn
 * VISIBLE thì không hiển thị công khai và không được tính vào điểm trung bình của Homestay.
 */

export const MODERATION_ACTIONS = ['KEEP', 'HIDE', 'REMOVE', 'RESTORE'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export interface AdminReviewDto {
  id: number;
  placeId: number;
  placeName: string;
  providerId: number | null;
  providerName: string | null;
  bookingId: number | null;
  bookingCode: string | null;
  guestName: string;
  rating: number;
  content: string | null;
  images: string[];
  status: ReviewStatus;
  createdAt: string;
  providerReply: string | null;
  providerReplyAt: string | null;
  moderatedByName: string | null;
  moderatedAt: string | null;
  moderationReason: string | null;
}

interface Row {
  id: number;
  placeId: number;
  placeName: string;
  providerId: number | null;
  providerName: string | null;
  bookingId: number | null;
  bookingCode: string | null;
  bookingGuestName: string | null;
  rating: number;
  content: string | null;
  status: ReviewStatus;
  createdAt: string;
  providerReply: string | null;
  providerReplyAt: string | null;
  moderatedBy: number | null;
  moderatedAt: string | null;
  moderationReason: string | null;
}

const SELECT = `SELECT r.id, r.place_id, p.name AS place_name, pr.id AS provider_id, pr.name AS provider_name, b.id AS booking_id, b.booking_code,
       b.guest_name AS booking_guest_name, r.rating, r.content, r.status, r.created_at, r.provider_reply, r.provider_reply_at, r.moderated_by,
       r.moderated_at, r.moderation_reason
  FROM review r JOIN place p ON p.id = r.place_id LEFT JOIN provider pr ON pr.id = p.provider_id LEFT JOIN booking b ON b.id = r.booking_id`;

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface ReviewSearch {
  status?: ReviewStatus;
  /** true = đã được kiểm duyệt (có moderated_at); false = chưa được kiểm duyệt lần nào; undefined = không lọc. */
  processed?: boolean;
  placeId?: number;
  providerId?: number;
  rating?: number;
  keyword?: string;
  from?: string;
  to?: string;
  page: number;
  size: number;
}

export async function search(o: ReviewSearch): Promise<PageJson<AdminReviewDto>> {
  if (o.from && o.to && o.to < o.from) throw new IllegalArgumentError('Khoảng thời gian không hợp lệ: ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  if (o.rating != null && (o.rating < 1 || o.rating > 5)) throw new IllegalArgumentError('Số sao phải từ 1 đến 5.');
  const kw = o.keyword && o.keyword.trim() !== '' ? o.keyword.trim().toLowerCase() : null;
  const where = new Where();
  if (o.status) where.and('r.status = ?', o.status);
  if (o.processed != null) where.and(o.processed ? 'r.moderated_at IS NOT NULL' : 'r.moderated_at IS NULL');
  if (o.placeId != null) where.and('p.id = ?', o.placeId);
  if (o.providerId != null) where.and('p.provider_id = ?', o.providerId);
  if (o.rating != null) where.and('r.rating = ?', o.rating);
  if (o.from) where.and('r.created_at >= ?', `${o.from}T00:00:00`);
  if (o.to) where.and('r.created_at < ?', `${nextDay(o.to)}T00:00:00`);
  if (kw) {
    const like = `%${escapeLike(kw)}%`;
    where.and(
      `(lower(r.content) LIKE ? ESCAPE '\\' OR lower(p.name) LIKE ? ESCAPE '\\' OR lower(b.guest_name) LIKE ? ESCAPE '\\' OR lower(b.booking_code) LIKE ? ESCAPE '\\')`,
      like,
      like,
      like,
      like,
    );
  }
  const page = Math.max(o.page, 0);
  const size = Math.min(Math.max(o.size, 1), 100);
  const total = (await scalar<number>(`SELECT count(*) FROM review r JOIN place p ON p.id = r.place_id LEFT JOIN booking b ON b.id = r.booking_id ${where.toSql()}`, where.params)) ?? 0;
  const rows = await query<Row>(`${SELECT} ${where.toSql()} ORDER BY r.created_at DESC, r.id DESC LIMIT ${size} OFFSET ${page * size}`, where.params);
  return pageOf(await toDtos(rows), page, size, total, true);
}

export async function detail(id: number): Promise<AdminReviewDto> {
  const [row] = await query<Row>(`${SELECT} WHERE r.id = $1`, [id]);
  if (!row) throw new IllegalArgumentError(`Không tìm thấy đánh giá với ID: ${id}`);
  return (await toDtos([row]))[0];
}

async function toDtos(rows: Row[]): Promise<AdminReviewDto[]> {
  const moderatorIds = [...new Set(rows.map((r) => r.moderatedBy).filter((v): v is number => v != null))];
  const names = new Map<number, string>();
  if (moderatorIds.length > 0) {
    for (const a of await query<{ id: number; fullName: string | null }>('SELECT id, full_name FROM account WHERE id = ANY($1)', [moderatorIds])) {
      names.set(a.id, a.fullName ?? 'Quản trị viên');
    }
  }
  const images = new Map<number, string[]>();
  for (const i of await reviewRepo.imagesOf(rows.map((r) => r.id))) images.set(i.id, [...(images.get(i.id) ?? []), i.value]);
  return rows.map((r) => ({
    id: r.id,
    placeId: r.placeId,
    placeName: r.placeName,
    providerId: r.providerId,
    providerName: r.providerName,
    bookingId: r.bookingId,
    bookingCode: r.bookingCode,
    guestName: r.bookingId == null ? 'Khách du lịch' : (r.bookingGuestName as string),
    rating: r.rating ?? 0,
    content: r.content,
    images: images.get(r.id) ?? [],
    status: r.status,
    createdAt: r.createdAt,
    providerReply: r.providerReply,
    providerReplyAt: r.providerReplyAt,
    moderatedByName: r.moderatedBy == null ? null : (names.get(r.moderatedBy) ?? null),
    moderatedAt: r.moderatedAt,
    moderationReason: r.moderationReason,
  }));
}

/**
 * Quy tắc chuyển trạng thái: VISIBLE → ẩn/gỡ; HIDDEN → khôi phục/gỡ; REMOVED không đổi được nữa. KEEP không đổi trạng thái, chỉ ghi
 * nhận đã xem xét. Ẩn và gỡ bắt buộc có lý do.
 */
export function moderate(id: number, adminAccountId: number | null, action: ModerationAction | null | undefined, reason: string | null | undefined): Promise<AdminReviewDto> {
  return tx(async () => {
    if (action == null) throw new IllegalArgumentError('Vui lòng chọn cách xử lý.');
    const cleanReason = reason == null || reason.trim() === '' ? null : reason.trim();
    if ((action === 'HIDE' || action === 'REMOVE') && cleanReason == null) throw new IllegalArgumentError('Vui lòng nhập lý do khi ẩn hoặc gỡ đánh giá.');
    if (adminAccountId == null) throw new IllegalStateError('Không xác định được tài khoản quản trị đang thao tác.');
    const review = await reviewRepo.findByIdForUpdate(id);
    if (!review) throw new IllegalArgumentError(`Không tìm thấy đánh giá với ID: ${id}`);
    const old = review.status;
    if (old === 'REMOVED') throw new IllegalStateError('Đánh giá đã bị gỡ, không thể xử lý lại.');
    let target: ReviewStatus;
    switch (action) {
      case 'KEEP':
        target = old;
        break;
      case 'HIDE':
        if (old !== 'VISIBLE') throw new IllegalStateError('Đánh giá không ở trạng thái hiển thị để ẩn.');
        target = 'HIDDEN';
        break;
      case 'REMOVE':
        target = 'REMOVED';
        break;
      case 'RESTORE':
        if (old !== 'HIDDEN') throw new IllegalStateError('Chỉ khôi phục được đánh giá đang bị ẩn.');
        target = 'VISIBLE';
        break;
    }
    await reviewRepo.updateReview(id, { status: target, moderatedBy: adminAccountId, moderatedAt: nowLocal(), moderationReason: cleanReason });
    if (old !== target) await refreshPlaceRating(review.placeId);
    // REV-BR-17: chỉ báo khách khi GỠ (xóa) đánh giá đã đăng — Ẩn không bắt buộc báo theo tài liệu.
    if (action === 'REMOVE') await notifyCustomerRemoved(review.bookingId, review.placeId, id, cleanReason);
    const suffix = { KEEP: 'KEPT', HIDE: 'HIDDEN', REMOVE: 'REMOVED', RESTORE: 'RESTORED' }[action];
    await audit.record(adminAccountId, `REVIEW_${suffix}`, 'Review', id, cleanReason, { status: old }, { status: target, placeId: review.placeId });
    return detail(id);
  });
}

/** REV-BR-17: báo cho khách hàng khi đánh giá của họ bị Admin gỡ, kèm lý do. */
async function notifyCustomerRemoved(bookingId: number | null, placeId: number, reviewId: number, reason: string | null): Promise<void> {
  if (bookingId == null) return;
  const [booking] = await query<{ guestPhone: string | null; guestEmail: string | null }>('SELECT guest_phone, guest_email FROM booking WHERE id = $1', [bookingId]);
  if (!booking) return;
  const place = await placeRepo.findById(placeId);
  await recorder.toCustomer('REVIEW_REMOVED_CUSTOMER', booking.guestPhone, booking.guestEmail, 'review', reviewId, {
    homestay_name: place?.name ?? null,
    homestayName: place?.name ?? null,
    reason: reason ?? '',
    isRead: false,
    title: 'Đánh giá của bạn đã bị gỡ',
    message: reason ?? '',
  });
}

/** Điểm trung bình và số đánh giá của Homestay chỉ tính các đánh giá đang hiển thị công khai. */
async function refreshPlaceRating(placeId: number): Promise<void> {
  const stats = await reviewRepo.visibleRatingStats(placeId);
  const count = Number(stats.count);
  const avg = count > 0 && stats.avg != null ? Math.round(stats.avg * 100) / 100 : 0;
  await placeRepo.setRating(placeId, avg, count);
}
