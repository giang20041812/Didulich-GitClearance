import axios from 'axios';
import type { BookingSearchParams, BookingStatusSummary, PageResponse } from '../types/admin';
import type { BookingAction, PartnerBookingDetailDto, PartnerBookingRowDto } from '../types/booking';

const API_BASE = '/api/v1/partner/bookings';

const authHeaders = () => {
  const token = localStorage.getItem('portal_token');
  return { headers: token ? { Authorization: `Bearer ${token}` } : {} };
};

const ACTION_PATH: Record<BookingAction, string> = { CONFIRM: 'confirm', REJECT: 'reject', PAY: 'pay', CANCEL: 'cancel', CHECK_IN: 'check-in' };

/** Đơn đặt phòng của chính nhà cung cấp đang đăng nhập (backend tự lọc theo tài khoản). */
export const partnerBookingService = {
  async getBookings(params?: Omit<BookingSearchParams, 'providerId'>): Promise<PageResponse<PartnerBookingRowDto>> {
    const res = await axios.get<PageResponse<PartnerBookingRowDto>>(API_BASE, { ...authHeaders(), params });
    return res.data;
  },

  async getSummary(priority: 'high' | 'low' = 'high'): Promise<BookingStatusSummary> {
    const res = await axios.get<BookingStatusSummary>(`${API_BASE}/summary`, { ...authHeaders(), apiPriority: priority });
    return res.data;
  },

  async getDetail(id: number): Promise<PartnerBookingDetailDto> {
    const res = await axios.get<PartnerBookingDetailDto>(`${API_BASE}/${id}`, authHeaders());
    return res.data;
  },

  /**
   * Xử lý đơn — cùng quy trình với Admin: CONFIRM / REJECT (chờ xác nhận), PAY / CANCEL (đã xác nhận).
   * note: lý do / ghi chú, không bắt buộc.
   */
  async act(id: number, action: BookingAction, note?: string): Promise<PartnerBookingDetailDto> {
    const res = await axios.post<PartnerBookingDetailDto>(`${API_BASE}/${id}/${ACTION_PATH[action]}`,
      { note: note?.trim() || undefined }, authHeaders());
    return res.data;
  },
};
