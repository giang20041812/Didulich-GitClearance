import { Mountain } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { mediaUrl } from '@/lib/mediaUrl';

/** Ảnh bìa điểm tham quan; chưa có ảnh thì vẽ phong cảnh thay thế. */
export default function PlaceThumb({ dest, className }: { dest: { name: string; coverImageUrl?: string | null }; className: string }) {
  return (
    <span className={`block shrink-0 overflow-hidden bg-slate-100 ${className}`}>
      {dest.coverImageUrl ? (
        <img src={mediaUrl(dest.coverImageUrl, 330)} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <ImagePlaceholder Icon={Mountain} />
      )}
    </span>
  );
}
