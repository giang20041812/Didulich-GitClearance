import { useEffect, useState } from 'react';
import { Check, Loader2, Star, Trash2 } from 'lucide-react';
import { partnerMediaService, type MediaTarget } from '@/services/partnerMediaService';
import { homestayError } from '@/services/partnerHomestayService';
import ConfirmDialog, { type ConfirmRequest } from '@/components/partner/ConfirmDialog';
import PhotoPicker from '@/components/partner/PhotoPicker';
import { releasePhotos, usePhotoCleanup, type LocalPhoto } from '@/lib/localPhotos';
import { ui } from '@/lib/partnerUi';
import type { MediaDto } from '@/types/partner';

const MAX_IMAGES = 30;

const message = (e: unknown) => (e instanceof Error && !('isAxiosError' in e) ? e.message : homestayError(e));

/**
 * FR-NCC-02 / FR-NCC-07: ảnh Homestay hoặc một loại phòng. Ảnh mới chọn chỉ được XEM TRƯỚC trên máy; bấm "Lưu ảnh"
 * mới tải lên và gắn vào Homestay (trước đây chọn ảnh là lưu luôn, không xem lại được). Ảnh đầu tiên tự thành ảnh
 * đại diện; xóa ảnh đại diện thì ảnh kế tiếp được chọn thay. Xóa ảnh đã lưu hỏi xác nhận bằng hộp thoại của hệ thống.
 */
export default function MediaManager({ target, title, onChange }: { target: MediaTarget; title: string; onChange?: (media: MediaDto[]) => void }) {
  const [media, setMedia] = useState<MediaDto[]>([]);
  const [pending, setPending] = useState<LocalPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<ConfirmRequest | null>(null);
  const { placeId, roomId } = target;
  usePhotoCleanup(pending);

  useEffect(() => {
    let active = true;
    partnerMediaService.list({ placeId, roomId })
      .then((data) => { if (active) setMedia(data); })
      .catch((e: unknown) => { if (active) setError(message(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [placeId, roomId]);

  async function run(label: string, action: () => Promise<MediaDto[]>) {
    setBusy(label); setError(''); setSaved('');
    try { const next = await action(); setMedia(next); onChange?.(next); }
    catch (e: unknown) { setError(message(e)); }
    finally { setBusy(''); }
  }

  /** Tải lần lượt các ảnh đang xem trước; ảnh lỗi ở lại hàng chờ để thử lại, ảnh xong thì rời hàng chờ. */
  async function savePending() {
    const queue = [...pending];
    const failed: LocalPhoto[] = [];
    let done = 0;
    setError(''); setSaved('');
    for (const [i, photo] of queue.entries()) {
      setBusy(`Đang lưu ảnh ${i + 1}/${queue.length}...`);
      try {
        const next = await partnerMediaService.upload({ placeId, roomId }, photo.file);
        setMedia(next); onChange?.(next);
        URL.revokeObjectURL(photo.preview);
        done += 1;
      } catch (e: unknown) {
        failed.push(photo);
        setError(`Chưa lưu được ${failed.length} ảnh: ${message(e)}`);
      }
    }
    setPending(failed);
    setBusy('');
    if (done) setSaved(`Đã lưu ${done} ảnh.`);
  }

  function discardPending() {
    releasePhotos(pending);
    setPending([]);
  }

  const room = Math.max(0, MAX_IMAGES - media.length);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">Thêm, đổi ảnh đại diện hoặc xóa ảnh được áp dụng ngay, không cần quản trị viên duyệt.</p>
      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-semibold text-ink-deep">{title} đã lưu <span className="font-normal text-muted">({media.length}/{MAX_IMAGES})</span></p>
        {loading ? <p role="status" className="text-sm text-muted">Đang tải ảnh...</p> : media.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-5 text-center text-sm text-muted">Chưa có ảnh nào được lưu.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {media.map((m) => (
              <li key={m.mediaId} className="relative overflow-hidden rounded-md border border-border">
                <img src={m.url} alt={m.caption ?? title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                {m.role === 'COVER' && <span className="absolute left-1.5 top-1.5 rounded-sm bg-sun px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">Ảnh đại diện</span>}
                <button type="button" disabled={!!busy} aria-label="Xóa ảnh"
                  onClick={() => setConfirmRemove({
                    title: 'Xóa ảnh này?',
                    body: <>Ảnh sẽ bị gỡ khỏi trang và không hiển thị với du khách nữa.</>,
                    confirmLabel: 'Xóa ảnh',
                    tone: 'danger',
                    onConfirm: () => void run('Đang xóa ảnh...', () => partnerMediaService.remove({ placeId, roomId }, m.mediaId)),
                  })}
                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md bg-white/95 text-danger shadow-sm hover:bg-white disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
                {m.role !== 'COVER' && (
                  <button type="button" disabled={!!busy} onClick={() => void run('Đang đặt ảnh đại diện...', () => partnerMediaService.setCover({ placeId, roomId }, m.mediaId))}
                    className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-sm bg-white/95 py-1 text-[11px] font-semibold text-ink-deep shadow-sm hover:bg-white disabled:opacity-50">
                    <Star className="h-3 w-3" /> Làm ảnh đại diện
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`flex flex-col gap-3 rounded-md border p-3 ${pending.length ? 'border-primary/30 bg-primary-50/40' : 'border-border'}`}>
        <PhotoPicker photos={pending} onChange={(next) => { setSaved(''); setPending(next); }} max={room} disabled={!!busy} onError={setError}
          coverLabel={null} title="Thêm ảnh mới" hint="Chọn ảnh để xem trước. Ảnh chỉ được lưu khi bạn bấm “Lưu ảnh”." />
        {pending.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ui.btnPrimary} disabled={!!busy} onClick={() => void savePending()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {busy || `Lưu ${pending.length} ảnh`}
            </button>
            <button type="button" className={ui.btnGhost} disabled={!!busy} onClick={discardPending}>Bỏ chọn</button>
          </div>
        )}
      </div>

      {busy && !pending.length && <p role="status" className="text-xs text-primary">{busy}</p>}
      {saved && <p role="status" className="text-sm font-semibold text-accent-700">{saved}</p>}
      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-2.5 text-sm text-danger">{error}</p>}
      <ConfirmDialog request={confirmRemove} onClose={() => setConfirmRemove(null)} />
    </div>
  );
}
