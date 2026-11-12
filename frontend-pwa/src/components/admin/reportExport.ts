import { buildXlsx, downloadBlob, type XlsxCell, type XlsxSheet } from '@/lib/xlsx';
import type { AdminDashboardSummaryDto, AdminOverviewReport, ReportGroup } from '@/types/admin';
import { STATUS_LABEL, fmtDate, fmtDateTime } from './bookingMeta';

const GROUP_LABEL: Record<ReportGroup, string> = {
  ALL: 'Tất cả đơn',
  CONFIRMED: 'Đã xác nhận / đã thanh toán',
  OPEN: 'Chờ xác nhận',
  LOST: 'Đã hủy',
};

/** Số liệu "không đủ dữ liệu" (null) ghi rõ thay vì 0 — cùng quy ước RPT-BR-02 với màn hình. */
const orNA = (v: number | null | undefined): XlsxCell => (v == null ? 'Không đủ dữ liệu' : v);

/**
 * Xuất báo cáo Tổng quan ra Excel (.xlsx): KPI kỳ báo cáo + số liệu hệ thống, diễn biến theo thời gian,
 * phân bổ trạng thái, top nhà cung cấp / điểm đến và doanh thu 6 tháng. Dữ liệu đúng như đang hiển thị theo bộ lọc.
 */
export function exportOverviewReport(
  report: AdminOverviewReport,
  options: { group: ReportGroup; providerName?: string; summary?: AdminDashboardSummaryDto | null },
) {
  const { kpi } = report;
  const { summary } = options;

  const overview: XlsxCell[][] = [
    ['BÁO CÁO TỔNG QUAN — VIETTREK', ''],
    ['Kỳ báo cáo', `${fmtDate(report.from)} → ${fmtDate(report.to)} (tính theo ngày đặt)`],
    ['Nhà cung cấp', options.providerName ?? 'Toàn hệ thống'],
    ['Trạng thái đơn', GROUP_LABEL[options.group]],
    ['Thời điểm chốt số liệu', fmtDateTime(report.generatedAt)],
    ['Thời điểm xuất file', new Date().toLocaleString('vi-VN')],
    [],
    ['Chỉ số kỳ báo cáo', 'Giá trị'],
    ['Tổng số đơn', kpi.totalBookings],
    ['Đơn đã xác nhận / đã thanh toán', kpi.confirmedBookings],
    ['Đơn chờ xác nhận', kpi.openBookings],
    ['Đơn đã hủy', kpi.lostBookings],
    ['Giá trị đặt phòng (đ)', kpi.bookingValue],
    ['Giá trị trung bình / đơn xác nhận (đ)', orNA(kpi.averageValue)],
    ['Doanh thu đã thanh toán (đ)', kpi.paidRevenue],
    ['Tỷ lệ xác nhận (%)', orNA(kpi.confirmationRate)],
    ['Nhà cung cấp mới', orNA(kpi.newProviders)],
    ['Điểm đến mới', orNA(kpi.newPlaces)],
  ];
  const headerRows = [0, 7];
  if (summary) {
    headerRows.push(overview.length + 1);
    overview.push(
      [],
      ['Số liệu hệ thống (hiện tại)', 'Giá trị'],
      ['Tổng điểm đến', summary.totalPlaces],
      ['Điểm đến chờ duyệt', summary.unverifiedPlaces],
      ['Điểm đến cần bổ sung', summary.needsUpdatePlaces],
      ['Tổng nhà cung cấp', summary.totalProviders],
      ['NCC đang hoạt động', summary.activeProviders],
      ['NCC bị đình chỉ', summary.suspendedProviders],
      ['NCC đã chấm dứt', summary.terminatedProviders],
      ['Tổng khách du lịch', summary.totalTravelers],
      ['Khách mới 7 ngày', summary.newTravelers7d],
      ['Khách mới 30 ngày', summary.newTravelers30d],
      ['Khách bị khóa', summary.lockedTravelers],
      ['Đơn trong tháng', summary.monthlyBookingsCount],
      ['Doanh thu tháng (đ)', summary.monthlyRevenue],
      ['Yêu cầu hoàn tiền chờ xử lý', summary.pendingRefundsCount],
      ['SOS chờ xử lý', summary.pendingSosCount],
    );
  }

  const sheets: XlsxSheet[] = [
    { name: 'Tổng quan', rows: overview, headerRows, widths: [40, 44] },
    {
      name: 'Theo thời gian',
      rows: [
        ['Kỳ', 'Từ ngày', 'Đến ngày', 'Số đơn', 'Giá trị (đ)'],
        ...report.series.map((s) => [s.label, fmtDate(s.from), fmtDate(s.to), s.bookings, s.value]),
      ],
      widths: [16, 14, 14, 10, 18],
    },
    {
      name: 'Theo trạng thái',
      rows: [['Trạng thái', 'Số đơn'], ...report.byStatus.map((s) => [STATUS_LABEL[s.status] ?? s.status, s.count])],
      widths: [28, 12],
    },
    {
      name: 'Top nhà cung cấp',
      rows: [['#', 'Nhà cung cấp', 'Số đơn', 'Giá trị (đ)'], ...report.topProviders.map((p, i) => [i + 1, p.name, p.bookings, p.value])],
      widths: [5, 40, 10, 18],
    },
    {
      name: 'Top điểm đến',
      rows: [
        ['#', 'Điểm đến', 'Nhà cung cấp', 'Số đơn', 'Giá trị (đ)'],
        ...report.topPlaces.map((p, i) => [i + 1, p.name, p.providerName, p.bookings, p.value]),
      ],
      widths: [5, 40, 32, 10, 18],
    },
  ];

  const trend = summary?.revenueTrend ?? [];
  if (trend.length > 0) {
    const gmv = new Map((summary?.gmvTrend ?? []).map((g) => [`${g.year}-${g.month}`, g.totalAmount]));
    sheets.push({
      name: 'Doanh thu 6 tháng',
      rows: [
        ['Tháng', 'Doanh thu đối soát (đ)', 'Số giao dịch', 'Giá trị đặt phòng GMV (đ)'],
        ...trend.map((t) => [`${String(t.month).padStart(2, '0')}/${t.year}`, t.totalAmount, t.transactionCount, gmv.get(`${t.year}-${t.month}`) ?? null]),
      ],
      widths: [12, 24, 14, 26],
    });
  }

  downloadBlob(buildXlsx(sheets), `bao-cao-tong-quan_${report.from}_${report.to}.xlsx`);
}
