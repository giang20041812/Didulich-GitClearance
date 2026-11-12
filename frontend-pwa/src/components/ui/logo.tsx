import React from 'react';
import markSm from '@/assets/brand/logo-di-160.webp';
import markLg from '@/assets/brand/logo-di-320.webp';
import lockupStacked from '@/assets/brand/logo-lockup-stacked-480.webp';

/** Biểu tượng "Đi" + chữ "Du Lịch" đọc liền thành tên thương hiệu. */
export const BRAND_NAME = 'Đi Du Lịch';

type Size = number | string;

const toPx = (size: Size) => (typeof size === 'number' ? `${size}px` : size);


interface MarkProps {
  size?: Size;
  className?: string;
  /** Mô tả cho trình đọc màn hình; để trống khi đã có tên thương hiệu dạng chữ bên cạnh. */
  alt?: string;
  /** Đặt biểu tượng trên nền kem — dùng khi nằm trên ảnh hoặc nền xanh đậm. */
  plate?: boolean;
}

/** Biểu tượng "Đi" (chữ Đ lồng ruộng bậc thang, núi và mặt trời). */
export const LogoMark: React.FC<MarkProps> = ({ size = 48, className = '', alt = '', plate = false }) => {
  const px = toPx(size);
  const img = (
    <img
      src={markSm}
      srcSet={`${markSm} 160w, ${markLg} 320w`}
      sizes={px}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      decoding="async"
      className={plate ? 'block h-full w-full object-contain' : `block shrink-0 object-contain ${className}`}
      style={plate ? undefined : { width: px, height: px }}
    />
  );
  if (!plate) return img;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[22%] bg-[#F7F5ED] shadow-sm ${className}`}
      style={{ width: px, height: px, padding: `calc(${px} * 0.08)` }}
    >
      {img}
    </span>
  );
};

/**
 * Chữ "Đi Du Lịch" cạnh biểu tượng: font tiêu đề DT Phudu.
 * `size` là cỡ chữ (px); `height` giữ cho các chỗ gọi cũ (chiều cao ảnh chữ cũ) và được quy đổi sang cỡ chữ.
 */
export const LogoWordmark: React.FC<{ size?: number; height?: Size; tone?: 'dark' | 'light'; className?: string }> = ({
  size,
  height = 15,
  tone = 'dark',
  className = '',
}) => {
  const fontSize = size ?? (typeof height === 'number' ? Math.round(height * 1.5) : 22);
  return (
    <span
      aria-hidden
      className={`block shrink-0 whitespace-nowrap leading-none ${className}`}
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: `${fontSize}px`,
        letterSpacing: '-0.01em',
        color: tone === 'light' ? '#F7F5ED' : 'var(--color-ink-deep)',
      }}
    >
      Đi Du Lịch
    </span>
  );
};

interface LogoProps {
  className?: string;
  /** Chiều cao biểu tượng. */
  size?: Size;
  showText?: boolean;
  /** 'horizontal' = biểu tượng + chữ ngang; 'stacked' = logo dọc gốc; 'mark' = chỉ biểu tượng. */
  variant?: 'horizontal' | 'stacked' | 'mark' | 'full';
  /** 'light' cho nền tối / nền ảnh (chữ màu kem, biểu tượng đặt trên nền kem). */
  tone?: 'dark' | 'light';
  /** @deprecated giữ để tương thích, không còn dùng. */
  textColor?: string;
  /** @deprecated giữ để tương thích, không còn dùng. */
  subTextColor?: string;
}

/** Logo "Đi Du Lịch". */
export const Logo: React.FC<LogoProps> = ({
  size = 48,
  className = '',
  showText = true,
  variant = 'horizontal',
  tone = 'dark',
}) => {
  if (variant === 'stacked') {
    return (
      <img
        src={lockupStacked}
        alt={BRAND_NAME}
        draggable={false}
        decoding="async"
        className={`block h-auto ${className}`}
        style={{ width: toPx(size) }}
      />
    );
  }
  if (variant === 'mark' || !showText) {
    return <LogoMark size={size} className={className} alt={BRAND_NAME} plate={tone === 'light'} />;
  }
  const markSize = typeof size === 'number' ? size : 48;
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} role="img" aria-label={BRAND_NAME}>
      <LogoMark size={markSize} plate={tone === 'light'} />
      <LogoWordmark size={Math.round(markSize * 0.56)} tone={tone} />
    </span>
  );
};

// Tên cũ — giữ để các trang hiện có không phải sửa import.
export const VietTrackLogoMark: React.FC<{ size?: Size; className?: string }> = ({ size = 48, className = '' }) => (
  <LogoMark size={size} className={className} />
);
export const VietTrackLogo = Logo;
export const DiDuLichLogoMark = VietTrackLogoMark;
export const DiDuLichLogo = Logo;
export const VietJourneyLogoMark = VietTrackLogoMark;
export const VietJourneyLogo = Logo;

export default Logo;
