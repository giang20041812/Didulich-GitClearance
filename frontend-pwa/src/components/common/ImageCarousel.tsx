import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import ImageLightbox from './ImageLightbox';
import { mediaUrl } from '@/lib/mediaUrl';

interface ImageCarouselProps {
  images: string[];
  alt: string;
  className?: string;
  imageClassName?: string;
  emptyContent?: ReactNode;
  initialIndex?: number;
}

export default function ImageCarousel({ images, alt, className = '', imageClassName = 'h-full w-full object-cover', emptyContent, initialIndex = 0 }: ImageCarouselProps) {
  const validImages = images.filter((image) => image.trim().length > 0);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, Math.min(initialIndex, Math.max(0, validImages.length - 1))));
  const [isOpen, setIsOpen] = useState(false);
  const [failed, setFailed] = useState<Record<string, true>>({});
  const touchStartX = useRef<number | null>(null);
  const canNavigate = validImages.length > 1;

  useEffect(() => {
    if (activeIndex >= validImages.length) setActiveIndex(0);
  }, [activeIndex, validImages.length]);

  if (validImages.length === 0) return <div className={className}>{emptyContent}</div>;
  const previous = () => setActiveIndex((index) => (index - 1 + validImages.length) % validImages.length);
  const next = () => setActiveIndex((index) => (index + 1) % validImages.length);
  // Ảnh media Supabase đi qua proxy /media/ cùng origin (cache immutable — xem lib/mediaUrl.ts).
  const activeSrc = mediaUrl(validImages[activeIndex]) ?? '';

  return (
    <>
      <div className={`relative overflow-hidden ${className}`}>
        {/* Ảnh ghim tuyệt đối vào khung: Safari iOS không tính được h-full của <img> nằm trong <button>,
            ảnh đầu bị co thành dải mỏng (TEST). Vuốt ngang để đổi ảnh trên điện thoại. */}
        <div
          className="relative h-full w-full"
          onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (!canNavigate || start == null || end == null || Math.abs(end - start) < 40) return;
            if (end < start) next(); else previous();
          }}
        >
          <button type="button" className="absolute inset-0 block cursor-zoom-in overflow-hidden" onClick={() => setIsOpen(true)} aria-label={`Mở ảnh ${activeIndex + 1} của ${validImages.length}`}>
            {failed[activeSrc] ? (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-slate-100 text-xs font-medium text-slate-500">
                <ImageOff className="h-6 w-6 text-slate-400" />
                Không tải được ảnh
              </span>
            ) : (
              <img
                key={activeSrc}
                src={activeSrc}
                alt={`${alt} ${activeIndex + 1}`}
                decoding="async"
                onError={() => setFailed((prev) => ({ ...prev, [activeSrc]: true }))}
                className={`absolute inset-0 ${imageClassName}`}
              />
            )}
          </button>
          {canNavigate && <>
            <button type="button" onClick={previous} aria-label="Ảnh trước" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md bg-black/55 p-2 text-white hover:bg-black/75"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={next} aria-label="Ảnh tiếp theo" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-black/55 p-2 text-white hover:bg-black/75"><ChevronRight className="h-5 w-5" /></button>
            <span className="pointer-events-none absolute bottom-2 right-2 rounded-sm bg-black/65 px-2 py-1 text-xs font-semibold text-white">{activeIndex + 1}/{validImages.length}</span>
          </>}
        </div>
      </div>
      {isOpen && <ImageLightbox images={validImages} index={activeIndex} alt={alt} onIndexChange={setActiveIndex} onClose={() => setIsOpen(false)} />}
    </>
  );
}
