import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Star, X } from 'lucide-react';
import { toLocalPhotos, type LocalPhoto } from '@/lib/localPhotos';

/**
 * Chọn ảnh và XEM TRƯỚC trên máy: chưa có gì được lưu cho tới khi chủ nhà bấm Lưu / Gửi duyệt. Ảnh đầu tiên là ảnh bìa;
 * bấm "Làm ảnh bìa" để đổi. Ô "Thêm ảnh" lớn, dễ bấm trên điện thoại (mở thư viện ảnh hoặc máy ảnh).
 */
export default function PhotoPicker({ photos, onChange, max = 30, disabled, title, hint, onError, coverLabel = 'Ảnh bìa', compact }: {
  photos: LocalPhoto[];
  onChange: (photos: LocalPhoto[]) => void;
  max?: number;
  disabled?: boolean;
  title?: string;
  hint?: string;
  onError: (message: string) => void;
  coverLabel?: string | null;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const room = Math.max(0, max - photos.length);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    if (input.current) input.current.value = '';
    if (files.length > room) onError(`Chỉ thêm được ${room} ảnh nữa (tối đa ${max} ảnh).`);
    setProcessing(true);
    try {
      const added = await toLocalPhotos(files.slice(0, room), onError);
      if (added.length) onChange([...photos, ...added]);
    } finally {
      setProcessing(false);
    }
  }

  function remove(key: string) {
    const target = photos.find((p) => p.key === key);
    if (target) URL.revokeObjectURL(target.preview);
    onChange(photos.filter((p) => p.key !== key));
  }

  function makeCover(key: string) {
    const target = photos.find((p) => p.key === key);
    if (target) onChange([target, ...photos.filter((p) => p.key !== key)]);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {(title || hint) && (
        <div>
          {title && <p className="text-sm font-semibold text-ink-deep">{title} <span className="font-normal text-muted">({photos.length}/{max})</span></p>}
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
        </div>
      )}
      <ul className={`grid gap-2.5 ${compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
        {photos.map((photo, i) => (
          <li key={photo.key} className="group relative overflow-hidden rounded-md border border-border bg-canvas">
            <img src={photo.preview} alt={`Ảnh ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
            {i === 0 && coverLabel && <span className="absolute left-1.5 top-1.5 rounded-sm bg-sun px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">{coverLabel}</span>}
            <button type="button" disabled={disabled} aria-label={`Bỏ ảnh ${i + 1}`} onClick={() => remove(photo.key)}
              className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md bg-white/95 text-danger shadow-sm transition-colors hover:bg-white disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
            {i > 0 && coverLabel && (
              <button type="button" disabled={disabled} onClick={() => makeCover(photo.key)}
                className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-sm bg-white/95 py-1 text-[11px] font-semibold text-ink-deep shadow-sm transition-colors hover:bg-white disabled:opacity-50">
                <Star className="h-3 w-3" /> Làm {coverLabel.toLowerCase()}
              </button>
            )}
          </li>
        ))}
        {room > 0 && (
          <li>
            <label className={`flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-primary/30 bg-primary-50/40 text-primary transition-colors hover:border-primary hover:bg-primary-50 ${disabled || processing ? 'pointer-events-none opacity-60' : ''}`}>
              {processing ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
              <span className="text-xs font-bold">{processing ? 'Đang xử lý ảnh...' : photos.length ? 'Thêm ảnh' : 'Chọn ảnh'}</span>
              <input ref={input} type="file" accept="image/*" multiple className="sr-only" disabled={disabled || processing}
                onChange={(e) => void add(e.target.files)} />
            </label>
          </li>
        )}
      </ul>
    </div>
  );
}
