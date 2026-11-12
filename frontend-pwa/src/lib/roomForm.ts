import type { PartnerRoomInput } from '@/types/room';
import { countError, firstError, lengthError, nameError, priceError } from '@/lib/fieldValidation';

export const BLANK_ROOM: PartnerRoomInput = {
  name: '', description: '', maxOccupancy: 2, totalRoomCount: 1, privateBathroom: 'UNVERIFIED', areaSqm: null, basePrice: 0,
  weekendPrice: undefined, status: 'ACTIVE', viewDescription: '', beds: [], amenityIds: [], otherAmenities: '',
};

/** Gợi ý tên loại phòng hay dùng — bấm một lần là điền. */
export const ROOM_NAME_PRESETS = ['Phòng đôi', 'Phòng đơn', 'Phòng gia đình', 'Phòng tập thể (dorm)', 'Bungalow', 'Nhà sàn nguyên căn'];

/** Lỗi của từng ô trong form loại phòng (cùng quy tắc với PartnerRoomDtos.RoomInput) — dùng ở trang Phòng và luồng đăng Homestay. */
export function roomErrors(form: PartnerRoomInput) {
  return {
    name: nameError(form.name, 'tên loại phòng'),
    totalRoomCount: countError(form.totalRoomCount || null, 'số phòng', 1, 10000),
    maxOccupancy: countError(form.maxOccupancy || null, 'số khách mỗi phòng', 1, 1000),
    basePrice: priceError(form.basePrice),
    weekendPrice: form.weekendPrice ? priceError(form.weekendPrice, false) : null,
    areaSqm: form.areaSqm != null && (form.areaSqm <= 0 || form.areaSqm > 9999.99) ? 'Diện tích từ 0,01 đến 9.999 m²' : null,
    beds: form.beds.some(b => !b.bedType.trim() || b.quantity < 1 || b.quantity > 100) ? 'Nhập loại giường và số lượng (1-100) cho mỗi dòng' : null,
    otherAmenities: lengthError(form.otherAmenities, 2000),
    description: lengthError(form.description, 10000),
  };
}

export const hasRoomErrors = (form: PartnerRoomInput) => firstError(...Object.values(roomErrors(form))) != null;
