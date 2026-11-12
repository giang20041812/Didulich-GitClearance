import { useState, useEffect } from 'react';
import { X, Siren, MapPin, Phone, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { submitPublicSos } from '@/services/sosService';
import type { SosRequestType } from '@/types/sos';

interface EmergencySosModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SOS_TYPES: { value: SosRequestType; label: string }[] = [
  { value: 'MEDICAL', label: 'Y tế / người bị thương' },
  { value: 'ACCIDENT', label: 'Tai nạn giao thông' },
  { value: 'LOST', label: 'Thất lạc / lạc đường' },
  { value: 'SECURITY', label: 'An ninh, mất an toàn' },
  { value: 'OTHER', label: 'Khác' },
];

const HOTLINES = [
  { label: 'Công an', phone: '113' },
  { label: 'Cứu hỏa, cứu nạn', phone: '114' },
  { label: 'Cấp cứu y tế', phone: '115' },
];

/**
 * Gửi yêu cầu hỗ trợ khẩn cấp (SOS) — không cần đăng nhập.
 * Gắn kèm tọa độ GPS nếu du khách cho phép; vận hành viên nhận và điều phối qua cổng Admin.
 * Với tình huống nguy hiểm tính mạng, LUÔN gọi 113/114/115 trước.
 */
export default function EmergencySosModal({ isOpen, onClose }: EmergencySosModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<SosRequestType>('MEDICAL');
  const [description, setDescription] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const locate = () => {
    if (!navigator.geolocation) { setLocError('Thiết bị không hỗ trợ định vị'); return; }
    setLocating(true); setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { setLocError('Không lấy được vị trí — bạn vẫn có thể gửi và mô tả vị trí bằng chữ'); setLocating(false); },
      { timeout: 8000 }
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !phone.trim()) { setError('Vui lòng nhập họ tên và số điện thoại để vận hành viên liên lạc.'); return; }
    setSubmitting(true);
    try {
      const res = await submitPublicSos({
        requesterName: name.trim(),
        requesterPhone: phone.trim(),
        latitude: coords?.lat,
        longitude: coords?.lng,
        type,
        description: description.trim() || undefined,
      });
      setDone(res.message || 'Yêu cầu hỗ trợ đã được ghi nhận. Vận hành viên sẽ liên hệ với bạn sớm nhất.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được yêu cầu. Vui lòng gọi trực tiếp 113/114/115.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Gửi yêu cầu hỗ trợ khẩn cấp">
      <div className="relative w-full max-w-md rounded-3xl border border-rose-200/80 bg-white shadow-2xl my-8 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-rose-100 bg-gradient-to-r from-rose-600 to-red-600 px-6 py-5">
          <div className="flex items-center gap-3 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs">
              <Siren className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Yêu cầu hỗ trợ khẩn cấp</h3>
              <p className="text-xs text-rose-100">Nguy hiểm tính mạng — hãy gọi 113 / 115 ngay</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hotline gọi ngay */}
        <div className="grid grid-cols-3 gap-2 border-b border-rose-100 bg-rose-50/50 p-4">
          {HOTLINES.map(h => (
            <a key={h.phone} href={`tel:${h.phone}`} className="flex flex-col items-center gap-1 rounded-2xl border border-rose-200 bg-white px-2 py-3 text-center shadow-2xs transition-all hover:border-rose-400 hover:bg-rose-50 active:scale-95">
              <Phone className="h-4 w-4 text-rose-600" />
              <span className="text-sm font-extrabold text-rose-700">{h.phone}</span>
              <span className="text-[10px] font-medium leading-tight text-slate-500">{h.label}</span>
            </a>
          ))}
        </div>

        {done ? (
          <div className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Đã gửi yêu cầu hỗ trợ</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{done}</p>
              <p className="mt-2 text-[11px] text-slate-400">Hãy giữ điện thoại mở và di chuyển tới vị trí an toàn khi chờ trợ giúp.</p>
            </div>
            <button type="button" onClick={onClose} className="w-full rounded-xl cta cta-primary py-2.5 text-xs font-bold text-white transition-colors cursor-pointer">
              Đóng
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3.5 p-6">
            <p className="rounded-2xl bg-amber-50/80 border border-amber-200/80 p-3 text-xs leading-relaxed text-amber-900">
              Gửi yêu cầu để <b>vận hành viên nền tảng</b> hỗ trợ (tư vấn, liên hệ homestay, điều phối).
              Với tai nạn, cháy, cấp cứu — <b>gọi 113/114/115 trước</b>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-800">Họ và tên (*)</span>
                <input required value={name} onChange={e => setName(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/15" placeholder="Nguyễn Văn A" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-800">Số điện thoại (*)</span>
                <input required inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/15" placeholder="09xx xxx xxx" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-800">Bạn cần hỗ trợ gì?</span>
              <select value={type} onChange={e => setType(e.target.value as SosRequestType)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium focus:border-[var(--color-primary)] focus:outline-none">
                {SOS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-800">Mô tả & vị trí bằng chữ</span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/15"
                placeholder="VD: Bị lệch hướng ở đèo Khau Phạ, gần km thứ 2 từ đỉnh đèo..." />
            </label>
            <button type="button" onClick={locate} disabled={locating}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-800 transition-colors hover:bg-sky-100 disabled:opacity-60 cursor-pointer">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {coords ? `Đã gắn vị trí (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : 'Gắn vị trí GPS của tôi'}
            </button>
            {locError && <p className="text-xs text-amber-700">{locError}</p>}
            {error && (
              <p className="flex items-start gap-1.5 rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
              </p>
            )}
            <button type="submit" disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white shadow-md shadow-rose-950/15 transition-all hover:bg-rose-700 disabled:opacity-60 cursor-pointer">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
              {submitting ? 'Đang gửi...' : 'Gửi yêu cầu hỗ trợ'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
