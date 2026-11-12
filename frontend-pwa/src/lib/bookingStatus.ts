import type { BookingAction, BookingStatus, StayActor } from '@/types/booking';

/**
 * Nhãn, màu trạng thái và thao tác đơn — dùng chung cho cổng Admin, cổng NCC và trang của khách để ba bên gọi tên giống
 * nhau. Vòng đời: Chờ xác nhận → Đã xác nhận (chờ thanh toán) → Đã thanh toán; hoặc → Đã hủy.
 */
export const BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'PAID', 'CANCELLED'];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
};

/** Nhãn đầy đủ khi có chỗ (tab, tiêu đề chi tiết). */
export const BOOKING_STATUS_LONG_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận · chờ thanh toán',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
};

export const BOOKING_STATUS_TONE: Record<BookingStatus, string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  CONFIRMED: 'border-sky-200 bg-sky-50 text-sky-700',
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-700',
};

/** Nhãn nút cho từng thao tác (giống nhau ở Admin và NCC). */
export const BOOKING_ACTION_LABEL: Record<BookingAction, string> = {
  CONFIRM: 'Xác nhận',
  REJECT: 'Từ chối',
  PAY: 'Đã Thanh Toán ',
  CANCEL: 'Hủy đơn',
  CHECK_IN: 'Khách đã nhận phòng',
};

/** Hộp xác nhận trước khi thực hiện thao tác: tiêu đề, mô tả hệ quả, có ô lý do không bắt buộc hay không. */
export const BOOKING_ACTION_CONFIRM: Record<BookingAction, { title: string; body: string; askReason: boolean; danger: boolean }> = {
  CONFIRM: { title: 'Xác nhận đơn?', body: 'Đơn chuyển sang “Đã xác nhận”, chờ khách thanh toán. Khách được báo ngay.', askReason: false, danger: false },
  REJECT: { title: 'Từ chối đơn?', body: 'Đơn chuyển sang “Đã hủy”, phòng được trả lại lịch. Khách được báo ngay.', askReason: true, danger: true },
  PAY: { title: 'Ghi nhận đã thanh toán?', body: 'Đơn chuyển sang “Đã thanh toán” và kết thúc — không sửa / hủy được nữa.', askReason: false, danger: false },
  CANCEL: { title: 'Hủy đơn?', body: 'Đơn chuyển sang “Đã hủy”, phòng được trả lại lịch. Khách được báo ngay.', askReason: true, danger: true },
  CHECK_IN: { title: 'Khách đã nhận phòng?', body: 'Dùng khi khách không tự quét mã QR. Trạng thái đơn giữ nguyên; hết giờ trả phòng hệ thống tự trả phòng.', askReason: false, danger: false },
};

/** Lý do chọn nhanh khi từ chối / hủy (không bắt buộc). */
export const BOOKING_CANCEL_REASONS = ['Hết phòng trong thời gian yêu cầu', 'Homestay tạm ngừng đón khách', 'Khách không thanh toán'];

/** Dòng lịch sử: khách sửa đơn ghi Chờ xác nhận → Chờ xác nhận, hiển thị thành "Khách sửa đơn". */
export function historyTitle(from: BookingStatus | null, to: BookingStatus): string {
  if (!from) return to === 'PENDING' ? 'Khách đặt đơn' : BOOKING_STATUS_LABEL[to];
  if (from === to) return to === 'PENDING' ? 'Khách sửa đơn · chờ xác nhận lại' : BOOKING_STATUS_LABEL[to];
  return `${BOOKING_STATUS_LABEL[from]} → ${BOOKING_STATUS_LABEL[to]}`;
}

/** Trạng thái cũ (trước khi cắt về 4 trạng thái) có thể còn trong thông báo đã lưu — quy về nhãn mới. */
export function statusLabelOf(status: string | null | undefined): string {
  if (!status) return '';
  if (status in BOOKING_STATUS_LABEL) return BOOKING_STATUS_LABEL[status as BookingStatus];
  if (status === 'AWAITING_PAYMENT') return BOOKING_STATUS_LABEL.CONFIRMED;
  if (['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(status)) return BOOKING_STATUS_LABEL.PAID;
  if (['REJECTED', 'EXPIRED', 'NO_SHOW', 'REFUNDED'].includes(status)) return BOOKING_STATUS_LABEL.CANCELLED;
  return status;
}

/** Thông báo ngắn sau khi thao tác thành công. */
export function bookingActionDone(action: BookingAction, bookingCode: string): string {
  switch (action) {
    case 'CONFIRM': return `Đã xác nhận đơn ${bookingCode}. Khách đã được báo, chờ khách thanh toán.`;
    case 'REJECT': return `Đã từ chối đơn ${bookingCode}, phòng đã trả lại lịch.`;
    case 'PAY': return `Đã ghi nhận thanh toán đơn ${bookingCode}.`;
    case 'CANCEL': return `Đã hủy đơn ${bookingCode}, phòng đã trả lại lịch.`;
    case 'CHECK_IN': return `Đã ghi nhận khách nhận phòng đơn ${bookingCode}.`;
  }
}

/** "YYYY-MM-DD" hôm nay theo giờ Việt Nam. */
const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/**
 * Thao tác hợp lệ của một đơn — khớp BookingWorkflowService.allowedActions (máy chủ vẫn kiểm tra lại, kể cả giờ trả
 * phòng): theo trạng thái, thêm "Khách đã nhận phòng" khi đơn đã thanh toán, đang trong ngày ở, chưa nhận (đơn chưa
 * thanh toán không nhận phòng được).
 */
export function bookingActionsOf(b: { status: BookingStatus; checkIn?: string; checkOut?: string; checkedInAt?: string | null }): BookingAction[] {
  const actions: BookingAction[] = b.status === 'PENDING' ? ['CONFIRM', 'REJECT'] : b.status === 'CONFIRMED' ? ['PAY', 'CANCEL'] : [];
  const today = vnToday();
  if (b.status === 'PAID' && !b.checkedInAt && b.checkIn && b.checkOut
      && b.checkIn.slice(0, 10) <= today && today <= b.checkOut.slice(0, 10)) {
    actions.push('CHECK_IN');
  }
  return actions;
}

// ─── Nhận / trả phòng (mốc thời gian, không phải trạng thái đơn) ───

export type StayState = 'IN_HOUSE' | 'CHECKED_OUT';

/** Đang ở (đã nhận, chưa trả phòng) hoặc đã trả phòng; null khi chưa nhận phòng. */
export function stayStateOf(b: { checkedInAt?: string | null; checkedOutAt?: string | null }): StayState | null {
  if (b.checkedOutAt) return 'CHECKED_OUT';
  return b.checkedInAt ? 'IN_HOUSE' : null;
}

export const STAY_LABEL: Record<StayState, string> = { IN_HOUSE: 'Đã nhận phòng', CHECKED_OUT: 'Đã trả phòng' };

export const STAY_TONE: Record<StayState, string> = {
  IN_HOUSE: 'border-violet-200 bg-violet-50 text-violet-700',
  CHECKED_OUT: 'border-slate-200 bg-slate-100 text-slate-600',
};

export const STAY_ACTOR_LABEL: Record<StayActor, string> = {
  CUSTOMER: 'Khách quét mã QR',
  PROVIDER: 'Nhà cung cấp',
  ADMIN: 'Quản trị viên',
  SYSTEM: 'Tự động khi hết giờ',
};

/** "14:05 · 10/10" — mốc nhận / trả phòng. */
export function stayMoment(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}
