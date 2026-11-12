import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { mediaUrl } from '@/lib/mediaUrl';

interface ImageLightboxProps {
  images: string[];
  /** Chú thích từng ảnh (cùng thứ tự với `images`); bỏ trống thì không hiện. */
  captions?: (string | null | undefined)[];
  index: number;
  alt: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Xem ảnh lớn toàn màn hình, chuyển qua lại bằng nút hoặc phím ←/→, đóng bằng Esc / nút X / bấm nền.
 * Render ra document.body để không bị khung cha (ngăn kéo, thẻ có transform) bó lại; phím Esc chỉ đóng lightbox,
 * không lan tới hộp thoại đang mở phía dưới.
 */
export default function ImageLightbox({ images, captions, index, alt, onIndexChange, onClose }: ImageLightboxProps) {
  const total = images.length;
  const canNavigate = total > 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
      }
      if (event.key === 'ArrowLeft' && canNavigate) onIndexChange((index - 1 + total) % total);
      if (event.key === 'ArrowRight' && canNavigate) onIndexChange((index + 1) % total);
    };
    // capture: chạy trước listener Esc của ngăn kéo / hộp thoại bên dưới.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [canNavigate, index, onClose, onIndexChange, total]);

  if (total === 0) return null;
  const previous = () => onIndexChange((index - 1 + total) % total);
  const next = () => onIndexChange((index + 1) % total);
  const caption = captions?.[index];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))]" role="dialog" aria-modal="true" aria-label={`Xem ảnh ${alt}`} onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Đóng xem ảnh" className="absolute right-4 top-[calc(1rem+var(--safe-top))] z-10 rounded-md bg-white/15 p-2 text-white hover:bg-white/25"><X className="h-6 w-6" /></button>
      <div className="relative flex h-full w-full max-w-6xl items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <img src={mediaUrl(images[index])} alt={`${alt} ${index + 1}`} className="max-h-[82vh] max-w-[calc(100%-5rem)] object-contain" />
        {canNavigate && <>
          <button type="button" onClick={previous} aria-label="Ảnh trước" className="absolute left-0 rounded-md bg-white/15 p-3 text-white hover:bg-white/25"><ChevronLeft className="h-7 w-7" /></button>
          <button type="button" onClick={next} aria-label="Ảnh tiếp theo" className="absolute right-0 rounded-md bg-white/15 p-3 text-white hover:bg-white/25"><ChevronRight className="h-7 w-7" /></button>
        </>}
        <span className="absolute bottom-2 left-1/2 flex max-w-[90%] -translate-x-1/2 flex-col items-center gap-0.5 rounded-sm bg-black/65 px-3 py-1 text-center text-sm font-semibold text-white">
          {index + 1}/{total}
          {caption && <span className="truncate text-xs font-normal text-white/80">{caption}</span>}
        </span>
      </div>
    </div>,
    document.body,
  );
}
