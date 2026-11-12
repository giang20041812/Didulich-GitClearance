import { exec, one, query } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import type { ReviewStatus } from '../domain/enums.js';

export interface ReviewRow {
  id: number;
  placeId: number;
  bookingId: number;
  rating: number;
  content: string | null;
  status: ReviewStatus;
  editableUntil: string;
  createdAt: string;
  updatedAt: string;
  providerReply: string | null;
  providerReplyAt: string | null;
  providerReplyBy: number | null;
  moderatedBy: number | null;
  moderatedAt: string | null;
  moderationReason: string | null;
}

export interface PublicReviewRow {
  id: number;
  rating: number;
  content: string | null;
  providerReply: string | null;
  providerReplyAt: string | null;
  guestName: string | null;
  createdAt: string;
  editableUntil: string;
}

/** Đánh giá công khai cho trang chi tiết — chỉ các cột hiển thị, mới nhất trước. */
export async function publicRowsByPlace(placeId: number, status: ReviewStatus, limit: number): Promise<PublicReviewRow[]> {
  return query<PublicReviewRow>(
    `SELECT r.id, r.rating, r.content, r.provider_reply, r.provider_reply_at, b.guest_name, r.created_at, r.editable_until
       FROM review r LEFT JOIN booking b ON b.id = r.booking_id
      WHERE r.place_id = $1 AND r.status = $2
      ORDER BY r.created_at DESC, r.id DESC LIMIT $3`,
    [placeId, status, limit],
  );
}

/** Ảnh của nhiều đánh giá, theo thứ tự: mỗi dòng {id: reviewId, value: url}. */
export async function imagesOf(reviewIds: readonly number[]): Promise<Array<{ id: number; value: string }>> {
  if (reviewIds.length === 0) return [];
  return query('SELECT review_id AS id, url AS value FROM review_image WHERE review_id = ANY($1) ORDER BY review_id, sort_order', [reviewIds]);
}

export async function replaceImages(reviewId: number, urls: readonly string[]): Promise<void> {
  await exec('DELETE FROM review_image WHERE review_id = $1', [reviewId]);
  for (let i = 0; i < urls.length; i++) {
    await exec('INSERT INTO review_image (review_id, sort_order, url) VALUES ($1, $2, $3)', [reviewId, i, urls[i]]);
  }
}

export async function findById(id: number): Promise<ReviewRow | null> {
  return one<ReviewRow>('SELECT * FROM review WHERE id = $1', [id]);
}

export async function findByIdForUpdate(id: number): Promise<ReviewRow | null> {
  return one<ReviewRow>('SELECT * FROM review WHERE id = $1 FOR UPDATE', [id]);
}

export async function findByBookingId(bookingId: number): Promise<ReviewRow | null> {
  return one<ReviewRow>('SELECT * FROM review WHERE booking_id = $1', [bookingId]);
}

export async function existsByBookingId(bookingId: number): Promise<boolean> {
  return (await findByBookingId(bookingId)) !== null;
}

/** [số đánh giá, điểm trung bình] của các đánh giá đang hiển thị công khai của một điểm đến. */
export async function visibleRatingStats(placeId: number): Promise<{ count: number; avg: number | null }> {
  const row = await one<{ n: number; avg: number | null }>(
    `SELECT count(*) AS n, avg(rating)::float8 AS avg FROM review WHERE place_id = $1 AND status = 'VISIBLE'`,
    [placeId],
  );
  return { count: row?.n ?? 0, avg: row?.avg ?? null };
}

export async function insertReview(data: Partial<ReviewRow> & Pick<ReviewRow, 'placeId' | 'bookingId' | 'rating' | 'editableUntil' | 'createdAt' | 'updatedAt'>): Promise<ReviewRow> {
  return insertRow<ReviewRow>('review', { status: 'VISIBLE', ...data });
}

export async function updateReview(id: number, patch: Partial<ReviewRow>): Promise<ReviewRow | null> {
  return updateRow<ReviewRow>('review', id, patch);
}

export async function deleteReview(id: number): Promise<void> {
  await exec('DELETE FROM review WHERE id = $1', [id]); // review_image xóa theo (ON DELETE CASCADE)
}
