import { partnerGet } from '@/lib/partnerGet';

export interface PartnerDashboardSummaryDto {
  monthlyRevenue: number;
  monthlyBookingsCount: number;
  averageRating: number;
  totalReviews: number;
  occupancyRate: number;
  
  /** Số đơn tạo trong tháng theo 4 trạng thái. */
  pendingBookings: number;
  confirmedBookings: number;
  paidBookings: number;
  cancelledBookings: number;
  statusTrend: DailyStatusPoint[];
  revenueTrend: MonthlyRevenuePoint[];
  recentBookings: RecentBookingDto[];
}

export interface MonthlyRevenuePoint {
  year: number;
  month: number;
  totalAmount: number;
  transactionCount: number;
}

export interface DailyStatusPoint {
  date: string;
  paid: number;
  pending: number;
  cancelled: number;
}

export interface RecentBookingDto {
  bookingCode: string;
  homestayName: string;
  guestName: string;
  checkInDate: string;
  totalAmount: number;
  status: string;
}

const API = '/api/v1/partner/dashboard';

const config = () => {
  const token = localStorage.getItem('portal_token');
  // ≥ 30s: request rơi vào container backend đang khởi động phải chờ ~15s.
  return { headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 30000 };
};

export const partnerDashboardService = {
  getSummary: async (year?: number, month?: number, homestayId?: number): Promise<PartnerDashboardSummaryDto> => {
    const params = new URLSearchParams();
    if (year) params.append('year', year.toString());
    if (month) params.append('month', month.toString());
    if (homestayId) params.append('homestayId', homestayId.toString());
    const query = params.toString();
    return partnerGet<PartnerDashboardSummaryDto>(`${API}/summary${query ? `?${query}` : ''}`, config());
  }
};
