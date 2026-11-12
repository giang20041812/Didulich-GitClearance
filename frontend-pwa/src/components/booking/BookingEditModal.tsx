import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  AlertTriangle,
  Calendar,
  BedDouble,
  Users,
  User,
  Phone,
  Mail,
  FileText,
  Clock,
  Sparkles,
  CheckCircle2,
  XCircle,
  Search,
} from 'lucide-react';
import type { BookingResponseDto, UpdateBookingDetailsRequest, CheckAvailabilityResponse, BookedDateRangeDto } from '@/types/booking';
import type { RoomTypeDto } from '@/types/room';
import { updateBookingDetails, checkRoomAvailability, fetchBookedDatesByPlace } from '@/services/bookingService';
import { getHomestayById } from '@/services/homestayService';
import RoomAvailabilityCalendar, { type CalendarRoomLine } from '@/components/homestay/RoomAvailabilityCalendar';
import Stepper from '@/components/ui/Stepper';
import { MAX_ROOMS_PER_BOOKING, bookingRanges, bookingRooms, roomSummary } from '@/lib/roomSelection';

interface BookingEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: BookingResponseDto;
  onSuccess: (updatedBooking: BookingResponseDto) => void;
}

export default function BookingEditModal({
  isOpen,
  onClose,
  booking,
  onSuccess,
}: BookingEditModalProps) {
  // Khách chỉ sửa được khi đơn còn chờ xác nhận (máy chủ trả canEdit); sửa xong đơn chờ xác nhận lại.
  const isPending = booking.canEdit;

  const [guestName, setGuestName] = useState(booking.guestName || '');
  const [guestPhone, setGuestPhone] = useState(booking.guestPhone || '');
  const [guestEmail, setGuestEmail] = useState(booking.guestEmail || '');
  const [guestNote, setGuestNote] = useState(booking.guestNote || '');
  const [checkIn, setCheckIn] = useState(booking.checkIn || '');
  const [checkOut, setCheckOut] = useState(booking.checkOut || '');
  // Số phòng theo từng loại phòng của đơn (0 = bỏ loại đó; thêm được loại phòng khác của chỗ nghỉ).
  const ownRooms = useMemo(() => bookingRooms(booking), [booking]);
  const [roomCounts, setRoomCounts] = useState<Record<number, number>>(
    () => Object.fromEntries(ownRooms.map((room) => [room.roomTypeId, room.roomCount])),
  );
  const [guestCount, setGuestCount] = useState<number>(booking.guestCount || 1);

  // Kiểm tra lịch phòng trống
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<CheckAvailabilityResponse | null>(null);
  const [placeBookedDates, setPlaceBookedDates] = useState<BookedDateRangeDto[]>([]);
  /** Loại phòng của chỗ nghỉ (tổng số phòng từng loại); chưa tải được thì chỉ sửa được các loại phòng của đơn. */
  const [homestayRooms, setHomestayRooms] = useState<RoomTypeDto[] | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !booking.placeId) return;
    let isMounted = true;

    // Lịch đã đặt của cả chỗ nghỉ (theo từng loại phòng) và danh sách loại phòng.
    fetchBookedDatesByPlace(booking.placeId).then((data) => {
      if (isMounted) setPlaceBookedDates(data);
    }).catch(() => {});
    getHomestayById(String(booking.placeId)).then((detail) => {
      if (isMounted && detail?.rooms) setHomestayRooms(detail.rooms);
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isOpen, booking.placeId]);

  // Loại phòng sửa được: loại phòng của đơn + loại đang bán, có giá của chỗ nghỉ.
  const editableRooms = useMemo(() => {
    const list: { roomTypeId: number; name: string; totalRoomCount: number }[] = [];
    for (const room of homestayRooms ?? []) {
      const own = ownRooms.some((r) => r.roomTypeId === Number(room.id));
      if (!own && ((room.status ?? 'ACTIVE') !== 'ACTIVE' || room.basePrice == null)) continue;
      list.push({ roomTypeId: Number(room.id), name: room.name, totalRoomCount: Math.max(1, room.totalRoomCount || 1) });
    }
    for (const room of ownRooms) {
      if (!list.some((r) => r.roomTypeId === room.roomTypeId)) {
        list.push({ roomTypeId: room.roomTypeId, name: room.roomTypeName, totalRoomCount: Math.max(1, room.roomCount) });
      }
    }
    return list;
  }, [homestayRooms, ownRooms]);
  const selectedRooms = editableRooms
    .map((room) => ({ ...room, roomCount: roomCounts[room.roomTypeId] ?? 0 }))
    .filter((room) => room.roomCount > 0);
  const roomCount = selectedRooms.reduce((sum, room) => sum + room.roomCount, 0);

  // Lịch không tính phòng của CHÍNH đơn đang sửa (nếu không, ngày cũ của đơn hiện "Kín" và không chọn lại được).
  const calendarBookedDates = useMemo(() => {
    const remaining = [...placeBookedDates];
    for (const own of bookingRanges(booking)) {
      const index = remaining.findIndex((b) => b.checkIn === own.checkIn && b.checkOut === own.checkOut
        && Number(b.roomCount || 1) === Number(own.roomCount) && Number(b.roomTypeId) === Number(own.roomTypeId));
      if (index >= 0) remaining.splice(index, 1);
    }
    return remaining;
  }, [placeBookedDates, booking]);
  const calendarLines: CalendarRoomLine[] = selectedRooms.map((room) => ({
    name: room.name,
    roomTypeId: room.roomTypeId,
    bookedDates: calendarBookedDates,
    totalRoomCount: room.totalRoomCount,
    requestedRoomCount: room.roomCount,
  }));

  // Reset kết quả kiểm tra lịch nếu người dùng sửa ngày hoặc số phòng
  const handleDateChange = (newCheckIn: string, newCheckOut: string) => {
    setCheckIn(newCheckIn);
    setCheckOut(newCheckOut);
    setAvailabilityResult(null);
  };
  const handleRoomCountChange = (roomTypeId: number, count: number) => {
    setRoomCounts((current) => ({ ...current, [roomTypeId]: Math.max(0, count) }));
    setAvailabilityResult(null);
  };

  // Hàm kiểm tra lịch phòng: hỏi máy chủ cho từng loại phòng đã chọn (không tính phòng của chính đơn này).
  const handleCheckAvailability = async () => {
    if (!checkIn || !checkOut) {
      setErrorMsg('Vui lòng chọn ngày nhận phòng và ngày trả phòng trước khi kiểm tra.');
      return;
    }
    if (checkOut <= checkIn) {
      setErrorMsg('Ngày trả phòng phải sau ngày nhận phòng.');
      return;
    }
    if (roomCount < 1) {
      setErrorMsg('Vui lòng chọn ít nhất 1 phòng.');
      return;
    }
    setErrorMsg(null);
    setIsCheckingAvailability(true);

    try {
      const results = await Promise.all(selectedRooms.map(async (room) => ({
        room,
        result: await checkRoomAvailability(room.roomTypeId, checkIn, checkOut, room.roomCount, booking.bookingCode),
      })));
      const failed = results.filter(({ result }) => !result.available);
      setAvailabilityResult({
        available: failed.length === 0,
        requestedRooms: roomCount,
        minAvailableRooms: Math.min(...results.map(({ result }) => result.minAvailableRooms)),
        message: failed.length > 0
          ? failed.map(({ room, result }) => (results.length > 1 ? `${room.name}: ${result.message}` : result.message)).join(' ')
          : results.length > 1 ? 'Đủ phòng cho mọi loại phòng đã chọn.' : results[0]?.result.message ?? '',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể kiểm tra tình trạng phòng.';
      setErrorMsg(msg);
      setAvailabilityResult(null);
    } finally {
      setIsCheckingAvailability(false);
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!guestName.trim()) {
      setErrorMsg('Vui lòng nhập họ và tên khách lưu trú.');
      return;
    }
    if (!guestPhone.trim()) {
      setErrorMsg('Vui lòng nhập số điện thoại liên hệ.');
      return;
    }
    if (!checkIn || !checkOut) {
      setErrorMsg('Vui lòng chọn ngày nhận phòng và trả phòng.');
      return;
    }
    if (checkOut <= checkIn) {
      setErrorMsg('Ngày trả phòng phải sau ngày nhận phòng.');
      return;
    }
    if (roomCount < 1) {
      setErrorMsg('Vui lòng chọn ít nhất 1 phòng.');
      return;
    }
    if (roomCount > MAX_ROOMS_PER_BOOKING) {
      setErrorMsg(`Mỗi đơn đặt tối đa ${MAX_ROOMS_PER_BOOKING} phòng.`);
      return;
    }
    if (guestCount < 1) {
      setErrorMsg('Số lượng khách phải từ 1 trở lên.');
      return;
    }
    if (!isPending) {
      setErrorMsg('Đơn đã được xác nhận nên không thể thay đổi nữa. Bạn vẫn có thể hủy đơn và đặt lại.');
      return;
    }

    // Nếu đã kiểm tra lịch và thấy hết phòng, chặn submit
    if (availabilityResult && !availabilityResult.available) {
      setErrorMsg('Khoảng thời gian này đã hết phòng. Vui lòng kiểm tra và chọn ngày khác trước khi lưu.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: UpdateBookingDetailsRequest = {
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail.trim() || undefined,
        guestNote: guestNote.trim() || undefined,
        checkIn,
        checkOut,
        rooms: selectedRooms.map((room) => ({ roomTypeId: room.roomTypeId, roomCount: room.roomCount })),
        guestCount,
      };

      const updated = await updateBookingDetails(booking.bookingCode, payload);
      onSuccess(updated);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu thay đổi đặt phòng.';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal((
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-2 sm:p-4 pt-[12rem] pb-8 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[calc(100dvh-14rem)] flex flex-col shadow-2xl border border-gray-200 overflow-hidden my-0">
        {/* Header Modal */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-[var(--color-primary)]" />
              <span>Chỉnh sửa chi tiết đặt phòng</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Mã booking: <strong className="font-mono text-[var(--color-primary)]">#{booking.bookingCode}</strong> ({roomSummary(ownRooms)})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            title="Đóng modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông báo phân nhánh PENDING vs CONFIRMED */}
        <div className="px-5 pt-3 shrink-0">
          {isPending ? (
            <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-md text-teal-800 text-xs flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Đơn đang chờ xác nhận:</span>
                <p className="text-[11px] text-teal-700 mt-0.5">
                  Bạn có thể cập nhật thông tin liên hệ, thời gian, số phòng và số khách. Sau khi lưu, đơn sẽ được gửi lại để chỗ nghỉ
                  xác nhận lại; giá được tính lại theo bảng giá của các đêm mới.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Đơn đã được xác nhận:</span>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Đơn không thể thay đổi nữa. Nếu cần đổi lịch, bạn có thể hủy đơn (trước khi thanh toán) và đặt lại.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mx-5 mt-2.5 p-2.5 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-start gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Form Body cuộn mượt */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-2.5 space-y-2.5 text-xs sm:px-5">
          {/* Nhóm 1: Thông tin khách liên hệ */}
          <div className="space-y-2 p-2.5 bg-canvas rounded-md border border-gray-100">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              Thông tin người liên hệ
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-500 font-medium mb-1">
                  Họ và tên khách <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-slate-800 text-xs focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-500 font-medium mb-1">
                  Số điện thoại <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-slate-800 text-xs focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">Email nhận xác nhận</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-slate-800 text-xs focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Nhóm 2: Lịch trình & Số lượng phòng + NÚT CHECK LỊCH PHÒNG */}
          <div className="space-y-2 p-2.5 bg-canvas rounded-md border border-gray-100">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Thời gian &amp; Số lượng phòng
              </span>

              {/* Nút kiểm tra lịch phòng */}
              <button
                type="button"
                onClick={handleCheckAvailability}
                disabled={isCheckingAvailability || !checkIn || !checkOut}
                className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isCheckingAvailability ? (
                  <>
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Đang kiểm tra...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3 h-3" />
                    <span>Kiểm tra phòng trống</span>
                  </>
                )}
              </button>
            </div>

            {/* Thông báo kết quả kiểm tra lịch phòng */}
            {availabilityResult && (
              <div
                className={`p-2.5 rounded-md text-xs flex items-start gap-2 transition-all ${
                  availabilityResult.available
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {availabilityResult.available ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="font-bold block">
                    {availabilityResult.available ? 'Phòng khả dụng' : 'Không thể đặt'}
                  </span>
                  <p className="text-[11px] mt-0.5 leading-snug">
                    {availabilityResult.message}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-slate-50/70 p-1.5 rounded-md border border-slate-200 mt-2">
              <RoomAvailabilityCalendar
                lines={calendarLines}
                checkIn={checkIn || null}
                checkOut={checkOut || null}
                onChange={(inDate, outDate) => {
                  handleDateChange(inDate ?? '', outDate ?? '');
                }}
              />
            </div>

            {/* Số phòng từng loại — đơn gộp được nhiều loại phòng của chỗ nghỉ */}
            <div className="pt-1">
              <span className="block text-gray-500 font-medium mb-1 flex items-center gap-1.5">
                <BedDouble className="w-3.5 h-3.5 text-gray-400" />
                Số phòng theo loại <span className="text-rose-500">*</span>
                <span className="ml-auto font-semibold text-slate-700">{roomCount} phòng</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {editableRooms.map((room) => {
                  const count = roomCounts[room.roomTypeId] ?? 0;
                  const max = Math.max(count, Math.min(room.totalRoomCount, MAX_ROOMS_PER_BOOKING - (roomCount - count)));
                  return (
                    <Stepper
                      key={room.roomTypeId}
                      label={room.name}
                      value={count}
                      min={0}
                      max={max}
                      onChange={(v) => handleRoomCountChange(room.roomTypeId, Math.min(max, v))}
                      hint={`${room.totalRoomCount} phòng loại này`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-gray-500 font-medium mb-1">
                  Số lượng khách <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Users className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={guestCount}
                    onChange={(e) => setGuestCount(parseInt(e.target.value) || 1)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-slate-800 text-xs focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>



          {/* Ghi chú chung */}
          <div>
            <label className="block text-gray-500 font-medium mb-1 flex items-center gap-1">
              <FileText className="w-3 h-3 text-gray-400" />
              <span>Ghi chú thêm cho chủ homestay</span>
            </label>
            <textarea
              rows={2}
              value={guestNote}
              onChange={(e) => setGuestNote(e.target.value)}
              placeholder="VD: Đến muộn sau 18h, cần đệm phụ..."
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-slate-800 text-xs focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] outline-hidden resize-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-1.5 flex items-center justify-end gap-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isPending || (availabilityResult !== null && !availabilityResult.available)}
              className="px-5 py-2 text-xs font-bold text-white cta cta-primary rounded-md transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Lưu và gửi xác nhận lại</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  ), document.body);
}

