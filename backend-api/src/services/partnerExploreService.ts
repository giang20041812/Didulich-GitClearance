import { query } from '../db/pool.js';
import { EXPLORE_CATEGORY_INFO, SERVICE_GROUPS, SERVICE_GROUP_INFO, PROVIDER_SERVICE_TYPE_LABEL, type CategoryKind, type ExploreCategory, type ProviderServiceType } from '../domain/enums.js';
import { HttpError, IllegalArgumentError, InvalidFieldsError } from '../lib/errors.js';
import type { PageJson } from '../lib/page.js';
import type { AccountWithProvider } from '../repositories/accountRepo.js';
import type { UserPrincipal } from '../security/principal.js';
import * as places from './explorePlaceService.js';
import type { PlaceInput } from './explorePlaceWriter.js';
import { actor } from './partnerHomestayService.js';

/**
 * Địa điểm khám phá của NCC (NCC-01). Mọi thao tác chỉ trên địa điểm của chính NCC (BR-C01 → 403 "Bạn không có quyền truy cập nội dung
 * này", AC-02.07); tạo / sửa qua Admin duyệt (BR-C02, BR-C03 — xem explorePlaceService).
 */

export async function list(principal: UserPrincipal | undefined, page: number, size: number) {
  const account = await actor(principal, false);
  return places.list(undefined, undefined, undefined, undefined, account.provider!.id, page, size);
}

export async function get(principal: UserPrincipal | undefined, id: number) {
  const account = await actor(principal, false);
  return places.form(id, account.provider!.id);
}

export async function create(principal: UserPrincipal | undefined, input: PlaceInput) {
  return places.partnerCreate(input, await actor(principal, true));
}

export async function update(principal: UserPrincipal | undefined, id: number, input: PlaceInput) {
  return places.partnerUpdate(id, input, await actor(principal, true));
}

// ===== "Dịch vụ của tôi" (PartnerListingService) ======================================================================================

/**
 * "Dịch vụ của tôi" của nhà xe và nhà cung cấp trải nghiệm. Mỗi dịch vụ là một địa điểm khám phá có thông tin dịch vụ
 * (place_service_profile) nên đi chung quy trình duyệt của explorePlaceService: tạo mới → Chờ duyệt; sửa bản đã duyệt → bản sửa chờ duyệt,
 * khách vẫn thấy bản cũ. Danh mục và nhóm dịch vụ cố định theo loại hình của NCC: nhà xe → "Dịch vụ địa phương" (loại TRANSPORT), trải
 * nghiệm → "Trải nghiệm" (loại CULTURE).
 */

const HOMESTAY_ONLY = 'Chức năng này dành cho nhà xe và nhà cung cấp trải nghiệm.';

function serviceType(account: AccountWithProvider): ProviderServiceType {
  const type = account.provider!.serviceType;
  if (type == null || type === 'HOMESTAY') throw new HttpError(403, HOMESTAY_ONLY);
  return type;
}

const categoryOf = (type: ProviderServiceType): ExploreCategory => (type === 'TRANSPORT' ? 'LOCAL_SERVICE' : 'EXPERIENCE');
const kindOf = (type: ProviderServiceType): CategoryKind => (type === 'TRANSPORT' ? 'TRANSPORT' : 'CULTURE');

export async function listingConfig(principal: UserPrincipal | undefined) {
  const type = serviceType(await actor(principal, false));
  const category = categoryOf(type);
  return {
    serviceType: type,
    serviceTypeLabel: PROVIDER_SERVICE_TYPE_LABEL[type],
    category,
    categoryLabel: EXPLORE_CATEGORY_INFO[category].label,
    groups: SERVICE_GROUPS.filter((g) => SERVICE_GROUP_INFO[g].kind === kindOf(type)).map((g) => ({ code: g, label: SERVICE_GROUP_INFO[g].label })),
  };
}

/** "Hà Nội → Mù Cang Chải" (nhà xe) hoặc "Hẹn tại …" (trải nghiệm); null nếu chưa nhập. */
function route(profile: { routeFrom: string | null; routeTo: string | null; serviceGroup: (typeof SERVICE_GROUPS)[number] }): string | null {
  const from = profile.routeFrom == null ? null : profile.routeFrom.trim();
  const to = profile.routeTo == null ? null : profile.routeTo.trim();
  if (from && to) return `${from} → ${to}`;
  if (from) return SERVICE_GROUP_INFO[profile.serviceGroup].kind === 'CULTURE' ? `Hẹn tại ${from}` : from;
  return null;
}

export async function listListings(principal: UserPrincipal | undefined, keyword: string | undefined, page: number, size: number): Promise<PageJson<unknown>> {
  const account = await actor(principal, false);
  const type = serviceType(account);
  const rows = await places.list(categoryOf(type), undefined, undefined, keyword, account.provider!.id, page, size);
  const ids = rows.content.map((r) => r.id);
  const profiles = new Map<number, Parameters<typeof places.serviceDto>[0] & { placeId: number }>();
  const prices = new Map<number, { priceRefMin: number | null; priceUnitNote: string | null }>();
  if (ids.length > 0) {
    for (const p of await query<Parameters<typeof places.serviceDto>[0] & { placeId: number }>('SELECT * FROM place_service_profile WHERE place_id = ANY($1)', [ids])) profiles.set(p.placeId, p);
    for (const p of await query<{ id: number; priceRefMin: number | null; priceUnitNote: string | null }>('SELECT id, price_ref_min, price_unit_note FROM place WHERE id = ANY($1)', [ids])) prices.set(p.id, p);
  }
  return {
    ...rows,
    content: rows.content.map((row) => {
      const profile = profiles.get(row.id);
      const place = prices.get(row.id);
      return {
        place: row,
        serviceGroup: profile?.serviceGroup ?? null,
        serviceGroupLabel: profile ? SERVICE_GROUP_INFO[profile.serviceGroup].label : null,
        priceFrom: place?.priceRefMin ?? null,
        priceUnit: place?.priceUnitNote ?? null,
        route: profile ? route(profile) : null,
        service: profile ? places.serviceDto(profile) : null,
      };
    }),
  };
}

/** Dịch vụ của chính NCC và đúng loại hình (nhà xe không mở được địa điểm ăn uống họ từng gợi ý). */
async function ownListing(account: AccountWithProvider, id: number) {
  const type = serviceType(account);
  const form = await places.form(id, account.provider!.id);
  if (form.kind !== kindOf(type)) throw new HttpError(404, 'Không tìm thấy dịch vụ.');
  return form;
}

export async function getListing(principal: UserPrincipal | undefined, id: number) {
  return ownListing(await actor(principal, false), id);
}

/** Form dịch vụ bắt buộc có thông tin dịch vụ đúng loại hình; danh mục luôn theo loại hình của NCC. */
function typed(account: AccountWithProvider, input: PlaceInput | null | undefined): PlaceInput {
  const type = serviceType(account);
  if (!input) throw new IllegalArgumentError('Thiếu thông tin dịch vụ.');
  const group = input.service?.serviceGroup;
  if (!group) throw new InvalidFieldsError([{ field: 'serviceGroup', message: 'Vui lòng chọn loại dịch vụ.' }]);
  if (SERVICE_GROUP_INFO[group].kind !== kindOf(type)) {
    throw new InvalidFieldsError([{ field: 'serviceGroup', message: `Loại dịch vụ không phù hợp với loại hình ${PROVIDER_SERVICE_TYPE_LABEL[type]}.` }]);
  }
  return { ...input, category: categoryOf(type), coordVerified: null, visible: null };
}

export async function createListing(principal: UserPrincipal | undefined, input: PlaceInput) {
  const account = await actor(principal, true);
  return places.partnerCreate(typed(account, input), account);
}

export async function updateListing(principal: UserPrincipal | undefined, id: number, input: PlaceInput) {
  const account = await actor(principal, true);
  await ownListing(account, id);
  return places.partnerUpdate(id, typed(account, input), account);
}
