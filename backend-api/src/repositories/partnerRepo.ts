import { exec, one, query, scalar } from '../db/pool.js';
import { insertRow, json, updateRow } from '../db/sql.js';
import type { ActorType, AmenityValue, ChangeOperation, ChangeRequestStatus, ChangeTargetType, ContactChannel, MediaRole, RefundType } from '../domain/enums.js';
import { nowLocal } from '../lib/time.js';
import type { AmenityRow, PlaceMediaItem, PlaceWithRegion, RegionRow } from './placeRepo.js';
import type { CancellationPolicyRow, HomestayProfileRow } from './roomRepo.js';

/** Truy vấn của không gian làm việc NCC. Quyền sở hữu là một phần của mọi lần tìm Homestay. */

const OWNED = `SELECT p.*, r.name AS region_name FROM place p LEFT JOIN region r ON r.id = p.region_id
  WHERE p.provider_id = $1 AND p.kind = 'HOMESTAY' AND p.is_deleted = FALSE`;

export const findOwned = (providerId: number) => query<PlaceWithRegion>(`${OWNED} ORDER BY p.updated_at DESC, p.id DESC`, [providerId]);

/** Chỉ id + tên các Homestay của NCC, cùng thứ tự với {@link findOwned}. */
export const ownedNames = (providerId: number) =>
  query<{ id: number; name: string }>(
    `SELECT p.id, p.name FROM place p WHERE p.provider_id = $1 AND p.kind = 'HOMESTAY' AND p.is_deleted = FALSE ORDER BY p.updated_at DESC, p.id DESC`,
    [providerId],
  );

const OWNED_ONE = `SELECT p.*, r.name AS region_name FROM place p LEFT JOIN region r ON r.id = p.region_id
  WHERE p.id = $1 AND p.provider_id = $2 AND p.kind = 'HOMESTAY' AND p.is_deleted = FALSE`;

/** Homestay của NCC; lock=true khóa ghi dòng địa điểm (thứ tự khóa: Place → RoomType → RoomInventoryDay). */
export const findOwnedById = (id: number, providerId: number, lock: boolean) =>
  one<PlaceWithRegion>(lock ? `${OWNED_ONE} FOR UPDATE OF p` : OWNED_ONE, [id, providerId]);

export interface ProfileWithPolicy extends HomestayProfileRow {
  policy: CancellationPolicyRow | null;
}

async function withPolicy(profile: HomestayProfileRow | null): Promise<ProfileWithPolicy | null> {
  if (!profile) return null;
  const policy = profile.currentPolicyId != null ? await one<CancellationPolicyRow>('SELECT * FROM cancellation_policy WHERE id = $1', [profile.currentPolicyId]) : null;
  return { ...profile, policy };
}

export async function profile(placeId: number): Promise<ProfileWithPolicy | null> {
  return withPolicy(await one<HomestayProfileRow>('SELECT * FROM homestay_profile WHERE place_id = $1', [placeId]));
}

export async function profiles(placeIds: readonly number[]): Promise<ProfileWithPolicy[]> {
  if (placeIds.length === 0) return [];
  const rows = await query<HomestayProfileRow>('SELECT * FROM homestay_profile WHERE place_id = ANY($1)', [placeIds]);
  const policyIds = rows.map((r) => r.currentPolicyId).filter((id): id is number => id != null);
  const policies = policyIds.length > 0 ? await query<CancellationPolicyRow>('SELECT * FROM cancellation_policy WHERE id = ANY($1)', [policyIds]) : [];
  const byId = new Map(policies.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, policy: r.currentPolicyId != null ? (byId.get(r.currentPolicyId) ?? null) : null }));
}

/** Ảnh Homestay kèm tài sản, theo sort_order rồi media_id (ảnh bìa lọc ở nơi dùng). */
export const media = (placeIds: readonly number[]) =>
  placeIds.length === 0
    ? Promise.resolve([] as PlaceMediaItem[])
    : query<PlaceMediaItem>(
        `SELECT pm.place_id, pm.media_id, pm.role, pm.caption, pm.sort_order, ma.public_url FROM place_media pm JOIN media_asset ma ON ma.id = pm.media_id
          WHERE pm.place_id = ANY($1) ORDER BY pm.sort_order, pm.media_id`,
        [placeIds],
      );

export async function roomCounts(placeIds: readonly number[]): Promise<Map<number, number>> {
  if (placeIds.length === 0) return new Map();
  const rows = await query<{ placeId: number; n: number }>('SELECT place_id, count(*) AS n FROM room_type WHERE place_id = ANY($1) GROUP BY place_id', [placeIds]);
  return new Map(rows.map((r) => [r.placeId, r.n]));
}

/** Số loại phòng đủ điều kiện nhận Booking (đang mở bán, giá > 0) theo Homestay. */
export async function sellableRoomCounts(placeIds: readonly number[]): Promise<Map<number, number>> {
  if (placeIds.length === 0) return new Map();
  const rows = await query<{ placeId: number; n: number }>(
    `SELECT place_id, count(*) AS n FROM room_type WHERE place_id = ANY($1) AND status = 'ACTIVE' AND base_price > 0 GROUP BY place_id`,
    [placeIds],
  );
  return new Map(rows.map((r) => [r.placeId, r.n]));
}

export const activeRegions = () => query<RegionRow>('SELECT * FROM region WHERE is_active = TRUE ORDER BY path, name');

export const placeAmenityCatalog = () => query<AmenityRow>(`SELECT * FROM amenity WHERE is_active = TRUE AND scope = 'PLACE' ORDER BY sort_order, id`);

export const roomAmenityCatalog = () => query<AmenityRow>(`SELECT * FROM amenity WHERE is_active = TRUE AND scope = 'ROOM' ORDER BY sort_order`);

export async function nextPolicyVersion(placeId: number): Promise<number> {
  const latest = await scalar<number>('SELECT max(version) FROM cancellation_policy WHERE place_id = $1', [placeId]);
  return latest == null ? 1 : latest + 1;
}

export async function insertPolicy(p: {
  placeId: number;
  version: number;
  name: string;
  contentText: string;
  freeCancelCutoffHours: number;
  refundOnLateCancel: RefundType;
  createdBy: number | null;
}): Promise<CancellationPolicyRow> {
  return insertRow<CancellationPolicyRow>('cancellation_policy', { ...p, effectiveFrom: nowLocal() });
}

// ---- Hồ sơ homestay ---------------------------------------------------------------------------------------------------

export async function insertProfile(placeId: number, checkinCode: string): Promise<void> {
  await exec('INSERT INTO homestay_profile (place_id, checkin_code, updated_at) VALUES ($1, $2, $3)', [placeId, checkinCode, nowLocal()]);
}

export async function updateProfile(placeId: number, patch: Record<string, unknown>): Promise<void> {
  await updateRow('homestay_profile', placeId, { ...patch, updatedAt: nowLocal() }, 'place_id');
}

// ---- Liên hệ / tiện nghi -----------------------------------------------------------------------------------------------

export interface PlaceContactRow {
  id: number;
  placeId: number;
  channel: ContactChannel;
  value: string;
  isPublic: boolean;
  sortOrder: number;
}

export const publicContactsOf = (placeId: number) =>
  query<PlaceContactRow>('SELECT * FROM place_contact WHERE place_id = $1 AND is_public = TRUE ORDER BY sort_order ASC, id ASC', [placeId]);

export async function insertContact(placeId: number, channel: ContactChannel, value: string): Promise<void> {
  await exec(`INSERT INTO place_contact (place_id, channel, value, is_public, sort_order) VALUES ($1, $2, $3, TRUE, 0)`, [placeId, channel, value]);
}

export const updateContactValue = (id: number, value: string) => exec('UPDATE place_contact SET value = $2 WHERE id = $1', [id, value]);

export const deleteContact = (id: number) => exec('DELETE FROM place_contact WHERE id = $1', [id]);

export interface PlaceAmenityWithName {
  placeId: number;
  amenityId: number;
  value: AmenityValue;
  name: string;
}

export const placeAmenityRows = (placeId: number) =>
  query<PlaceAmenityWithName>(
    `SELECT pa.place_id, pa.amenity_id, pa.value, a.name FROM place_amenity pa JOIN amenity a ON a.id = pa.amenity_id
      WHERE pa.place_id = $1 ORDER BY a.sort_order ASC, a.id`,
    [placeId],
  );

export const deletePlaceAmenity = (placeId: number, amenityId: number) => exec('DELETE FROM place_amenity WHERE place_id = $1 AND amenity_id = $2', [placeId, amenityId]);

export const insertPlaceAmenity = (placeId: number, amenityId: number) =>
  exec(`INSERT INTO place_amenity (place_id, amenity_id, value) VALUES ($1, $2, 'YES')`, [placeId, amenityId]);

export const setPlaceAmenityYes = (placeId: number, amenityId: number) =>
  exec(`UPDATE place_amenity SET value = 'YES' WHERE place_id = $1 AND amenity_id = $2`, [placeId, amenityId]);

// ---- Yêu cầu thay đổi --------------------------------------------------------------------------------------------------

export interface ChangeRequestRow {
  id: number;
  providerId: number;
  placeId: number;
  targetType: ChangeTargetType;
  targetId: number | null;
  roomTypeId: number | null;
  operation: ChangeOperation;
  status: ChangeRequestStatus;
  payload: Record<string, any> | null;
  beforeData: Record<string, any> | null;
  submittedBy: number;
  submittedAt: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

/** Yêu cầu kèm tên để dựng tóm tắt (đã nối địa điểm, nhà cung cấp, người gửi, người duyệt). */
export interface ChangeRequestFull extends ChangeRequestRow {
  placeName: string;
  providerName: string;
  submittedByName: string | null;
  reviewedByName: string | null;
}

const CHANGE_FULL = `SELECT c.*, p.name AS place_name, pr.name AS provider_name, sb.full_name AS submitted_by_name, rb.full_name AS reviewed_by_name
  FROM partner_change_request c JOIN place p ON p.id = c.place_id JOIN provider pr ON pr.id = c.provider_id
  JOIN account sb ON sb.id = c.submitted_by LEFT JOIN account rb ON rb.id = c.reviewed_by`;

export const findChangeFull = (id: number) => one<ChangeRequestFull>(`${CHANGE_FULL} WHERE c.id = $1`, [id]);

export const findChangeForUpdate = (id: number) => one<ChangeRequestRow>('SELECT * FROM partner_change_request WHERE id = $1 FOR UPDATE', [id]);

/** Yêu cầu đang chờ cùng đối tượng — bị thay thế khi NCC gửi yêu cầu mới. */
export const findOpenChanges = (status: ChangeRequestStatus, placeId: number, type: ChangeTargetType, targetId: number | null, roomTypeId: number | null) =>
  query<ChangeRequestRow>(
    `SELECT * FROM partner_change_request
      WHERE status = $1 AND place_id = $2 AND target_type = $3
        AND (($4::bigint IS NULL AND target_id IS NULL) OR target_id = $4)
        AND (($5::bigint IS NULL AND room_type_id IS NULL) OR room_type_id = $5)`,
    [status, placeId, type, targetId, roomTypeId],
  );

export const countChangesByStatus = async (status: ChangeRequestStatus): Promise<number> =>
  (await scalar<number>('SELECT count(*) FROM partner_change_request WHERE status = $1', [status])) ?? 0;

/** Homestay đang có yêu cầu xuất bản lần đầu chờ Admin duyệt. */
export async function pendingPublishPlaceIds(placeIds: readonly number[]): Promise<Set<number>> {
  if (placeIds.length === 0) return new Set();
  const rows = await query<{ placeId: number }>(
    `SELECT DISTINCT place_id FROM partner_change_request WHERE status = 'PENDING' AND operation = 'PUBLISH' AND place_id = ANY($1)`,
    [placeIds],
  );
  return new Set(rows.map((r) => r.placeId));
}

export async function insertChange(data: {
  providerId: number;
  placeId: number;
  targetType: ChangeTargetType;
  targetId: number | null;
  roomTypeId: number | null;
  operation: ChangeOperation;
  payload: Record<string, unknown> | null;
  beforeData: Record<string, unknown> | null;
  submittedBy: number;
}): Promise<ChangeRequestRow> {
  const { payload, beforeData, ...rest } = data;
  return insertRow<ChangeRequestRow>('partner_change_request', {
    ...rest,
    status: 'PENDING',
    payload: json(payload),
    beforeData: json(beforeData),
    submittedAt: nowLocal(),
  });
}

export async function updateChange(id: number, patch: Partial<Pick<ChangeRequestRow, 'status' | 'reviewedBy' | 'reviewedAt' | 'reviewNote'>>): Promise<void> {
  // updateRow bỏ qua khóa undefined, nên null phải được truyền tường minh để xóa cột.
  await updateRow('partner_change_request', id, patch);
}

// ---- Ảnh --------------------------------------------------------------------------------------------------------------

export interface MediaLink {
  mediaId: number;
  role: MediaRole;
  caption: string | null;
  sortOrder: number;
  publicUrl: string | null;
}

export const placeMediaLinks = (placeId: number) =>
  query<MediaLink>(
    `SELECT pm.media_id, pm.role, pm.caption, pm.sort_order, ma.public_url FROM place_media pm JOIN media_asset ma ON ma.id = pm.media_id
      WHERE pm.place_id = $1 ORDER BY CASE WHEN pm.role = 'COVER' THEN 0 ELSE 1 END, pm.sort_order, pm.media_id`,
    [placeId],
  );

export const roomMediaLinks = (roomTypeId: number) =>
  query<MediaLink>(
    `SELECT rm.media_id, rm.role, rm.caption, rm.sort_order, ma.public_url FROM room_type_media rm JOIN media_asset ma ON ma.id = rm.media_id
      WHERE rm.room_type_id = $1 ORDER BY CASE WHEN rm.role = 'COVER' THEN 0 ELSE 1 END, rm.sort_order, rm.media_id`,
    [roomTypeId],
  );

export async function assetExists(storageKey: string): Promise<boolean> {
  return (await scalar<boolean>('SELECT count(*) > 0 FROM media_asset WHERE storage_key = $1', [storageKey])) === true;
}

export async function insertAsset(storageKey: string, publicUrl: string, mimeType: string, uploadedBy: number | null): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO media_asset (storage_key, public_url, mime_type, uploaded_by, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [storageKey, publicUrl, mimeType, uploadedBy, nowLocal()],
  );
  return row!.id;
}

export const insertPlaceMedia = (placeId: number, mediaId: number, role: MediaRole, caption: string | null, sortOrder: number) =>
  exec('INSERT INTO place_media (place_id, media_id, role, caption, sort_order) VALUES ($1,$2,$3,$4,$5)', [placeId, mediaId, role, caption, sortOrder]);

export const insertRoomMedia = (roomTypeId: number, mediaId: number, role: MediaRole, caption: string | null, sortOrder: number) =>
  exec('INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) VALUES ($1,$2,$3,$4,$5)', [roomTypeId, mediaId, role, caption, sortOrder]);

export const setPlaceMediaRole = (placeId: number, mediaId: number | null, role: MediaRole) =>
  exec(`UPDATE place_media SET role = $3 WHERE place_id = $1 AND ($2::bigint IS NULL OR media_id = $2)`, [placeId, mediaId, role]);

export const setRoomMediaRole = (roomTypeId: number, mediaId: number | null, role: MediaRole) =>
  exec(`UPDATE room_type_media SET role = $3 WHERE room_type_id = $1 AND ($2::bigint IS NULL OR media_id = $2)`, [roomTypeId, mediaId, role]);

export const deletePlaceMedia = (placeId: number, mediaId: number) => exec('DELETE FROM place_media WHERE place_id = $1 AND media_id = $2', [placeId, mediaId]);

export const deleteRoomMedia = (roomTypeId: number, mediaId: number) => exec('DELETE FROM room_type_media WHERE room_type_id = $1 AND media_id = $2', [roomTypeId, mediaId]);

/** Xóa tài sản ảnh nếu không còn gắn với Homestay / loại phòng nào. */
export async function deleteAssetIfOrphan(mediaId: number): Promise<void> {
  const used = (await scalar<number>('SELECT (SELECT count(*) FROM place_media WHERE media_id = $1) + (SELECT count(*) FROM room_type_media WHERE media_id = $1)', [mediaId])) ?? 0;
  if (used === 0) await exec('DELETE FROM media_asset WHERE id = $1', [mediaId]);
}

// ---- Audit log của NCC --------------------------------------------------------------------------------------------------

export const ROOM_TYPE = 'RoomType';
export const HOMESTAY = 'Homestay';

/** NFR-AUD-02: ghi lịch sử thay đổi giá, số phòng, lịch bán do NCC thực hiện, cùng transaction với thay đổi. */
export async function recordAudit(
  actorId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  reason: string | null | undefined,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  await exec(
    `INSERT INTO audit_log (actor, actor_id, action, entity_type, entity_id, reason, before_data, after_data, created_at)
     VALUES ('PROVIDER' , $1, $2, $3, $4, $5, $6, $7, $8)`,
    [actorId, action, entityType, entityId, reason == null || reason.trim() === '' ? null : reason.trim(), json(before), json(after), nowLocal()],
  );
}

export interface ChangeLogRow {
  id: number;
  actor: ActorType;
  action: string;
  entityType: string;
  entityId: number | null;
  reason: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
}

/** 100 thay đổi gần nhất của Homestay và các loại phòng thuộc Homestay. */
export const changeLogOf = (placeId: number, roomIds: readonly number[]) =>
  query<ChangeLogRow>(
    `SELECT * FROM audit_log WHERE actor = 'PROVIDER'
        AND ((entity_type = 'Homestay' AND entity_id = $1) OR (entity_type = 'RoomType' AND entity_id = ANY($2)))
      ORDER BY created_at DESC, id DESC LIMIT 100`,
    [placeId, roomIds],
  );
