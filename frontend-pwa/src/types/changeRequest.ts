/**
 * Yêu cầu thay đổi Homestay/phòng/giá của NCC chờ Admin duyệt.
 * Khớp com.dulichso.bookingapi.dto.ChangeRequestDtos và entity PartnerChangeRequest (backend-api).
 */
import type { PlaceVerificationStatus, PlaceVisibility, ProviderStatus } from './admin';

export type ChangeTargetType = 'HOMESTAY' | 'ROOM_TYPE' | 'ROOM_PRICE';
/**
 * PUBLISH: HOM-MGT-BR-04 — NCC xin đưa Homestay từ chưa công khai sang PUBLISHED lần đầu, chờ Admin duyệt.
 * TRANSFER: xác nhận nghiệp vụ (2026-09-28) — NCC hiện tại xin chuyển Homestay sang NCC khác quản lý, chờ Admin duyệt.
 */
export type ChangeOperation = 'CREATE' | 'UPDATE' | 'DELETE' | 'PUBLISH' | 'TRANSFER';
export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** Phản hồi 202 khi thay đổi được gửi chờ duyệt thay vì ghi trực tiếp (SubmittedDto). */
export interface SubmittedChange {
  changeRequestId: number;
  status: ChangeRequestStatus;
  message: string;
}

/** ChangeRequestSummaryDto */
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

/** FieldChangeDto: giá trị cũ/mới đã chuẩn hóa thành chuỗi hiển thị. */
export interface FieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

/** FieldDiffDto: một trường của đối tượng (kể cả trường không đổi); `changed` = giá trị mới khác giá trị hiện tại. */
export interface FieldDiff extends FieldChange {
  changed: boolean;
}

/** ChangeRequestDetailDto. `stale` = dữ liệu chính thức đã đổi kể từ lúc NCC gửi yêu cầu. */
export interface ChangeRequestDetail {
  summary: ChangeRequestSummary;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Chỉ các trường có thay đổi. */
  changes: FieldChange[];
  /** Toàn bộ trường theo thứ tự hiển thị, kể cả trường không đổi. */
  fields: FieldDiff[];
  /** Ngữ cảnh xét duyệt (nhà cung cấp / Homestay / loại phòng); null nếu backend không trả. */
  context: ChangeContext | null;
  stale: boolean;
}

/** ProviderInfoDto — hồ sơ đối tác gửi yêu cầu. */
export interface ChangeProviderInfo {
  id: number;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  status: ProviderStatus | null;
}

/** HomestayInfoDto */
export interface ChangeHomestayInfo {
  id: number;
  name: string;
  address: string | null;
  regionName: string | null;
  visibility: PlaceVisibility | null;
  verification: PlaceVerificationStatus | null;
  roomTypeCount: number;
}

/** RoomInfoDto — loại phòng hiện tại mà yêu cầu nhắm tới. */
export interface ChangeRoomInfo {
  id: number;
  name: string;
  totalRoomCount: number;
  maxOccupancy: number;
  basePrice: number | null;
  weekendPrice: number | null;
  status: 'ACTIVE' | 'INACTIVE' | string;
}

/** ChangeContextDto; `room` null khi yêu cầu không liên quan loại phòng. */
export interface ChangeContext {
  provider: ChangeProviderInfo | null;
  homestay: ChangeHomestayInfo | null;
  room: ChangeRoomInfo | null;
}

export interface ChangeRequestSearchParams {
  status?: ChangeRequestStatus;
  providerId?: number;
  placeId?: number;
  targetType?: ChangeTargetType;
  keyword?: string;
  from?: string;
  to?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

/** PendingCountDto */
export interface PendingChangeCount {
  pending: number;
}
