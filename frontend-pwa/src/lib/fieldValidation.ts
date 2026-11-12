/**
 * Kiểm tra từng ô ngay khi người dùng gõ (Cổng NCC và form đặt phòng của khách) — cùng quy tắc với backend (PartnerHomestayService.validate,
 * PartnerRoomDtos.RoomInput) để lỗi hiện ngay dưới ô nhập thay vì chỉ báo sau khi bấm Lưu.
 * Mỗi hàm trả về câu báo lỗi tiếng Việt, hoặc null khi hợp lệ.
 */

const trim = (value?: string | null) => (value ?? '').trim();

/** Bỏ dấu cách, dấu chấm, gạch nối, ngoặc mà người dùng hay gõ trong số điện thoại. */
export const phoneDigits = (value?: string | null) => trim(value).replace(/[\s.()-]/g, '');

export function nameError(value?: string | null, label = 'tên Homestay'): string | null {
  const v = trim(value);
  if (!v) return `Nhập ${label}`;
  if (v.length > 255) return `Tối đa 255 ký tự (đang có ${v.length})`;
  return null;
}

export function addressError(value?: string | null, required = true): string | null {
  const v = trim(value);
  if (!v) return required ? 'Nhập địa chỉ để khách tìm đường' : null;
  if (v.length < 5) return 'Địa chỉ quá ngắn — ghi rõ thôn/bản, xã, huyện';
  if (v.length > 500) return 'Địa chỉ tối đa 500 ký tự';
  return null;
}

/** Di động Việt Nam (10 số, đầu 03/05/07/08/09), máy bàn (02x + 8 số) hoặc số nước ngoài +mã nước. */
export function phoneError(value?: string | null, required = false): string | null {
  const raw = trim(value);
  if (!raw) return required ? 'Nhập số điện thoại liên hệ' : null;
  const digits = phoneDigits(raw);
  if (/^(\+84|84|0)[35789]\d{8}$/.test(digits)) return null;
  if (/^(\+84|84|0)2\d{9}$/.test(digits)) return null;
  if (/^\+(?!84)[1-9]\d{6,14}$/.test(digits)) return null;
  if (!/^\+?\d+$/.test(digits)) return 'Số điện thoại chỉ gồm chữ số';
  return 'Số điện thoại chưa đúng — số di động gồm 10 chữ số, VD: 0912 345 678';
}

/** Lỗi gõ nhầm tên miền hay gặp: "gmail.comabc", "gmial.com"... → gợi ý đúng. */
const KNOWN_DOMAINS: { right: string; wrong: RegExp }[] = [
  { right: 'gmail.com', wrong: /^(gmai|gmial|gamil|gmaill|gmal|gnail|gmali)\.|^gmail\.(?!com$)/ },
  { right: 'yahoo.com', wrong: /^(yaho|yahooo|yhoo)\.|^yahoo\.(?!com$|com\.vn$)/ },
  { right: 'hotmail.com', wrong: /^(hotmai|hotmial|hotmal)\.|^hotmail\.(?!com$)/ },
  { right: 'outlook.com', wrong: /^(outlok|outllook)\.|^outlook\.(?!com$|com\.vn$)/ },
  { right: 'icloud.com', wrong: /^(iclod|icoud)\.|^icloud\.(?!com$)/ },
];

export function emailError(value?: string | null, required = false): string | null {
  const v = trim(value);
  if (!v) return required ? 'Nhập email' : null;
  if (v.length > 254) return 'Email quá dài';
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,24}$/.test(v)) return 'Email chưa đúng dạng, VD: ten@gmail.com';
  const domain = v.slice(v.lastIndexOf('@') + 1).toLowerCase();
  const typo = KNOWN_DOMAINS.find((d) => domain !== d.right && d.wrong.test(domain));
  if (typo) return `Có phải bạn muốn nhập ...@${typo.right}?`;
  return null;
}

/** Thêm "https://" khi người dùng dán link thiếu phần đầu (VD: facebook.com/ten-trang). */
export function normalizeUrl(value?: string | null): string {
  const v = trim(value);
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(v)) return `https://${v}`;
  return v;
}

export function urlError(value?: string | null, max = 500): string | null {
  const v = trim(value);
  if (!v) return null;
  if (!/^https?:\/\/\S+$/i.test(v)) return 'Link phải bắt đầu bằng https://';
  if (v.length > max) return `Link tối đa ${max.toLocaleString('vi-VN')} ký tự`;
  return null;
}

export function tiktokError(value?: string | null): string | null {
  const v = trim(value);
  if (!v) return null;
  if (!/^https:\/\/((www|m|vt|vm)\.)?tiktok\.com\/\S*$/.test(v)) return 'Dán link TikTok dạng https://www.tiktok.com/@kenh/video/... hoặc https://vt.tiktok.com/...';
  if (v.length > 500) return 'Link tối đa 500 ký tự';
  return null;
}

export function facebookError(value?: string | null): string | null {
  const v = trim(value);
  if (!v) return null;
  const base = urlError(v);
  if (base) return base;
  if (!/^https?:\/\/([\w-]+\.)*(facebook\.com|fb\.com|fb\.me)\//i.test(v)) return 'Đây không phải link Facebook (facebook.com/...)';
  return null;
}

/** Vĩ độ / kinh độ: phải có cả hai; ngoài lãnh thổ Việt Nam thì nhắc kiểm tra lại. */
export function coordinateError(lat: number | null | undefined, lng: number | null | undefined): string | null {
  const hasLat = lat != null && Number.isFinite(lat);
  const hasLng = lng != null && Number.isFinite(lng);
  if (!hasLat && !hasLng) return null;
  if (hasLat !== hasLng) return 'Cần nhập cả vĩ độ và kinh độ';
  if (Math.abs(lat as number) > 90 || Math.abs(lng as number) > 180) return 'Tọa độ không hợp lệ';
  if ((lat as number) < 8 || (lat as number) > 24 || (lng as number) < 102 || (lng as number) > 110) return 'Vị trí đang nằm ngoài Việt Nam — kiểm tra lại';
  return null;
}

export function lengthError(value: string | null | undefined, max: number): string | null {
  const v = trim(value);
  return v.length > max ? `Tối đa ${max.toLocaleString('vi-VN')} ký tự (đang có ${v.length.toLocaleString('vi-VN')})` : null;
}

export function countError(value: number | null | undefined, label: string, min: number, max: number): string | null {
  if (value == null || !Number.isFinite(value)) return `Nhập ${label}`;
  if (!Number.isInteger(value)) return `${label.charAt(0).toUpperCase()}${label.slice(1)} phải là số nguyên`;
  if (value < min) return `Ít nhất ${min}`;
  if (value > max) return `Tối đa ${max.toLocaleString('vi-VN')}`;
  return null;
}

export function priceError(value: number | null | undefined, required = true): string | null {
  if (value == null || value === 0) return required ? 'Nhập giá phòng (lớn hơn 0)' : null;
  if (value < 0) return 'Giá phải lớn hơn 0';
  if (value > 999_999_999_999) return 'Giá quá lớn';
  if (value < 10_000) return 'Giá có vẻ quá thấp — giá tính theo đồng, VD: 500.000';
  return null;
}

/** Trả về null khi không có lỗi nào; dùng để bật / tắt nút Lưu. */
export const firstError = (...errors: (string | null)[]) => errors.find((e) => e != null) ?? null;

/** SĐT khách đặt phòng theo mã nước đang chọn: +84 thì số di động 10 chữ số (gõ hoặc bỏ số 0 đầu đều được). */
export function guestPhoneError(countryCode: string, value?: string | null): string | null {
  const digits = phoneDigits(value);
  if (!digits) return 'Nhập số điện thoại di động';
  if (!/^\d+$/.test(digits)) return 'Số điện thoại chỉ gồm chữ số';
  if (countryCode === '+84') return /^0?[35789]\d{8}$/.test(digits) ? null : 'Số điện thoại chưa đúng — số di động Việt Nam gồm 10 chữ số, VD: 0912 345 678';
  return /^\d{6,14}$/.test(digits) ? null : 'Số điện thoại chưa đúng';
}

/** Ghép mã nước + số khách gõ thành dạng lưu: "+84" + 9 số (bỏ số 0 đầu). */
export function fullGuestPhone(countryCode: string, value?: string | null): string {
  const digits = phoneDigits(value);
  return countryCode === '+84' ? `+84${digits.replace(/^0/, '')}` : `${countryCode}${digits}`;
}
