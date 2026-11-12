import { exec, one, query, scalar } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import type {
  AmenityScope,
  AmenityValue,
  CategoryKind,
  ContactChannel,
  HighlightType,
  MediaRole,
  PlaceApprovalStatus,
  PlaceOperationStatus,
  PlaceVerificationStatus,
  PlaceVisibility,
  ServiceGroup,
  SourceType,
} from '../domain/enums.js';
import { nowLocal } from '../lib/time.js';
import { containsPattern, likeSql } from '../lib/vietnamese.js';

export interface PlaceRow {
  id: number;
  slug: string;
  kind: CategoryKind;
  name: string;
  nameNorm: string;
  description: string | null;
  badge: string | null;
  providerId: number | null;
  regionId: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
  accessNote: string | null;
  priceRefMin: number | null;
  priceRefMax: number | null;
  priceUnitNote: string | null;
  visibility: PlaceVisibility;
  operationStatus: PlaceOperationStatus;
  operationNote: string | null;
  isDeleted: boolean;
  googleRating: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  sourceType: SourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  verification: PlaceVerificationStatus;
  lastVerifiedAt: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
  coordVerified: boolean;
  coordVerifiedAt: string | null;
  coordVerifiedBy: number | null;
  approvalStatus: PlaceApprovalStatus;
  rejectReason: string | null;
  /** Cờ Admin: dữ liệu đã được xác thực (chính thống). Địa điểm tạo mới mặc định chưa xác thực. */
  dataVerified: boolean;
}

export interface PlaceWithRegion extends PlaceRow {
  regionName: string | null;
}

export interface RegionRow {
  id: number;
  code: string;
  name: string;
  nameNorm: string;
  level: number;
  parentId: number | null;
  path: string;
  isActive: boolean;
}

export interface AmenityRow {
  id: number;
  code: string;
  name: string;
  scope: AmenityScope;
  isEssential: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface ContactRow {
  id: number;
  placeId: number;
  channel: ContactChannel;
  value: string;
  isPublic: boolean;
  sortOrder: number;
}

export interface HighlightRow {
  id: number;
  placeId: number;
  type: HighlightType;
  content: string;
  isPublic: boolean;
  sortOrder: number;
}

export interface AttractionProfileRow {
  placeId: number;
  needs: string | null;
  suitableSessions: string | null;
  seasonStartMd: number | null;
  seasonEndMd: number | null;
  visitMinutes: number | null;
}

export interface PlaceServiceProfileRow {
  placeId: number;
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
  updatedAt: string;
}

export interface PlaceMediaItem {
  placeId: number;
  mediaId: number;
  role: MediaRole;
  caption: string | null;
  sortOrder: number;
  publicUrl: string | null;
}

const WITH_REGION = `SELECT p.*, r.name AS region_name FROM place p LEFT JOIN region r ON r.id = p.region_id`;

/** Địa điểm theo id (kể cả đã xóa mềm). */
export async function findById(id: number): Promise<PlaceRow | null> {
  return one<PlaceRow>('SELECT * FROM place WHERE id = $1', [id]);
}

export async function findByIdForUpdate(id: number): Promise<PlaceRow | null> {
  return one<PlaceRow>('SELECT * FROM place WHERE id = $1 FOR UPDATE', [id]);
}

export async function findBySlug(slug: string): Promise<PlaceRow | null> {
  return one<PlaceRow>('SELECT * FROM place WHERE slug = $1', [slug]);
}

export async function findAllByIds(ids: readonly number[]): Promise<PlaceRow[]> {
  if (ids.length === 0) return [];
  return query<PlaceRow>('SELECT * FROM place WHERE id = ANY($1)', [ids]);
}

/** Chi tiết công khai theo id (chưa xóa), kèm tên khu vực. */
export async function findDetailById(id: number): Promise<PlaceWithRegion | null> {
  return one<PlaceWithRegion>(`${WITH_REGION} WHERE p.id = $1 AND p.is_deleted = FALSE`, [id]);
}

export async function findDetailBySlug(slug: string): Promise<PlaceWithRegion | null> {
  return one<PlaceWithRegion>(`${WITH_REGION} WHERE p.slug = $1 AND p.is_deleted = FALSE`, [slug]);
}

export async function withRegionByIds(ids: readonly number[]): Promise<PlaceWithRegion[]> {
  if (ids.length === 0) return [];
  return query<PlaceWithRegion>(`${WITH_REGION} WHERE p.id = ANY($1)`, [ids]);
}

export async function insertPlace(data: Partial<PlaceRow> & Pick<PlaceRow, 'slug' | 'kind' | 'name' | 'nameNorm'>): Promise<PlaceRow> {
  const now = nowLocal();
  return insertRow<PlaceRow>('place', {
    visibility: 'DRAFT',
    operationStatus: 'OPERATING',
    isDeleted: false,
    ratingCount: 0,
    sourceType: 'PUBLIC_TRUSTED',
    verification: 'UNVERIFIED',
    coordVerified: false,
    dataVerified: false,
    approvalStatus: 'APPROVED',
    createdAt: now,
    updatedAt: now,
    ...data,
  });
}

function sameCoordinate(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null) return b == null;
  return b != null && Number(a) === Number(b);
}

/**
 * Cập nhật địa điểm (tương đương lưu entity Place): luôn đặt updated_at; tọa độ đổi thì cờ "Tọa độ đã xác minh" tự tắt
 * (BR-C05 / AC-02.05).
 */
export async function updatePlace(current: PlaceRow, patch: Partial<PlaceRow>): Promise<PlaceRow> {
  const next: Record<string, unknown> = { ...patch, updatedAt: nowLocal() };
  const latChanged = 'latitude' in patch && !sameCoordinate(current.latitude, patch.latitude);
  const lngChanged = 'longitude' in patch && !sameCoordinate(current.longitude, patch.longitude);
  if (latChanged || lngChanged) {
    next.coordVerified = false;
    next.coordVerifiedAt = null;
    next.coordVerifiedBy = null;
  }
  const row = await updateRow<PlaceRow>('place', current.id, next);
  return row as PlaceRow;
}

// ---- Khu vực ----------------------------------------------------------------------------------------------------

export async function findActiveRegions(): Promise<RegionRow[]> {
  return query<RegionRow>('SELECT * FROM region WHERE is_active = TRUE ORDER BY id');
}

export async function findAllRegions(): Promise<RegionRow[]> {
  return query<RegionRow>('SELECT * FROM region ORDER BY id');
}

export async function findRegionById(id: number): Promise<RegionRow | null> {
  return one<RegionRow>('SELECT * FROM region WHERE id = $1', [id]);
}

export async function findRegionByCode(code: string): Promise<RegionRow | null> {
  return one<RegionRow>('SELECT * FROM region WHERE code = $1', [code]);
}

/** Tỉnh / thành (cấp 1) chứa khu vực này — chính nó khi đã là cấp 1 hoặc không có cha. */
export async function provinceOfRegion(regionId: number): Promise<RegionRow | null> {
  return one<RegionRow>(
    `WITH RECURSIVE chain AS (
       SELECT r.*, 0 AS depth FROM region r WHERE r.id = $1
       UNION ALL
       SELECT p.*, c.depth + 1 FROM region p JOIN chain c ON p.id = c.parent_id WHERE c.level > 1 AND c.depth < 5
     )
     SELECT id, code, name, name_norm, level, parent_id, path, is_active FROM chain ORDER BY depth DESC LIMIT 1`,
    [regionId],
  );
}

// ---- Ảnh --------------------------------------------------------------------------------------------------------

/** Ảnh của nhiều địa điểm: mỗi dòng {id: placeId, value: url}, ảnh COVER đứng đầu rồi theo sortOrder. */
export async function publicUrlsByPlaceIds(placeIds: readonly number[]): Promise<Array<{ id: number; value: string }>> {
  if (placeIds.length === 0) return [];
  return query(
    `SELECT pm.place_id AS id, ma.public_url AS value FROM place_media pm JOIN media_asset ma ON ma.id = pm.media_id
      WHERE pm.place_id = ANY($1)
      ORDER BY pm.place_id, CASE WHEN pm.role = 'COVER' THEN 0 ELSE 1 END, pm.sort_order ASC`,
    [placeIds],
  );
}

export async function mediaWithAsset(placeId: number): Promise<PlaceMediaItem[]> {
  return query<PlaceMediaItem>(
    `SELECT pm.place_id, pm.media_id, pm.role, pm.caption, pm.sort_order, ma.public_url
       FROM place_media pm JOIN media_asset ma ON ma.id = pm.media_id
      WHERE pm.place_id = $1
      ORDER BY CASE WHEN pm.role = 'COVER' THEN 0 ELSE 1 END, pm.sort_order ASC`,
    [placeId],
  );
}

// ---- Tiện nghi, liên hệ, điểm nổi bật -----------------------------------------------------------------------------

export interface PlaceAmenityItem {
  placeId: number;
  amenityId: number;
  value: AmenityValue;
  note: string | null;
  code: string;
  name: string;
  sortOrder: number;
}

export async function placeAmenities(placeIds: readonly number[]): Promise<PlaceAmenityItem[]> {
  if (placeIds.length === 0) return [];
  return query<PlaceAmenityItem>(
    `SELECT pa.place_id, pa.amenity_id, pa.value, pa.note, a.code, a.name, a.sort_order
       FROM place_amenity pa JOIN amenity a ON a.id = pa.amenity_id
      WHERE pa.place_id = ANY($1) ORDER BY a.sort_order ASC`,
    [placeIds],
  );
}

export type AmenityInUseRow = AmenityRow & { count: number };

/** Tiện ích (cấp cơ sở) đang được ít nhất một chỗ nghỉ công khai thuộc kind xác nhận có (YES). */
export async function placeAmenitiesInUse(kind: CategoryKind): Promise<AmenityInUseRow[]> {
  return query<AmenityInUseRow>(
    `SELECT a.*, COUNT(DISTINCT p.id)::int AS count FROM place_amenity pa JOIN amenity a ON a.id = pa.amenity_id JOIN place p ON p.id = pa.place_id
      WHERE pa.value = 'YES' AND a.is_active = TRUE AND p.kind = $1 AND p.is_deleted = FALSE AND p.visibility = 'PUBLISHED'
      GROUP BY a.id`,
    [kind],
  );
}

/** Tiện ích cấp phòng (YES) của các loại phòng đang mở bán thuộc chỗ nghỉ công khai có kind. */
export async function roomAmenitiesInUse(kind: CategoryKind): Promise<AmenityInUseRow[]> {
  return query<AmenityInUseRow>(
    `SELECT a.*, COUNT(DISTINCT p.id)::int AS count FROM room_amenity ra JOIN amenity a ON a.id = ra.amenity_id JOIN room_type rt ON rt.id = ra.room_type_id
       JOIN place p ON p.id = rt.place_id
      WHERE ra.value = 'YES' AND a.is_active = TRUE AND rt.status = 'ACTIVE' AND p.kind = $1 AND p.is_deleted = FALSE
        AND p.visibility = 'PUBLISHED'
      GROUP BY a.id`,
    [kind],
  );
}

export async function publicContacts(placeIds: readonly number[]): Promise<ContactRow[]> {
  if (placeIds.length === 0) return [];
  return query<ContactRow>('SELECT * FROM place_contact WHERE place_id = ANY($1) AND is_public = TRUE ORDER BY sort_order ASC', [placeIds]);
}

export async function publicContactsByChannel(placeIds: readonly number[], channel: ContactChannel): Promise<ContactRow[]> {
  if (placeIds.length === 0) return [];
  return query<ContactRow>(
    'SELECT * FROM place_contact WHERE place_id = ANY($1) AND channel = $2 AND is_public = TRUE ORDER BY sort_order ASC',
    [placeIds, channel],
  );
}

export async function publicHighlights(placeId: number): Promise<HighlightRow[]> {
  return query<HighlightRow>('SELECT * FROM place_highlight WHERE place_id = $1 AND is_public = TRUE ORDER BY sort_order ASC, id ASC', [placeId]);
}

// ---- Hồ sơ riêng theo loại ----------------------------------------------------------------------------------------

export async function attractionProfiles(placeIds: readonly number[]): Promise<AttractionProfileRow[]> {
  if (placeIds.length === 0) return [];
  return query<AttractionProfileRow>('SELECT * FROM attraction_profile WHERE place_id = ANY($1)', [placeIds]);
}

export async function serviceProfiles(placeIds: readonly number[]): Promise<PlaceServiceProfileRow[]> {
  if (placeIds.length === 0) return [];
  return query<PlaceServiceProfileRow>('SELECT * FROM place_service_profile WHERE place_id = ANY($1)', [placeIds]);
}

/** Nhãn đang dùng của một nhóm cho nhiều địa điểm: mỗi dòng {id: placeId, value: tên nhãn}. */
export async function tagNames(placeIds: readonly number[], groupCode: string): Promise<Array<{ id: number; value: string }>> {
  if (placeIds.length === 0) return [];
  return query(
    `SELECT pt.place_id AS id, t.name AS value FROM place_tag pt JOIN tag t ON t.id = pt.tag_id
      WHERE pt.place_id = ANY($1) AND t.group_code = $2 AND t.is_active = TRUE ORDER BY pt.place_id, t.name`,
    [placeIds, groupCode],
  );
}

// ---- Lân cận ----------------------------------------------------------------------------------------------------

export interface NearbyRow {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  kind: CategoryKind;
  needs: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  distance: number;
}

/**
 * Điểm lân cận gần nhất trong bán kính. Lọc trước theo khung tọa độ để chỉ tính khoảng cách Haversine cho các điểm trong
 * khung; ảnh bìa chỉ lấy cho các dòng cuối cùng (sau ORDER BY + LIMIT).
 */
export async function findNearbyPlaces(
  lat: number,
  lng: number,
  radius: number,
  box: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  placeId: number,
  limit: number,
): Promise<NearbyRow[]> {
  return query<NearbyRow>(
    `SELECT n.id, n.name, n.description,
            (SELECT ma.public_url FROM place_media pm JOIN media_asset ma ON ma.id = pm.media_id
              WHERE pm.place_id = n.id AND pm.role = 'COVER' ORDER BY pm.sort_order LIMIT 1) AS image_url,
            n.kind, ap.needs, n.latitude, n.longitude, n.address, n.distance
       FROM (
         SELECT id, name, description, kind, latitude, longitude, address,
                (6371 * acos(least(1.0, greatest(-1.0, cos(radians($1::float8)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2::float8))
                                                      + sin(radians($1::float8)) * sin(radians(latitude)))))) AS distance
           FROM place
          WHERE visibility = 'PUBLISHED' AND is_deleted = false AND id <> $3
            AND latitude BETWEEN $4 AND $5 AND longitude BETWEEN $6 AND $7
            AND kind <> 'HOMESTAY'
       ) n
       LEFT JOIN attraction_profile ap ON ap.place_id = n.id
      WHERE n.distance <= $8
      ORDER BY n.distance
      LIMIT $9`,
    [lat, lng, placeId, box.minLat, box.maxLat, box.minLng, box.maxLng, radius, limit],
  );
}

/** Tọa độ của một địa điểm chưa xóa; null nếu không có địa điểm. */
export async function coordinatesOf(id: number): Promise<{ latitude: number | null; longitude: number | null } | null> {
  return one('SELECT latitude, longitude FROM place WHERE id = $1 AND is_deleted = FALSE', [id]);
}

/** Điểm công khai của một tỉnh (region cấp 1): gắn thẳng vào tỉnh, huyện hoặc xã của tỉnh. */
export async function findPublicPlacesInProvince(provinceId: number, kind: CategoryKind): Promise<PlaceWithRegion[]> {
  return query<PlaceWithRegion>(
    `SELECT p.*, r.name AS region_name FROM place p JOIN region r ON r.id = p.region_id
       LEFT JOIN region rp ON rp.id = r.parent_id LEFT JOIN region rpp ON rpp.id = rp.parent_id
      WHERE p.kind = $2 AND p.visibility = 'PUBLISHED' AND p.is_deleted = FALSE
        AND (r.id = $1 OR rp.id = $1 OR rpp.id = $1)
      ORDER BY p.name ASC`,
    [provinceId, kind],
  );
}

// ---- Danh sách công khai ------------------------------------------------------------------------------------------

export interface PublicListFilter {
  kind?: CategoryKind | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  amenities?: string[] | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  attractionIds?: number[] | null;
  keyword?: string | null;
  needs?: string | null;
  guests?: number | null;
}

/**
 * Điều kiện lọc danh sách công khai — chuyển từ PlaceSpecification.filterPublicPlaces. Lọc theo ngày ở KHÔNG loại địa
 * điểm khỏi kết quả (frontend cần hiện cơ sở hết phòng là "Không khả dụng"), nên không có điều kiện ngày ở đây.
 */
function publicWhere(f: PublicListFilter): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const parts: string[] = [];

  const kw = containsPattern(f.keyword);
  if (kw) {
    const p = add(kw);
    parts.push(`(${likeSql('p.name', p)} OR ${likeSql('p.address', p)})`);
  }
  parts.push(`p.visibility = 'PUBLISHED'`, `p.operation_status IN ('OPERATING', 'TEMP_CLOSED')`, `p.is_deleted = FALSE`);
  if (f.kind) parts.push(`p.kind = ${add(f.kind)}`);

  if (f.needs && f.needs.trim()) {
    parts.push(`p.id IN (SELECT place_id FROM attraction_profile WHERE needs = ${add(f.needs.trim().toLowerCase())})`);
  }

  if (f.attractionIds && f.attractionIds.length > 0) {
    const ids = add(f.attractionIds);
    // Điểm du lịch gắn thẳng vào quận (level 2) hoặc vào phường/xã (level 3 → lấy quận cha).
    const district = `(SELECT ar.id FROM place a JOIN region ar ON ar.id = a.region_id WHERE a.id = ANY(${ids}) AND ar.level = 2)`;
    const wardParent = `(SELECT ar.parent_id FROM place a JOIN region ar ON ar.id = a.region_id WHERE a.id = ANY(${ids}) AND ar.level = 3)`;
    parts.push(`(r.id IN ${district} OR r.id IN ${wardParent} OR rp.id IN ${district} OR rp.id IN ${wardParent})`);
  } else {
    // Huyện -> Tỉnh (không lọc tới Phường/Xã), so khớp không phân biệt dấu.
    const districtPattern = containsPattern(f.district);
    const provincePattern = containsPattern(f.province);
    if (districtPattern) {
      const p = add(districtPattern);
      parts.push(`(${likeSql('r.name', p)} OR ${likeSql('rp.name', p)} OR ${likeSql('r.path', p)} OR ${likeSql('p.address', p)})`);
    } else if (provincePattern) {
      const p = add(provincePattern);
      parts.push(
        `(${likeSql('r.name', p)} OR ${likeSql('rp.name', p)} OR ${likeSql('rpp.name', p)} OR ${likeSql('r.path', p)} OR ${likeSql('p.address', p)})`,
      );
    }
  }

  // Khoảng giá: chỉ chỗ nghỉ có loại phòng đang bán, có giá. Riêng danh sách homestay (không lọc giá) còn liệt kê cả chỗ nghỉ CHƯA CÓ
  // loại phòng nào — thông tin tham khảo do Admin nhập, khách liên hệ trực tiếp (chi tiết hiện "chưa mở bán phòng trực tuyến").
  if (f.kind === 'HOMESTAY' || f.minPrice != null || f.maxPrice != null) {
    const priced = `EXISTS (SELECT 1 FROM room_type x WHERE x.place_id = p.id AND x.status = 'ACTIVE' AND x.base_price IS NOT NULL)`;
    const infoOnly = `NOT EXISTS (SELECT 1 FROM room_type x WHERE x.place_id = p.id)`;
    parts.push(f.minPrice == null && f.maxPrice == null ? `(${priced} OR ${infoOnly})` : priced);
    if (f.minPrice != null) {
      parts.push(
        `NOT EXISTS (SELECT 1 FROM room_type x WHERE x.place_id = p.id AND x.status = 'ACTIVE' AND x.base_price IS NOT NULL AND x.base_price < ${add(f.minPrice)})`,
      );
    }
    if (f.maxPrice != null) {
      parts.push(
        `EXISTS (SELECT 1 FROM room_type x WHERE x.place_id = p.id AND x.status = 'ACTIVE' AND x.base_price IS NOT NULL AND x.base_price <= ${add(f.maxPrice)})`,
      );
    }
  }

  // Sức chứa cho cả đoàn: tổng số khách các loại phòng đang bán, có giá. Chỗ nghỉ chưa có loại phòng nào không biết sức chứa nên không bị loại.
  if (f.guests != null && f.guests > 1) {
    parts.push(
      `((SELECT sum(x.max_occupancy::bigint * x.total_room_count) FROM room_type x WHERE x.place_id = p.id AND x.status = 'ACTIVE' AND x.base_price IS NOT NULL) >= ${add(f.guests)}
        OR NOT EXISTS (SELECT 1 FROM room_type x WHERE x.place_id = p.id))`,
    );
  }

  // Tiện nghi: ở cấp địa điểm HOẶC cấp phòng, value = YES.
  for (const raw of f.amenities ?? []) {
    const code = (raw ?? '').trim();
    if (!code) continue;
    const c = add(code.toUpperCase());
    parts.push(
      `(EXISTS (SELECT 1 FROM place_amenity pa JOIN amenity a ON a.id = pa.amenity_id WHERE pa.place_id = p.id AND upper(a.code) = ${c} AND pa.value = 'YES')
        OR EXISTS (SELECT 1 FROM room_amenity ra JOIN room_type rt ON rt.id = ra.room_type_id JOIN amenity a ON a.id = ra.amenity_id
                    WHERE rt.place_id = p.id AND upper(a.code) = ${c} AND ra.value = 'YES'))`,
    );
  }

  return { where: parts.join(' AND '), params };
}

const LIST_FROM = `FROM place p LEFT JOIN region r ON r.id = p.region_id LEFT JOIN region rp ON rp.id = r.parent_id LEFT JOIN region rpp ON rpp.id = rp.parent_id`;

export type PublicSort = 'recommended' | 'price_asc' | 'price_desc' | 'ratingAvg' | 'priceRefMin';

/**
 * Chuyển tham số sort của frontend thành thứ tự thật. Frontend gửi sort=recommended|rating_desc|price_asc|price_desc
 * (Spring hiểu là ASC), nên chiều sắp xếp lấy theo khóa: "recommended"/"rating_desc" luôn là đánh giá cao trước. Chỉ
 * ratingAvg / priceRefMin viết thẳng tên thuộc tính mới giữ chiều người gọi gửi lên. NULL luôn xếp cuối.
 */
export function orderByForSort(property: string | undefined, direction: 'asc' | 'desc'): string {
  const dir = direction === 'desc' ? 'DESC' : 'ASC';
  switch (property) {
    case 'price_asc':
      return 'p.price_ref_min ASC NULLS LAST, p.id ASC';
    case 'price_desc':
      return 'p.price_ref_min DESC NULLS LAST, p.id ASC';
    case 'priceRefMin':
      return `p.price_ref_min ${dir} NULLS LAST, p.id ASC`;
    case 'ratingAvg':
      return `p.rating_avg ${dir} NULLS LAST, p.rating_count ${dir} NULLS LAST, p.id ASC`;
    default:
      return 'p.rating_avg DESC NULLS LAST, p.rating_count DESC NULLS LAST, p.id ASC';
  }
}

export async function searchPublic(
  filter: PublicListFilter,
  orderBy: string,
  page: number,
  size: number,
): Promise<{ rows: PlaceWithRegion[]; total: number }> {
  const { where, params } = publicWhere(filter);
  const total = (await scalar<number>(`SELECT count(*) ${LIST_FROM} WHERE ${where}`, params)) ?? 0;
  const rows = await query<PlaceWithRegion>(
    `SELECT p.*, r.name AS region_name ${LIST_FROM} WHERE ${where} ORDER BY ${orderBy} LIMIT ${size} OFFSET ${page * size}`,
    params,
  );
  return { rows, total };
}

// ---- Số liệu ------------------------------------------------------------------------------------------------------

export async function countNotDeleted(): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM place WHERE is_deleted = FALSE')) ?? 0;
}

export async function countNotDeletedCreatedBetween(from: string, to: string): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM place WHERE is_deleted = FALSE AND created_at >= $1 AND created_at < $2', [from, to])) ?? 0;
}

export async function countByVerification(verification: PlaceVerificationStatus): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM place WHERE verification = $1 AND is_deleted = FALSE', [verification])) ?? 0;
}

export async function deleteById(id: number): Promise<number> {
  return exec('DELETE FROM place WHERE id = $1', [id]);
}

/** Ghi điểm đánh giá trung bình + số đánh giá (khách gửi / sửa / xóa đánh giá). */
export async function setRating(id: number, ratingAvg: number, ratingCount: number): Promise<void> {
  await exec('UPDATE place SET rating_avg = $2, rating_count = $3 WHERE id = $1', [id, ratingAvg, ratingCount]);
}
