import { one, query, scalar, tx } from '../db/pool.js';
import { Where, insertRow, updateRow } from '../db/sql.js';
import type { CategoryKind, ServiceGroup } from '../domain/enums.js';
import { HttpError, IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import * as rules from '../lib/exploreRules.js';
import { pageOf, type PageJson } from '../lib/page.js';
import * as labels from '../lib/placeLabels.js';
import { nowLocal } from '../lib/time.js';
import type { PlaceRow } from '../repositories/placeRepo.js';
import * as placeRepo from '../repositories/placeRepo.js';
import type { UserPrincipal } from '../security/principal.js';
import * as audit from './auditLogService.js';
import { normalizeName } from './explorePlaceWriter.js';
import * as recorder from './notificationRecorder.js';
import { actor } from './partnerHomestayService.js';

/**
 * "Gợi ý quanh đây": NCC bật gợi ý cho địa điểm của mình; khách đã bật gợi ý đi tới gần một điểm nổi tiếng thì ứng dụng hiện thông báo gợi
 * ý các địa điểm đó. Máy chủ chỉ trả danh sách điểm mốc + gợi ý; ứng dụng tự tính khoảng cách nên vị trí của khách không rời khỏi máy.
 * Admin ẩn được gợi ý vi phạm (NCC được thông báo, sửa lời mời không tự mở lại).
 */

/** Khách cách điểm mốc không quá 1,5 km thì coi là "đang ở" điểm đó (GPS trên núi sai số vài trăm mét). */
export const TRIGGER_RADIUS_M = 1500;
export const RADIUS_MIN_KM = 1;
export const RADIUS_MAX_KM = 30;
export const RADIUS_DEFAULT_KM = 5;
export const MESSAGE_MAX = 120;
const PARTNER_TARGET = 'nearby-offers';
const ADMIN_PAGE_MAX = 50;
/** Loại địa điểm làm điểm mốc: điểm tham quan và điểm chụp ảnh nổi tiếng. */
const LANDMARK_KINDS: CategoryKind[] = ['ATTRACTION', 'PHOTO'];
/** Lời mời không được dẫn khách ra ngoài: chặn đường link / tên miền. */
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|vn|net|org|info|me|io|xyz|top|site|link|ly)\b)/i;

export interface OfferInput {
  enabled?: boolean | null;
  message?: string | null;
  radiusKm?: number | null;
}

interface OfferRow {
  placeId: number;
  enabled: boolean;
  message: string | null;
  radiusKm: number;
  hiddenByAdmin: boolean;
  hiddenReason: string | null;
  hiddenAt: string | null;
  updatedAt: string;
  updatedBy: number | null;
}

// ---- Truy vấn -----------------------------------------------------------------------------------------------------------------

/** Điểm mốc khách đi tới — chỉ điểm đang hiển thị, tọa độ đã xác minh. */
async function findLandmarks(): Promise<PlaceRow[]> {
  return query<PlaceRow>(
    `SELECT * FROM place WHERE kind = ANY($1) AND is_deleted = FALSE AND visibility = 'PUBLISHED' AND approval_status = 'APPROVED'
        AND coord_verified = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY name`,
    [LANDMARK_KINDS],
  );
}

async function profilesOf(ids: number[]): Promise<Map<number, ServiceGroup>> {
  const map = new Map<number, ServiceGroup>();
  if (ids.length > 0) for (const p of await query<{ placeId: number; serviceGroup: ServiceGroup }>('SELECT place_id, service_group FROM place_service_profile WHERE place_id = ANY($1)', [ids])) map.set(p.placeId, p.serviceGroup);
  return map;
}

async function coversOf(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  for (const c of await placeRepo.publicUrlsByPlaceIds(ids)) if (!map.has(c.id)) map.set(c.id, c.value);
  return map;
}

// ---- Phía khách ---------------------------------------------------------------------------------------------------------------

export async function suggestions() {
  const landmarks = (await findLandmarks()).map((p) => ({ id: p.id, name: p.name, slug: p.slug, kind: p.kind, latitude: p.latitude, longitude: p.longitude }));
  // Gợi ý khách thấy được: đang bật, Admin chưa ẩn; địa điểm đã duyệt, đang hiển thị, đang hoạt động, có tọa độ; NCC đang hoạt động.
  const active = await query<PlaceRow & { offerRadiusKm: number; offerMessage: string | null }>(
    `SELECT p.*, o.radius_km AS offer_radius_km, o.message AS offer_message
       FROM place_nearby_offer o JOIN place p ON p.id = o.place_id JOIN provider pr ON pr.id = p.provider_id
      WHERE o.enabled = TRUE AND o.hidden_by_admin = FALSE AND p.is_deleted = FALSE AND p.visibility = 'PUBLISHED'
        AND p.approval_status = 'APPROVED' AND p.operation_status = 'OPERATING' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        AND (p.kind = 'HOMESTAY' OR p.coord_verified = TRUE) AND pr.status = 'ACTIVE'
      ORDER BY o.place_id`,
  );
  const ids = active.map((p) => p.id);
  const covers = await coversOf(ids);
  const profiles = await profilesOf(ids);
  return {
    triggerRadiusM: TRIGGER_RADIUS_M,
    landmarks,
    offers: active.map((p) => ({
      placeId: p.id,
      name: p.name,
      slug: p.slug,
      kind: p.kind,
      label: labels.label(p.kind, profiles.get(p.id)),
      latitude: p.latitude,
      longitude: p.longitude,
      radiusKm: p.offerRadiusKm,
      message: p.offerMessage,
      imageUrl: covers.get(p.id) ?? null,
      priceFrom: p.priceRefMin,
      priceUnit: p.priceUnitNote,
    })),
  };
}

// ---- Phía NCC -----------------------------------------------------------------------------------------------------------------

/**
 * Lý do địa điểm chưa thể gợi ý; null = đủ điều kiện. Địa điểm khám phá phải có tọa độ đã xác minh (như mục "Khám phá quanh đây");
 * homestay dùng tọa độ chủ nhà ghim khi đăng.
 */
export function notEligibleReason(p: PlaceRow): string | null {
  if (p.approvalStatus !== 'APPROVED') return 'địa điểm chưa được duyệt.';
  if (p.visibility !== 'PUBLISHED') return 'địa điểm đang ẩn với khách.';
  if (p.operationStatus === 'TEMP_CLOSED') return 'địa điểm đang tạm ngừng hoạt động.';
  if (p.latitude == null || p.longitude == null) return 'địa điểm chưa có vị trí trên bản đồ.';
  if (p.kind !== 'HOMESTAY' && p.coordVerified !== true) return 'vị trí trên bản đồ chưa được quản trị viên xác minh.';
  return null;
}

/** Lời mời: gộp khoảng trắng, tối đa 120 ký tự, không chứa đường link; rỗng → null. */
function messageOf(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const clean = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (clean === '') return null;
  if (clean.length > MESSAGE_MAX) throw new IllegalArgumentError(`Lời mời tối đa ${MESSAGE_MAX} ký tự.`);
  if (LINK.test(clean)) throw new IllegalArgumentError('Lời mời không được chứa đường link hoặc tên trang web.');
  return clean;
}

/** Lý do ẩn 10–500 ký tự (cùng giới hạn với lý do từ chối địa điểm). */
function hideReason(reason: string | null | undefined): string {
  const clean = reason == null ? '' : reason.trim();
  if (clean.length < rules.REJECT_REASON_MIN || clean.length > rules.REJECT_REASON_MAX) {
    throw new IllegalArgumentError(`Lý do ẩn phải từ ${rules.REJECT_REASON_MIN} đến ${rules.REJECT_REASON_MAX} ký tự.`);
  }
  return clean;
}

const capitalize = (text: string): string => (text === '' ? text : text[0].toUpperCase() + text.slice(1));

/** Điểm mốc trong bán kính gợi ý của địa điểm, gần nhất trước, tối đa 8. */
function landmarksWithin(place: PlaceRow, radiusKm: number, landmarks: PlaceRow[]) {
  if (place.latitude == null || place.longitude == null) return [];
  const hits = [];
  for (const l of landmarks) {
    if (l.id === place.id) continue;
    const km = rules.haversineKm(place.latitude, place.longitude, l.latitude as number, l.longitude as number);
    if (km <= radiusKm) hits.push({ id: l.id, name: l.name, distanceKm: km, distanceText: rules.formatDistance(km) });
  }
  hits.sort((a, b) => a.distanceKm - b.distanceKm);
  return hits.slice(0, 8);
}

const providerPlaces = (providerId: number): Promise<PlaceRow[]> => query<PlaceRow>('SELECT * FROM place WHERE provider_id = $1 AND is_deleted = FALSE ORDER BY name, id', [providerId]);

async function partnerRows(places: PlaceRow[]) {
  const ids = places.map((p) => p.id);
  const byPlace = new Map<number, OfferRow>();
  if (ids.length > 0) for (const o of await query<OfferRow>('SELECT * FROM place_nearby_offer WHERE place_id = ANY($1)', [ids])) byPlace.set(o.placeId, o);
  const covers = await coversOf(ids);
  const profiles = await profilesOf(ids);
  const landmarks = await findLandmarks();
  return places.map((p) => {
    const o = byPlace.get(p.id);
    const reason = notEligibleReason(p);
    const radius = o ? o.radiusKm : RADIUS_DEFAULT_KM;
    return {
      placeId: p.id,
      placeName: p.name,
      kind: p.kind,
      label: labels.label(p.kind, profiles.get(p.id)),
      imageUrl: covers.get(p.id) ?? null,
      eligible: reason == null,
      notEligibleReason: reason == null ? null : capitalize(reason),
      configured: o != null,
      enabled: o != null && o.enabled === true,
      message: o?.message ?? null,
      radiusKm: radius,
      hiddenByAdmin: o != null && o.hiddenByAdmin === true,
      hiddenReason: o?.hiddenReason ?? null,
      updatedAt: o?.updatedAt ?? null,
      landmarks: landmarksWithin(p, radius, landmarks),
    };
  });
}

export async function partnerList(principal: UserPrincipal | undefined) {
  const account = await actor(principal, false);
  return { radiusMinKm: RADIUS_MIN_KM, radiusMaxKm: RADIUS_MAX_KM, messageMax: MESSAGE_MAX, places: await partnerRows(await providerPlaces(account.provider!.id)) };
}

/** NCC lưu cài đặt gợi ý của một địa điểm; bật gợi ý cần địa điểm đủ điều kiện ({@link notEligibleReason}). */
export function partnerSave(principal: UserPrincipal | undefined, placeId: number, input: OfferInput | null | undefined) {
  return tx(async () => {
    const account = await actor(principal, true);
    if (!input) throw new IllegalArgumentError('Thiếu cài đặt gợi ý.');
    const place = (await providerPlaces(account.provider!.id)).find((p) => p.id === placeId);
    if (!place) throw new HttpError(404, 'Không tìm thấy địa điểm của bạn.');
    const offer = await one<OfferRow>('SELECT * FROM place_nearby_offer WHERE place_id = $1 FOR UPDATE', [placeId]);
    const radius = input.radiusKm != null ? input.radiusKm : offer ? offer.radiusKm : RADIUS_DEFAULT_KM;
    if (radius < RADIUS_MIN_KM || radius > RADIUS_MAX_KM) throw new IllegalArgumentError(`Bán kính gợi ý từ ${RADIUS_MIN_KM} đến ${RADIUS_MAX_KM} km.`);
    const message = messageOf(input.message);
    const enabled = input.enabled == null || input.enabled;
    if (enabled) {
      const reason = notEligibleReason(place);
      if (reason != null) throw new IllegalStateError(`Chưa thể bật gợi ý: ${reason}`);
    }
    const fields = { enabled, message, radiusKm: radius, updatedAt: nowLocal(), updatedBy: account.id };
    if (offer) await updateRow('place_nearby_offer', placeId, fields, 'place_id');
    else await insertRow('place_nearby_offer', { placeId, ...fields });
    return (await partnerRows([place]))[0];
  });
}

// ---- Phía Admin -----------------------------------------------------------------------------------------------------------------

type AdminRow = OfferRow & PlaceRow & { providerName: string | null; offerUpdatedAt: string };

const ADMIN_SELECT = `SELECT o.place_id, o.enabled, o.message AS offer_message, o.radius_km, o.hidden_by_admin, o.hidden_reason, o.hidden_at, o.updated_at AS offer_updated_at,
       p.id, p.name, p.kind, p.provider_id, p.visibility, p.approval_status, p.operation_status, p.latitude, p.longitude, p.coord_verified, pr.name AS provider_name
  FROM place_nearby_offer o JOIN place p ON p.id = o.place_id LEFT JOIN provider pr ON pr.id = p.provider_id`;

async function adminRows(rows: Array<Record<string, any>>) {
  const profiles = await profilesOf(rows.map((r) => r.placeId));
  return rows.map((r) => ({
    placeId: r.placeId,
    placeName: r.name,
    kind: r.kind,
    label: labels.label(r.kind, profiles.get(r.placeId)),
    providerId: r.providerId,
    providerName: r.providerName,
    enabled: r.enabled === true,
    message: r.offerMessage,
    radiusKm: r.radiusKm,
    hiddenByAdmin: r.hiddenByAdmin === true,
    hiddenReason: r.hiddenReason,
    hiddenAt: r.hiddenAt,
    updatedAt: r.offerUpdatedAt,
    placeVisible: notEligibleReason(r as PlaceRow) == null,
  }));
}

export async function adminList(hidden: boolean | undefined, keyword: string | undefined, page: number, size: number): Promise<PageJson<unknown>> {
  const norm = normalizeName(keyword).replace(/%/g, '');
  const where = new Where();
  if (hidden != null) where.and('o.hidden_by_admin = ?', hidden);
  if (norm !== '') where.and(`p.name_norm LIKE ? ESCAPE '\\'`, `%${norm.replace(/[\\_]/g, (c) => `\\${c}`)}%`);
  const p = Math.max(page, 0);
  const s = Math.min(Math.max(size, 1), ADMIN_PAGE_MAX);
  const total = (await scalar<number>(`SELECT count(*) FROM place_nearby_offer o JOIN place p ON p.id = o.place_id ${where.toSql()}`, where.params)) ?? 0;
  const rows = await query(`${ADMIN_SELECT} ${where.toSql()} ORDER BY o.updated_at DESC, o.place_id DESC LIMIT ${s} OFFSET ${p * s}`, where.params);
  return pageOf(await adminRows(rows), p, s, total, true);
}

async function adminRow(placeId: number) {
  const [row] = await query(`${ADMIN_SELECT} WHERE o.place_id = $1`, [placeId]);
  return (await adminRows([row]))[0];
}

async function lockedOffer(placeId: number): Promise<OfferRow> {
  const offer = await one<OfferRow>('SELECT * FROM place_nearby_offer WHERE place_id = $1 FOR UPDATE', [placeId]);
  if (!offer) throw new HttpError(404, 'Không tìm thấy gợi ý.');
  return offer;
}

const snapshot = (o: OfferRow): Record<string, unknown> => ({ enabled: o.enabled, message: o.message, radiusKm: o.radiusKm, hiddenByAdmin: o.hiddenByAdmin });

async function notifyProvider(placeId: number, template: string, message: string): Promise<void> {
  const place = await placeRepo.findById(placeId);
  if (place?.providerId == null) return;
  await recorder.toProvider(place.providerId, template, 'Place', placeId, message, PARTNER_TARGET);
}

/** Admin ẩn gợi ý vi phạm, lý do 10–500 ký tự; NCC được thông báo kèm lý do. */
export function hide(placeId: number, reason: string | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    const clean = hideReason(reason);
    const offer = await lockedOffer(placeId);
    if (offer.hiddenByAdmin === true) throw new IllegalStateError('Gợi ý này đã bị ẩn.');
    const before = snapshot(offer);
    await updateRow('place_nearby_offer', placeId, { hiddenByAdmin: true, hiddenReason: clean, hiddenAt: nowLocal() }, 'place_id');
    const after = (await one<OfferRow>('SELECT * FROM place_nearby_offer WHERE place_id = $1', [placeId]))!;
    await audit.record(adminAccountId, 'NEARBY_OFFER_HIDDEN', 'Place', placeId, clean, before, snapshot(after));
    const place = await placeRepo.findById(placeId);
    await notifyProvider(placeId, 'PARTNER_NEARBY_OFFER_HIDDEN', `${place?.name}: quản trị viên đã ẩn gợi ý quanh đây. Lý do: ${clean}`);
    return adminRow(placeId);
  });
}

export function show(placeId: number, adminAccountId: number | null) {
  return tx(async () => {
    const offer = await lockedOffer(placeId);
    if (offer.hiddenByAdmin !== true) throw new IllegalStateError('Gợi ý này đang không bị ẩn.');
    const before = snapshot(offer);
    await updateRow('place_nearby_offer', placeId, { hiddenByAdmin: false, hiddenReason: null, hiddenAt: null }, 'place_id');
    const after = (await one<OfferRow>('SELECT * FROM place_nearby_offer WHERE place_id = $1', [placeId]))!;
    await audit.record(adminAccountId, 'NEARBY_OFFER_SHOWN', 'Place', placeId, null, before, snapshot(after));
    const place = await placeRepo.findById(placeId);
    await notifyProvider(placeId, 'PARTNER_NEARBY_OFFER_SHOWN', `${place?.name}: gợi ý quanh đây đã được hiển thị trở lại.`);
    return adminRow(placeId);
  });
}
