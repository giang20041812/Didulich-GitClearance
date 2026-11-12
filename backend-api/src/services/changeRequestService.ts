import { tx } from '../db/pool.js';
import type { ChangeOperation, ChangeRequestStatus, ChangeTargetType } from '../domain/enums.js';
import { HttpError, IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import type { AccountWithProvider } from '../repositories/accountRepo.js';
import { query, scalar } from '../db/pool.js';
import * as partner from '../repositories/partnerRepo.js';
import type { ChangeRequestFull } from '../repositories/partnerRepo.js';
import * as placeRepo from '../repositories/placeRepo.js';
import * as providers from '../repositories/providerRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import type { UserPrincipal } from '../security/principal.js';
import * as audit from './auditLogService.js';
import * as recorder from './notificationRecorder.js';
import * as homestays from './partnerHomestayService.js';
import { bad } from './partnerHomestayService.js';
import * as media from './partnerMediaService.js';
import * as roomService from './partnerRoomService.js';
import type { PriceInput, RoomDto, RoomInput } from './partnerRoomService.js';

// ===== ChangeRequestDiff ===============================================================================================================
// Xác định các trường NCC được phép đề xuất thay đổi và so sánh nội dung cũ/mới để Admin duyệt. Chỉ các trường trong danh sách mới
// được lưu vào yêu cầu (id, trạng thái hiển thị... không bao giờ đi theo đường này). Ngoại lệ duy nhất là PHOTOS.

type Fields = ReadonlyArray<readonly [string, string]>;

const HOMESTAY_FIELDS: Fields = [
  ['name', 'Tên Homestay'], ['description', 'Mô tả'], ['address', 'Địa chỉ'], ['regionId', 'Khu vực (mã)'],
  ['latitude', 'Vĩ độ'], ['longitude', 'Kinh độ'], ['googleMapLink', 'Link Google Maps'], ['accessNote', 'Hướng dẫn đường đi'], ['contactPhone', 'Số điện thoại'],
  ['contactEmail', 'Email'], ['reviewVideoUrl', 'Video review TikTok'], ['facebookUrl', 'Fanpage Facebook'], ['amenities', 'Tiện nghi'],
  ['otherAmenities', 'Tiện ích khác'],
  ['viewHighlight', 'Điểm nổi bật / view'], ['suitability', 'Nhóm khách phù hợp'],
  ['checkInFrom', 'Giờ nhận phòng'], ['checkOutUntil', 'Giờ trả phòng'], ['processingStartTime', 'Bắt đầu xử lý đơn'], ['processingEndTime', 'Kết thúc xử lý đơn'], ['houseRules', 'Nội quy'],
  ['surchargeNote', 'Phụ thu'], ['childrenPolicy', 'Chính sách trẻ em'], ['petsPolicy', 'Chính sách thú cưng'],
  ['policyName', 'Tên chính sách hủy'], ['cancellationPolicy', 'Nội dung chính sách hủy'],
  ['freeCancelCutoffHours', 'Số giờ hủy miễn phí'], ['refundOnLateCancel', 'Hoàn tiền khi hủy muộn'],
];

/** Trường loại phòng theo đúng thứ tự và nhãn của form NCC (Cổng NCC → Loại phòng). */
const ROOM_FIELDS: Fields = [
  ['name', 'Tên loại phòng'], ['totalRoomCount', 'Tổng số phòng'], ['maxOccupancy', 'Khách tối đa mỗi phòng'],
  ['areaSqm', 'Diện tích (m²)'], ['privateBathroom', 'Phòng tắm riêng'], ['basePrice', 'Giá ngày thường / phòng / đêm'],
  ['weekendPrice', 'Giá cuối tuần (T7, CN)'], ['beds', 'Giường ngủ'], ['viewDescription', 'Vị trí / hướng nhìn'],
  ['description', 'Mô tả'], ['amenityIds', 'Tiện nghi phòng'], ['otherAmenities', 'Tiện ích khác'], ['status', 'Trạng thái bán'],
];

/** Khóa trong payload yêu cầu tạo loại phòng: danh sách ảnh {imageId, url} đã tải lên kho, chưa gắn vào phòng nào. */
export const PHOTOS = 'photos';

/** Giá theo mùa của loại phòng, theo form NCC. */
const PRICE_FIELDS: Fields = [['name', 'Tên đợt giá'], ['periodStart', 'Từ ngày'], ['periodEnd', 'Đến ngày'], ['price', 'Giá / phòng / đêm']];

type Data = Record<string, any> | null | undefined;

export interface FieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface FieldDiff extends FieldChange {
  changed: boolean;
}

/** Chuyển giá trị gốc của một trường thành chuỗi hiển thị cho Admin; so sánh vẫn dùng {@link norm}. */
export type Display = (field: string, raw: unknown, normalized: string) => string;
const RAW: Display = (_field, _raw, normalized) => normalized;

/** Phần của yêu cầu cần để so sánh (không phụ thuộc DB). */
export interface DiffSource {
  targetType: ChangeTargetType;
  operation: ChangeOperation;
  beforeData: Data;
  payload: Data;
}

const fieldsOf = (type: ChangeTargetType): Fields => (type === 'HOMESTAY' ? HOMESTAY_FIELDS : type === 'ROOM_TYPE' ? ROOM_FIELDS : PRICE_FIELDS);

/** Chỉ giữ các trường được phép của đối tượng; null nếu nguồn null. */
export function pick(type: ChangeTargetType, source: Data): Record<string, unknown> | null {
  if (!source) return null;
  const out: Record<string, unknown> = {};
  for (const [key] of fieldsOf(type)) out[key] = source[key] === undefined ? null : source[key];
  return out;
}

/**
 * Chuẩn hóa để so sánh/hiển thị: null và chuỗi rỗng như nhau, số không phân biệt 500000 với 500000.0, danh sách không phân biệt
 * thứ tự.
 */
export function norm(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Number(value)) : String(value);
  if (Array.isArray(value)) {
    return value
      .map(norm)
      .filter((s) => s !== '')
      .sort()
      .join(', ');
  }
  if (typeof value === 'object') {
    const map = value as Record<string, unknown>;
    if (map.bedType != null && map.quantity != null) return `${norm(map.bedType)} ×${norm(map.quantity)}`;
    return Object.entries(map)
      .map(([k, v]) => `${k}=${norm(v)}`)
      .sort()
      .join(', ');
  }
  return String(value).trim();
}

function diffOf(field: string, label: string, before: unknown, after: unknown, del: boolean, display: Display): FieldDiff {
  const oldNorm = norm(before);
  const newNorm = del ? '(xóa)' : norm(after);
  return { field, label, before: display(field, before, oldNorm), after: del ? '(xóa)' : display(field, after, newNorm), changed: oldNorm !== newNorm };
}

/**
 * Toàn bộ trường của đối tượng trong yêu cầu theo thứ tự hiển thị, kể cả trường không đổi (before = after), để Admin xem đủ nội
 * dung. Việc so sánh luôn dùng giá trị chuẩn hóa; `display` chỉ quyết định chuỗi hiển thị.
 */
export function fieldDiffs(request: DiffSource, display: Display = RAW): FieldDiff[] {
  const before = request.beforeData;
  const after = request.payload;
  // HOM-MGT-BR-04: yêu cầu xuất bản không nằm trong danh sách trường whitelist của HOMESTAY — hiển thị riêng một dòng.
  if (request.operation === 'PUBLISH') return [diffOf('visibility', 'Trạng thái hiển thị', before?.visibility, after?.visibility, false, display)];
  // Chuyển NCC: cũng không nằm trong whitelist — hiển thị riêng một dòng "Nhà cung cấp quản lý".
  if (request.operation === 'TRANSFER') return [diffOf('providerId', 'Nhà cung cấp quản lý', before?.providerName, after?.providerName, false, display)];
  const del = request.operation === 'DELETE';
  const out = fieldsOf(request.targetType).map(([key, label]) => diffOf(key, label, before?.[key], after?.[key], del, display));
  const photos = after?.[PHOTOS];
  if (Array.isArray(photos) && photos.length > 0) out.push({ field: PHOTOS, label: 'Ảnh phòng', before: '', after: `${photos.length} ảnh`, changed: true });
  return out;
}

/** Danh sách trường có thay đổi giữa nội dung cũ và mới của một yêu cầu. */
export const changesOf = (request: DiffSource, display: Display = RAW): FieldChange[] =>
  fieldDiffs(request, display)
    .filter((f) => f.changed)
    .map(({ field, label, before, after }) => ({ field, label, before, after }));

/** Các trường có thay đổi giữa hai bản dữ liệu (không gắn với một yêu cầu cụ thể). */
export function changedFields(type: ChangeTargetType, before: Data, after: Data): string[] {
  return fieldsOf(type)
    .map(([key]) => key)
    .filter((key) => norm(before?.[key]) !== norm(after?.[key]));
}

/** Tên hiển thị của đối tượng bị thay đổi. */
export function targetName(request: Pick<ChangeRequestFull, 'payload' | 'beforeData' | 'placeName'>): string {
  let name: unknown = request.payload?.name;
  if (name == null && request.beforeData) name = request.beforeData.name;
  if (name == null || String(name).trim() === '') name = request.placeName;
  return String(name);
}

/** Tóm tắt các trường thay đổi, ví dụ "Tên loại phòng, Giá cơ bản". */
export function summaryText(request: DiffSource & Pick<ChangeRequestFull, 'placeName'>): string {
  const name = targetName(request as ChangeRequestFull);
  if (request.operation === 'DELETE') return `Xóa ${name}`;
  if (request.operation === 'CREATE') return `Tạo mới ${name}`;
  if (request.operation === 'PUBLISH') return `Yêu cầu xuất bản ${name}`;
  if (request.operation === 'TRANSFER') return `Chuyển quản lý sang ${request.payload?.providerName ?? 'NCC khác'}`;
  return changesOf(request)
    .map((c) => c.label)
    .join(', ');
}

export interface ChangeRequestSummary {
  id: number;
  targetType: ChangeTargetType;
  operation: ChangeOperation;
  status: ChangeRequestStatus;
  placeId: number;
  placeName: string;
  providerId: number;
  providerName: string;
  targetId: number | null;
  roomTypeId: number | null;
  targetName: string;
  changeSummary: string;
  submittedByName: string | null;
  submittedAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export const toSummary = (r: ChangeRequestFull): ChangeRequestSummary => ({
  id: r.id,
  targetType: r.targetType,
  operation: r.operation,
  status: r.status,
  placeId: r.placeId,
  placeName: r.placeName,
  providerId: r.providerId,
  providerName: r.providerName,
  targetId: r.targetId,
  roomTypeId: r.roomTypeId,
  targetName: targetName(r),
  changeSummary: summaryText(r),
  submittedByName: r.submittedByName,
  submittedAt: r.submittedAt,
  reviewedByName: r.reviewedByName,
  reviewedAt: r.reviewedAt,
  reviewNote: r.reviewNote,
});

// ===== Phía NCC ======================================================================================================================
// Sửa THÔNG TIN Homestay luôn ghi trực tiếp (kể cả khi đã PUBLISHED). Sửa loại phòng ghi trực tiếp; tạo loại phòng mới và giá đặc
// biệt của Homestay đang công khai vẫn cần Admin duyệt. Hai việc luôn bắt buộc qua Admin duyệt bất kể trạng thái công khai: lần
// đầu xuất bản (updateStatus) và chuyển NCC quản lý (requestTransfer).

const PENDING_MESSAGE = 'Homestay đang công khai nên thay đổi đã được gửi cho quản trị viên duyệt. Dữ liệu hiện hành chưa thay đổi cho đến khi được duyệt.';
const PUBLISH_PENDING_MESSAGE = 'Yêu cầu xuất bản đã được gửi cho quản trị viên duyệt. Homestay sẽ hiển thị công khai sau khi được duyệt.';
const TRANSFER_PENDING_MESSAGE = 'Yêu cầu chuyển NCC quản lý đã được gửi cho quản trị viên duyệt. Homestay vẫn do bạn quản lý cho đến khi được duyệt.';

/** Kết quả một thao tác lưu: hoặc đã ghi trực tiếp (`saved`) hoặc đã gửi chờ duyệt (`pending`). */
export interface Outcome<T> {
  saved?: T;
  pending?: SubmittedDto;
}

export interface SubmittedDto {
  changeRequestId: number;
  status: ChangeRequestStatus;
  message: string;
}

export const saveHomestay = async (principal: UserPrincipal | undefined, id: number, dto: homestays.HomestayDto): Promise<Outcome<homestays.HomestayDto>> => ({
  saved: await homestays.saveHomestayDetail(principal, id, dto),
});

export function saveRoom(principal: UserPrincipal | undefined, placeId: number, roomId: number | null, input: RoomInput): Promise<Outcome<RoomDto>> {
  return tx(async () => {
    const account = await homestays.actor(principal, true);
    const place = await homestays.owned(placeId, account, false);
    if (roomId != null || !homestays.isPublic(place)) {
      const saved = await roomService.save(principal, placeId, roomId, input);
      if (roomId == null) await media.attachPhotosToRoom(account, saved.id, input.photos);
      return { saved };
    }
    const after = pick('ROOM_TYPE', input as unknown as Data)!;
    // Loại phòng chưa tồn tại nên chưa gắn ảnh được: giữ ảnh đã tải lên trong yêu cầu, gắn khi Admin duyệt.
    if (input.photos && input.photos.length > 0) after[PHOTOS] = input.photos;
    return { pending: await submit(account, place, 'ROOM_TYPE', null, null, 'CREATE', after, null) };
  });
}

export function savePrice(principal: UserPrincipal | undefined, placeId: number, roomId: number, priceId: number | null, input: PriceInput) {
  return tx(async (): Promise<Outcome<roomService.PriceDto>> => {
    const account = await homestays.actor(principal, true);
    const place = await homestays.owned(placeId, account, false);
    if (!homestays.isPublic(place)) return { saved: await roomService.savePrice(principal, placeId, roomId, priceId, input) };
    if (input.periodEnd < input.periodStart) throw bad('Ngày kết thúc giá phải bằng hoặc sau ngày bắt đầu.');
    const before = priceId == null ? null : pick('ROOM_PRICE', await currentPrice(account, placeId, roomId, priceId));
    const after = pick('ROOM_PRICE', input as unknown as Data);
    if (priceId != null && changedFields('ROOM_PRICE', before, after).length === 0) throw bad('Không có thay đổi nào so với dữ liệu hiện tại.');
    return { pending: await submit(account, place, 'ROOM_PRICE', priceId, roomId, priceId == null ? 'CREATE' : 'UPDATE', after, before) };
  });
}

/** @returns null nếu đã xóa trực tiếp, ngược lại là thông tin yêu cầu chờ duyệt. */
export function deletePrice(principal: UserPrincipal | undefined, placeId: number, roomId: number, priceId: number): Promise<SubmittedDto | null> {
  return tx(async () => {
    const account = await homestays.actor(principal, true);
    const place = await homestays.owned(placeId, account, false);
    if (!homestays.isPublic(place)) {
      await roomService.deletePrice(principal, placeId, roomId, priceId);
      return null;
    }
    const before = pick('ROOM_PRICE', await currentPrice(account, placeId, roomId, priceId));
    return submit(account, place, 'ROOM_PRICE', priceId, roomId, 'DELETE', null, before);
  });
}

/**
 * HOM-MGT-BR-04: cập nhật trạng thái hiển thị/vận hành. Lần đầu đưa Homestay sang PUBLISHED phải gửi yêu cầu chờ Admin duyệt (dữ
 * liệu hiện hành chưa đổi); các trạng thái khác (ngừng hiển thị, mở/tạm đóng) vẫn ghi trực tiếp.
 */
export function updateStatus(principal: UserPrincipal | undefined, id: number, request: homestays.UpdateStatusInput) {
  return tx(async (): Promise<Outcome<unknown>> => {
    const account = await homestays.actor(principal, true);
    const place = await homestays.owned(id, account, false);
    const firstPublish = request.visibility === 'PUBLISHED' && place.visibility !== 'PUBLISHED';
    if (!firstPublish) return { saved: await homestays.updateStatus(principal, id, request) };
    const missing = await homestays.missingForPublish(place);
    if (missing.length > 0) throw bad(`Homestay chưa đủ điều kiện công khai/nhận Booking, còn thiếu: ${missing.join(', ')}.`);
    const pending = await submit(account, place, 'HOMESTAY', null, null, 'PUBLISH', { visibility: 'PUBLISHED' }, { visibility: place.visibility }, PUBLISH_PENDING_MESSAGE);
    return { pending };
  });
}

/** NCC hiện tại xin chuyển Homestay sang một NCC khác quản lý — luôn phải qua Admin duyệt, bất kể Homestay đang công khai hay chưa. */
export function requestTransfer(principal: UserPrincipal | undefined, placeId: number, targetProviderId: number | null | undefined): Promise<SubmittedDto> {
  return tx(async () => {
    const account = await homestays.actor(principal, true);
    const place = await homestays.owned(placeId, account, false);
    if (targetProviderId == null) throw bad('Vui lòng chọn nhà cung cấp nhận chuyển.');
    if (targetProviderId === place.providerId) throw bad('Nhà cung cấp đích phải khác nhà cung cấp hiện tại.');
    const target = await providers.findById(targetProviderId);
    if (!target) throw bad(`Không tìm thấy nhà cung cấp với ID: ${targetProviderId}`);
    if (target.status !== 'ACTIVE') throw bad('Nhà cung cấp nhận chuyển hiện không hoạt động.');
    const current = await providers.findById(place.providerId!);
    const before = { providerId: place.providerId, providerName: current?.name ?? null };
    const after = { providerId: target.id, providerName: target.name };
    return submit(account, place, 'HOMESTAY', null, null, 'TRANSFER', after, before, TRANSFER_PENDING_MESSAGE);
  });
}

/** Các yêu cầu của chính NCC (mọi Homestay của NCC), mới nhất trước. */
export async function listForPartner(principal: UserPrincipal | undefined, status: ChangeRequestStatus | undefined, placeId: number | undefined, page: number, size: number): Promise<PageJson<ChangeRequestSummary>> {
  const providerId = (await homestays.actor(principal, false)).provider!.id;
  return searchRequests({ providerId, status, placeId }, 'desc', page, size);
}

/** NCC rút lại yêu cầu đang chờ của chính mình. */
export function cancelRequest(principal: UserPrincipal | undefined, id: number): Promise<ChangeRequestSummary> {
  return tx(async () => {
    const account = await homestays.actor(principal, true);
    const request = await partner.findChangeForUpdate(id);
    if (!request || request.providerId !== account.provider!.id) throw new HttpError(404, 'Không tìm thấy yêu cầu thay đổi của bạn.');
    if (request.status !== 'PENDING') throw new HttpError(409, 'Yêu cầu đã được xử lý, không thể rút lại.');
    await partner.updateChange(id, { status: 'CANCELLED', reviewedAt: nowLocal(), reviewNote: 'Nhà cung cấp rút lại yêu cầu.' });
    return toSummary((await partner.findChangeFull(id))!);
  });
}

async function submit(
  account: AccountWithProvider,
  place: placeRepo.PlaceRow,
  type: ChangeTargetType,
  targetId: number | null,
  roomTypeId: number | null,
  operation: ChangeOperation,
  payload: Record<string, unknown> | null,
  before: Record<string, unknown> | null,
  message: string = PENDING_MESSAGE,
): Promise<SubmittedDto> {
  // Yêu cầu mới thay thế yêu cầu đang chờ trước đó cho cùng đối tượng; tạo mới nhiều đối tượng thì không thay thế nhau.
  if (type === 'HOMESTAY' || targetId != null) {
    for (const old of await partner.findOpenChanges('PENDING', place.id, type, targetId, roomTypeId)) {
      await partner.updateChange(old.id, { status: 'CANCELLED', reviewedAt: nowLocal(), reviewNote: 'Được thay thế bằng yêu cầu mới của nhà cung cấp.' });
    }
  }
  const saved = await partner.insertChange({ providerId: place.providerId!, placeId: place.id, targetType: type, targetId, roomTypeId, operation, payload, beforeData: before, submittedBy: account.id });
  await recorder.toAdmins('ADMIN_NEW_CHANGE_REQUEST', 'ChangeRequest', saved.id, `${place.name}: ${changeLabel(type, operation)} — đang chờ duyệt.`, 'changes');
  return { changeRequestId: saved.id, status: saved.status, message };
}

function changeLabel(type: ChangeTargetType, operation: ChangeOperation): string {
  if (operation === 'PUBLISH') return 'xin công khai Homestay';
  if (operation === 'TRANSFER') return 'xin chuyển Homestay sang nhà cung cấp khác';
  const verb = operation === 'CREATE' ? 'thêm' : operation === 'DELETE' ? 'xóa' : 'sửa';
  const target = type === 'HOMESTAY' ? 'thông tin Homestay' : type === 'ROOM_TYPE' ? 'loại phòng' : 'giá phòng';
  return `${verb} ${target}`;
}

async function currentPrice(account: AccountWithProvider, placeId: number, roomId: number, priceId: number): Promise<Data> {
  const found = (await roomService.pricesAs(account, placeId, roomId)).find((p) => p.id === priceId);
  if (!found) throw bad('Không tìm thấy bảng giá.');
  return found as unknown as Data;
}

// ===== Phía Admin ======================================================================================================================
// Xem nội dung cũ/mới, Approve (mới ghi vào dữ liệu chính thức) hoặc Reject (bắt buộc lý do). Mọi quyết định được ghi audit log.

interface SearchFilter {
  status?: ChangeRequestStatus;
  providerId?: number;
  placeId?: number;
  targetType?: ChangeTargetType;
  keyword?: string;
  from?: string;
  to?: string;
}

async function searchRequests(filter: SearchFilter, sortDir: string, page: number, size: number): Promise<PageJson<ChangeRequestSummary>> {
  const pageNo = Math.max(page, 0);
  const pageSize = Math.min(Math.max(size, 1), 100);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filter.status) add('c.status = ?', filter.status);
  if (filter.providerId != null) add('c.provider_id = ?', filter.providerId);
  if (filter.placeId != null) add('c.place_id = ?', filter.placeId);
  if (filter.targetType) add('c.target_type = ?', filter.targetType);
  if (filter.from) add('c.submitted_at >= ?', `${filter.from}T00:00:00`);
  if (filter.to) add('c.submitted_at < ?', `${nextDay(filter.to)}T00:00:00`);
  if (filter.keyword && filter.keyword.trim() !== '') {
    const like = `%${filter.keyword.trim().toLowerCase().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    params.push(like);
    where.push(`(lower(p.name) LIKE $${params.length} ESCAPE '\\' OR lower(pr.name) LIKE $${params.length} ESCAPE '\\')`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const dir = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const from = `FROM partner_change_request c JOIN place p ON p.id = c.place_id JOIN provider pr ON pr.id = c.provider_id
    JOIN account sb ON sb.id = c.submitted_by LEFT JOIN account rb ON rb.id = c.reviewed_by ${clause}`;
  const total = (await scalar<number>(`SELECT count(*) ${from}`, params)) ?? 0;
  const rows = await query<ChangeRequestFull>(
    `SELECT c.*, p.name AS place_name, pr.name AS provider_name, sb.full_name AS submitted_by_name, rb.full_name AS reviewed_by_name ${from}
      ORDER BY c.submitted_at ${dir}, c.id ${dir} LIMIT ${pageSize} OFFSET ${pageNo * pageSize}`,
    params,
  );
  return pageOf(rows.map(toSummary), pageNo, pageSize, total, true);
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function search(
  status: ChangeRequestStatus | undefined,
  providerId: number | undefined,
  placeId: number | undefined,
  targetType: ChangeTargetType | undefined,
  keyword: string | undefined,
  from: string | undefined,
  to: string | undefined,
  sortDir: string,
  page: number,
  size: number,
): Promise<PageJson<ChangeRequestSummary>> {
  if (from && to && to < from) throw new IllegalArgumentError('Khoảng thời gian không hợp lệ: ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  return searchRequests({ status, providerId, placeId, targetType, keyword, from, to }, sortDir, page, size);
}

export const pendingCount = (): Promise<number> => partner.countChangesByStatus('PENDING');

export interface ChangeRequestDetail {
  summary: ChangeRequestSummary;
  before: Data;
  after: Data;
  changes: FieldChange[];
  fields: FieldDiff[];
  context: unknown;
  stale: boolean;
}

export async function detail(id: number): Promise<ChangeRequestDetail> {
  const request = await partner.findChangeFull(id);
  if (!request) throw new IllegalArgumentError(`Không tìm thấy yêu cầu thay đổi với ID: ${id}`);
  return toDetail(request);
}

async function toDetail(request: ChangeRequestFull): Promise<ChangeRequestDetail> {
  return {
    summary: toSummary(request),
    before: request.beforeData,
    after: request.payload,
    changes: changesOf(request),
    fields: fieldDiffs(request),
    context: null,
    stale: await isStale(request),
  };
}

const clean = (text: string | null | undefined): string | null => {
  if (text == null || text.trim() === '') return null;
  const t = text.trim();
  return t.length > 500 ? t.slice(0, 500) : t;
};

async function lockPending(id: number): Promise<partner.ChangeRequestRow> {
  const request = await partner.findChangeForUpdate(id);
  if (!request) throw new IllegalArgumentError(`Không tìm thấy yêu cầu thay đổi với ID: ${id}`);
  if (request.status !== 'PENDING') throw new IllegalStateError(`Yêu cầu đã được xử lý (${request.status}), không thể duyệt hoặc từ chối lại.`);
  return request;
}

async function reviewer(adminAccountId: number | null): Promise<accounts.AccountWithProvider> {
  const found = adminAccountId == null ? null : await accounts.findById(adminAccountId);
  if (!found) throw new IllegalStateError('Không xác định được tài khoản quản trị đang thao tác.');
  return found;
}

async function finish(id: number, status: ChangeRequestStatus, reviewerAccount: accounts.AccountWithProvider, note: string | null | undefined): Promise<void> {
  await partner.updateChange(id, { status, reviewedBy: reviewerAccount.id, reviewedAt: nowLocal(), reviewNote: clean(note) });
}

export function approve(id: number, adminAccountId: number | null, note: string | null | undefined): Promise<ChangeRequestDetail> {
  return tx(async () => {
    const request = await lockPending(id);
    const submitter = await accounts.findById(request.submittedBy);
    const provider = await providers.findById(request.providerId);
    if (!submitter || submitter.status !== 'ACTIVE' || !provider || provider.status !== 'ACTIVE') {
      throw new IllegalStateError('Nhà cung cấp đang không hoạt động, không thể duyệt yêu cầu.');
    }
    const reviewerAccount = await reviewer(adminAccountId);
    const placeId = request.placeId;
    const payload = request.payload ?? {};
    switch (request.targetType) {
      case 'HOMESTAY':
        // HOM-MGT-BR-04 / chuyển NCC: các yêu cầu này không mang theo nội dung sửa Homestay (payload chỉ có "visibility" hoặc
        // "providerId"/"providerName") — không được coi là PartnerHomestayDetailDto như UPDATE thường.
        if (request.operation === 'PUBLISH') await homestays.applyPublish(submitter, placeId);
        else if (request.operation === 'TRANSFER') await homestays.applyTransfer(submitter, placeId, await resolveTransferTarget(payload));
        else await homestays.applyApproved(submitter, placeId, payload as homestays.HomestayDto);
        break;
      case 'ROOM_TYPE': {
        const input = payload as unknown as RoomInput;
        const saved = await roomService.applyApproved(submitter, placeId, request.targetId, input);
        // Ảnh NCC chọn lúc tạo loại phòng mới được giữ trong yêu cầu; gắn vào phòng ngay khi duyệt.
        if (request.targetId == null) await media.attachPhotosToRoom(submitter, saved.id, input.photos);
        break;
      }
      case 'ROOM_PRICE':
        if (request.operation === 'DELETE') await roomService.applyDeletePrice(submitter, placeId, request.roomTypeId!, request.targetId!);
        else await roomService.applyPrice(submitter, placeId, request.roomTypeId!, request.targetId, payload as unknown as PriceInput);
        break;
    }
    await finish(id, 'APPROVED', reviewerAccount, note);
    const full = (await partner.findChangeFull(id))!;
    await audit.record(adminAccountId, 'CHANGE_REQUEST_APPROVED', 'ChangeRequest', id, clean(note), { status: 'PENDING' }, {
      status: 'APPROVED',
      target: request.targetType,
      placeId,
      changes: summaryText(full),
    });
    return toDetail(full);
  });
}

export function reject(id: number, adminAccountId: number | null, reason: string | null | undefined): Promise<ChangeRequestDetail> {
  return tx(async () => {
    if (reason == null || reason.trim() === '') throw new IllegalArgumentError('Vui lòng nhập lý do từ chối.');
    const request = await lockPending(id);
    await finish(id, 'REJECTED', await reviewer(adminAccountId), reason);
    await audit.record(adminAccountId, 'CHANGE_REQUEST_REJECTED', 'ChangeRequest', id, clean(reason), { status: 'PENDING' }, { status: 'REJECTED', target: request.targetType, placeId: request.placeId });
    return toDetail((await partner.findChangeFull(id))!);
  });
}

/**
 * Xem xét lại yêu cầu đã bị từ chối: đưa về Chờ duyệt để Admin duyệt hoặc từ chối lại (lý do cũ giữ trong Audit Log). Không mở lại
 * nếu NCC đã gửi yêu cầu mới hơn cho cùng đối tượng — yêu cầu mới thay thế yêu cầu cũ.
 */
export function reopen(id: number, adminAccountId: number | null, note: string | null | undefined): Promise<ChangeRequestDetail> {
  return tx(async () => {
    await reviewer(adminAccountId);
    const request = await partner.findChangeForUpdate(id);
    if (!request) throw new IllegalArgumentError(`Không tìm thấy yêu cầu thay đổi với ID: ${id}`);
    if (request.status !== 'REJECTED') throw new IllegalStateError('Chỉ có thể xem xét lại yêu cầu đã bị từ chối.');
    const singleTarget = request.targetType === 'HOMESTAY' || request.targetId != null;
    if (singleTarget && (await partner.findOpenChanges('PENDING', request.placeId, request.targetType, request.targetId, request.roomTypeId)).length > 0) {
      throw new IllegalStateError('Nhà cung cấp đã gửi yêu cầu mới cho cùng nội dung — hãy xử lý yêu cầu mới đó.');
    }
    const previousNote = request.reviewNote;
    await partner.updateChange(id, { status: 'PENDING', reviewedBy: null, reviewedAt: null, reviewNote: null });
    const before: Record<string, unknown> = { status: 'REJECTED' };
    if (previousNote != null) before.reason = previousNote;
    await audit.record(adminAccountId, 'CHANGE_REQUEST_REOPENED', 'ChangeRequest', id, clean(note), before, { status: 'PENDING', placeId: request.placeId });
    return toDetail((await partner.findChangeFull(id))!);
  });
}

/** Nhà cung cấp đích của yêu cầu chuyển — phải còn tồn tại và đang ACTIVE ngay tại thời điểm duyệt. */
async function resolveTransferTarget(payload: Record<string, any>): Promise<number> {
  const raw = payload.providerId;
  if (raw == null) throw new IllegalStateError('Yêu cầu chuyển thiếu nhà cung cấp đích.');
  const target = await providers.findById(Number(raw));
  if (!target) throw new IllegalStateError('Không tìm thấy nhà cung cấp đích.');
  if (target.status !== 'ACTIVE') throw new IllegalStateError('Nhà cung cấp đích hiện không hoạt động, không thể duyệt chuyển.');
  return target.id;
}

/** Dữ liệu chính thức có còn giống nội dung cũ NCC nhìn thấy lúc gửi không. Chỉ ý nghĩa với yêu cầu đang chờ. */
async function isStale(request: ChangeRequestFull): Promise<boolean> {
  if (request.status !== 'PENDING') return false;
  try {
    const place = await placeRepo.findDetailById(request.placeId);
    if (!place) return true;
    // HOM-MGT-BR-04: yêu cầu xuất bản coi là cũ khi Homestay không còn đủ điều kiện xuất bản ngay lúc này, hoặc visibility hiện tại
    // đã khác lúc gửi yêu cầu.
    if (request.operation === 'PUBLISH') {
      const beforeVisibility = request.beforeData?.visibility;
      return (beforeVisibility != null && beforeVisibility !== place.visibility) || !(await homestays.isReadyToPublish(place));
    }
    // Chuyển NCC: cũ khi Homestay đã bị chuyển/xóa khỏi NCC gửi yêu cầu từ lúc gửi, hoặc NCC đích không còn tồn tại / ACTIVE.
    if (request.operation === 'TRANSFER') {
      const beforeProviderId = request.beforeData?.providerId;
      const providerChanged = beforeProviderId != null && place.providerId != null && Number(beforeProviderId) !== place.providerId;
      const targetId = request.payload?.providerId;
      const target = targetId == null ? null : await providers.findById(Number(targetId));
      return providerChanged || !target || target.status !== 'ACTIVE';
    }
    const owner = await accounts.findById(request.submittedBy);
    if (!owner) return true;
    let current: Data = null;
    if (request.targetType === 'HOMESTAY') {
      current = pick('HOMESTAY', (await homestays.detailOf(place)) as unknown as Data);
    } else if (request.targetType === 'ROOM_TYPE') {
      if (request.targetId != null) {
        const found = (await roomService.listAs(owner, request.placeId)).find((r) => r.id === request.targetId);
        if (!found) return true;
        current = pick('ROOM_TYPE', found as unknown as Data);
      }
    } else if (request.targetId != null) {
      const found = (await roomService.pricesAs(owner, request.placeId, request.roomTypeId!)).find((p) => p.id === request.targetId);
      if (!found) return true;
      current = pick('ROOM_PRICE', found as unknown as Data);
    }
    return changedFields(request.targetType, request.beforeData, current).length > 0;
  } catch {
    // Đối tượng đã bị xóa hoặc không còn truy cập được → nội dung cũ chắc chắn không còn khớp.
    return true;
  }
}

// ===== ChangeRequestPresenter ==========================================================================================================
// Chi tiết yêu cầu thay đổi cho màn Admin: mọi trường hiển thị giống form của NCC (tên tiện nghi thay cho mã, "Có phòng tắm riêng"
// thay cho YES, giá có định dạng tiền...) kèm ngữ cảnh nhà cung cấp / Homestay / loại phòng. Chỉ đọc.

export async function presentDetail(id: number) {
  const base = await detail(id);
  const s = base.summary;
  const view: DiffSource = { targetType: s.targetType, operation: s.operation, beforeData: base.before, payload: base.after };
  const display = displayFor(await amenityNames(base.before, base.after));
  return { summary: s, before: base.before, after: base.after, changes: changesOf(view, display), fields: fieldDiffs(view, display), context: await context(s), stale: base.stale };
}

async function context(s: ChangeRequestSummary) {
  const p = s.providerId == null ? null : await providers.findById(s.providerId);
  const provider = p
    ? { id: p.id, name: p.name, contactName: p.contactName, contactPhone: p.contactPhone, contactEmail: p.contactEmail, address: p.address, status: p.status }
    : null;
  const place = s.placeId == null ? null : await placeRepo.findDetailById(s.placeId);
  let homestay = null;
  if (place) {
    const roomTypeCount = (await rooms.roomTypesByPlace(place.id)).length;
    homestay = { id: place.id, name: place.name, address: place.address, regionName: place.regionName, visibility: place.visibility, verification: place.verification, roomTypeCount };
  }
  const roomId = s.targetType === 'ROOM_TYPE' ? s.targetId : s.targetType === 'ROOM_PRICE' ? s.roomTypeId : null;
  const r = roomId == null ? null : await rooms.findRoomTypeById(roomId);
  const room = r ? { id: r.id, name: r.name, totalRoomCount: r.totalRoomCount, maxOccupancy: r.maxOccupancy, basePrice: r.basePrice, weekendPrice: r.weekendPrice, status: r.status } : null;
  return { provider, homestay, room };
}

/** Tên tiện nghi cho các mã xuất hiện ở bản cũ / mới (một truy vấn). */
async function amenityNames(before: Data, after: Data): Promise<Map<number, string>> {
  const ids: number[] = [];
  for (const data of [before ?? {}, after ?? {}]) {
    const list = (data as Record<string, unknown>).amenityIds;
    if (Array.isArray(list)) for (const v of list) if (typeof v === 'number') ids.push(v);
  }
  const names = new Map<number, string>();
  if (ids.length === 0) return names;
  for (const a of await rooms.amenitiesByIds(ids)) names.set(a.id, a.name);
  return names;
}

const money = (normalized: string): string => {
  const n = Number(normalized);
  return Number.isFinite(n) ? `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ` : normalized;
};

const dmy = (normalized: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized.slice(8, 10)}/${normalized.slice(5, 7)}/${normalized.slice(0, 4)}` : normalized);

function bedText(value: unknown): string {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return norm(value);
  const map = value as Record<string, unknown>;
  const type = norm(map.bedType);
  const quantity = norm(map.quantity);
  return `${quantity} ${type.toLocaleLowerCase('vi-VN')}`.trim();
}

export function displayFor(amenityNamesById: Map<number, string>): Display {
  return (field, raw, normalized) => {
    if (field === 'weekendPrice') return normalized === '' ? 'Bằng giá ngày thường' : money(normalized);
    if (normalized === '') return '';
    switch (field) {
      case 'amenityIds':
        return Array.isArray(raw)
          ? raw
              .map((v) => (typeof v === 'number' ? (amenityNamesById.get(v) ?? `#${v}`) : String(v)))
              .sort()
              .join(', ')
          : normalized;
      case 'privateBathroom':
        return normalized === 'YES' ? 'Có phòng tắm riêng' : normalized === 'NO' ? 'Dùng chung' : 'Chưa xác định';
      case 'status':
        return normalized === 'ACTIVE' ? 'Mở bán' : normalized === 'INACTIVE' ? 'Ngừng bán' : normalized;
      case 'basePrice':
      case 'price':
        return money(normalized);
      case 'areaSqm':
        return `${normalized} m²`;
      case 'beds':
        return Array.isArray(raw)
          ? raw
              .map(bedText)
              .filter((b) => b !== '')
              .join(', ')
          : normalized;
      case 'periodStart':
      case 'periodEnd':
        return dmy(normalized);
      case 'visibility':
        return normalized === 'PUBLISHED' ? 'Công khai' : normalized === 'DRAFT' ? 'Bản nháp' : normalized;
      case 'refundOnLateCancel':
        return normalized === 'FULL_REFUND' ? 'Hoàn toàn bộ tiền' : normalized === 'NO_REFUND' ? 'Không hoàn tiền' : normalized;
      case 'freeCancelCutoffHours':
        return `${normalized} giờ`;
      default:
        return normalized;
    }
  };
}
