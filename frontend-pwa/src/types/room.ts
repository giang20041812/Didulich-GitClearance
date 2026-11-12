// Types for Room & Inventory Module matching backend-api DTOs
import { AmenityValue } from './homestay';

export interface RoomBedInfo {
  bedType: string;
  quantity: number;
}

export interface RoomTypeItem {
  id: number;
  placeId: number;
  name: string;
  description?: string;
  maxOccupancy: number;
  totalRoomCount: number;
  privateBathroom: AmenityValue;
  areaSqm?: number;
  /** null = chưa có giá, không đặt được. */
  basePrice: number | null;
  weekendPrice?: number | null;
  status: 'ACTIVE' | 'INACTIVE';
  
  // Dynamic fields
  availableRooms: number;
  badgeText?: string;
  coverImage?: string;
  images?: string[];
  bedDescription?: string;
  features?: string[];
  unitNote?: string; // e.g. "/ đêm" or "/ người"
}

// Legacy type used by HomestayDetailPage (main branch)
export interface RoomTypeDto {
  id: number;
  name: string;
  description: string;
  maxOccupancy: number;
  totalRoomCount: number;
  areaSqm: number;
  /** null = chưa có giá (dữ liệu nguồn không có giá cụ thể) — không đặt được, hiển thị "Liên hệ". */
  basePrice: number | null;
  weekendPrice?: number | null;
  /** ACTIVE = đang bán; INACTIVE = NCC đã ngừng bán, trang khách không hiển thị. Thiếu = mặc định ACTIVE (API cũ). */
  status?: 'ACTIVE' | 'INACTIVE';
  images: string[];
  amenities?: string[];
  /** "Tiện ích khác" NCC tự gõ cho loại phòng. */
  otherAmenities?: string | null;
  bedType?: string;
  hasBreakfast?: boolean;
  freeCancellation?: boolean;
}

export interface NightPriceDetail {
  nightIndex: number;
  dateStr: string;
  priceLabel: string;
  price: number;
  isSpecialRate?: boolean;
}

export type AvailabilityStatus = 'AVAILABLE' | 'NOT_ENOUGH_ROOMS' | 'ONLINE_BOOKING_PAUSED';

export interface RoomAvailabilityItem extends RoomTypeItem {
  availabilityStatus: AvailabilityStatus;
  statusBadgeText: string;
  nightlyPrices?: NightPriceDetail[];
  totalPrice?: number;
  unavailabilityReason?: string;
  pausedNotice?: string;
  imagesCount?: number;
}

export interface AvailabilityFilterParams {
  checkInDate: string; // e.g. "2026-10-15"
  checkOutDate: string; // e.g. "2026-10-17"
  guestsCount: number;
  roomsCount: number;
}

export interface PartnerRoomInput {
  name: string;
  description: string;
  maxOccupancy: number;
  totalRoomCount: number;
  privateBathroom: AmenityValue;
  areaSqm: number | null;
  basePrice: number;
  weekendPrice?: number;
  status: 'ACTIVE' | 'INACTIVE';
  viewDescription: string;
  beds: RoomBedInfo[];
  amenityIds: number[];
  /** "Tiện ích khác" của loại phòng do NCC tự gõ. */
  otherAmenities?: string;
  /** Chỉ khi tạo loại phòng mới: ảnh đã tải lên kho, backend gắn vào phòng (hoặc khi Admin duyệt). */
  photos?: import('./partner').PhotoRef[];
}
/** Loại phòng đã lưu: basePrice có thể null khi dữ liệu nạp từ nguồn chưa có giá — NCC cần nhập giá trước khi mở bán. */
export interface PartnerRoom extends Omit<PartnerRoomInput, 'basePrice'> { id: number; placeId: number; basePrice: number | null }
export interface RoomPriceInput { name: string; periodStart: string; periodEnd: string; price: number }
export interface RoomPrice extends RoomPriceInput { id: number }
/** UC-NCC-04 luồng phụ 6: giá trị NCC đã thấy trên lịch, để backend phát hiện dữ liệu đã bị sửa đồng thời. */
export interface RoomInventoryExpectedDay { stayDate: string; totalRooms: number; stopSell: boolean }
export interface RoomInventoryInput { startDate: string; endDate: string; totalRooms: number; stopSell: boolean; reason?: string; expected?: RoomInventoryExpectedDay[] }
export interface RoomInventoryDay {
  stayDate: string; totalRooms: number; heldRooms: number; confirmedRooms: number; availableRooms: number; stopSell: boolean; price: number;
  blockReason: string | null;
}
/** Một ô của màn hình Lịch phòng — khớp PartnerRoomDtos.AvailabilityDayDto. lockedRooms: phòng NCC đang khóa (không tính ngày đóng). */
export interface AvailabilityDay {
  stayDate: string; totalRooms: number; heldRooms: number; confirmedRooms: number; availableRooms: number;
  lockedRooms: number; stopSell: boolean; blockReason: string | null;
}
/** Một hàng của Lịch phòng; priced=false: loại phòng chưa có giá nên khách chưa đặt được. */
export interface AvailabilityRoom { id: number; name: string; totalRoomCount: number; status: 'ACTIVE' | 'INACTIVE'; priced: boolean; days: AvailabilityDay[] }
/** Lịch tổng hợp cả Homestay trong [startDate, endDate) — khớp PartnerRoomDtos.AvailabilityDto */
export interface HomestayAvailability { placeId: number; startDate: string; endDate: string; rooms: AvailabilityRoom[] }
/**
 * Khóa / mở phòng cho mỗi ngày trong [startDate, endDate) — khớp PartnerRoomDtos.RoomLockInput.
 * closed=true: ngừng bán cả loại phòng; closed=false: khóa đúng lockedRooms phòng mỗi ngày (0 = mở hết).
 */
export interface RoomLockInput { startDate: string; endDate: string; closed: boolean; lockedRooms?: number; reason?: string; expected?: RoomInventoryExpectedDay[] }
/**
 * Trạng thái một phòng trong một ngày: còn trống / khách đang giữ phòng (HELD — đơn chờ chủ nhà xác nhận) /
 * có khách (GUEST — đã xác nhận) / chủ nhà đang khóa. HELD và GUEST không khóa / mở được.
 */
export type UnitState = 'FREE' | 'HELD' | 'GUEST' | 'LOCKED';
/** Một ngày của lịch theo từng phòng: units[i] là "Phòng i+1" — khớp PartnerRoomDtos.UnitDayDto. */
export interface UnitDay { stayDate: string; units: UnitState[] }
/** Lịch theo từng phòng của một loại phòng — khớp PartnerRoomDtos.RoomUnitsDto. */
export interface RoomUnits { id: number; name: string; totalRoomCount: number; status: 'ACTIVE' | 'INACTIVE'; days: UnitDay[] }
/** Lịch theo từng phòng của mọi loại phòng trong Homestay (loại đang bán lên trước) — khớp PartnerRoomDtos.HomestayUnitsDto. */
export interface HomestayUnits { placeId: number; rooms: RoomUnits[] }
/** Homestay trong bộ chọn của cổng NCC (chỉ id + tên). */
export interface HomestayName { id: number; name: string }
/** Mở trang Lịch phòng trong một lượt gọi: danh sách Homestay + lịch Homestay đang xem (null khi chưa có Homestay). */
export interface CalendarBootstrap { homestays: HomestayName[]; placeId: number | null; units: HomestayUnits | null }
/** Đơn còn hiệu lực chưa trả phòng của một loại phòng (chỉ ngày ở + số phòng). */
export interface UpcomingStay { checkIn: string; checkOut: string; roomCount: number }
/** limitedDays: ngày đã có nhiều khách đặt hơn nên chỉ khóa được ít hơn số yêu cầu. */
export interface RoomLockResult { updatedDays: number; limitedDays: string[] }
export interface RoomQuote { roomTypeId: number; availableRooms: number; suitable: boolean; totalAmount: number; nights: RoomInventoryDay[] }
/** Ngừng / mở phục vụ cả Homestay trong khoảng [startDate, endDate) — khớp PartnerRoomDtos.HomestayBlockInput */
export interface HomestayBlockInput { startDate: string; endDate: string; stopSell: boolean; reason?: string }
/** NFR-AUD-02 — khớp PartnerRoomDtos.ChangeLogDto */
export interface HomestayChangeLog {
  id: number; action: string; entityType: 'RoomType' | 'Homestay'; entityId: number; reason: string | null;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null; createdAt: string;
}
