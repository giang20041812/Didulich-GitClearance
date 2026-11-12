import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Calendar, Building } from 'lucide-react';
import type { BookingResponseDto } from '@/types/booking';
import { cancelBooking } from '@/services/bookingService';

interface BookingCancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: BookingResponseDto;
  onSuccess: (updatedBooking: BookingResponseDto) => void;
}

const CANCEL_REASONS = [
  'Thay đổi lịch trình',
  'Đã tìm được chỗ nghỉ khác',
  'Thời tiết / đường đi không thuận lợi',
  'Đặt nhầm ngày hoặc phòng',
  'Việc gia đình / sức khỏe',
];

const vnDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/**
 * Xác nhận hủy đơn: chỉ hỏi "Hủy đơn này?" — không còn bảng phân tích chính sách hủy / hoàn tiền và ô cam kết
 * (khách chưa trả tiền trong ứng dụng nên các con số hoàn tiền trước đây dễ gây hiểu nhầm). Lý do là tùy chọn.
 */
export default function BookingCancelModal({ isOpen, onClose, booking, onSuccess }: BookingCancelModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customNote, setCustomNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isSubmitting) onClose(); };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const reason = selectedReason ?? 'Khách yêu cầu hủy phòng';
      const note = customNote.trim() || undefined;
      const updated = await cancelBooking(booking.bookingCode, reason, note);
      onSuccess(updated);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không hủy được đơn. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/55 backdrop-blur-xs sm:items-center sm:p-4 fade-in-overlay"
      onClick={() => { if (!isSubmitting) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-booking-title"
        onClick={(e) => e.stopPropagation()}
        className="sheet-in flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="cancel-booking-title" className="text-lg font-bold text-slate-900">Hủy đơn này?</h3>
              <p className="font-mono text-xs text-slate-500">#{booking.bookingCode}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Building className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
              <span className="truncate">{booking.placeName}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{vnDate(booking.checkIn)} → {vnDate(booking.checkOut)} · {booking.roomCount} phòng · {Number(booking.totalAmount || 0).toLocaleString('vi-VN')}đ</span>
            </div>
          </div>
          <p className="text-slate-600">Phòng sẽ được trả lại cho chỗ nghỉ. Thao tác này không hoàn tác được.</p>

          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">Lý do (không bắt buộc)</p>
            <div className="flex flex-wrap gap-2">
              {CANCEL_REASONS.map((r) => {
                const active = selectedReason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedReason(active ? null : r)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      active ? 'border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary)]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <textarea
              rows={2}
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Ghi chú thêm cho chỗ nghỉ (nếu có)"
              aria-label="Ghi chú thêm"
              className="mt-2.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {errorMsg && (
            <div role="alert" className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-slate-100 px-5 py-4 pb-[max(var(--safe-bottom),1rem)]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-11 flex-1 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            Giữ lại đơn
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 text-sm font-bold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            {isSubmitting ? 'Đang hủy…' : 'Hủy đơn'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
