import type { ProviderServiceType } from '../domain/enums.js';
import { IllegalArgumentError } from '../lib/errors.js';

/**
 * Câu hỏi riêng của từng loại hình trong mẫu đăng ký nhà cung cấp: kiểm tra và chuẩn hóa trước khi lưu vào
 * provider_application.details. Giao diện (frontend providerServices.ts) dùng cùng mã và giới hạn.
 *  - Homestay: loại nhà, số phòng, số khách tối đa.
 *  - Trải nghiệm: loại trải nghiệm, thời lượng, số khách mỗi đoàn, ngôn ngữ, số thẻ hướng dẫn viên.
 *  - Nhà xe: loại xe, số xe, tuyến chạy chính, số giấy phép kinh doanh vận tải.
 */

export const PROPERTY_TYPES = new Set(['NHA_SAN', 'NHA_GO', 'NHA_TRINH_TUONG', 'BUNGALOW', 'NHA_XAY', 'KHAC']);
export const EXPERIENCE_TYPES = new Set(['TREKKING', 'CRAFT', 'CUISINE', 'CULTURE', 'ADVENTURE', 'FARM']);
export const LANGUAGES = new Set(['VI', 'EN', 'HMONG', 'THAI', 'OTHER']);
export const VEHICLE_TYPES = new Set(['XE_MAY', 'OTO_4_7', 'XE_16', 'XE_KHACH', 'LIMOUSINE', 'XE_JEEP']);

type Raw = Record<string, unknown>;

/**
 * Bản đã chuẩn hóa — chỉ các khóa của loại hình, đúng kiểu. `raw` null (giao diện cũ chưa có câu hỏi riêng) thì trả null để hồ sơ
 * vẫn gửi được; Admin thấy "Chưa khai báo". Sai thì IllegalArgumentError với câu báo lỗi tiếng Việt hiển thị thẳng cho người đăng ký.
 */
export function normalize(type: ProviderServiceType, raw: Raw | null | undefined): Raw | null {
  if (raw == null) return null;
  const out: Raw = {};
  switch (type) {
    case 'HOMESTAY':
      out.propertyType = oneOf(raw, 'propertyType', PROPERTY_TYPES, 'Vui lòng chọn loại nhà.');
      out.roomCount = intIn(raw, 'roomCount', 1, 100, 'Số phòng');
      out.maxGuests = intIn(raw, 'maxGuests', 1, 500, 'Số khách tối đa');
      break;
    case 'EXPERIENCE': {
      out.experienceTypes = someOf(raw, 'experienceTypes', EXPERIENCE_TYPES, true, 'Vui lòng chọn ít nhất một loại trải nghiệm.');
      out.durationHours = hoursIn(raw, 'durationHours', 'Thời lượng mỗi lượt');
      out.groupSizeMax = intIn(raw, 'groupSizeMax', 1, 200, 'Số khách tối đa mỗi đoàn');
      const languages = someOf(raw, 'languages', LANGUAGES, false, null);
      if (languages.length > 0) out.languages = languages;
      const license = optionalText(raw, 'guideLicenseNo', 64, 'Số thẻ hướng dẫn viên');
      if (license != null) out.guideLicenseNo = license;
      break;
    }
    case 'TRANSPORT': {
      out.vehicleTypes = someOf(raw, 'vehicleTypes', VEHICLE_TYPES, true, 'Vui lòng chọn ít nhất một loại xe.');
      out.fleetSize = intIn(raw, 'fleetSize', 1, 500, 'Số xe');
      out.routes = requiredText(raw, 'routes', 3, 500, 'Tuyến chạy chính');
      const license = optionalText(raw, 'transportLicenseNo', 64, 'Số giấy phép kinh doanh vận tải');
      if (license != null) out.transportLicenseNo = license;
      break;
    }
  }
  return out;
}

function oneOf(raw: Raw, key: string, allowed: Set<string>, missingMessage: string): string {
  const value = raw[key];
  const code = value == null ? '' : String(value).trim();
  if (!allowed.has(code)) throw new IllegalArgumentError(missingMessage);
  return code;
}

/** Danh sách mã hợp lệ, giữ thứ tự, bỏ trùng; mã lạ → lỗi (giao diện chỉ gửi mã có trong danh sách). */
function someOf(raw: Raw, key: string, allowed: Set<string>, required: boolean, missingMessage: string | null): string[] {
  const value = raw[key];
  const codes = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value) {
      const code = item == null ? '' : String(item).trim();
      if (!allowed.has(code)) throw new IllegalArgumentError(`Lựa chọn "${code}" không hợp lệ.`);
      codes.add(code);
    }
  } else if (value != null) {
    throw new IllegalArgumentError('Lựa chọn không hợp lệ.');
  }
  if (required && codes.size === 0) throw new IllegalArgumentError(missingMessage ?? 'Lựa chọn không hợp lệ.');
  return [...codes];
}

/** Số từ JSON hoặc chuỗi số ("12", "1,5"); không phải số → null. */
function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim().replace(',', '.'));
    return Number.isFinite(n) && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(value.trim().replace(',', '.')) ? n : null;
  }
  return null;
}

function intIn(raw: Raw, key: string, min: number, max: number, label: string): number {
  const n = number(raw[key]);
  if (n == null || !Number.isInteger(n)) throw new IllegalArgumentError(`${label} phải là số nguyên từ ${min} đến ${max}.`);
  if (n < min || n > max) throw new IllegalArgumentError(`${label} phải từ ${min} đến ${max}.`);
  return n;
}

/** Giờ, bước nửa giờ: 0,5 – 120 (tour nhiều ngày tính tổng số giờ). */
function hoursIn(raw: Raw, key: string, label: string): number {
  const n = number(raw[key]);
  if (n == null || n < 0.5 || n > 120) throw new IllegalArgumentError(`${label} phải từ 0,5 đến 120 giờ.`);
  if (!Number.isInteger(n * 2)) throw new IllegalArgumentError(`${label} tính theo nửa giờ (vd 1,5 giờ).`);
  return n;
}

function requiredText(raw: Raw, key: string, min: number, max: number, label: string): string {
  const value = raw[key];
  const text = value == null ? '' : String(value).trim();
  if (text.length < min || text.length > max) throw new IllegalArgumentError(`${label} cần từ ${min} đến ${max} ký tự.`);
  return text;
}

function optionalText(raw: Raw, key: string, max: number, label: string): string | null {
  const value = raw[key];
  const text = value == null ? '' : String(value).trim();
  if (text === '') return null;
  if (text.length > max) throw new IllegalArgumentError(`${label} tối đa ${max} ký tự.`);
  return text;
}
