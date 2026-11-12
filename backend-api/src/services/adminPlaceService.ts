import { query, scalar, tx } from '../db/pool.js';
import { Where } from '../db/sql.js';
import { CATEGORY_KIND_LABEL, PLACE_VERIFICATION_STATUSES, type CategoryKind, type PlaceVerificationStatus, type PlaceVisibility } from '../domain/enums.js';
import { IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { today } from '../lib/time.js';
import { containsPattern, likeSql } from '../lib/vietnamese.js';
import * as placeRepo from '../repositories/placeRepo.js';
import type { PlaceRow } from '../repositories/placeRepo.js';
import * as audit from './auditLogService.js';
import * as extras from './placeExtras.js';

const SORT_FIELDS: Record<string, string> = { createdAt: 'p.created_at', updatedAt: 'p.updated_at', name: 'p.name', ratingAvg: 'p.rating_avg' };

interface JoinedPlace extends PlaceRow {
  providerName: string | null;
  regionName: string | null;
}

const SELECT = `SELECT p.*, pr.name AS provider_name, r.name AS region_name
  FROM place p LEFT JOIN provider pr ON pr.id = p.provider_id LEFT JOIN region r ON r.id = p.region_id`;

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function summaryOf(p: JoinedPlace) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    kind: p.kind,
    categoryName: CATEGORY_KIND_LABEL[p.kind],
    providerId: p.providerId,
    providerName: p.providerName,
    regionId: p.regionId,
    regionName: p.regionName,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    priceRefMin: p.priceRefMin,
    priceRefMax: p.priceRefMax,
    visibility: p.visibility,
    operationStatus: p.operationStatus,
    verification: p.verification,
    lastVerifiedAt: p.lastVerifiedAt,
    dataVerified: p.dataVerified,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

async function joined(id: number): Promise<JoinedPlace | null> {
  const [row] = await query<JoinedPlace>(`${SELECT} WHERE p.id = $1 AND p.is_deleted = FALSE`, [id]);
  return row ?? null;
}

const notFound = (id: number) => new IllegalArgumentError(`Không tìm thấy địa điểm với ID: ${id}`);

export interface PlaceFilter {
  keyword?: string;
  visibility?: PlaceVisibility;
  verification?: PlaceVerificationStatus;
  dataVerified?: boolean;
  kind?: CategoryKind;
  providerId?: number;
  regionId?: number;
  createdFrom?: string;
  createdTo?: string;
}

function filterWhere(f: PlaceFilter): Where {
  const where = new Where();
  where.and('p.is_deleted = FALSE');
  if (f.visibility) where.and('p.visibility = ?', f.visibility);
  if (f.verification) where.and('p.verification = ?', f.verification);
  if (f.dataVerified != null) where.and('p.data_verified = ?', f.dataVerified);
  if (f.kind) where.and('p.kind = ?', f.kind);
  if (f.providerId != null) where.and('p.provider_id = ?', f.providerId);
  if (f.regionId != null) where.and('p.region_id = ?', f.regionId);
  if (f.createdFrom) where.and('p.created_at >= ?', `${f.createdFrom}T00:00:00`);
  if (f.createdTo) where.and('p.created_at < ?', `${nextDay(f.createdTo)}T00:00:00`);
  const kw = containsPattern(f.keyword);
  if (kw) {
    const ph = where.add(kw);
    where.and(`(${likeSql('p.name', ph)} OR ${likeSql('p.slug', ph)} OR ${likeSql('p.address', ph)} OR ${likeSql('pr.name', ph)})`);
  }
  return where;
}

export async function getPlaces(f: PlaceFilter, sortBy: string, sortDir: string, page: number, size: number): Promise<PageJson<ReturnType<typeof summaryOf>>> {
  const column = SORT_FIELDS[sortBy] ?? SORT_FIELDS.createdAt;
  // NULL luôn xếp cuối (cả ASC lẫn DESC): điểm chưa có đánh giá không đứng trước 5 sao.
  const dir = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const p = Math.max(page, 0);
  const s = Math.min(Math.max(size, 1), 100);
  const where = filterWhere(f);
  const total = (await scalar<number>(`SELECT count(*) FROM place p LEFT JOIN provider pr ON pr.id = p.provider_id ${where.toSql()}`, where.params)) ?? 0;
  const rows = await query<JoinedPlace>(`${SELECT} ${where.toSql()} ORDER BY ${column} ${dir} NULLS LAST, p.id ${dir} LIMIT ${s} OFFSET ${p * s}`, where.params);
  return pageOf(rows.map(summaryOf), p, s, total, true);
}

/** Số điểm đến theo trạng thái xác thực (cho chip đếm). */
export async function countByVerification(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const v of PLACE_VERIFICATION_STATUSES) counts[v] = Number((await scalar<number>('SELECT count(*) FROM place WHERE is_deleted = FALSE AND verification = $1', [v])) ?? 0);
  return counts;
}

export async function getPlaceById(id: number) {
  const place = await joined(id);
  if (!place) throw notFound(id);
  const profile = await query<{ viewHighlight: string | null; suitability: string | null }>('SELECT view_highlight, suitability FROM homestay_profile WHERE place_id = $1', [id]);
  const contacts = (await placeRepo.publicContacts([id]))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, channel: c.channel, value: c.value, isPublic: c.isPublic, sortOrder: c.sortOrder }));
  const highlights = (await placeRepo.publicHighlights(id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((h) => ({ id: h.id, type: h.type, content: h.content }));
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    kind: place.kind,
    categoryName: CATEGORY_KIND_LABEL[place.kind],
    providerId: place.providerId,
    providerName: place.providerName,
    regionId: place.regionId,
    regionName: place.regionName,
    address: place.address,
    description: place.description,
    accessNote: place.accessNote,
    latitude: place.latitude,
    longitude: place.longitude,
    priceRefMin: place.priceRefMin,
    priceRefMax: place.priceRefMax,
    priceUnitNote: place.priceUnitNote,
    visibility: place.visibility,
    operationStatus: place.operationStatus,
    verification: place.verification,
    lastVerifiedAt: place.lastVerifiedAt,
    dataVerified: place.dataVerified,
    ratingAvg: place.ratingAvg,
    ratingCount: place.ratingCount,
    googleRating: place.googleRating,
    viewHighlight: profile[0]?.viewHighlight ?? null,
    suitability: profile[0]?.suitability ?? null,
    contacts,
    highlights,
    attributes: extras.attributes(place, await extras.loadExtrasOf(id)),
    createdAt: place.createdAt,
    updatedAt: place.updatedAt,
  };
}

export function updateVerification(id: number, request: { verification: PlaceVerificationStatus; reason?: string | null }, callerAccountId: number | null) {
  return tx(async () => {
    const place = await joined(id);
    if (!place) throw notFound(id);
    if ((request.verification === 'NEEDS_UPDATE' || request.verification === 'ARCHIVED') && (request.reason == null || request.reason.trim() === '')) {
      throw new IllegalArgumentError('Vui lòng nhập lý do khi yêu cầu bổ sung hoặc lưu trữ điểm đến.');
    }
    const oldStatus = place.verification;
    await placeRepo.updatePlace(place, { verification: request.verification, ...(request.verification === 'VERIFIED' ? { lastVerifiedAt: today() } : {}) });
    await audit.record(
      callerAccountId,
      'UPDATE_PLACE_VERIFICATION',
      'Place',
      id,
      request.reason ?? 'Kiểm duyệt trạng thái xác thực nội dung điểm đến',
      { verification: oldStatus },
      { verification: request.verification },
    );
    return summaryOf((await joined(id))!);
  });
}

/** Bật / tắt cờ "dữ liệu đã xác thực" của một địa điểm (độc lập với trạng thái kiểm duyệt nội dung); ghi nhật ký khi có thay đổi. */
export function updateDataVerified(id: number, request: { dataVerified: boolean; reason?: string | null }, callerAccountId: number | null) {
  return tx(async () => {
    const place = await joined(id);
    if (!place) throw notFound(id);
    if (place.dataVerified !== request.dataVerified) {
      await placeRepo.updatePlace(place, { dataVerified: request.dataVerified });
      await audit.record(
        callerAccountId,
        'UPDATE_PLACE_DATA_VERIFIED',
        'Place',
        id,
        request.reason ?? (request.dataVerified ? 'Admin xác thực dữ liệu điểm đến' : 'Admin bỏ xác thực dữ liệu điểm đến'),
        { dataVerified: place.dataVerified },
        { dataVerified: request.dataVerified },
      );
    }
    return summaryOf((await joined(id))!);
  });
}

export function updateVisibility(id: number, request: { visibility: PlaceVisibility; reason?: string | null }, callerAccountId: number | null) {
  return tx(async () => {
    const place = await joined(id);
    if (!place) throw notFound(id);
    if (request.visibility !== 'PUBLISHED' && (request.reason == null || request.reason.trim() === '')) throw new IllegalArgumentError('Vui lòng nhập lý do khi ẩn điểm đến.');
    const old = place.visibility;
    await placeRepo.updatePlace(place, { visibility: request.visibility });
    await audit.record(callerAccountId, 'UPDATE_PLACE_VISIBILITY', 'Place', id, request.reason ?? 'Admin thay đổi hiển thị khẩn cấp', { visibility: old }, { visibility: request.visibility });
    return summaryOf((await joined(id))!);
  });
}

export function bulkUpdateVerification(ids: number[] | null | undefined, verification: PlaceVerificationStatus | null | undefined, reason: string | null | undefined, callerAccountId: number | null) {
  return tx(async () => {
    if (ids == null || ids.length === 0) throw new IllegalArgumentError('Chưa chọn điểm đến nào.');
    if (ids.length > 100) throw new IllegalArgumentError('Tối đa 100 điểm đến mỗi lần.');
    if (verification == null) throw new IllegalArgumentError('Thiếu trạng thái kiểm duyệt.');
    for (const id of ids) await updateVerification(id, { verification, reason }, callerAccountId);
    return ids.length;
  });
}

/**
 * Xóa mềm điểm đến (is_deleted = true, ẩn khỏi khách): bắt buộc lý do, tối đa 100 mục mỗi lần, ghi audit từng mục. Điểm đến còn đơn
 * đặt phòng đang hiệu lực không được xóa; cả lô bị từ chối nếu có một mục vi phạm.
 */
export function deletePlaces(ids: number[] | null | undefined, reason: string | null | undefined, callerAccountId: number | null) {
  return tx(async () => {
    if (ids == null || ids.length === 0) throw new IllegalArgumentError('Chưa chọn điểm đến nào.');
    if (reason == null || reason.trim() === '') throw new IllegalArgumentError('Vui lòng nhập lý do xóa điểm đến.');
    const distinct = [...new Set(ids.filter((i) => i != null))];
    if (distinct.length > 100) throw new IllegalArgumentError('Tối đa 100 điểm đến mỗi lần.');
    const cleanReason = reason.trim().length > 500 ? reason.trim().slice(0, 500) : reason.trim();
    for (const id of distinct) {
      const place = await placeRepo.findById(id);
      if (!place || place.isDeleted) throw notFound(id);
      // Đơn còn hiệu lực: chờ xác nhận / đã xác nhận, hoặc đã thanh toán mà chưa qua ngày trả phòng.
      const active = await scalar<boolean>(
        `SELECT count(*) > 0 FROM booking WHERE place_id = $1 AND (status IN ('PENDING', 'CONFIRMED') OR (status = 'PAID' AND check_out > $2))`,
        [id, today()],
      );
      if (active) throw new IllegalStateError(`Không thể xóa "${place.name}": điểm đến còn đơn đặt phòng đang hiệu lực.`);
      const oldVisibility = place.visibility;
      await placeRepo.updatePlace(place, { isDeleted: true, visibility: 'UNPUBLISHED' });
      await audit.record(callerAccountId, 'DELETE_PLACE', 'Place', place.id, cleanReason, { visibility: oldVisibility, deleted: false }, { visibility: 'UNPUBLISHED', deleted: true, name: place.name });
    }
    return distinct.length;
  });
}

