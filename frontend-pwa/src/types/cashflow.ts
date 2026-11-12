/**
 * Dòng tiền theo NCC / Homestay từ lịch sử thanh toán và hoàn tiền toàn hệ thống.
 * Khớp com.dulichso.bookingapi.dto.admin.AdminCashflowDtos (backend-api).
 */
import type { PageResponse } from './admin';

export type CashflowLevel = 'PROVIDER' | 'PLACE';

/** CashflowRowDto. netAmount = paidAmount - refundedAmount; pendingRefundAmount là tiền hoàn đang chờ duyệt (chưa trừ vào net). */
export interface CashflowRow {
  id: number;
  name: string;
  providerId: number;
  providerName: string | null;
  paidBookings: number;
  paidAmount: number;
  netAmount: number;
}

/** CashflowTotalsDto */
export interface CashflowTotals {
  paidBookings: number;
  paidAmount: number;
  netAmount: number;
}

/** CashflowReportDto */
export interface CashflowReport {
  from: string;
  to: string;
  level: CashflowLevel;
  totals: CashflowTotals;
  rows: PageResponse<CashflowRow>;
}

export interface CashflowSearchParams {
  from?: string;
  to?: string;
  level?: CashflowLevel;
  providerId?: number;
  keyword?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}
