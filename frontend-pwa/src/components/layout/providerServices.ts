import { BedDouble, Bus, Compass, type LucideIcon } from 'lucide-react';
import type { ProviderServiceType } from '@/types/partner';
import homestayImage from '@/assets/fluent/homestay.webp';
import experienceImage from '@/assets/fluent/experience.webp';
import transportImage from '@/assets/fluent/transport.webp';

export interface ProviderServiceOption {
  type: ProviderServiceType;
  /** Giá trị ?loai= trên đường dẫn đăng ký (đọc được, chia sẻ được). */
  slug: string;
  label: string;
  description: string;
  /** Biểu tượng nét (menu, nhãn nhỏ). */
  Icon: LucideIcon;
  /** Ảnh 3D (Fluent Emoji, MIT) cho hộp "Bạn muốn cung cấp gì?" và trang đăng ký. */
  image: string;
}

const HOMESTAY: ProviderServiceOption = {
  type: 'HOMESTAY', slug: 'homestay', label: 'Homestay', description: 'Cho thuê phòng, nhà gỗ, nhà sàn',
  Icon: BedDouble, image: homestayImage,
};

/**
 * Loại hình nhà cung cấp — hộp "Bạn muốn cung cấp gì?" (header, sidebar) và form đăng ký dùng chung để tên gọi, biểu
 * tượng luôn khớp nhau. Cả ba loại đều phải được quản trị viên duyệt hồ sơ.
 */
export const PROVIDER_SERVICES: ProviderServiceOption[] = [
  HOMESTAY,
  {
    type: 'EXPERIENCE', slug: 'trai-nghiem', label: 'Trải nghiệm', description: 'Tour bản làng, trekking, làm nghề, ẩm thực',
    Icon: Compass, image: experienceImage,
  },
  {
    type: 'TRANSPORT', slug: 'nha-xe', label: 'Nhà xe', description: 'Xe khách, xe đưa đón, cho thuê xe máy',
    Icon: Bus, image: transportImage,
  },
];

/** Đường dẫn cũ dùng ?loai=di-chuyen cho nhà xe — vẫn mở đúng loại hình. */
const LEGACY_SLUGS: Record<string, ProviderServiceType> = { 'di-chuyen': 'TRANSPORT' };

export const providerRegisterPath = (option: ProviderServiceOption) => `/register/partner?loai=${option.slug}`;

/** Loại hình theo ?loai= trên đường dẫn; thiếu hoặc sai thì null (trang đăng ký hỏi chọn loại hình trước). */
export const providerServiceBySlug = (slug: string | null) => {
  const legacy = slug ? LEGACY_SLUGS[slug] : undefined;
  return PROVIDER_SERVICES.find((option) => option.slug === slug || option.type === legacy) ?? null;
};

/** Hồ sơ cũ (trước khi có loại hình) là homestay. */
export const providerServiceByType = (type: ProviderServiceType | null | undefined) =>
  PROVIDER_SERVICES.find((option) => option.type === type) ?? HOMESTAY;

// ------------------------------------------------------------------ câu hỏi riêng từng loại hình
// Cùng mã và giới hạn với ProviderApplicationDetails.java (backend kiểm lại khi nhận hồ sơ).

export interface CodeOption { code: string; label: string }

export const PROPERTY_TYPES: CodeOption[] = [
  { code: 'NHA_SAN', label: 'Nhà sàn' },
  { code: 'NHA_GO', label: 'Nhà gỗ' },
  { code: 'NHA_TRINH_TUONG', label: 'Nhà trình tường' },
  { code: 'BUNGALOW', label: 'Bungalow' },
  { code: 'NHA_XAY', label: 'Nhà xây' },
  { code: 'KHAC', label: 'Khác' },
];

export const EXPERIENCE_TYPES: CodeOption[] = [
  { code: 'TREKKING', label: 'Đi bộ, leo núi' },
  { code: 'CRAFT', label: 'Làm nghề thủ công' },
  { code: 'CUISINE', label: 'Ẩm thực bản địa' },
  { code: 'CULTURE', label: 'Văn hóa, lễ hội' },
  { code: 'ADVENTURE', label: 'Mạo hiểm (dù lượn, zipline…)' },
  { code: 'FARM', label: 'Làm nông, hái chè' },
];

export const GUIDE_LANGUAGES: CodeOption[] = [
  { code: 'VI', label: 'Tiếng Việt' },
  { code: 'EN', label: 'Tiếng Anh' },
  { code: 'HMONG', label: "Tiếng H'Mông" },
  { code: 'THAI', label: 'Tiếng Thái' },
  { code: 'OTHER', label: 'Ngôn ngữ khác' },
];

export const VEHICLE_TYPES: CodeOption[] = [
  { code: 'XE_MAY', label: 'Xe máy' },
  { code: 'OTO_4_7', label: 'Ô tô 4–7 chỗ' },
  { code: 'XE_16', label: 'Xe 16 chỗ' },
  { code: 'XE_KHACH', label: 'Xe khách' },
  { code: 'LIMOUSINE', label: 'Limousine' },
  { code: 'XE_JEEP', label: 'Xe U-oát / Jeep' },
];

export const codeLabel = (options: CodeOption[], code: unknown) =>
  options.find((o) => o.code === code)?.label ?? (typeof code === 'string' ? code : '');
