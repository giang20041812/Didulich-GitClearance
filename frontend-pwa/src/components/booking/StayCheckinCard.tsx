import { useState, type FormEvent } from 'react';
import { CheckCircle2, DoorOpen, KeyRound, Loader2, LogOut, ScanLine } from 'lucide-react';
import { checkInStay } from '@/services/stayService';
import { getApiErrorMessage } from '@/lib/apiError';
import { stayMoment } from '@/lib/bookingStatus';
import type { BookingResponseDto } from '@/types/booking';

interface StayCheckinCardProps {
  booking: BookingResponseDto;
  /** Giờ trả phòng của homestay ("HH:mm:ss"); null = mặc định 12:00. */
  checkOutUntil?: string | null;
  /** Vừa nhận phòng: trang tải lại đơn. */
  onCheckedIn: () => void;
}

/**
 * Nhận / trả phòng trên trang đơn của khách. Trong ngày ở mà chưa nhận phòng: mời quét mã QR dán tại homestay bằng
 * camera điện thoại, hoặc gõ mã 8 ký tự in dưới QR (iPhone mở ứng dụng đã cài không quét được mã từ trong ứng dụng).
 * Đã nhận: báo giờ tự trả phòng. Đã trả: một dòng nhỏ.
 */
export default function StayCheckinCard({ booking, checkOutUntil, onCheckedIn }: StayCheckinCardProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (booking.checkedOutAt) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600">
        <LogOut className="h-4 w-4 shrink-0" /> Đã trả phòng lúc {stayMoment(booking.checkedOutAt)}. Cảm ơn bạn đã ghé!
      </p>
    );
  }

  if (booking.checkedInAt) {
    const until = (checkOutUntil ?? '12:00').slice(0, 5);
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><CheckCircle2 className="h-5 w-5" /></span>
        <div className="min-w-0 text-sm">
          <p className="font-extrabold">Đã nhận phòng lúc {stayMoment(booking.checkedInAt)}</p>
          <p className="mt-0.5 text-xs text-emerald-800">Tự trả phòng lúc {until} ngày {booking.checkOut.slice(8, 10)}/{booking.checkOut.slice(5, 7)} — bạn không cần làm gì thêm.</p>
        </div>
      </div>
    );
  }

  if (!booking.canCheckIn) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/[\s-]/g, '');
    if (clean.length !== 8) {
      setError('Mã nhận phòng gồm 8 ký tự in dưới mã QR tại homestay.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await checkInStay(clean, booking.bookingCode);
      onCheckedIn();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa nhận phòng được. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="stay-checkin-title" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-2 ring-[#0a7d64]">
      <div className="flex items-center gap-3 bg-gradient-to-r from-[#0a7d64] to-[#12a383] px-4 py-3 text-white">
        <DoorOpen className="h-6 w-6 shrink-0" />
        <div className="min-w-0">
          <h2 id="stay-checkin-title" className="text-base font-extrabold leading-tight">Đã tới {booking.placeName}? Nhận phòng ngay</h2>
          <p className="text-xs text-white/85">Một chạm là xong — chủ nhà được báo ngay.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="flex items-start gap-2 text-sm text-slate-700">
          <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-[#0a7d64]" />
          <span><strong>Cách 1:</strong> mở camera điện thoại, quét mã QR dán ở quầy / cửa phòng rồi bấm “Nhận phòng”.</span>
        </p>
        <form onSubmit={(e) => { void submit(e); }} className="flex flex-col gap-2">
          <label htmlFor="stay-code" className="flex items-start gap-2 text-sm text-slate-700">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#0a7d64]" />
            <span><strong>Cách 2:</strong> nhập mã 8 ký tự in dưới mã QR.</span>
          </label>
          <div className="flex gap-2">
            <input
              id="stay-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 10))}
              placeholder="VD: K7M2-PX9Q"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-200 px-3 font-mono text-lg font-bold tracking-[0.12em] uppercase focus:border-[#0a7d64] focus:outline-none"
            />
            <button type="submit" disabled={busy} className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-[#0a7d64] px-4 text-sm font-extrabold text-white disabled:opacity-60 cursor-pointer">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />} Nhận phòng
            </button>
          </div>
          {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
        </form>
      </div>
    </section>
  );
}
