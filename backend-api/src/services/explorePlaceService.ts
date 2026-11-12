import { query, scalar, tx } from '../db/pool.js';
import { Where } from '../db/sql.js';
import { insertRow, json, updateRow } from '../db/sql.js';
import { EXPLORE_CATEGORY_INFO, exploreAllKinds, exploreCategoryOf, SERVICE_GROUP_INFO, type ExploreCategory, type PlaceApprovalStatus, type PlaceEditStatus, type ServiceGroup } from '../domain/enums.js';
import { HttpError, IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import * as rules from '../lib/exploreRules.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { nowLocal } from '../lib/time.js';

import type { AccountWithProvider } from '../repositories/accountRepo.js';
import * as placeRepo from '../repositories/placeRepo.js';
import type { PlaceRow } from '../repositories/placeRepo.js';
import * as audit from './auditLogService.js';
import { hourDto, openingHoursOf } from './exploreService.js';
import * as recorder from './notificationRecorder.js';
import * as writer from './explorePlaceWriter.js';
import type { PlaceInput } from './explorePlaceWriter.js';

/**
 * Quản lý địa điểm khám phá (US02.01) cho Admin (AD-01, AD-02) và NCC (NCC-01). Phân quyền và duyệt theo BR-C01, BR-C02, BR-C03; cờ
 * "Tọa độ đã xác minh" theo BR-C05; thông báo theo BR-C04.
 */

/** BR-C01 / AC-02.07. */
export const NO_ACCESS = 'Bạn không có quyền truy cập nội dung này';
const ADMIN_TARGET = 'explorePlaces';
const LIST_PAGE_SIZE_MAX = 50;

/** Bộ lọc trạng thái của AD-01. */
export const STATUS_FILTERS = ['VISIBLE', 'HIDDEN', 'PENDING', 'REJECTED'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
/** Bộ lọc tọa độ của AD-01. */
export const COORD_FILTERS = ['VERIFIED', 'UNVERIFIED', 'MISSING'] as const;
export type CoordFilter = (typeof COORD_FILTERS)[number];

interface EditRequestRow {
  id: number;
  placeId: number;
  payload: PlaceInput;
  status: PlaceEditStatus;
  rejectReason: string | null;
  submittedBy: number | null;
  submittedAt: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
}

// ---- Truy vấn ---------------------------------------------------------------------------------------------------------------------

const isExplorePlace = (place: PlaceRow | null | undefined): place is PlaceRow =>
  !!place && place.kind != null && !place.isDeleted && exploreCategoryOf(place.kind) !== undefined;

export { isExplorePlace };

async function lock(id: number): Promise<PlaceRow> {
  const place = await placeRepo.findByIdForUpdate(id);
  if (!isExplorePlace(place)) throw new HttpError(404, 'Không tìm thấy địa điểm.');
  return place;
}

function requireOwner(place: PlaceRow, providerId: number): void {
  if (place.providerId == null || place.providerId !== providerId) throw new HttpError(403, NO_ACCESS);
}

/** Địa điểm khám phá còn tồn tại; `providerId` khác null thì phải thuộc NCC đó (BR-C01 → 403). */
export async function owned(id: number, providerId: number | null): Promise<PlaceRow> {
  const place = await placeRepo.findById(id);
  if (!isExplorePlace(place)) throw new HttpError(404, 'Không tìm thấy địa điểm.');
  if (providerId != null) requireOwner(place, providerId);
  return place;
}

async function editsOf(placeIds: number[]): Promise<EditRequestRow[]> {
  if (placeIds.length === 0) return [];
  return query<EditRequestRow>('SELECT * FROM place_edit_request WHERE place_id = ANY($1) ORDER BY submitted_at DESC, id DESC', [placeIds]);
}

async function pendingEdit(placeId: number, forUpdate: boolean): Promise<EditRequestRow | null> {
  const [row] = await query<EditRequestRow>(`SELECT * FROM place_edit_request WHERE place_id = $1 AND status = 'PENDING' ${forUpdate ? 'FOR UPDATE' : ''}`, [placeId]);
  return row ?? null;
}

// ---- Danh sách / chi tiết -----------------------------------------------------------------------------------------------------------

/** AD-01 (providerId null = mọi địa điểm) và NCC-01 (providerId = NCC đang đăng nhập). */
export async function list(
  category: ExploreCategory | undefined,
  status: StatusFilter | undefined,
  coord: CoordFilter | undefined,
  keyword: string | undefined | null,
  providerId: number | null,
  page: number,
  size: number,
): Promise<PageJson<ReturnType<typeof rowOf>>> {
  const where = new Where();
  where.and('p.is_deleted = FALSE');
  where.and('p.kind = ANY(?)', category ? EXPLORE_CATEGORY_INFO[category].kinds : exploreAllKinds());
  if (providerId != null) where.and('p.provider_id = ?', providerId);
  const norm = writer.normalizeName(keyword);
  if (norm !== '') where.and(`p.name_norm LIKE ? ESCAPE '\\'`, `%${norm.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  switch (status) {
    case 'VISIBLE':
      where.and(`p.approval_status = 'APPROVED' AND p.visibility = 'PUBLISHED'`);
      break;
    case 'HIDDEN':
      where.and(`p.approval_status = 'APPROVED' AND p.visibility <> 'PUBLISHED'`);
      break;
    case 'PENDING':
      where.and(`(p.approval_status = 'PENDING' OR EXISTS (SELECT 1 FROM place_edit_request r WHERE r.place_id = p.id AND r.status = 'PENDING'))`);
      break;
    case 'REJECTED':
      where.and(`p.approval_status = 'REJECTED'`);
      break;
  }
  switch (coord) {
    case 'VERIFIED':
      where.and('p.coord_verified = TRUE');
      break;
    case 'UNVERIFIED':
      where.and('p.coord_verified = FALSE AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL');
      break;
    case 'MISSING':
      where.and('(p.latitude IS NULL OR p.longitude IS NULL)');
      break;
  }
  const p = Math.max(page, 0);
  const s = Math.min(Math.max(size, 1), LIST_PAGE_SIZE_MAX);
  const total = (await scalar<number>(`SELECT count(*) FROM place p ${where.toSql()}`, where.params)) ?? 0;
  const rows = await query<PlaceRow & { providerName: string | null }>(
    `SELECT p.*, pr.name AS provider_name FROM place p LEFT JOIN provider pr ON pr.id = p.provider_id ${where.toSql()}
      ORDER BY p.updated_at DESC, p.id DESC LIMIT ${s} OFFSET ${p * s}`,
    where.params,
  );
  const ids = rows.map((r) => r.id);
  const covers = new Map<number, string>();
  for (const c of await placeRepo.publicUrlsByPlaceIds(ids)) if (!covers.has(c.id)) covers.set(c.id, c.value);
  const pending = new Set((await editsOf(ids)).filter((e) => e.status === 'PENDING').map((e) => e.placeId));
  return pageOf(rows.map((r) => rowOf(r, covers.get(r.id) ?? null, pending.has(r.id))), p, s, total, true);
}

function rowOf(p: PlaceRow & { providerName: string | null }, cover: string | null, pendingEditFlag: boolean) {
  const category = exploreCategoryOf(p.kind) as ExploreCategory;
  return {
    id: p.id,
    name: p.name,
    category,
    categoryLabel: EXPLORE_CATEGORY_INFO[category].label,
    imageUrl: cover,
    providerId: p.providerId,
    providerName: p.providerName,
    visible: p.visibility === 'PUBLISHED',
    approvalStatus: p.approvalStatus,
    rejectReason: p.rejectReason,
    hasCoordinates: p.latitude != null && p.longitude != null,
    coordVerified: p.coordVerified === true,
    pendingEdit: pendingEditFlag,
    updatedAt: p.updatedAt,
  };
}

/** AD-02 / NCC: mở form sửa. NCC chỉ mở được địa điểm của mình (BR-C01). */
export async function form(id: number, providerId: number | null) {
  return toForm(await owned(id, providerId));
}

export function serviceDto(s: {
  serviceGroup: ServiceGroup;
  vehicleType: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  departureTimes: string | null;
  durationMinutes: number | null;
  seats: number | null;
  groupSizeMax: number | null;
  languages: string | null;
  includes: string | null;
}) {
  return {
    serviceGroup: s.serviceGroup,
    serviceGroupLabel: SERVICE_GROUP_INFO[s.serviceGroup].label,
    vehicleType: s.vehicleType,
    routeFrom: s.routeFrom,
    routeTo: s.routeTo,
    departureTimes: s.departureTimes,
    durationMinutes: s.durationMinutes,
    seats: s.seats,
    groupSizeMax: s.groupSizeMax,
    languages: s.languages == null || s.languages.trim() === '' ? [] : s.languages.split(','),
    includes: s.includes,
  };
}

export async function toForm(p: PlaceRow) {
  const category = exploreCategoryOf(p.kind) as ExploreCategory;
  let phone: string | null = null;
  let website: string | null = null;
  for (const c of await placeRepo.publicContacts([p.id])) {
    if (phone == null && c.channel === 'PHONE') phone = c.value;
    if (website == null && c.channel === 'WEBSITE') website = c.value;
  }
  const images = (await placeRepo.mediaWithAsset(p.id)).map((m) => ({ mediaId: m.mediaId, url: m.publicUrl, cover: m.role === 'COVER' }));
  const provider = p.providerId == null ? null : await query<{ name: string }>('SELECT name FROM provider WHERE id = $1', [p.providerId]);
  const [profile] = await query<Parameters<typeof serviceDto>[0]>('SELECT * FROM place_service_profile WHERE place_id = $1', [p.id]);
  const [coordVerifiedAt] = await query<{ coordVerifiedAt: string | null }>('SELECT coord_verified_at FROM place WHERE id = $1', [p.id]);
  return {
    id: p.id,
    name: p.name,
    category,
    summary: p.summary,
    description: p.description,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    phone,
    website,
    openingHours: (await openingHoursOf(p.id)).map(hourDto),
    images,
    visible: p.visibility === 'PUBLISHED',
    approvalStatus: p.approvalStatus,
    rejectReason: p.rejectReason,
    coordVerified: p.coordVerified === true,
    coordVerifiedAt: coordVerifiedAt?.coordVerifiedAt ?? null,
    providerId: p.providerId,
    providerName: provider?.[0]?.name ?? null,
    pendingEdit: await latestEdit(p.id),
    kind: p.kind,
    priceFrom: p.priceRefMin,
    priceUnit: p.priceUnitNote,
    service: profile ? serviceDto(profile) : null,
  };
}

/** Bản sửa đang chờ, hoặc bản bị từ chối gần nhất (để NCC xem lý do) nếu sau đó chưa gửi bản mới. */
async function latestEdit(placeId: number) {
  const [latest] = await editsOf([placeId]);
  if (!latest || (latest.status !== 'PENDING' && latest.status !== 'REJECTED')) return null;
  return { id: latest.id, status: latest.status, rejectReason: latest.rejectReason, submittedAt: latest.submittedAt, changes: latest.payload };
}

// ---- Admin (BR-C02: Admin tạo / sửa → hiển thị ngay) -------------------------------------------------------------------------------

const snapshot = (p: PlaceRow): Record<string, unknown> => ({
  name: p.name,
  kind: p.kind,
  latitude: p.latitude,
  longitude: p.longitude,
  coordVerified: p.coordVerified,
  visibility: p.visibility,
  approvalStatus: p.approvalStatus,
});

const auditPlace = (adminAccountId: number | null, action: string, place: PlaceRow, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string | null = null) =>
  audit.record(adminAccountId, action, 'Place', place.id, reason, before, after);

/** BR-C05: bật cờ cần có tọa độ (V17); ghi người / thời điểm xác minh. */
async function applyAdminVerification(place: PlaceRow, verified: boolean | null | undefined, adminId: number | null): Promise<void> {
  if (verified == null) return;
  if (verified) {
    if (place.latitude == null || place.longitude == null) throw new IllegalStateError('Cần nhập tọa độ trước khi xác minh.');
    if (place.coordVerified === true) return;
    await updateRow('place', place.id, { coordVerified: true, coordVerifiedAt: nowLocal(), coordVerifiedBy: adminId });
  } else {
    await updateRow('place', place.id, { coordVerified: false, coordVerifiedAt: null, coordVerifiedBy: null });
  }
}

const fresh = async (id: number): Promise<PlaceRow> => (await placeRepo.findById(id)) as PlaceRow;

/** AC-02.01: Admin tạo — đã duyệt, hiển thị ngay (trừ khi Admin chọn Ẩn); cờ tọa độ theo lựa chọn của Admin. */
export function adminCreate(input: PlaceInput, adminAccountId: number | null) {
  return tx(async () => {
    writer.validate(input, true);
    let place = await writer.newPlace({
      category: input.category as ExploreCategory,
      actorId: adminAccountId,
      sourceType: 'OFFICIAL',
      approvalStatus: 'APPROVED',
      visibility: input.visible === false ? 'UNPUBLISHED' : 'PUBLISHED',
    });
    place = await writer.apply(place, input, adminAccountId);
    await applyAdminVerification(place, input.coordVerified, adminAccountId);
    place = await fresh(place.id);
    await auditPlace(adminAccountId, 'EXPLORE_PLACE_CREATED', place, null, snapshot(place));
    return toForm(place);
  });
}

/** AD-02: Admin sửa — áp dụng ngay; đổi tọa độ thì cờ tự tắt trừ khi Admin bật lại trong cùng lần lưu (AC-02.05). */
export function adminUpdate(id: number, input: PlaceInput, adminAccountId: number | null) {
  return tx(async () => {
    writer.validate(input, true);
    let place = await lock(id);
    const before = snapshot(place);
    const [oldLat, oldLng] = [place.latitude, place.longitude];
    place = await writer.apply(place, input, adminAccountId);
    const same = (a: number | null, b: number | null) => (a == null ? b == null : b != null && Number(a) === Number(b));
    const coordinatesChanged = !same(oldLat, place.latitude) || !same(oldLng, place.longitude);
    // AC-02.05: đổi tọa độ thì cờ tự tắt và KHÔNG được bật lại trong cùng lần lưu; Admin xác minh lại bằng thao tác riêng.
    if (input.coordVerified != null && !(coordinatesChanged && input.coordVerified === true)) await applyAdminVerification(place, input.coordVerified, adminAccountId);
    if (input.visible != null) await placeRepo.updatePlace(await fresh(id), { visibility: input.visible ? 'PUBLISHED' : 'UNPUBLISHED' });
    place = await fresh(id);
    await auditPlace(adminAccountId, 'EXPLORE_PLACE_UPDATED', place, before, snapshot(place));
    return toForm(place);
  });
}

/** AC-02.08: Ẩn / Hiển thị. Ẩn địa điểm của NCC → thông báo NCC (BR-C04 "Admin ngừng nội dung"). */
export function setVisible(id: number, visible: boolean | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    if (visible == null) throw new IllegalArgumentError('Thiếu trạng thái Hiển thị / Ẩn.');
    let place = await lock(id);
    if (place.approvalStatus !== 'APPROVED') throw new IllegalStateError('Địa điểm chưa được duyệt — hãy duyệt trước khi đổi trạng thái hiển thị.');
    const target = visible ? 'PUBLISHED' : 'UNPUBLISHED';
    if (place.visibility !== target) {
      const before = snapshot(place);
      place = await placeRepo.updatePlace(place, { visibility: target, updatedBy: adminAccountId });
      await auditPlace(adminAccountId, visible ? 'EXPLORE_PLACE_SHOWN' : 'EXPLORE_PLACE_HIDDEN', place, before, snapshot(place));
      if (!visible) await notifyProvider(place, 'PARTNER_EXPLORE_PLACE_HIDDEN', `${place.name}: quản trị viên đã ẩn địa điểm.`);
    }
    return toForm(place);
  });
}

/** AC-02.04 / BR-C05: chỉ Admin bật / tắt cờ; chưa có tọa độ thì không bật được (V17). */
export function setCoordVerified(id: number, verified: boolean | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    if (verified == null) throw new IllegalArgumentError('Thiếu trạng thái xác minh tọa độ.');
    const place = await lock(id);
    const before = snapshot(place);
    await applyAdminVerification(place, verified, adminAccountId);
    const after = await fresh(id);
    await auditPlace(adminAccountId, verified ? 'EXPLORE_COORD_VERIFIED' : 'EXPLORE_COORD_UNVERIFIED', after, before, snapshot(after));
    return toForm(after);
  });
}

/** FS Q2: xác minh tọa độ hàng loạt; bỏ qua (kèm lý do) địa điểm chưa có tọa độ hoặc không phải địa điểm khám phá. */
export function bulkVerify(ids: number[] | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    if (ids == null || ids.length === 0) throw new IllegalArgumentError('Chưa chọn địa điểm nào.');
    if (ids.length > 200) throw new IllegalArgumentError('Mỗi lần xác minh tối đa 200 địa điểm.');
    let updated = 0;
    const skipped: string[] = [];
    for (const place of await placeRepo.findAllByIds([...new Set(ids)])) {
      if (!isExplorePlace(place)) continue;
      if (place.latitude == null || place.longitude == null) {
        skipped.push(`${place.name}: chưa có tọa độ`);
        continue;
      }
      if (place.coordVerified === true) continue;
      await applyAdminVerification(place, true, adminAccountId);
      updated++;
    }
    await audit.record(adminAccountId, 'EXPLORE_COORD_VERIFIED_BULK', 'Place', null, null, null, { ids: [...ids], updated });
    return { updated, skipped };
  });
}

/** BR-C02 / V19: lý do từ chối 10–500 ký tự. */
export function rejectReason(reason: string | null | undefined): string {
  const clean = reason == null ? '' : reason.trim();
  if (clean.length < rules.REJECT_REASON_MIN || clean.length > rules.REJECT_REASON_MAX) {
    throw new IllegalArgumentError(`Lý do từ chối phải từ ${rules.REJECT_REASON_MIN} đến ${rules.REJECT_REASON_MAX} ký tự.`);
  }
  return clean;
}

/** L4: duyệt địa điểm NCC tạo → Hiển thị; thông báo NCC. */
export function approve(id: number, adminAccountId: number | null) {
  return tx(async () => {
    let place = await lock(id);
    if (place.approvalStatus !== 'PENDING') throw new IllegalStateError('Địa điểm đã được xử lý.');
    const before = snapshot(place);
    place = await placeRepo.updatePlace(place, { approvalStatus: 'APPROVED', rejectReason: null, visibility: 'PUBLISHED', updatedBy: adminAccountId });
    await auditPlace(adminAccountId, 'EXPLORE_PLACE_APPROVED', place, before, snapshot(place));
    await notifyProvider(place, 'PARTNER_EXPLORE_PLACE_APPROVED', `${place.name}: đã được duyệt.`);
    return toForm(place);
  });
}

/** L4: từ chối địa điểm NCC tạo, lý do 10–500 ký tự (BR-C02, V19). */
export function reject(id: number, reason: string | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    const clean = rejectReason(reason);
    let place = await lock(id);
    if (place.approvalStatus !== 'PENDING') throw new IllegalStateError('Địa điểm đã được xử lý.');
    const before = snapshot(place);
    place = await placeRepo.updatePlace(place, { approvalStatus: 'REJECTED', rejectReason: clean, updatedBy: adminAccountId });
    await auditPlace(adminAccountId, 'EXPLORE_PLACE_REJECTED', place, before, snapshot(place), clean);
    await notifyProvider(place, 'PARTNER_EXPLORE_PLACE_REJECTED', `${place.name}: bị từ chối. Lý do: ${clean}`);
    return toForm(place);
  });
}

/** L3 / BR-C03: duyệt bản sửa của NCC → áp dụng; đổi tọa độ thì cờ tự tắt (AC-02.05). */
export function approveEdit(id: number, adminAccountId: number | null) {
  return tx(async () => {
    let place = await lock(id);
    const edit = await pendingEdit(id, true);
    if (!edit) throw new IllegalStateError('Không có thay đổi nào đang chờ duyệt.');
    writer.validate(edit.payload, false);
    const before = snapshot(place);
    place = await writer.apply(place, edit.payload, adminAccountId);
    await updateRow('place_edit_request', edit.id, { status: 'APPROVED', reviewedBy: adminAccountId, reviewedAt: nowLocal() });
    await auditPlace(adminAccountId, 'EXPLORE_PLACE_EDIT_APPROVED', place, before, snapshot(place));
    await notifyProvider(place, 'PARTNER_EXPLORE_PLACE_APPROVED', `${place.name}: thay đổi đã được duyệt.`);
    return toForm(place);
  });
}

/** L3 / BR-C03: từ chối bản sửa — bản đang hiển thị giữ nguyên. */
export function rejectEdit(id: number, reason: string | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    const clean = rejectReason(reason);
    const place = await lock(id);
    const edit = await pendingEdit(id, true);
    if (!edit) throw new IllegalStateError('Không có thay đổi nào đang chờ duyệt.');
    await updateRow('place_edit_request', edit.id, { status: 'REJECTED', rejectReason: clean, reviewedBy: adminAccountId, reviewedAt: nowLocal() });
    await auditPlace(adminAccountId, 'EXPLORE_PLACE_EDIT_REJECTED', place, null, null, clean);
    await notifyProvider(place, 'PARTNER_EXPLORE_PLACE_REJECTED', `${place.name}: thay đổi bị từ chối. Lý do: ${clean}`);
    return toForm(place);
  });
}

// ---- NCC (BR-C01, BR-C02, BR-C03) -----------------------------------------------------------------------------------------------------

/** AC-02.06: NCC tạo → Chờ duyệt, khách chưa thấy; thông báo Admin. */
export function partnerCreate(input: PlaceInput, provider: AccountWithProvider) {
  return tx(async () => {
    writer.validate(input, false);
    let place = await writer.newPlace({
      category: input.category as ExploreCategory,
      actorId: provider.id,
      providerId: provider.provider!.id,
      sourceType: 'PROVIDER',
      approvalStatus: 'PENDING',
      visibility: 'DRAFT',
    });
    place = await writer.apply(place, input, provider.id);
    await recorder.toAdmins('ADMIN_NEW_EXPLORE_PLACE', 'Place', place.id, `${place.name}: NCC gửi địa điểm mới — đang chờ duyệt.`, ADMIN_TARGET);
    return toForm(place);
  });
}

/** NCC không được gửi cờ xác minh / trạng thái hiển thị (BR-C05, V18); giá và thông tin dịch vụ giữ nguyên. */
export const withoutAdminFields = (input: PlaceInput): PlaceInput => ({ ...input, coordVerified: null, visible: null });

/**
 * NCC sửa. Địa điểm chưa được duyệt (Chờ duyệt / Bị từ chối) → ghi thẳng và đưa về Chờ duyệt. Đã duyệt → tạo bản sửa chờ duyệt, khách vẫn
 * thấy bản cũ (BR-C03); bản sửa chờ duyệt trước đó (nếu có) bị thay thế.
 */
export function partnerUpdate(id: number, input: PlaceInput, provider: AccountWithProvider) {
  return tx(async () => {
    writer.validate(input, false);
    let place = await lock(id);
    requireOwner(place, provider.provider!.id);
    const clean = withoutAdminFields(input);
    if ((place.approvalStatus as PlaceApprovalStatus) !== 'APPROVED') {
      place = await writer.apply(place, clean, provider.id);
      place = await placeRepo.updatePlace(place, { approvalStatus: 'PENDING', rejectReason: null });
    } else {
      const old = await pendingEdit(id, true);
      if (old) await updateRow('place_edit_request', old.id, { status: 'CANCELLED' });
      await insertRow('place_edit_request', { placeId: id, payload: json(clean), status: 'PENDING', submittedBy: provider.id, submittedAt: nowLocal() });
    }
    await recorder.toAdmins('ADMIN_NEW_EXPLORE_PLACE', 'Place', place.id, `${place.name}: NCC gửi thay đổi địa điểm — đang chờ duyệt.`, ADMIN_TARGET);
    return toForm(place);
  });
}

async function notifyProvider(place: PlaceRow, template: string, message: string): Promise<void> {
  if (place.providerId == null) return;
  await recorder.toProvider(place.providerId, template, 'Place', place.id, message, 'explore-places');
}

