import hero1280 from '@/assets/hero-sunrise-1280.webp';
import hero1672 from '@/assets/hero-sunrise-1672.webp';

/**
 * Ảnh nền hero trang chủ: "Sunrise Over Misty Rice Terraces" (bản gốc PNG 1672x941, tỉ lệ 16:9, đã đổi sang webp). Dùng chung cho <img> (HeroBackdrop) và thẻ preload (main.tsx)
 * để trình duyệt tải đúng một bản.
 *
 * Màn hình dựng đứng: khung ảnh 16:9 phủ theo chiều cao nên rộng ~178vh — khai báo đúng để không chọn bản quá nhỏ.
 */
export const HERO_SRCSET = `${hero1280} 1280w, ${hero1672} 1672w`;
export const HERO_SIZES = '(orientation: portrait) 178vh, 100vw';
export const HERO_FALLBACK_SRC = hero1672;
