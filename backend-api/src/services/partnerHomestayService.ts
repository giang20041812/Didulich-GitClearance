import { randomUUID } from 'node:crypto';
import { tx } from '../db/pool.js';
import { CATEGORY_KIND_LABEL, type ContactChannel, type PlaceOperationStatus, type PlaceVisibility, type RefundType } from '../domain/enums.js';
import { HttpError } from '../lib/errors.js';
import { ldtToString, parseLocalTime, timeToString, today } from '../lib/time.js';
import { authenticatedAccount } from '../lib/requestContext.js';
import { normalize } from '../lib/vietnamese.js';
import * as accounts from '../repositories/accountRepo.js';
import * as partner from '../repositories/partnerRepo.js';
import * as placeRepo from '../repositories/placeRepo.js';
import * as providers from '../repositories/providerRepo.js';
import type { PlaceMediaItem, PlaceWithRegion } from '../repositories/placeRepo.js';
import type { UserPrincipal } from '../security/principal.js';
import * as bookingImpact from './bookingImpactService.js';
import { newCode } from './bookingStayService.js';

/** Nhận mọi link TikTok https (video, kênh, link rút gọn vt/vm). */
const TIKTOK_VIDEO = /^https:\/\/((www|m|vt|vm)\.)?tiktok\.com\/\S*$/;
const DEFAULT_CHECK_IN = '14:00';
const DEFAULT_CHECK_OUT = '12:00';
const DEFAULT_FREE_CANCEL_HOURS = 24;
const MAX_OTHER_AMENITIES = 2000;

export const bad = (message: string) => new HttpError(400, message);

/** Homestay theo dạng NCC nhập / xem (PartnerHomestayDetailDto). */
export interface HomestayDto {
  id?: number | null;
  code?: string | null;
  slug?: string | null;
  name?: string | null;
  description?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  reviewVideoUrl?: string | null;
  regionName?: string | null;
  regionId?: number | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapLink?: string | null;
  facebookUrl?: string | null;
  accessNote?: string | null;
  coverImageUrl?: string | null;
  galleryUrls?: string[] | null;
  amenities?: string[] | null;
  otherAmenities?: string | null;
  checkInFrom?: string | null;
  checkOutUntil?: string | null;
  processingStartTime?: string | null;
  processingEndTime?: string | null;
  houseRules?: string | null;
  cancellationPolicy?: string | null;
  policyName?: string | null;
  freeCancelCutoffHours?: number | null;
  refundOnLateCancel?: RefundType | null;
  policyVersion?: number | null;
  policyEffectiveFrom?: string | null;
  missingForPublish?: string[];
  pendingPublish?: boolean;
  surchargeNote?: string | null;
  childrenPolicy?: string | null;
  petsPolicy?: string | null;
  viewHighlight?: string | null;
  suitability?: string | null;
  googleRating?: number | null;
  visibility?: PlaceVisibility | null;
  operationStatus?: PlaceOperationStatus | null;
  isReadyToPublish?: boolean;
  cooperativeName?: string | null;
  providerCode?: string | null;
  alertNote?: string | null;
  roomTypesCount?: number | null;
  roomTypesSummary?: string | null;
  priceRefMin?: number | null;
  priceRefMax?: number | null;
  priceUnitNote?: string | null;
  pricingSummary?: string | null;
  availabilitySummary?: string | null;
  stopSellSummary?: string | null;
  heroStatusBadge?: string | null;
}

export interface UpdateStatusInput {
  visibility?: PlaceVisibility | null;
  operationStatus?: PlaceOperationStatus | null;
  reason?: string | null;
}

/** Dữ liệu cần để xác định Homestay đủ điều kiện công khai / nhận Booking (UC-NCC-02/03/05). */
interface PublishFacts {
  rooms: number;
  sellableRooms: number;
  cover: string;
  phone: string;
  profile: partner.ProfileWithPolicy | null;
  pendingPublish: boolean;
}

const text = (value: string | null | undefined): string => (value == null ? '' : value.trim());

// ---- Tài khoản NCC và quyền sở hữu ----------------------------------------------------------------------------------------------

/**
 * Tài khoản NCC đang thao tác (đúng vai trò, đang hoạt động); writing=true còn yêu cầu nhà cung cấp đang hoạt động. Tài khoản
 * mà middleware xác thực vừa nạp được dùng lại; ngoài request HTTP (test, job) thì tra DB.
 */
export async function actor(principal: UserPrincipal | undefined, writing: boolean): Promise<accounts.AccountWithProvider> {
  if (!principal || principal.role !== 'PROVIDER') throw new HttpError(403, 'Chỉ nhà cung cấp được sử dụng chức năng này.');
  const account = authenticatedAccount(principal.accountId) ?? (await accounts.findByIdentifier(principal.identifier));
  if (!account) throw new HttpError(403, '');
  if (account.role !== 'PROVIDER' || account.status !== 'ACTIVE' || !account.provider) throw new HttpError(403, 'Tài khoản nhà cung cấp không hợp lệ.');
  if (writing && account.provider.status !== 'ACTIVE') throw new HttpError(403, 'Nhà cung cấp hiện không được phép cập nhật dữ liệu.');
  return account;
}

/** Homestay thuộc NCC của `account`; lock=true khóa ghi dòng địa điểm. */
export async function owned(id: number, account: accounts.AccountWithProvider, lock: boolean): Promise<PlaceWithRegion> {
  const place = await partner.findOwnedById(id, account.provider!.id, lock);
  if (!place) throw new HttpError(404, 'Không tìm thấy Homestay của bạn.');
  return place;
}

export const isPublic = (place: Pick<PlaceWithRegion, 'visibility'>): boolean => place.visibility === 'PUBLISHED';

export function requireNotPublic(place: Pick<PlaceWithRegion, 'visibility'>): void {
  if (isPublic(place)) throw new HttpError(409, 'Homestay đang công khai: thay đổi phải gửi yêu cầu để quản trị viên duyệt.');
}

// ---- Danh sách / lựa chọn ----------------------------------------------------------------------------------------------------

export async function options(principal: UserPrincipal | undefined) {
  await actor(principal, false);
  const [regions, amenities] = await Promise.all([partner.activeRegions(), partner.placeAmenityCatalog()]);
  return { regions: regions.map((r) => ({ id: r.id, name: r.name })), amenities: amenities.map((a) => ({ id: a.id, name: a.name })) };
}

/** Id + tên các Homestay của NCC (bộ chọn Homestay ở Lịch phòng, Loại phòng, Đánh giá, Tổng quan). */
export async function names(principal: UserPrincipal | undefined) {
  return namesOf(await actor(principal, false));
}

export async function namesOf(account: accounts.AccountWithProvider): Promise<Array<{ id: number; name: string }>> {
  return partner.ownedNames(account.provider!.id);
}

function parseFilter<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  if (text(value) === '' || value === 'ALL') return null;
  if (!(allowed as readonly string[]).includes(value!)) throw bad('Bộ lọc trạng thái không hợp lệ.');
  return value as T;
}

export async function getHomestays(principal: UserPrincipal | undefined, keyword: string | undefined, visibility: string | undefined, operation: string | undefined) {
  const account = await actor(principal, false);
  const places = await partner.findOwned(account.provider!.id);
  const ids = places.map((p) => p.id);
  const [counts, mediaRows, contactRows, sellable, profileRows, pending] = await Promise.all([
    partner.roomCounts(ids),
    partner.media(ids),
    placeRepo.publicContacts(ids),
    partner.sellableRoomCounts(ids),
    partner.profiles(ids),
    partner.pendingPublishPlaceIds(ids),
  ]);
  const mediaBy = groupBy(mediaRows, (m) => m.placeId);
  const contactsBy = groupBy(contactRows, (c) => c.placeId);
  const profileBy = new Map(profileRows.map((p) => [p.placeId, p]));
  const all = places.map((p) =>
    summary(p, {
      rooms: counts.get(p.id) ?? 0,
      sellableRooms: sellable.get(p.id) ?? 0,
      cover: cover(mediaBy.get(p.id) ?? []),
      phone: contact(contactsBy.get(p.id) ?? [], 'PHONE'),
      profile: profileBy.get(p.id) ?? null,
      pendingPublish: pending.has(p.id),
    }),
  );
  const vis = parseFilter(visibility, ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] as const);
  const op = parseFilter(operation, ['OPERATING', 'TEMP_CLOSED'] as const);
  const kw = normalize(text(keyword));
  const filtered = all
    .filter((h) => kw === '' || normalize(`${h.name} ${h.address}`).includes(kw))
    .filter((h) => vis == null || h.visibility === vis)
    .filter((h) => op == null || h.operationStatus === op);
  return {
    homestays: filtered,
    stats: {
      totalCount: all.length,
      publishedCount: all.filter((h) => h.visibility === 'PUBLISHED').length,
      draftCount: all.filter((h) => h.visibility === 'DRAFT').length,
      unpublishedCount: all.filter((h) => h.visibility === 'UNPUBLISHED').length,
      operatingCount: all.filter((h) => h.operationStatus === 'OPERATING').length,
      tempClosedCount: all.filter((h) => h.operationStatus === 'TEMP_CLOSED').length,
    },
    cooperativeName: account.provider!.name,
    providerCode: `NCC-${account.provider!.id}`,
    isProviderSuspended: account.provider!.status !== 'ACTIVE',
  };
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export async function getHomestayDetail(principal: UserPrincipal | undefined, id: number): Promise<HomestayDto> {
  return detail(await owned(id, await actor(principal, false), false));
}

// ---- Tạo / sửa ---------------------------------------------------------------------------------------------------------------

export function createHomestay(principal: UserPrincipal | undefined, dto: HomestayDto): Promise<HomestayDto> {
  return tx(async () => {
    const account = await actor(principal, true);
    prepareNew(account, dto);
    // Homestay mới luôn là bản nháp; id và quyền sở hữu do client gửi lên không bao giờ được dùng.
    const place = await placeRepo.insertPlace({
      kind: 'HOMESTAY',
      providerId: account.provider!.id,
      slug: `homestay-${randomUUID()}`,
      name: dto.name!.trim(),
      nameNorm: normalize(dto.name),
      sourceType: 'PROVIDER',
      createdBy: account.id,
      updatedBy: account.id,
      visibility: 'DRAFT',
    });
    await apply(place, dto, account);
    return detail((await partner.findOwnedById(place.id, account.provider!.id, false))!);
  });
}

/**
 * Homestay mới: điền sẵn những gì chủ nhà không cần tự nghĩ ra rồi kiểm tra — SĐT liên hệ lấy SĐT đăng nhập, giờ nhận/trả
 * phòng 14:00 / 12:00, chính sách hủy "Linh hoạt" (miễn phí hủy trước 24 giờ). Dùng chung cho tạo Homestay và bước kiểm tra
 * trước khi tải ảnh của luồng đăng Homestay.
 */
export function prepareNew(account: accounts.AccountWithProvider, dto: HomestayDto): void {
  if (text(dto.contactPhone) === '') {
    let phone = text(account.phone);
    if (phone === '' && account.provider) phone = text(account.provider.contactPhone);
    if (phone !== '') dto.contactPhone = phone;
  }
  if (text(dto.checkInFrom) === '') dto.checkInFrom = DEFAULT_CHECK_IN;
  if (text(dto.checkOutUntil) === '') dto.checkOutUntil = DEFAULT_CHECK_OUT;
  if (text(dto.cancellationPolicy) === '' && text(dto.policyName) === '' && dto.freeCancelCutoffHours == null && dto.refundOnLateCancel == null) {
    dto.freeCancelCutoffHours = DEFAULT_FREE_CANCEL_HOURS;
    dto.refundOnLateCancel = 'NO_REFUND';
  }
  validate(dto);
}

/**
 * Ghi trực tiếp thông tin Homestay (tên/địa chỉ/mô tả/liên hệ/tiện nghi/chính sách...). Áp dụng cho cả Homestay đã PUBLISHED —
 * NCC được sửa thông tin bất kỳ lúc nào, không cần Admin duyệt lại. Khác với: (a) lần đầu xuất bản và (b) chuyển NCC quản lý —
 * cả hai vẫn bắt buộc qua Admin duyệt.
 */
export function saveHomestayDetail(principal: UserPrincipal | undefined, id: number, dto: HomestayDto): Promise<HomestayDto> {
  return tx(async () => {
    const account = await actor(principal, true);
    const place = await owned(id, account, true);
    validate(dto);
    await apply(place, dto, account);
    return detail((await owned(id, account, false))!);
  });
}

/** Áp dụng thay đổi đã được Admin duyệt; người gửi yêu cầu được ghi nhận là người cập nhật. */
export function applyApproved(submitter: accounts.AccountWithProvider, placeId: number, dto: HomestayDto): Promise<HomestayDto> {
  return tx(async () => {
    const place = await owned(placeId, submitter, true);
    validate(dto);
    await apply(place, dto, submitter);
    return detail(await owned(placeId, submitter, false));
  });
}

/** Ảnh chụp chi tiết hiện tại của Homestay (dùng làm "nội dung cũ" khi so sánh). */
export const detailOf = (place: PlaceWithRegion): Promise<HomestayDto> => detail(place);

/**
 * Cập nhật trực tiếp trạng thái hiển thị / vận hành. HOM-MGT-BR-04: NCC KHÔNG được tự đưa Homestay từ chưa công khai sang
 * PUBLISHED lần đầu bằng đường này — phải qua yêu cầu Admin duyệt. Ngừng hiển thị hoặc đổi trạng thái vận hành không cần duyệt.
 */
export function updateStatus(principal: UserPrincipal | undefined, id: number, request: UpdateStatusInput) {
  return tx(async () => {
    const account = await actor(principal, true);
    let place = await owned(id, account, true);
    if (request.visibility === 'PUBLISHED' && place.visibility !== 'PUBLISHED') throw new HttpError(409, 'Xuất bản Homestay lần đầu cần được quản trị viên duyệt.');
    if (request.visibility == null && request.operationStatus == null) throw bad('Chưa chọn trạng thái cần cập nhật.');
    const patch: Partial<placeRepo.PlaceRow> = {};
    if (request.visibility != null) patch.visibility = request.visibility;
    if (request.operationStatus === 'TEMP_CLOSED' && place.operationStatus !== 'TEMP_CLOSED') {
      await bookingImpact.cancelForPlace(
        id,
        today(),
        '9999-12-31',
        request.reason == null || request.reason.trim() === '' ? 'Homestay tạm ngừng hoạt động theo yêu cầu của nhà cung cấp.' : request.reason.trim(),
      );
    }
    if (request.operationStatus != null) patch.operationStatus = request.operationStatus;
    patch.updatedBy = account.id;
    await placeRepo.updatePlace(place, patch);
    place = (await owned(id, account, false))!;
    return summary(place, await facts(place));
  });
}

/** HOM-MGT-BR-04: điều kiện đủ để công khai — dùng cả khi NCC tự kiểm tra trước khi gửi yêu cầu và khi Admin duyệt. */
export async function isReadyToPublish(place: PlaceWithRegion): Promise<boolean> {
  return (await missingForPublish(place)).length === 0;
}

/** Các mục còn thiếu để công khai (dùng cho thông báo khi NCC gửi yêu cầu xuất bản và khi Admin duyệt). */
export async function missingForPublish(place: PlaceWithRegion): Promise<string[]> {
  return missingFor(place, await facts(place));
}

/**
 * Áp dụng việc chuyển NCC quản lý Homestay đã được Admin duyệt. `submitter` là tài khoản của NCC hiện tại (bên gửi yêu cầu) —
 * `owned` xác nhận ngay trước khi ghi rằng Homestay vẫn thuộc NCC đó.
 */
export function applyTransfer(submitter: accounts.AccountWithProvider, placeId: number, targetProviderId: number) {
  return tx(async () => {
    const place = await owned(placeId, submitter, true);
    await placeRepo.updatePlace(place, { providerId: targetProviderId, updatedBy: submitter.id });
    const next = (await placeRepo.findDetailById(placeId))!;
    return summary(next, await facts(next));
  });
}

/** Áp dụng lần đầu công khai đã được Admin duyệt (HOM-MGT-BR-04). Chỉ gọi từ luồng duyệt yêu cầu thay đổi. */
export function applyPublish(submitter: accounts.AccountWithProvider, placeId: number) {
  return tx(async () => {
    const place = await owned(placeId, submitter, true);
    const missing = await missingForPublish(place);
    if (missing.length > 0) throw new HttpError(409, `Homestay không còn đủ điều kiện xuất bản, còn thiếu: ${missing.join(', ')}.`);
    await placeRepo.updatePlace(place, { visibility: 'PUBLISHED', updatedBy: submitter.id });
    const next = (await owned(placeId, submitter, false))!;
    return summary(next, await facts(next));
  });
}

// ---- Ghi dữ liệu -------------------------------------------------------------------------------------------------------------

async function apply(place: placeRepo.PlaceRow, dto: HomestayDto, account: accounts.AccountWithProvider): Promise<void> {
  let regionId: number | null = null;
  if (dto.regionId != null) {
    const region = (await partner.activeRegions()).find((r) => r.id === dto.regionId);
    if (!region) throw bad('Khu vực không hợp lệ.');
    regionId = region.id;
  }
  await placeRepo.updatePlace(place, {
    name: dto.name!.trim(),
    nameNorm: normalize(dto.name),
    description: text(dto.description),
    address: text(dto.address),
    accessNote: text(dto.accessNote),
    latitude: dto.latitude == null ? null : dto.latitude,
    longitude: dto.longitude == null ? null : dto.longitude,
    regionId,
    updatedBy: account.id,
  });
  await saveContact(place.id, 'PHONE', dto.contactPhone);
  await saveContact(place.id, 'EMAIL', dto.contactEmail);
  await saveContact(place.id, 'TIKTOK', dto.reviewVideoUrl);
  await saveContact(place.id, 'FACEBOOK', dto.facebookUrl);
  await saveContact(place.id, 'GOOGLE_MAPS', dto.googleMapLink);

  const requested = dto.amenities ?? [];
  const existing = await partner.placeAmenityRows(place.id);
  const catalog = await partner.placeAmenityCatalog();
  const byName = new Map<string, number>();
  for (const a of catalog) byName.set(a.name, a.id);
  // Giữ các tiện nghi ngừng dùng đã gắn với Homestay; không lặng lẽ bỏ chúng.
  for (const a of existing) if (!byName.has(a.name)) byName.set(a.name, a.amenityId);
  if (requested.some((n) => !byName.has(n))) throw bad('Tiện nghi không có trong danh mục.');
  for (const a of existing) if (a.value === 'YES' && !requested.includes(a.name)) await partner.deletePlaceAmenity(place.id, a.amenityId);
  const existingIds = new Set(existing.map((a) => a.amenityId));
  for (const name of new Set(requested)) {
    const amenityId = byName.get(name)!;
    if (!existingIds.has(amenityId)) await partner.insertPlaceAmenity(place.id, amenityId);
    else await partner.setPlaceAmenityYes(place.id, amenityId);
  }

  const profile = await partner.profile(place.id);
  const isNew = profile == null;
  // Mã QR nhận phòng có sẵn ngay từ đầu — chủ nhà chỉ việc in / để ra cho khách quét.
  if (isNew) await partner.insertProfile(place.id, newCode());
  const patch: Record<string, unknown> = {
    checkInFrom: time(dto.checkInFrom),
    checkOutUntil: time(dto.checkOutUntil),
    processingStartTime: time(dto.processingStartTime),
    processingEndTime: time(dto.processingEndTime),
    houseRules: text(dto.houseRules),
    surchargeNote: text(dto.surchargeNote),
    childrenPolicy: text(dto.childrenPolicy),
    petsPolicy: text(dto.petsPolicy),
    viewHighlight: text(dto.viewHighlight),
    suitability: text(dto.suitability),
    otherAmenities: text(dto.otherAmenities) === '' ? null : text(dto.otherAmenities),
  };
  const current = profile?.policy ?? null;
  if (text(dto.cancellationPolicy) !== '') {
    if (
      !current ||
      current.name !== dto.policyName!.trim() ||
      current.contentText !== dto.cancellationPolicy!.trim() ||
      current.freeCancelCutoffHours !== dto.freeCancelCutoffHours ||
      current.refundOnLateCancel !== dto.refundOnLateCancel
    ) {
      const policy = await partner.insertPolicy({
        placeId: place.id,
        version: await partner.nextPolicyVersion(place.id),
        name: dto.policyName!.trim(),
        contentText: dto.cancellationPolicy!.trim(),
        freeCancelCutoffHours: dto.freeCancelCutoffHours!,
        refundOnLateCancel: dto.refundOnLateCancel!,
        createdBy: account.id,
      });
      patch.currentPolicyId = policy.id;
    }
  } else if (current) {
    throw bad('Không được xóa chính sách đang áp dụng; hãy cập nhật thành phiên bản mới.');
  }
  await partner.updateProfile(place.id, patch);
}

async function saveContact(placeId: number, channel: ContactChannel, value: string | null | undefined): Promise<void> {
  const existing = (await partner.publicContactsOf(placeId)).filter((c) => c.channel === channel);
  const clean = text(value);
  if (clean === '') {
    if (existing.length > 0) await partner.deleteContact(existing[0].id);
  } else if (existing.length === 0) {
    await partner.insertContact(placeId, channel, clean);
  } else {
    // Form này chỉ sửa liên hệ chính; các liên hệ bổ sung được giữ nguyên.
    await partner.updateContactValue(existing[0].id, clean);
  }
}

// ---- Dựng DTO ------------------------------------------------------------------------------------------------------------------

const cover = (media: PlaceMediaItem[]): string => {
  const url = media.find((m) => m.role === 'COVER' && m.publicUrl != null)?.publicUrl ?? '';
  if (url === '' && media.length > 0) return text(media[0].publicUrl);
  return url;
};

const contact = (values: Array<{ channel: ContactChannel; value: string }>, channel: ContactChannel): string => values.find((c) => c.channel === channel)?.value ?? '';

async function facts(place: PlaceWithRegion): Promise<PublishFacts> {
  const [mediaRows, contacts, profile, rooms, sellable, pending] = await Promise.all([
    partner.media([place.id]),
    partner.publicContactsOf(place.id),
    partner.profile(place.id),
    partner.roomCounts([place.id]),
    partner.sellableRoomCounts([place.id]),
    partner.pendingPublishPlaceIds([place.id]),
  ]);
  return { rooms: rooms.get(place.id) ?? 0, sellableRooms: sellable.get(place.id) ?? 0, cover: cover(mediaRows), phone: contact(contacts, 'PHONE'), profile, pendingPublish: pending.has(place.id) };
}

/**
 * UC-NCC-02 luồng phụ 4 / UC-NCC-03 / UC-NCC-05: điều kiện công khai và nhận Booking — chỉ giữ những gì khách thật sự cần để
 * đặt phòng: tên, địa chỉ, SĐT liên hệ, ít nhất 1 ảnh, ít nhất một loại phòng đang mở bán có giá > 0, giờ nhận/trả phòng.
 */
function missingFor(p: PlaceWithRegion, f: PublishFacts): string[] {
  const missing: string[] = [];
  if (text(p.name) === '') missing.push('tên Homestay');
  if (text(p.address) === '') missing.push('địa chỉ');
  if (f.phone === '') missing.push('số điện thoại liên hệ');
  if (f.cover === '') missing.push('ít nhất 1 ảnh Homestay');
  if (f.rooms === 0) missing.push('loại phòng');
  else if (f.sellableRooms === 0) missing.push('loại phòng đang mở bán có giá > 0');
  if (!f.profile || f.profile.checkInFrom == null || f.profile.checkOutUntil == null) missing.push('giờ nhận/trả phòng');
  return missing;
}

function summary(p: PlaceWithRegion, f: PublishFacts) {
  const missing = missingFor(p, f);
  const ready = missing.length === 0;
  const closed = p.operationStatus === 'TEMP_CLOSED';
  return {
    id: p.id,
    code: `HM-${p.id}`,
    slug: p.slug,
    name: p.name,
    address: text(p.address),
    coverImageUrl: f.cover,
    categoryName: CATEGORY_KIND_LABEL[p.kind],
    visibility: p.visibility,
    operationStatus: p.operationStatus,
    roomTypesCount: f.rooms,
    priceRefMin: p.priceRefMin,
    priceRefMax: p.priceRefMax,
    priceUnitNote: text(p.priceUnitNote),
    lastUpdatedText: ldtToString(p.updatedAt),
    auditStatus: !ready ? 'NEEDS_DATA' : closed ? 'MAINTENANCE' : 'STANDARD',
    auditStatusText: !ready ? 'Cần bổ sung hồ sơ' : closed ? 'Tạm đóng cửa' : 'Hồ sơ đầy đủ',
    alertNote: f.pendingPublish ? 'Homestay đang chờ duyệt' : ready ? '' : `Còn thiếu: ${missing.join(', ')}.`,
    isReadyToPublish: ready,
    missingForPublish: missing,
    pendingPublish: f.pendingPublish,
  };
}

async function detail(p: PlaceWithRegion): Promise<HomestayDto> {
  const [cs, ms, amenityRows] = await Promise.all([partner.publicContactsOf(p.id), partner.media([p.id]), partner.placeAmenityRows(p.id)]);
  const facts2 = await factsFrom(p, cs, ms);
  const s = summary(p, facts2);
  const profile = facts2.profile;
  const policy = profile?.policy ?? null;
  return {
    id: p.id,
    code: s.code,
    slug: p.slug,
    name: p.name,
    description: text(p.description),
    address: text(p.address),
    regionId: p.regionId,
    regionName: p.regionName ?? '',
    latitude: p.latitude,
    longitude: p.longitude,
    googleMapLink: contact(cs, 'GOOGLE_MAPS'),
    facebookUrl: contact(cs, 'FACEBOOK'),
    accessNote: text(p.accessNote),
    contactPhone: contact(cs, 'PHONE'),
    contactEmail: contact(cs, 'EMAIL'),
    reviewVideoUrl: contact(cs, 'TIKTOK'),
    coverImageUrl: facts2.cover,
    galleryUrls: ms.map((m) => m.publicUrl).filter((u): u is string => u != null),
    amenities: amenityRows.filter((a) => a.value === 'YES').map((a) => a.name),
    otherAmenities: profile ? text(profile.otherAmenities) : '',
    checkInFrom: profile?.checkInFrom ? timeToString(profile.checkInFrom)! : '',
    checkOutUntil: profile?.checkOutUntil ? timeToString(profile.checkOutUntil)! : '',
    processingStartTime: profile?.processingStartTime ? timeToString(profile.processingStartTime)! : '',
    processingEndTime: profile?.processingEndTime ? timeToString(profile.processingEndTime)! : '',
    houseRules: profile ? text(profile.houseRules) : '',
    surchargeNote: profile ? text(profile.surchargeNote) : '',
    childrenPolicy: profile ? text(profile.childrenPolicy) : '',
    petsPolicy: profile ? text(profile.petsPolicy) : '',
    viewHighlight: profile ? text(profile.viewHighlight) : '',
    suitability: profile ? text(profile.suitability) : '',
    googleRating: p.googleRating,
    cancellationPolicy: policy ? policy.contentText : '',
    policyName: policy ? policy.name : '',
    freeCancelCutoffHours: policy ? policy.freeCancelCutoffHours : null,
    refundOnLateCancel: policy ? policy.refundOnLateCancel : null,
    policyVersion: policy ? policy.version : null,
    policyEffectiveFrom: policy ? policy.effectiveFrom : null,
    missingForPublish: s.missingForPublish,
    pendingPublish: s.pendingPublish,
    visibility: p.visibility,
    operationStatus: p.operationStatus,
    isReadyToPublish: s.isReadyToPublish,
    cooperativeName: (await providerName(p.providerId)) ?? '',
    providerCode: `NCC-${p.providerId}`,
    alertNote: s.alertNote,
    roomTypesCount: facts2.rooms,
    roomTypesSummary: `${facts2.rooms} loại phòng`,
    priceRefMin: p.priceRefMin,
    priceRefMax: p.priceRefMax,
    pricingSummary: 'Giá tham khảo hiện có của cơ sở',
    availabilitySummary: 'Chưa có thống kê tồn phòng trong màn hình này',
    stopSellSummary: 'Xem lịch phòng để kiểm tra tình trạng theo ngày',
    heroStatusBadge: p.visibility === 'PUBLISHED' ? 'Đang hiển thị' : 'Chưa hiển thị',
  };
}

async function providerName(providerId: number | null): Promise<string | null> {
  if (providerId == null) return null;

  return (await providers.findById(providerId))?.name ?? null;
}

async function factsFrom(p: PlaceWithRegion, cs: Array<{ channel: ContactChannel; value: string }>, ms: PlaceMediaItem[]): Promise<PublishFacts> {
  const [profile, rooms, sellable, pending] = await Promise.all([
    partner.profile(p.id),
    partner.roomCounts([p.id]),
    partner.sellableRoomCounts([p.id]),
    partner.pendingPublishPlaceIds([p.id]),
  ]);
  return { rooms: rooms.get(p.id) ?? 0, sellableRooms: sellable.get(p.id) ?? 0, cover: cover(ms), phone: contact(cs, 'PHONE'), profile, pendingPublish: pending.has(p.id) };
}

// ---- Kiểm tra dữ liệu ------------------------------------------------------------------------------------------------------------

/**
 * Chủ nhà chỉ cần chọn "hủy miễn phí trước bao lâu" và "hủy muộn có hoàn tiền không": tên và nội dung chính sách để trống thì
 * tự soạn từ hai lựa chọn đó (khách đọc được ngay), không bắt gõ văn bản.
 */
export function fillPolicyText(dto: HomestayDto): void {
  const hours = dto.freeCancelCutoffHours;
  const refund = dto.refundOnLateCancel;
  if (hours == null || hours < 0 || refund == null) return;
  if (text(dto.policyName) === '') dto.policyName = hours <= 24 ? 'Linh hoạt' : hours <= 72 ? 'Vừa phải' : 'Nghiêm ngặt';
  if (text(dto.cancellationPolicy) === '') {
    const free = hours === 0 ? 'Khách được hủy miễn phí đến giờ nhận phòng.' : `Khách được hủy miễn phí trước ${hours % 24 === 0 ? `${hours / 24} ngày` : `${hours} giờ`} so với giờ nhận phòng.`;
    const late = hours === 0 ? '' : refund === 'FULL_REFUND' ? ' Hủy muộn hơn vẫn được hoàn toàn bộ tiền đã trả.' : ' Hủy muộn hơn không được hoàn tiền đã trả.';
    dto.cancellationPolicy = free + late;
  }
}

/** LocalTime.parse: "HH:mm" hoặc "HH:mm:ss" (hai chữ số giờ); rỗng → null. */
function time(value: string | null | undefined): string | null {
  if (text(value) === '') return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value!)) throw bad('Giờ nhận/trả phòng không hợp lệ.');
  const parsed = parseLocalTime(value);
  if (!parsed) throw bad('Giờ nhận/trả phòng không hợp lệ.');
  return parsed;
}

const isHttpUrl = (value: string | null | undefined): boolean => {
  const clean = text(value);
  return clean === '' || (clean.length <= 500 && /^https?:\/\/\S+$/i.test(clean));
};

export function validate(dto: HomestayDto): void {
  fillPolicyText(dto);
  if (text(dto.otherAmenities).length > MAX_OTHER_AMENITIES) throw bad('Tiện ích khác tối đa 2.000 ký tự.');
  if (text(dto.childrenPolicy).length > 10000 || text(dto.petsPolicy).length > 10000) throw bad('Nội dung chính sách tối đa 10.000 ký tự.');
  if (text(dto.viewHighlight).length > 10000 || text(dto.suitability).length > 10000) throw bad('Nội dung tối đa 10.000 ký tự.');
  if (text(dto.googleMapLink) !== '' && (text(dto.googleMapLink).length > 2000 || !/^https?:\/\/\S+$/i.test(text(dto.googleMapLink)))) {
    throw bad('Link Google Maps phải bắt đầu bằng http:// hoặc https:// và tối đa 2.000 ký tự.');
  }
  if (!isHttpUrl(dto.facebookUrl)) throw bad('Link Facebook phải bắt đầu bằng http:// hoặc https:// và tối đa 500 ký tự.');
  if (text(dto.name) === '' || dto.name!.trim().length > 255) throw bad('Tên Homestay phải có từ 1 đến 255 ký tự.');
  if (text(dto.address).length > 500) throw bad('Địa chỉ tối đa 500 ký tự.');
  if (text(dto.description).length > 10000 || text(dto.houseRules).length > 10000 || text(dto.surchargeNote).length > 10000 || text(dto.accessNote).length > 10000) {
    throw bad('Nội dung tối đa 10.000 ký tự.');
  }
  if (text(dto.contactPhone) !== '' && !/^[+0-9() .-]{6,32}$/.test(text(dto.contactPhone))) throw bad('Số điện thoại không hợp lệ.');
  if (text(dto.contactEmail) !== '' && (dto.contactEmail!.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.contactEmail!))) throw bad('Email không hợp lệ.');
  if (text(dto.reviewVideoUrl) !== '' && (dto.reviewVideoUrl!.length > 500 || !TIKTOK_VIDEO.test(dto.reviewVideoUrl!.trim()))) {
    throw bad('Link video review phải là link TikTok bắt đầu bằng https://www.tiktok.com/ hoặc https://vt.tiktok.com/.');
  }
  if ((dto.latitude == null) !== (dto.longitude == null)) throw bad('Cần nhập cả vĩ độ và kinh độ.');
  if (dto.latitude != null && (!Number.isFinite(dto.latitude) || Math.abs(dto.latitude) > 90 || !Number.isFinite(dto.longitude!) || Math.abs(dto.longitude!) > 180)) {
    throw bad('Tọa độ không hợp lệ.');
  }
  time(dto.checkInFrom);
  time(dto.checkOutUntil);
  const processingStart = time(dto.processingStartTime);
  const processingEnd = time(dto.processingEndTime);
  if ((processingStart == null) !== (processingEnd == null)) throw bad('Cần chọn cả giờ bắt đầu và giờ kết thúc xử lý đơn.');
  if (processingStart != null && !(processingStart < processingEnd!)) throw bad('Giờ bắt đầu xử lý đơn phải trước giờ kết thúc.');
  if (text(dto.cancellationPolicy) === '' && (text(dto.policyName) !== '' || dto.freeCancelCutoffHours != null || dto.refundOnLateCancel != null)) {
    throw bad('Chọn thời hạn hủy miễn phí và mức hoàn tiền khi hủy muộn của chính sách hủy.');
  }
  if (
    text(dto.cancellationPolicy) !== '' &&
    (text(dto.policyName) === '' ||
      text(dto.policyName).length > 255 ||
      dto.cancellationPolicy!.length > 10000 ||
      dto.freeCancelCutoffHours == null ||
      dto.freeCancelCutoffHours < 0 ||
      dto.refundOnLateCancel == null)
  ) {
    throw bad('Chọn thời hạn hủy miễn phí (không âm) và mức hoàn tiền khi hủy muộn của chính sách hủy.');
  }
}

