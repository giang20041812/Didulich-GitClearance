import { useCallback, useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { BOOKING_ACTION_LABEL, BOOKING_STATUSES, BOOKING_STATUS_LONG_LABEL, STAY_LABEL, bookingActionsOf, stayStateOf } from '@/lib/bookingStatus';
import type { AdminBookingDto, BookingAction, BookingStatus, PageResponse } from '@/types/admin';
import {
  CompactDateRange,
  FilterSearch,
  RefreshButton,
  SortSelect,
  TableFooter,
  type SortOption,
} from './AdminFilters';
import { StatusBadge } from './StatusBadge';
import StatusFilter, { type StatusFilterItem } from './StatusFilter';
import { STATUS_COLOR } from './statusColor';
import { useUrlStatus } from '@/hooks/useUrlStatus';
import { useStatusCounts } from '@/hooks/useStatusCounts';
import { actionButtonClass } from './statusStyles';
import BookingDetailDrawer from './BookingDetailDrawer';
import AdminBookingDecisionDialog, { type Decision } from './AdminBookingDecisionDialog';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import { STATUS_LABEL, STATUS_TONE, fmtDate, fmtDateTime, isPendingStatus, vnd } from './bookingMeta';

const PAGE_SIZE = 15;

const SORT_OPTIONS: SortOption[] = [
  { value: 'createdAt:desc', label: 'Đặt gần đây' },
  { value: 'createdAt:asc', label: 'Đặt lâu nhất' },
  { value: 'checkIn:asc', label: 'Nhận phòng sớm nhất' },
  { value: 'checkIn:desc', label: 'Nhận phòng muộn nhất' },
  { value: 'totalAmount:desc', label: 'Giá trị cao nhất' },
];

/** Tab = đúng 4 trạng thái của đơn: Chờ xác nhận · Đã xác nhận (chờ thanh toán) · Đã thanh toán · Đã hủy. */
const TAB_TONE: Record<BookingStatus, StatusFilterItem<BookingStatus>['tone']> = {
  PENDING: STATUS_COLOR.yellow,
  CONFIRMED: STATUS_COLOR.blue,
  PAID: STATUS_COLOR.green,
  CANCELLED: STATUS_COLOR.gray,
};
const TAB_ITEMS: StatusFilterItem<BookingStatus>[] = BOOKING_STATUSES.map((s) => ({
  value: s,
  label: BOOKING_STATUS_LONG_LABEL[s],
  tone: TAB_TONE[s],
}));
/** Nút lùi (từ chối / hủy) bên trái, nút tiến (xác nhận / đã thanh toán) bên phải. */
const NEGATIVE: BookingAction[] = ['REJECT', 'CANCEL'];

/** Bộ lọc khởi tạo khi mở từ nơi khác (vd: drill-down từ báo cáo, thông báo đơn mới). */
export interface BookingsPreset {
  providerId?: number;
  placeId?: number;
  status?: BookingStatus;
  createdFrom?: string;
  createdTo?: string;
  /** Mô tả ngắn hiển thị cho người dùng, vd: "NCC Hello Mù Cang Chải · T9/2026". */
  label?: string;
  /** Thời điểm chốt của báo cáo vừa drill-down (UC-AD-07): dữ liệu ở đây là hiện tại, có thể đã khác thời điểm đó. */
  generatedAt?: string;
  /** Mở ngay chi tiết đơn này (bấm thông báo đơn mới / khách sửa / hủy đơn). */
  openBookingId?: number;
}

interface BookingsPanelProps {
  preset?: BookingsPreset;
}

/**
 * Quản lý đơn đặt phòng toàn hệ thống cho Admin — cùng bộ thao tác với cổng NCC: chờ xác nhận → Xác nhận / Từ chối;
 * đã xác nhận → Đã thanh toán / Hủy đơn. Nút nhanh ngay trên dòng; bấm dòng để xem chi tiết, lịch sử, thanh toán và
 * ghi nhận giám sát.
 */
export default function BookingsPanel({ preset }: BookingsPanelProps) {
  const [keyword, setKeyword] = useState('');
  // Trạng thái lấy từ URL (?status=); mở từ drill-down báo cáo thì dùng trạng thái của báo cáo.
  const [urlStatus, setUrlStatus] = useUrlStatus<BookingStatus>(BOOKING_STATUSES, '');
  const [presetStatus, setPresetStatus] = useState<BookingStatus | ''>(preset?.status ?? '');
  const status = presetStatus || urlStatus;
  const [createdFrom, setCreatedFrom] = useState(preset?.createdFrom ?? '');
  const [createdTo, setCreatedTo] = useState(preset?.createdTo ?? '');
  const [checkInFrom, setCheckInFrom] = useState('');
  const [checkInTo, setCheckInTo] = useState('');
  const [providerId, setProviderId] = useState<number | undefined>(preset?.providerId);
  const [placeId, setPlaceId] = useState<number | undefined>(preset?.placeId);
  const [presetLabel, setPresetLabel] = useState(preset?.label ?? '');
  const [presetGeneratedAt, setPresetGeneratedAt] = useState(preset?.generatedAt ?? '');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(0);

  const [data, setData] = useState<PageResponse<AdminBookingDto> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<AdminBookingDto | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [notice, setNotice] = useState('');
  // Xử lý đơn từ cấp 2 (SecurityConfig: POST /admin/bookings/** cần ADMIN_L2); cấp 3 chỉ xem, không hiện nút.
  const canOperate = useAdminPermission().can('operate');

  const debouncedKeyword = useDebouncedValue(keyword);
  const activeCount = [debouncedKeyword, presetStatus, createdFrom || createdTo, checkInFrom || checkInTo, providerId, placeId].filter(Boolean).length;

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
  };

  const clearFilters = () => {
    setKeyword('');
    setPresetStatus('');
    setCreatedFrom('');
    setCreatedTo('');
    setCheckInFrom('');
    setCheckInTo('');
    setProviderId(undefined);
    setPlaceId(undefined);
    setPresetLabel('');
    setPage(0);
  };

  /** Nút tải lại: đưa màn hình về trạng thái ban đầu (bỏ mọi điều kiện lọc / sắp xếp, về tab mặc định, trang 1) rồi tải lại. */
  const reloadFromStart = () => {
    clearFilters();
    setUrlStatus('');
    setSort('createdAt:desc');
    setPresetGeneratedAt('');
    setNotice('');
    setReload((n) => n + 1);
  };

  const load = useCallback(async () => {
    const [sortBy, sortDir] = sort.split(':') as [string, 'asc' | 'desc'];
    setLoading(true);
    setLoadError('');
    try {
      setData(await adminService.getBookings({
        keyword: debouncedKeyword.trim() || undefined,
        status: status || undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        checkInFrom: checkInFrom || undefined,
        checkInTo: checkInTo || undefined,
        providerId,
        placeId,
        sortBy,
        sortDir,
        page,
        size: PAGE_SIZE,
      }));
    } catch (err: unknown) {
      setLoadError(getApiErrorMessage(err, 'Không tải được danh sách đặt phòng. Vui lòng kiểm tra kết nối máy chủ và thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [status, debouncedKeyword, createdFrom, createdTo, checkInFrom, checkInTo, providerId, placeId, sort, page]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  // Mở từ thông báo: tải đơn rồi mở ngăn chi tiết ngay.
  const openBookingId = preset?.openBookingId;
  useEffect(() => {
    if (!openBookingId) return;
    let active = true;
    adminService.getBookingDetail(openBookingId)
      .then((d) => { if (active) setSelected(d.booking); })
      .catch((err: unknown) => { if (active) setLoadError(getApiErrorMessage(err, 'Không mở được đơn từ thông báo.')); });
    return () => { active = false; };
  }, [openBookingId]);

  /** Số lượng trên từng tab: áp dụng cùng từ khóa / ngày / NCC / điểm đến, chỉ khác trạng thái. */
  const counts = useStatusCounts(
    BOOKING_STATUSES,
    async (s) => {
      const res = await adminService.getBookings({
        keyword: debouncedKeyword.trim() || undefined,
        status: s || undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        checkInFrom: checkInFrom || undefined,
        checkInTo: checkInTo || undefined,
        providerId,
        placeId,
        page: 0,
        size: 1,
      });
      return res.totalElements;
    },
    JSON.stringify([debouncedKeyword.trim(), createdFrom, createdTo, checkInFrom, checkInTo, providerId, placeId]),
    reload,
    // Không lọc gì: số đơn theo từng trạng thái lấy trong một lượt (bookings/summary) thay vì 5 lượt.
    () => !debouncedKeyword.trim() && !createdFrom && !createdTo && !checkInFrom && !checkInTo && providerId == null && placeId == null
      ? adminService.getBookingsSummary('low')
      : null,
  );

  const onTab = (v: BookingStatus | '') => {
    setPage(0);
    setPresetStatus('');
    setUrlStatus(v);
  };

  const runDecision = async (d: Decision, note?: string) => {
    try {
      await adminService.bookingAction(d.id, d.action, note);
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Không xử lý được đơn. Vui lòng tải lại và thử lại.'));
    }
  };
  const afterDecision = (message: string) => {
    setNotice(message);
    setReload((n) => n + 1);
  };

  const th = 'px-4 py-2.5';
  const td = 'px-4 py-2.5';
  const rows = data?.content ?? [];

  return (
    <section className="rounded-lg border border-border bg-white shadow-sm">
      <StatusFilter ariaLabel="Trạng thái đơn" items={TAB_ITEMS} value={status} counts={counts} onChange={onTab} />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FilterSearch value={keyword} onChange={resetPage(setKeyword)} placeholder="Tìm theo mã đặt VJ-..., tên khách, SĐT hoặc Homestay..." />
        <CompactDateRange
          label="Ngày đặt"
          from={createdFrom}
          to={createdTo}
          onChange={(f, t) => {
            setCreatedFrom(f);
            setCreatedTo(t);
            setPage(0);
          }}
        />
        <CompactDateRange
          label="Nhận phòng"
          from={checkInFrom}
          to={checkInTo}
          onChange={(f, t) => {
            setCheckInFrom(f);
            setCheckInTo(t);
            setPage(0);
          }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SortSelect value={sort} options={SORT_OPTIONS} onChange={resetPage(setSort)} />
          <RefreshButton loading={loading} onClick={reloadFromStart} />
        </div>
        {presetLabel && (
          <span className="rise-in flex w-full flex-wrap items-center gap-2 text-xs">
            <StatusBadge tone="brand">Đang lọc: {presetLabel}</StatusBadge>
            <button
              type="button"
              onClick={() => {
                setProviderId(undefined);
                setPlaceId(undefined);
                setPresetLabel('');
                setPresetGeneratedAt('');
                setPage(0);
              }}
              className="flex items-center gap-1 text-muted hover:text-danger"
            >
              <X className="h-3.5 w-3.5" /> Bỏ lọc này
            </button>
            {presetGeneratedAt && (
              <span className="text-muted">· Dữ liệu hiện tại có thể khác thời điểm chốt báo cáo (chốt lúc {fmtDateTime(presetGeneratedAt)})</span>
            )}
          </span>
        )}
      </div>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-2 border-b border-accent/30 bg-accent/10 px-4 py-2.5 text-xs font-semibold text-primary-700">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo" className="opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {loadError && (
        <div role="alert" className="border-b border-danger/20 bg-danger/5 px-4 py-2.5 text-xs text-danger">
          {loadError}
        </div>
      )}

      <div className={`overflow-x-auto transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
        <table className="admin-stack w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-canvas/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className={th}>Mã đặt</th>
              <th className={th}>Khách hàng</th>
              <th className={th}>Homestay / Phòng</th>
              <th className={th}>Lưu trú</th>
              <th className={`${th} text-right`}>Tổng tiền</th>
              <th className={th}>Trạng thái</th>
              <th className={th}>Ngày đặt</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((b) => {
              const actions = canOperate
                ? [...bookingActionsOf(b)].sort((x, y) => Number(!NEGATIVE.includes(x)) - Number(!NEGATIVE.includes(y)))
                : [];
              return (
                <tr key={b.id} onClick={() => setSelected(b)} className="cursor-pointer transition-colors duration-150 hover:bg-canvas">
                  <td className={`${td} whitespace-nowrap font-mono font-semibold text-primary`}>{b.bookingCode}</td>
                  <td className={td}>
                    <div className="max-w-[180px] truncate font-semibold text-ink-deep">{b.guestName}</div>
                    <div className="text-[11px] tabular-nums text-muted">{b.guestPhone}</div>
                  </td>
                  <td className={td}>
                    <div className="max-w-[220px] truncate font-medium text-ink">{b.placeName}</div>
                    <div className="max-w-[220px] truncate text-[11px] text-muted">
                      {b.roomTypeName} · {b.providerName}
                    </div>
                  </td>
                  <td className={`${td} whitespace-nowrap text-ink`}>
                    <div>
                      {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}
                    </div>
                    <div className="text-[11px] text-muted">
                      {b.nights} đêm · {b.roomCount} phòng · {b.guestCount} khách
                    </div>
                  </td>
                  <td className={`${td} whitespace-nowrap text-right font-semibold tabular-nums text-ink-deep`}>{vnd(b.totalAmount)}</td>
                  <td className={td}>
                    <StatusBadge tone={STATUS_TONE[b.status]} pulse={isPendingStatus(b.status)}>
                      {STATUS_LABEL[b.status]}
                    </StatusBadge>
                    {stayStateOf(b) && (
                      <div className="mt-1">
                        <StatusBadge tone={stayStateOf(b) === 'IN_HOUSE' ? 'brand' : 'neutral'}>{STAY_LABEL[stayStateOf(b)!]}</StatusBadge>
                      </div>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{fmtDateTime(b.createdAt)}</td>
                  <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {actions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => setDecision({ action, id: b.id, summary: { ...b, roomTypeName: b.roomTypeName ?? '' } })}
                          className={actionButtonClass(NEGATIVE.includes(action) ? 'danger' : action === 'PAY' ? 'success' : 'brand')}
                        >
                          {BOOKING_ACTION_LABEL[action]}
                        </button>
                      ))}
                      <button type="button" onClick={() => setSelected(b)} className={actionButtonClass('neutral')} aria-label={`Chi tiết đơn ${b.bookingCode}`}>
                        <Eye className="h-3 w-3" /> Chi tiết
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !loadError && rows.length === 0 && (
          <div className="py-12 text-center text-xs text-muted">Không có đơn đặt phòng nào khớp bộ lọc.</div>
        )}
      </div>

      <TableFooter
        total={data?.totalElements ?? 0}
        activeCount={activeCount}
        onClear={clearFilters}
        page={page}
        totalPages={data?.totalPages ?? 0}
        onPage={setPage}
      />

      {selected && (
        <BookingDetailDrawer
          key={selected.id}
          booking={selected}
          onClose={() => setSelected(null)}
          onChanged={() => setReload((n) => n + 1)}
        />
      )}
      <AdminBookingDecisionDialog decision={decision} onClose={() => setDecision(null)} run={runDecision} onDone={afterDecision} />
    </section>
  );
}
