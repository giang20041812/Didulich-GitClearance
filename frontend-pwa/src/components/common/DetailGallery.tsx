import { useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Images, Mountain } from 'lucide-react';
import ImageCarousel from '@/components/common/ImageCarousel';
import ImageLightbox from '@/components/common/ImageLightbox';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { mediaUrl } from '@/lib/mediaUrl';

/** Vị trí ô ảnh trên lưới 4 cột × 2 hàng (theo số ảnh hiển thị). */
const TILES: Record<number, string[]> = {
  1: ['col-span-4 row-span-2'],
  2: ['col-span-2 row-span-2', 'col-span-2 row-span-2'],
  3: ['col-span-2 row-span-2', 'col-span-2', 'col-span-2'],
  4: ['col-span-2 row-span-2', 'col-span-2', '', ''],
  5: ['col-span-2 row-span-2', '', '', '', ''],
};

/**
 * Thư viện ảnh đầu trang chi tiết — cùng bố cục với trang homestay: lưới mosaic (ảnh chính parallax nhẹ) trên máy tính,
 * băng chuyền trượt trên điện thoại; bấm ảnh mở xem lớn toàn màn hình.
 */
export default function DetailGallery({
  images,
  name,
  emptyLabel = 'Ảnh đang được cập nhật',
}: {
  images: string[];
  name: string;
  emptyLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 450], [0, 24]);
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (images.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center overflow-hidden rounded-2xl bg-slate-100 md:h-[420px]">
        <ImagePlaceholder Icon={Mountain} variant="hero" label={emptyLabel} />
      </div>
    );
  }

  const shown = images.slice(0, 5);
  const tiles = TILES[shown.length] ?? TILES[5];

  return (
    <div className="relative">
      {/* Điện thoại: băng chuyền */}
      <div className="relative h-[260px] overflow-hidden rounded-2xl bg-slate-100 shadow-xs md:hidden">
        <ImageCarousel images={images} alt={name} className="h-full w-full" imageClassName="h-full w-full object-cover" />
        <span className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <Images className="h-3.5 w-3.5" />
          {images.length} ảnh
        </span>
      </div>

      {/* Máy tính: lưới mosaic */}
      <div
        className={`hidden h-[420px] gap-2 overflow-hidden rounded-2xl shadow-xs md:grid ${
          shown.length === 1 ? 'grid-cols-1' : 'grid-cols-4 grid-rows-2'
        }`}
      >
        {shown.map((img, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setLightbox(idx)}
            className={`group relative cursor-zoom-in overflow-hidden bg-slate-100 ${tiles?.[idx] ?? ''}`}
            aria-label={`Xem ảnh ${idx + 1} của ${images.length}`}
          >
            <motion.img
              src={mediaUrl(img) ?? img}
              alt={idx === 0 ? name : `${name} ${idx + 1}`}
              loading={idx === 0 ? 'eager' : 'lazy'}
              style={idx === 0 && !reduceMotion ? { y: heroY } : undefined}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            <span className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" aria-hidden />
          </button>
        ))}
      </div>

      <div className="hidden md:block">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={() => setLightbox(0)}
          className="absolute bottom-4 right-4 z-10 flex cursor-pointer items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-xs font-bold text-slate-800 shadow-md backdrop-blur-xs transition hover:bg-white active:scale-95"
        >
          <Images className="h-4 w-4 text-slate-600" />
          <span>Xem tất cả {images.length} ảnh</span>
        </motion.button>
      </div>

      {lightbox !== null && (
        <ImageLightbox
          images={images}
          index={lightbox}
          alt={name}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
