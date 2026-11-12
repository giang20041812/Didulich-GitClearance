import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCircle2, EyeOff, ImagePlus, Loader2, Pencil, PartyPopper, RotateCcw, Trash2, X } from 'lucide-react';
import CameraCapture from '@/components/journey/CameraCapture';
import { canStreamCamera, isTouchDevice } from '@/components/journey/journeyUi';
import type { CheckinView } from '@/types/journey';
import { compressImage, photoProblem } from '@/lib/imageCompress';
import { mediaUrl } from '@/lib/mediaUrl';
import { getApiErrorMessage } from '@/lib/apiError';
import { removeCheckin, saveCheckin } from '@/services/journeyService';

const MAX_NOTE = 1000;

interface CheckinFormProps {
  journeyId: number;
  placeId: number;
  placeName: string;
  checkin: CheckinView | null | undefined;
  onChange: (checkin: CheckinView | null) => void;
}

/** "08:12 · 08/10" — lúc check-in. */
const checkinMoment = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

/**
 * Check-in ĐỊA ĐIỂM: ảnh (nén ngay trên máy rồi tải qua máy chủ) + lưu bút, đều tùy chọn — không cần đứng tại địa điểm,
 * khách check-in lúc nào cũng được (tối về homestay rồi ghi lại cũng được). "Chụp ảnh": điện thoại mở ứng dụng camera
 * của máy (capture), máy tính có webcam mở camera ngay trong trang; "Chọn từ thư viện" mở ảnh có sẵn.
 */
export default function CheckinForm({ journeyId, placeId, placeName, checkin, onChange }: CheckinFormProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(!checkin);
  const [note, setNote] = useState(checkin?.note ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState<'compress' | 'save' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy('compress');
    const small = await compressImage(file);
    setBusy(null);
    const problem = photoProblem(small);
    if (problem) { setError(problem); return; }
    setPhoto(small);
    setPreview(URL.createObjectURL(small));
    setRemovePhoto(false);
  };

  /** Điện thoại / không mở được camera trong trang: dùng ứng dụng camera của máy. */
  const openCamera = () => {
    if (!isTouchDevice() && canStreamCamera()) setCameraOpen(true);
    else cameraInputRef.current?.click();
  };
  const openLibrary = () => libraryInputRef.current?.click();

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      const saved = await saveCheckin(journeyId, placeId, { photo, note: note.trim(), removePhoto });
      onChange(saved);
      setPhoto(null);
      setPreview(null);
      setRemovePhoto(false);
      setEditing(false);
      setJustSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa lưu được check-in. Vui lòng thử lại.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError('');
    try {
      await removeCheckin(journeyId, placeId);
      onChange(null);
      setNote('');
      setPhoto(null);
      setPreview(null);
      setConfirmRemove(false);
      setJustSaved(false);
      setEditing(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa bỏ được check-in. Vui lòng thử lại.'));
    } finally {
      setBusy(null);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setPhoto(null);
    setPreview(null);
    setRemovePhoto(false);
    setNote(checkin?.note ?? '');
    setError('');
  };

  const fileInputs = (
    <>
      {/* Ứng dụng camera của máy (điện thoại) — capture: mở thẳng camera sau */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="checkin-camera-input"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="checkin-library-input"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
      />
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => { void pick(file); }}
        onPickLibrary={openLibrary}
        placeName={placeName}
      />
    </>
  );

  // Đã check-in: ảnh như tấm bưu thiếp + lưu bút, sửa / bỏ check-in.
  if (checkin && !editing) {
    return (
      <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60">
        {justSaved && (
          <div className="rise-in flex items-center gap-2 bg-[#0a7d64] px-4 py-2.5 text-sm font-bold text-white" role="status">
            <PartyPopper className="h-4 w-4 shrink-0 text-amber-200" />
            <span className="min-w-0 flex-1">Tuyệt! Đã lưu kỷ niệm ở {placeName}.</span>
            <Link to="/journeys?tab=visited" className="shrink-0 text-xs font-bold text-white/90 underline underline-offset-2">Địa điểm đã đi</Link>
          </div>
        )}
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-emerald-900">Đã check-in</p>
              <p className="text-xs text-emerald-800/70">{checkinMoment(checkin.createdAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => { setNote(checkin.note ?? ''); setEditing(true); setJustSaved(false); }}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 hover:ring-emerald-400 cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" /> Sửa
            </button>
          </div>

          {checkin.hidden && (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
              <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Ảnh / lưu bút đã bị quản trị viên ẩn khỏi trang chia sẻ{checkin.hiddenReason ? `: ${checkin.hiddenReason}` : ''}.</span>
            </p>
          )}

          {checkin.photoUrl && (
            <div className="mt-3 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5">
              <img src={mediaUrl(checkin.photoUrl)} alt={`Ảnh check-in ${placeName}`} loading="lazy" className="max-h-80 w-full rounded-xl object-cover" />
            </div>
          )}
          {checkin.note ? (
            <p className="mt-3 whitespace-pre-line border-l-4 border-emerald-300 pl-3 text-sm italic leading-relaxed text-slate-700">{checkin.note}</p>
          ) : !checkin.photoUrl ? (
            <p className="mt-2 text-xs text-slate-500">Chưa có ảnh hay lưu bút — bấm Sửa để thêm.</p>
          ) : null}

          <div className="mt-3 border-t border-emerald-200/70 pt-2.5">
            {confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700">Bỏ check-in và xóa ảnh, lưu bút?</span>
                <button type="button" onClick={() => { void remove(); }} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 font-bold text-white disabled:opacity-50 cursor-pointer">
                  {busy === 'remove' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Bỏ check-in
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} className="rounded-full px-3 py-1.5 font-bold text-slate-500 hover:bg-white cursor-pointer">Giữ lại</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> Bỏ check-in
              </button>
            )}
          </div>
          {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
        </div>
        {fileInputs}
      </div>
    );
  }

  const shownPhoto = preview ?? (removePhoto ? null : checkin?.photoUrl ? mediaUrl(checkin.photoUrl) : null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      {shownPhoto ? (
        <div className="relative overflow-hidden rounded-2xl bg-slate-100">
          <img src={shownPhoto} alt="Ảnh check-in" className="aspect-[4/3] w-full object-cover" />
          <button
            type="button"
            onClick={() => { setPhoto(null); setPreview(null); if (checkin?.photoUrl) setRemovePhoto(true); }}
            aria-label="Bỏ ảnh"
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute inset-x-2 bottom-2 flex justify-end gap-2">
            <button type="button" onClick={openCamera} className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm backdrop-blur-sm hover:bg-white cursor-pointer">
              <RotateCcw className="h-3.5 w-3.5" /> Chụp lại
            </button>
            <button type="button" onClick={openLibrary} className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm backdrop-blur-sm hover:bg-white cursor-pointer">
              <ImagePlus className="h-3.5 w-3.5" /> Đổi ảnh
            </button>
          </div>
        </div>
      ) : busy === 'compress' ? (
        <div className="flex h-28 items-center justify-center gap-2 rounded-2xl bg-slate-50 text-sm font-semibold text-slate-500" role="status">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang xử lý ảnh…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={openCamera}
            className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-[#edfbf7] text-sm font-bold text-[#06604a] ring-2 ring-[#0a7d64] transition-colors hover:bg-[#dff5ee] active:scale-[0.98] cursor-pointer"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0a7d64] text-white shadow-sm">
              <Camera className="h-6 w-6" />
            </span>
            Chụp ảnh
          </button>
          <button
            type="button"
            onClick={openLibrary}
            className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-teal-200 bg-[#f4fbf8] text-sm font-bold text-[#06604a] transition-colors hover:border-[#0a7d64] active:scale-[0.98] cursor-pointer"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white ring-1 ring-teal-100">
              <ImagePlus className="h-6 w-6" />
            </span>
            Chọn từ thư viện
          </button>
        </div>
      )}

      <label className="mt-3 block">
        <span className="sr-only">Lưu bút</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
          rows={3}
          placeholder={`Vài dòng lưu bút về ${placeName}… (tùy chọn)`}
          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm leading-relaxed transition-colors focus:border-[#0a7d64] focus:bg-white focus:outline-none"
        />
        {note.length > 0 && <span className="block text-right text-[11px] text-slate-400">{note.length}/{MAX_NOTE}</span>}
      </label>

      {error && <p role="alert" className="mt-1 text-xs font-semibold text-rose-600">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        {checkin && (
          <button type="button" onClick={cancelEdit} className="h-12 rounded-xl px-4 text-sm font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">
            Hủy
          </button>
        )}
        <button
          type="button"
          onClick={() => { void save(); }}
          disabled={busy !== null}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0a7d64] px-4 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[#06604a] disabled:opacity-60 cursor-pointer"
        >
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {busy === 'save' ? 'Đang lưu…' : checkin ? 'Lưu thay đổi' : 'Check-in tại đây'}
        </button>
      </div>
      {fileInputs}
    </div>
  );
}
