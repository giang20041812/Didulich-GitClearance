import type { ChangeOperation, ChangeRequestStatus, ChangeTargetType } from '@/types/changeRequest';
import type { StatusTone } from './StatusBadge';

export const CHANGE_STATUS_LABEL: Record<ChangeRequestStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
};

export const CHANGE_STATUS_TONE: Record<ChangeRequestStatus, StatusTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export const CHANGE_TARGET_LABEL: Record<ChangeTargetType, string> = {
  HOMESTAY: 'Thông tin Homestay',
  ROOM_TYPE: 'Loại phòng',
  ROOM_PRICE: 'Giá đặc biệt',
};

export const CHANGE_OPERATION_LABEL: Record<ChangeOperation, string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  DELETE: 'Xóa',
  PUBLISH: 'Xin xuất bản',
  TRANSFER: 'Chuyển NCC quản lý',
};

export const CHANGE_STATUS_ORDER: ChangeRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
export const CHANGE_TARGET_ORDER: ChangeTargetType[] = ['HOMESTAY', 'ROOM_TYPE', 'ROOM_PRICE'];
