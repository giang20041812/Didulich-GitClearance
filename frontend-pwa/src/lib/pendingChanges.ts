import type { ChangeRequestSummary } from '@/types/changeRequest';

/**
 * Các thay đổi NCC đã gửi đang chờ Admin duyệt, tra theo đối tượng để gắn tag "Chờ duyệt" đúng chỗ
 * (thẻ Homestay, thẻ loại phòng, dòng giá...). Khớp PartnerChangeService:
 *  - HOMESTAY: xuất bản lần đầu (PUBLISH), chuyển NCC quản lý (TRANSFER) — targetId null;
 *  - ROOM_TYPE: thêm (CREATE, targetId null — loại phòng chưa tồn tại) / sửa (UPDATE, targetId = id loại phòng);
 *  - ROOM_PRICE: thêm / sửa / xóa giá theo mùa (targetId = id giá, roomTypeId = id loại phòng).
 */
export interface PendingIndex {
  all: ChangeRequestSummary[];
  /** Mọi yêu cầu đang chờ của một Homestay. */
  ofPlace: (placeId: number) => ChangeRequestSummary[];
  /** Yêu cầu sửa loại phòng này hoặc giá của nó. */
  ofRoom: (roomId: number) => ChangeRequestSummary[];
  ofPrice: (priceId: number) => ChangeRequestSummary | undefined;
  /** Loại phòng mới chưa được duyệt (chưa có trong danh sách chính thức). */
  newRooms: (placeId: number) => ChangeRequestSummary[];
  /** Giá theo mùa mới chưa được duyệt của một loại phòng. */
  newPrices: (roomId: number) => ChangeRequestSummary[];
}

export function indexPending(list: ChangeRequestSummary[]): PendingIndex {
  const pending = list.filter((r) => r.status === 'PENDING');
  return {
    all: pending,
    ofPlace: (placeId) => pending.filter((r) => r.placeId === placeId),
    ofRoom: (roomId) => pending.filter((r) =>
      (r.targetType === 'ROOM_TYPE' && r.targetId === roomId) || (r.targetType === 'ROOM_PRICE' && r.roomTypeId === roomId)),
    ofPrice: (priceId) => pending.find((r) => r.targetType === 'ROOM_PRICE' && r.targetId === priceId),
    newRooms: (placeId) => pending.filter((r) => r.placeId === placeId && r.targetType === 'ROOM_TYPE' && r.operation === 'CREATE'),
    newPrices: (roomId) => pending.filter((r) => r.targetType === 'ROOM_PRICE' && r.operation === 'CREATE' && r.roomTypeId === roomId),
  };
}

export const NO_PENDING: PendingIndex = indexPending([]);

/** Một dòng ngắn: thay đổi gì đang chờ duyệt. */
export function pendingWhat(r: ChangeRequestSummary): string {
  const name = `“${r.targetName}”`;
  switch (r.targetType) {
    case 'HOMESTAY':
      return r.operation === 'PUBLISH' ? 'Xuất bản Homestay' : r.operation === 'TRANSFER' ? r.changeSummary || 'Chuyển NCC quản lý' : `Sửa Homestay: ${r.changeSummary}`;
    case 'ROOM_TYPE':
      return r.operation === 'CREATE' ? `Thêm loại phòng ${name}` : r.operation === 'DELETE' ? `Xóa loại phòng ${name}` : `Sửa ${name}: ${r.changeSummary}`;
    case 'ROOM_PRICE':
      return r.operation === 'CREATE' ? `Thêm giá ${name}` : r.operation === 'DELETE' ? `Xóa giá ${name}` : `Sửa giá ${name}: ${r.changeSummary}`;
  }
}
