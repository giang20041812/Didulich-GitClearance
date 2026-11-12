import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Mountain, ArrowRight, type LucideIcon } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import CardFrame, { type CardFrameKind } from '@/components/ui/CardFrame';
import { mediaUrl, mediaSrcSet } from '@/lib/mediaUrl';
import { resolvePlacePhoto } from '@/lib/placeImages';

interface CompactPlaceCardProps {
  to: string;
  name: string;
  imageUrl?: string | null;
  FallbackIcon?: LucideIcon;
  location?: string | null;
  /** Mô tả ngắn (1-2 dòng) hiện dưới tên hoặc vị trí như phong cách thẻ hình 3. */
  description?: string | null;
  /** Giá đã định dạng ("350.000đ", "Miễn phí"...). Không có thì thẻ không có dòng giá. */
  price?: string | null;
  priceUnit?: string | null;
  /** Nhãn nhỏ góc trên trái ảnh (mùa đẹp, loại dịch vụ...). */
  badge?: ReactNode;
  /** Nhãn nhỏ góc trên phải ảnh (thời tiết, đánh giá, tag phụ...). */
  secondaryBadge?: ReactNode;
  /** Nút góc trên phải ảnh (vd. lưu yêu thích) — nằm ngoài link để không lồng nút trong thẻ a. */
  action?: ReactNode;
  /** Dòng trạng thái ngắn dưới địa điểm (tạm ngừng, hết phòng...). */
  notice?: ReactNode;
  /**
   * Tiện ích ngắn (vd. "Wifi", "Bếp") hiện dạng chip dưới địa điểm — chỉ từ md, điện thoại ẩn cho thẻ gọn. Truyền mảng (kể
   * cả rỗng) để thẻ chừa sẵn dòng này, các thẻ cùng hàng cao bằng nhau.
   */
  amenities?: string[] | null;
  /** Nhãn nút hành động ở chân thẻ (vd. "Khám phá ngay" kèm mũi tên chuyển động) */
  ctaText?: string | null;
  /** Khách sắp mở chi tiết (hover / chạm / focus) — dùng để tải trước. */
  onIntent?: () => void;
  /** Chế độ thu gọn (compact) kích thước vừa vặn cho danh sách homestay */
  compact?: boolean;
  /** Khung nét mảnh bên ngoài thẻ theo loại thông tin (nhà sàn cho homestay, núi cho điểm đến... — xem CardFrame). */
  frame?: CardFrameKind;
  /** Thuộc tính sizes của ảnh theo bề rộng thẻ thật trong lưới (mặc định: điện thoại 1 cột, tablet 2, máy tính 3). Đặt đúng để
   *  trình duyệt không tải / giải mã ảnh to gấp mấy lần khung — ảnh to dễ bị bỏ khỏi bộ nhớ giải mã rồi hiện lại chậm khi cuộn về. */
  sizes?: string;
}

/**
 * Thẻ danh sách gọn cho địa điểm / homestay: ảnh thực tế, tên, địa điểm, (tiện ích) và giá — không mô tả rườm rà.
 * Mọi thẻ trong một hàng cao bằng nhau (giá luôn nằm đáy thẻ).
 * Cả thẻ là một link sang trang chi tiết.
 */
export default function CompactPlaceCard({
  to,
  name,
  imageUrl,
  FallbackIcon = Mountain,
  location,
  description,
  price,
  priceUnit,
  badge,
  secondaryBadge,
  action,
  notice,
  amenities,
  ctaText,
  onIntent,
  compact = false,
  frame,
  sizes = '(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw',
}: CompactPlaceCardProps) {
  // Chỉ dùng ảnh thật của chính địa điểm; ảnh tạm (picsum...) coi như chưa có ảnh.
  const resolvedPhoto = resolvePlacePhoto(imageUrl);
  const src = mediaUrl(resolvedPhoto, 640);

  const card = (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-neutral-900 shadow-[0_2px_12px_rgba(0,0,0,0.08)] ring-1 ring-black/10 transition-[transform,box-shadow] duration-300 ease-out hover:shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
      onPointerEnter={onIntent}
      onTouchStart={onIntent}
      onFocus={onIntent}
    >
      <Link to={to} className="relative flex flex-1 flex-col aspect-[4/5]">
        <div className="absolute inset-0 overflow-hidden bg-neutral-900">
          {src ? (
            <img
              src={src}
              srcSet={mediaSrcSet(resolvedPhoto)}
              sizes={sizes}
              alt={name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
          ) : (
            <ImagePlaceholder Icon={FallbackIcon} label="Ảnh thực tế đang tải" />
          )}
        </div>
        {/* Lớp bóng đen mờ tự nhiên ở chân ảnh để chữ nổi bật, 60% phần trên giữ ảnh nguyên bản 100% không pha bất kỳ màu nào */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[36%] bg-gradient-to-t from-black/85 via-black/40 via-50% to-transparent" />
        
        {/* Hàng badge phía trên thẻ */}
        {(badge || secondaryBadge || action) && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 p-2.5 sm:p-3 pointer-events-none">
            <div className="min-w-0 max-w-[70%]">
              {badge}
            </div>
            <div className="shrink-0 flex items-center gap-1.5 pointer-events-auto">
              {secondaryBadge}
            </div>
          </div>
        )}

        {/* Nội dung đè trên ảnh */}
        <div className={`relative z-10 mt-auto flex flex-col gap-1.5 ${compact ? 'p-2.5 pt-8 sm:p-3 sm:pt-10' : 'p-3.5 pt-10 sm:p-4 sm:pt-12'}`}>
          {/* Tên ngắn: địa điểm nằm cạnh tên; tên dài: địa điểm xuống dòng dưới tên */}
          <div className={name.length <= 16 ? 'flex min-w-0 items-baseline gap-x-2' : 'flex min-w-0 flex-col gap-0.5'}>
            <h3
              className={`min-w-0 font-medium leading-snug text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.5)] ${
                compact ? 'line-clamp-1 text-xs sm:text-sm' : 'line-clamp-1 text-base sm:text-lg'
              } ${name.length <= 16 ? 'shrink-0' : ''}`}
            >
              {name}
            </h3>
            {location && (
              <p className="flex min-w-0 items-center gap-1 text-[11px] sm:text-xs font-normal text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
                <MapPin className="h-3 w-3 shrink-0 text-amber-300" />
                <span className="truncate">{location}</span>
              </p>
            )}
          </div>

          {description && (
            <p className="line-clamp-2 text-[11px] sm:text-xs text-white/80 leading-relaxed font-normal">
              {description}
            </p>
          )}

          {amenities && !description && (
            <div className="flex min-w-0 items-center gap-1 pt-0.5">
            <ul
              className="flex h-[19px] min-w-0 flex-1 flex-wrap gap-1 overflow-hidden"
              aria-label="Tiện ích"
            >
              {amenities.map((item) => (
                <li
                  key={item}
                  className="shrink-0 whitespace-nowrap rounded-md bg-white/15 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium leading-tight text-white border border-white/20"
                >
                  {item}
                </li>
              ))}
            </ul>
            {amenities.length > 0 && (
              <span
                title={amenities.join(' · ')}
                aria-label={`Tất cả tiện ích: ${amenities.join(', ')}`}
                className="shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white border border-white/20"
              >
                …
              </span>
            )}
            </div>
          )}

          {notice}

          {/* Hàng chân thẻ (Footer): Giá bên trái, CTA bên phải theo chuẩn hình 3 */}
          {ctaText ? (
            <div className="mt-1 pt-2 border-t border-white/15 flex items-center justify-between gap-2">
              <div>
                {price ? (
                  <p
                    className={`font-black leading-tight text-amber-300 ${
                      compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-[15px]'
                    }`}
                  >
                    {price}
                    {priceUnit && (
                      <span className="text-[10px] sm:text-[11px] font-normal text-white/70">
                        {' '}
                        /{priceUnit}
                      </span>
                    )}
                  </p>
                ) : (
                  <span className="text-[11px] font-semibold text-amber-200">Tham quan tự do</span>
                )}
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold text-white/95 group-hover:text-amber-300 transition-colors">
                <span>{ctaText}</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1 text-amber-300" />
              </span>
            </div>
          ) : (
            price && (
              <p
                className={`pt-0.5 font-black leading-tight text-amber-200 ${
                  compact ? 'text-xs sm:text-sm' : 'text-sm md:text-base'
                }`}
              >
                {price}
                {priceUnit && (
                  <span className="text-[10px] sm:text-[11px] font-normal text-white/70">
                    {' '}
                    /{priceUnit}
                  </span>
                )}
              </p>
            )
          )}
        </div>
      </Link>
      {action && <div className="absolute right-2.5 top-2.5 z-20">{action}</div>}
    </div>
  );

  return frame ? <CardFrame kind={frame}>{card}</CardFrame> : card;
}

/** Nhãn nhỏ trên ảnh thẻ gọn (mùa đẹp, Genius...). */
export function CompactCardBadge({ children, className = 'bg-[#052620]' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow-xs md:text-[11px] ${className}`}>
      {children}
    </span>
  );
}

/** Nhãn kính mờ phong cách hiện đại (thời tiết, đánh giá, loại hình...). */
export function GlassBadge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-semibold text-white/95 border border-white/20 shadow-xs md:text-[11px] ${className}`}>
      {children}
    </span>
  );
}
