import { useCallback, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { BadgePercent, Building2, CalendarCheck, ChevronRight, FileSpreadsheet, Home, RefreshCw, Wallet } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { exportOverviewReport } from './reportExport';
import type {
  AdminDashboardSummaryDto,
  AdminOverviewReport,
  AdminProviderSummaryDto,
  BookingStatus,
  ReportGroup,
} from '@/types/admin';
import { ChipGroup, DateRangeFilter, type ChipOption } from './AdminFilters';
import type { BookingsPreset } from './BookingsPanel';
import { StatusBadge } from './StatusBadge';
import { STATUS_FILL, STATUS_LABEL, STATUS_TONE, fmtDate, fmtDateTime, vnd } from './bookingMeta';

const INVALID_FILTER_MESSAGE = 'Điều kiện báo cáo không hợp lệ';
const AGGREGATE_FAILED_MESSAGE = 'Không thể tổng hợp báo cáo. Vui lòng thử lại.';
const NO_DATA_MESSAGE = 'Không có dữ liệu';
const INSUFFICIENT_DATA_MESSAGE = 'Không đủ dữ liệu';

interface ReportsPanelProps {
  /** Mở danh sách Booking đã lọc sẵn theo mục Admin vừa chọn trong báo cáo. */
  onDrill: (preset: BookingsPreset) => void;
  notify: (type: 'success' | 'error', text: string) => void;
  /** Số liệu hệ thống của trang Tổng quan — đưa thêm vào file báo cáo khi xuất. */
  summary?: AdminDashboardSummaryDto | null;
}

const GROUP_OPTIONS: ChipOption<ReportGroup>[] = [
  { value: 'ALL', label: 'Tất cả đơn' },
  { value: 'CONFIRMED', label: 'Đã xác nhận / đã thanh toán', tone: 'success' },
  { value: 'OPEN', label: 'Chờ xác nhận', tone: 'warning' },
  { value: 'LOST', label: 'Đã hủy', tone: 'danger' },
];

const toIso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const QUICK_RANGES: { label: string; range: () => [string, string] }[] = [
  {
    label: '30 ngày',
    range: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - 29);
      return [toIso(from), toIso(to)];
    },
  },
  {
    label: '6 tháng',
    range: () => {
      const to = new Date();
      return [toIso(new Date(to.getFullYear(), to.getMonth() - 5, 1)), toIso(to)];
    },
  },
  {
    label: 'Năm nay',
    range: () => {
      const to = new Date();
      return [toIso(new Date(to.getFullYear(), 0, 1)), toIso(to)];
    },
  },
];

export default function ReportsPanel({ onDrill, notify, summary }: ReportsPanelProps) {

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [providerId, setProviderId] = useState<number | ''>('');
  const [group, setGroup] = useState<ReportGroup>('ALL');
  const [providers, setProviders] = useState<AdminProviderSummaryDto[]>([]);
  const [report, setReport] = useState<AdminOverviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    adminService.getProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(
        await adminService.getReportOverview({
          from: from || undefined,
          to: to || undefined,
          providerId: providerId === '' ? undefined : providerId,
          group,
        }),
      );
    } catch (err: unknown) {
      // 400 (điều kiện lọc không hợp lệ, vd: ngày bắt đầu sau ngày kết thúc) hiển thị tại khu vực bộ lọc;
      // các lỗi khác (mạng, máy chủ) là sự cố xử lý nên báo bằng toast.
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(INVALID_FILTER_MESSAGE);
      } else {
        setError(getApiErrorMessage(err, AGGREGATE_FAILED_MESSAGE));
        notify('error', AGGREGATE_FAILED_MESSAGE);
      }
    } finally {
      setLoading(false);
    }
  }, [from, to, providerId, group, notify]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  const drill = (extra: BookingsPreset) => {
    if (!report) return;
    onDrill({
      providerId: providerId === '' ? undefined : providerId,
      createdFrom: report.from,
      createdTo: report.to,
      generatedAt: report.generatedAt,
      ...extra,
    });
  };

  /** Xuất đúng số liệu đang hiển thị (theo kỳ, NCC, trạng thái đã chọn) ra file Excel. */
  const exportExcel = () => {
    if (!report) return;
    try {
      exportOverviewReport(report, {
        group,
        providerName: providerId === '' ? undefined : providers.find((p) => p.id === providerId)?.name,
        summary,
      });
      notify('success', 'Đã xuất báo cáo Excel — kiểm tra thư mục Tải xuống.');
    } catch {
      notify('error', 'Không xuất được file báo cáo. Vui lòng thử lại.');
    }
  };

  const activeFilters = [from || to, providerId, group !== 'ALL'].filter(Boolean).length;
  const clear = () => {
    setFrom('');
    setTo('');
    setProviderId('');
    setGroup('ALL');
  };
  const maxValue = Math.max(1, ...(report?.series.map((s) => s.value) ?? [0]));
  const maxBookings = Math.max(1, ...(report?.series.map((s) => s.bookings) ?? [0]));
  const maxStatusCount = Math.max(1, ...(report?.byStatus.map((s) => s.count) ?? [0]));
  const useValue = maxValue > 1;
  const kpi = report?.kpi;
  // RPT-BR-02: không có bản ghi nào theo kỳ/bộ lọc hiện tại -> hiển thị trạng thái "Không có dữ liệu" thay vì lưới KPI toàn số 0.
  const noData = !!report && report.byStatus.every((s) => s.count === 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <DateRangeFilter
            label="Thời gian"
            from={from || report?.from || ''}
            to={to || report?.to || ''}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_RANGES.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  const [f, t] = q.range();
                  setFrom(f);
                  setTo(t);
                }}
                className="h-7 rounded-md border border-border bg-white px-2.5 text-xs font-medium text-muted transition-all duration-200 hover:border-primary/50 hover:bg-primary-50 hover:text-primary active:scale-95"
              >
                {q.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wide">Nhà cung cấp</span>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value ? Number(e.target.value) : '')}
              className="h-7 max-w-[220px] rounded-md border border-border bg-white px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Toàn hệ thống</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!report || loading}
            title="Xuất báo cáo đang xem ra file Excel (.xlsx)"
            className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-white shadow-xs transition-all duration-150 hover:bg-accent-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Xuất Excel
          </button>
          <button
            type="button"
            onClick={() => {
              clear();
              setReload((n) => n + 1);
            }}
            aria-label="Tải lại báo cáo"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted hover:text-primary"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <ChipGroup label="Trạng thái đơn" options={GROUP_OPTIONS} value={group} onChange={(v) => setGroup(v || 'ALL')} />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            {report ? (
              <>
                Kỳ báo cáo: <strong className="text-ink">{fmtDate(report.from)} → {fmtDate(report.to)}</strong> · tính theo ngày đặt
                {' · '}Thời điểm chốt / cập nhật gần nhất: <strong className="text-ink">{fmtDateTime(report.generatedAt)}</strong>
              </>
            ) : (
              'Đang tải...'
            )}
          </span>
          {activeFilters > 0 && (
            <button type="button" onClick={clear} className="font-semibold text-primary hover:underline">
              Đặt lại bộ lọc
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Thử lại</button>
        </div>
      )}

      {kpi && report && noData && (
        <div className="rounded-lg border border-border bg-white p-10 text-center text-sm text-muted">{NO_DATA_MESSAGE}</div>
      )}

      {kpi && report && !noData && (
        <div className={`flex flex-col gap-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={<CalendarCheck className="h-5 w-5" />} tone="bg-primary-50 text-primary" label="Tổng số đơn" value={`${kpi.totalBookings}`} sub={`${kpi.openBookings} chờ xác nhận · ${kpi.lostBookings} đã hủy`} onClick={() => drill({ label: 'Toàn bộ kỳ báo cáo' })} />
            <Kpi
              icon={<BadgePercent className="h-5 w-5" />}
              tone="bg-accent/10 text-primary-700"
              label="Đã xác nhận / đã thanh toán"
              value={`${kpi.confirmedBookings}`}
              sub={kpi.confirmationRate == null ? INSUFFICIENT_DATA_MESSAGE : `Tỷ lệ ${kpi.confirmationRate}% trên tổng đơn`}
            />
            <Kpi
              icon={<Wallet className="h-5 w-5" />}
              tone="bg-sun/15 text-amber-700"
              label="Giá trị đặt phòng"
              value={vnd(kpi.bookingValue)}
              sub={kpi.averageValue == null ? `${INSUFFICIENT_DATA_MESSAGE} (TB/đơn) · đã thu ${vnd(kpi.paidRevenue)}` : `TB ${vnd(kpi.averageValue)} / đơn · đã thu ${vnd(kpi.paidRevenue)}`}
            />
            <Kpi
              icon={<Building2 className="h-5 w-5" />}
              tone="bg-secondary/10 text-secondary-700"
              label="Tăng trưởng trong kỳ"
              value={kpi.newProviders == null ? '—' : `${kpi.newProviders} NCC`}
              sub={kpi.newPlaces == null ? 'Không áp dụng khi lọc theo một NCC' : `${kpi.newPlaces} điểm đến mới`}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="rounded-lg border border-border bg-white p-4 shadow-[var(--shadow-card)] lg:col-span-2" aria-label="Biểu đồ theo thời gian">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-ink-deep">
                  {useValue ? 'Giá trị đặt phòng' : 'Số đơn'} theo {report.granularity === 'DAY' ? 'ngày' : 'tháng'}
                </h3>
                <span className="text-[11px] text-muted">Bấm vào cột để xem danh sách đơn</span>
              </div>
              {report.series.every((s) => s.bookings === 0) ? (
                <p className="py-12 text-center text-xs text-muted">Không có đơn nào trong kỳ báo cáo.</p>
              ) : (
                <div className="flex h-48 items-end gap-1.5 overflow-x-auto pb-1">
                  {report.series.map((s) => {
                    const ratio = useValue ? s.value / maxValue : s.bookings / maxBookings;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        disabled={s.bookings === 0}
                        onClick={() => drill({ createdFrom: s.from, createdTo: s.to, label: s.label })}
                        title={`${s.label}: ${s.bookings} đơn · ${vnd(s.value)}`}
                        className="group flex h-full min-w-[22px] flex-1 flex-col items-center justify-end gap-1.5 disabled:cursor-default"
                      >
                        <span className="text-[10px] font-semibold text-muted">{s.bookings > 0 ? s.bookings : ''}</span>
                        {s.bookings > 0 ? (
                          <span
                            className="w-full rounded-t-sm bg-gradient-to-t from-primary to-primary-400 transition-all duration-300 group-hover:from-coral group-hover:to-sun"
                            style={{ height: `${Math.max(4, ratio * 100)}%` }}
                          />
                        ) : (
                          <span className="h-px w-full bg-border" />
                        )}
                        <span className="text-[10px] text-muted">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-white p-4 shadow-[var(--shadow-card)]" aria-label="Phân bố trạng thái">
              <h3 className="mb-3 font-display text-sm font-bold text-ink-deep">Theo trạng thái</h3>
              <ul className="flex flex-col gap-1.5">
                {report.byStatus.map((s) => (
                  <li key={s.status}>
                    <button
                      type="button"
                      disabled={s.count === 0}
                      onClick={() => drill({ status: s.status as BookingStatus, label: STATUS_LABEL[s.status] })}
                      className="relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover disabled:cursor-default disabled:opacity-50"
                    >
                      <span
                        aria-hidden
                        className={`absolute inset-y-0 left-0 rounded-md transition-all duration-300 ${STATUS_FILL[s.status]}`}
                        style={{ width: `${maxStatusCount ? (s.count / maxStatusCount) * 100 : 0}%` }}
                      />
                      <span className="relative">
                        <StatusBadge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</StatusBadge>
                      </span>
                      <strong className="relative text-sm text-ink-deep">{s.count}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <TopList
              icon={<Building2 className="h-4 w-4 text-primary" />}
              title="Top nhà cung cấp"
              empty={report.topProviders.length === 0}
            >
              {report.topProviders.map((p, i) => (
                <TopRow
                  key={p.id}
                  rank={i + 1}
                  name={p.name}
                  meta={`${p.bookings} đơn`}
                  value={vnd(p.value)}
                  onClick={() => drill({ providerId: p.id, label: `NCC ${p.name}` })}
                />
              ))}
            </TopList>
            <TopList
              icon={<Home className="h-4 w-4 text-primary" />}
              title="Top homestay / điểm đến"
              empty={report.topPlaces.length === 0}
            >
              {report.topPlaces.map((p, i) => (
                <TopRow
                  key={p.id}
                  rank={i + 1}
                  name={p.name}
                  meta={`${p.providerName} · ${p.bookings} đơn`}
                  value={vnd(p.value)}
                  onClick={() => drill({ placeId: p.id, label: `Homestay ${p.name}` })}
                />
              ))}
            </TopList>
          </div>
        </div>
      )}

      {!kpi && !error && <div className="rounded-lg border border-border bg-white p-10 text-center text-sm text-muted">Đang tải báo cáo...</div>}
    </div>
  );
}

function Kpi({
  icon,
  tone,
  label,
  value,
  sub,
  onClick,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className="block truncate font-display text-xl font-extrabold text-ink-deep">{value}</span>
        <span className="block text-[11px] leading-snug text-muted">{sub}</span>
      </span>
    </>
  );
  const cls = 'flex items-start gap-3.5 rounded-lg border border-border bg-white p-4 text-left shadow-[var(--shadow-card)] transition-all duration-300';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function TopList({ icon, title, empty, children }: { icon: ReactNode; title: string; empty: boolean; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-ink-deep">
        {icon} {title}
      </h3>
      {empty ? <p className="py-6 text-center text-xs text-muted">Chưa có dữ liệu trong kỳ báo cáo.</p> : <ul className="flex flex-col gap-1.5">{children}</ul>}
    </section>
  );
}

function TopRow({ rank, name, meta, value, onClick }: { rank: number; name: string; meta: string; value: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-md border border-border p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-hover"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-50 text-[11px] font-bold text-primary">{rank}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-ink-deep">{name}</span>
          <span className="block truncate text-[11px] text-muted">{meta}</span>
        </span>
        <strong className="shrink-0 text-xs text-ink-deep">{value}</strong>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
      </button>
    </li>
  );
}
