import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2, Star, Trash2, Upload, X } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import type { AdminMediaDto, AdminPlaceSummaryDto } from '@/types/admin';
import OverlayPortal from './OverlayPortal';

interface Props {
  place: AdminPlaceSummaryDto;
  onClose: () => void;
}

async function uploadToCloudinary(file: File): Promise<{ imageId: string; url: string }> {
  const cfg = await adminService.getMediaUploadConfig();

  if (cfg.provider === 'SUPABASE') {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(cfg.uploadUrl ?? '/api/v1/partner/media/upload-image', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') ?? ''}` },
      body: form,
    });
    if (!res.ok) throw new Error('Upload thất bại.');
    const data = (await res.json()) as { imageId: string; url: string };
    return data;
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', cfg.apiKey ?? '');
  form.append('timestamp', String(cfg.timestamp ?? ''));
  form.append('signature', cfg.signature ?? '');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? 'Upload thất bại.');
  }
  const data = (await res.json()) as { public_id: string; secure_url: string };
  return { imageId: data.public_id, url: data.secure_url };
}

export default function AdminPlaceMediaPanel({ place, onClose }: Props) {
  const [photos, setPhotos] = useState<AdminMediaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPhotos(await adminService.getPlaceMedia(place.id));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Không tải được danh sách ảnh.'));
    } finally {
      setLoading(false);
    }
  }, [place.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    let errMsg = '';
    for (const file of Array.from(files)) {
      try {
        const { imageId, url } = await uploadToCloudinary(file);
        const updated = await adminService.attachPlaceMedia(place.id, imageId, url);
        setPhotos(updated);
      } catch (err: unknown) {
        errMsg = getApiErrorMessage(err, `Lỗi khi tải "${file.name}".`);
      }
    }
    if (errMsg) setError(errMsg);
    setUploading(false);
  };

  const handleRemove = async (mediaId: number) => {
    setActionId(mediaId);
    setError('');
    try {
      setPhotos(await adminService.removePlaceMedia(place.id, mediaId));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Không xóa được ảnh.'));
    } finally {
      setActionId(null);
    }
  };

  const handleSetCover = async (mediaId: number) => {
    setActionId(mediaId);
    setError('');
    try {
      setPhotos(await adminService.setPlaceCover(place.id, mediaId));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Không đặt được ảnh bìa.'));
    } finally {
      setActionId(null);
    }
  };

  return (
    <OverlayPortal>
      <div
        className="admin-overlay-shell z-[9999] flex items-end justify-center bg-ink-deep/40 backdrop-blur-[2px] sm:items-center fade-in-overlay"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Quản lý ảnh — ${place.name}`}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-2xl flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl panel-slide-in max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-base font-bold text-ink-deep">Quản lý ảnh</h2>
              <p className="truncate text-xs text-muted">{place.name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            {error && (
              <p role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            {loading ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-canvas" />
                ))}
              </div>
            ) : photos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted">
                <ImageOff className="h-10 w-10 opacity-30" />
                <p className="text-sm">Chưa có ảnh nào</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {photos.map((photo) => (
                  <div key={photo.mediaId} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-canvas">
                    {photo.url && (
                      <img
                        src={photo.url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {photo.role === 'COVER' && (
                      <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-sun px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                        <Star className="h-2.5 w-2.5 fill-white" /> Bìa
                      </span>
                    )}
                    {/* Actions on hover */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-ink-deep/50 opacity-0 transition-opacity group-hover:opacity-100">
                      {photo.role !== 'COVER' && (
                        <button
                          type="button"
                          disabled={actionId === photo.mediaId}
                          onClick={() => void handleSetCover(photo.mediaId)}
                          className="flex h-7 items-center gap-1 rounded-md bg-sun px-2 text-[11px] font-semibold text-white shadow hover:bg-amber-500 disabled:opacity-60"
                        >
                          {actionId === photo.mediaId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                          Đặt bìa
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={actionId === photo.mediaId}
                        onClick={() => void handleRemove(photo.mediaId)}
                        className="flex h-7 items-center gap-1 rounded-md bg-danger px-2 text-[11px] font-semibold text-white shadow hover:bg-red-600 disabled:opacity-60"
                      >
                        {actionId === photo.mediaId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer — upload */}
          <div className="shrink-0 border-t border-border px-5 py-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary-50/50 py-3 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-50 disabled:opacity-60"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Đang tải lên...</>
              ) : (
                <><Upload className="h-4 w-4" /> Chọn ảnh để tải lên</>
              )}
            </button>
            <p className="mt-1.5 text-center text-[11px] text-muted">JPG, PNG, WebP · Tối đa 4MB mỗi ảnh</p>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
