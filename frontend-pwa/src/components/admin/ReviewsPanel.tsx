import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, EyeOff, RotateCcw, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import type { PageResponse } from '@/types/admin';
import type { AdminReview, AdminReviewStatus, ReviewModerationAction } from '@/types/adminReview';
import {
  CompactDateRange,
  CompactSelect,
  FilterSearch,
  ReasonDialog,
  RefreshButton,
  TableFooter,
  type SelectOption,
} from './AdminFilters';
import { StatusBadge, type StatusTone } from './StatusBadge';
import StatusFilter, { type StatusFilterItem } from './StatusFilter';
import { STATUS_COLOR } from './statusColor';
import { useUrlStatus } from '@/hooks/useUrlStatus';
import { useStatusCounts } from '@/hooks/useStatusCounts';
import { actionButtonClass } from './statusStyles';
import OverlayPortal from './OverlayPortal';

interface ReviewsPanelProps {
  notify: (type: 'success' | 'error', text: string) => void;
}

const PAGE_SIZE = 15;
const STATUS_LABEL: Record<AdminReviewStatus, string> = { VISIBLE: 'Đang hiển thị', HIDDEN: 'Đã ẩn', REMOVED: 'Đã gỡ' };
const STATUS_TONE: Record<AdminReviewStatus, StatusTone> = { VISIBLE: 'success', HIDDEN: 'warning', REMOVED: 'danger' };
/**
 * Tab xử lý đánh giá. Backend chưa có cơ chế "báo cáo vi phạm" nên "Chờ xử lý" / "Đã xử lý" được suy ra từ
 * review.moderated_at: chưa có quyết định của Admin = Chờ xử lý, đã có = Đã xử lý (mặc định "Chờ xử lý").
 */
type ReviewFilter = 'PENDING' | 'PROCESSED';
const STATUS_ITEMS: StatusFilterItem<ReviewFilter>[] = [
  { value: 'PENDING', label: 'Chờ xử lý', tone: STATUS_COLOR.yellow },
  { value: 'PROCESSED', label: 'Đã xử lý', tone: STATUS_COLOR.gray },
];
const STATUS_VALUES = STATUS_ITEMS.map((i) => i.value);
const RATING_OPTIONS: SelectOption<'1' | '2' | '3' | '4' | '5'>[] = (['1', '2', '3', '4', '5'] as const).map((n) => ({ value: n, label: `${n} sao` }));

const ACTION_META: Record<ReviewModerationAction, { title: string; confirm: string; description: string; reasonRequired: boolean; danger: boolean }> = {
  KEEP: { title: 'Giữ nguyên đánh giá', confirm: 'Xác nhận giữ nguyên', description: 'Đánh giá được xem xét và không vi phạm; chỉ ghi nhận quyết định.', reasonRequired: false, danger: false },
  HIDE: { title: 'Ẩn đánh giá', confirm: 'Ẩn đánh giá', description: 'Đánh giá không còn hiển thị công khai và không tính vào điểm của Homestay. Có thể khôi phục sau.', reasonRequired: true, danger: true },
  REMOVE: { title: 'Gỡ đánh giá vi phạm', confirm: 'Gỡ đánh giá', description: 'Đánh giá bị gỡ khỏi hệ thống công khai và không thể khôi phục. Lý do được lưu lại.', reasonRequired: true, danger: true },
  RESTORE: { title: 'Khôi phục đánh giá', confirm: 'Khôi phục', description: 'Đánh giá được hiển thị công khai trở lại và tính lại vào điểm của Homestay.', reasonRequired: false, danger: false },
};

const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN') : '—');

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} sao`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3 w-3 ${n <= value ? 'fill-sun text-sun' : 'text-border'}`} />
      ))}
    </span>
  );
}

type Decision = { action: ReviewModerationAction; review: AdminReview };

/** Kiểm duyệt đánh giá: xem nội dung kèm ngữ cảnh (Homestay, NCC, booking) rồi giữ nguyên, ẩn, gỡ hoặc khôi phục kèm lý do. */
export default function ReviewsPanel({ notify }: ReviewsPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useUrlStatus<ReviewFilter>(STATUS_VALUES, 'PENDING');
  const [rating, setRating] = useState<'1' | '2' | '3' | '4' | '5' | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const [data, setData] = useState<PageResponse<AdminReview> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [openReview, setOpenReview] = useState<AdminReview | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [dialogError, setDialogError] = useState('');

  const debouncedKeyword = useDebouncedValue(keyword);
  const activeCount = [debouncedKeyword, rating, from || to].filter(Boolean).length;

  /** Nút tải lại: đưa màn hình về trạng thái ban đầu (bỏ mọi điều kiện tìm kiếm / lọc / sắp xếp, về tab mặc định, trang 1) rồi tải lại dữ liệu mới nhất. */
  const reloadFromStart = () => {
    setKeyword('');
    setStatus('PENDING');
    setRating('');
    setFrom('');
    setTo('');
    setPage(0);
    setReload((n) => n + 1);
  };

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setData(
        await adminService.getReviews({
          processed: status ? status === 'PROCESSED' : undefined,
          rating: rating ? Number(rating) : undefined,
          keyword: debouncedKeyword.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          size: PAGE_SIZE,
        }),
      );
    } catch (err: unknown) {
      setLoadError(getApiErrorMessage(err, 'Không tải được danh sách đánh giá. Vui lòng kiểm tra kết nối máy chủ và thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [status, rating, debouncedKeyword, from, to, page]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  /** Số lượng trên từng tab: áp dụng cùng từ khóa / số sao / ngày, chỉ khác trạng thái xử lý. */
  const counts = useStatusCounts(
    STATUS_VALUES,
    async (s) =>
      (
        await adminService.getReviews({
          processed: s ? s === 'PROCESSED' : undefined,
          rating: rating ? Number(rating) : undefined,
          keyword: debouncedKeyword.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
          page: 0,
          size: 1,
        })
      ).totalElements,
    JSON.stringify([debouncedKeyword.trim(), rating, from, to]),
    reload,
  );

  const confirm = async (reason: string) => {
    if (!decision) return;
    const meta = ACTION_META[decision.action];
    if (meta.reasonRequired && !reason) {
      setDialogError('Vui lòng nhập lý do.');
      return;
    }
    try {
      await adminService.moderateReview(decision.review.id, decision.action, reason || undefined);
      notify('success', 'Đã ghi nhận kết quả kiểm duyệt đánh giá.');
      setDecision(null);
      setDialogError('');
      setOpenReview(null);
      setReload((n) => n + 1);
    } catch (err: unknown) {
      setDialogError(getApiErrorMessage(err, 'Không thể xử lý đánh giá.'));
    }
  };

  const ask = (action: ReviewModerationAction, review: AdminReview) => {
    setDialogError('');
    setDecision({ action, review });
  };

  const rows = data?.content ?? [];
  const th = 'px-4 py-2.5';
  const td = 'px-4 py-2.5';

  return (
    <>
      <StatusFilter ariaLabel="Trạng thái đánh giá" items={STATUS_ITEMS} value={status} counts={counts} onChange={resetPage(setStatus)} />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FilterSearch value={keyword} onChange={resetPage(setKeyword)} placeholder="Tìm theo nội dung, Homestay, tên khách hoặc mã đặt phòng..." />
        <CompactSelect label="Số sao" value={rating} options={[{ value: '', label: 'Tất cả' }, ...RATING_OPTIONS]} onChange={resetPage(setRating)} />
        <CompactDateRange
          label="Ngày đánh giá"
          from={from}
          to={to}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
            setPage(0);
          }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <RefreshButton loading={loading} onClick={reloadFromStart} />
        </div>
      </div>

      {loadError && (
        <div role="alert" className="border-b border-danger/20 bg-danger/5 px-4 py-2.5 text-xs text-danger">
          {loadError}
        </div>
      )}

      <div className={`overflow-x-auto transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
        <table className="admin-stack w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-canvas/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className={th}>Homestay / Khách</th>
              <th className={th}>Đánh giá</th>
              <th className={th}>Ngày</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((review) => (
              <tr key={review.id} onClick={() => setOpenReview(review)} className="cursor-pointer transition-colors duration-150 hover:bg-canvas">
                <td className={td}>
                  <div className="max-w-[220px] truncate font-semibold text-ink-deep" title={review.placeName}>{review.placeName}</div>
                  <div className="max-w-[220px] truncate text-[11px] text-muted">{review.guestName}{review.bookingCode ? ` · ${review.bookingCode}` : ''}</div>
                </td>
                <td className={td}>
                  <Stars value={review.rating} />
                  <div className="mt-0.5 max-w-[320px] truncate text-ink" title={review.content ?? ''}>{review.content || '—'}</div>
                </td>
                <td className={`${td} whitespace-nowrap text-ink`}>{fmtDateTime(review.createdAt)}</td>
                <td className={td}>
                  <StatusBadge tone={STATUS_TONE[review.status]}>{STATUS_LABEL[review.status]}</StatusBadge>
                </td>
                <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {review.status === 'VISIBLE' && (
                      <>
                        <button type="button" onClick={() => ask('KEEP', review)} className={actionButtonClass('success')}>
                          Giữ nguyên
                        </button>
                        <button type="button" onClick={() => ask('HIDE', review)} className={actionButtonClass('warning')}>
                          Ẩn
                        </button>
                      </>
                    )}
                    {review.status === 'HIDDEN' && (
                      <button type="button" onClick={() => ask('RESTORE', review)} className={actionButtonClass('success')}>
                        Khôi phục
                      </button>
                    )}
                    {review.status !== 'REMOVED' && (
                      <button type="button" onClick={() => ask('REMOVE', review)} className={actionButtonClass('danger')}>
                        Gỡ
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !loadError && <div className="py-12 text-center text-xs text-muted">Không có đánh giá nào khớp bộ lọc.</div>}
      </div>

      <TableFooter
        total={data?.totalElements ?? 0}
        activeCount={activeCount}
        onClear={() => {
          setKeyword('');
          setRating('');
          setFrom('');
          setTo('');
          setPage(0);
        }}
        page={page}
        totalPages={data?.totalPages ?? 0}
        onPage={setPage}
      />

      {openReview && <ReviewDrawer review={openReview} onClose={() => setOpenReview(null)} onAction={(action) => ask(action, openReview)} />}

      {decision && (
        <ReasonDialog
          title={ACTION_META[decision.action].title}
          description={`${ACTION_META[decision.action].description} (Đánh giá của ${decision.review.guestName} về "${decision.review.placeName}")`}
          confirmLabel={ACTION_META[decision.action].confirm}
          reasonRequired={ACTION_META[decision.action].reasonRequired}
          finalConfirm={
            decision.action === 'REMOVE'
              ? `Bạn sắp GỠ đánh giá của ${decision.review.guestName}. Đánh giá bị gỡ khỏi hệ thống công khai và không thể khôi phục; khách sẽ được thông báo kèm lý do.`
              : decision.action === 'HIDE'
              ? `Bạn sắp ẨN đánh giá của ${decision.review.guestName}. Đánh giá không còn hiển thị công khai và không tính vào điểm của Homestay cho đến khi được khôi phục.`
              : decision.action === 'RESTORE'
              ? `Bạn sắp KHÔI PHỤC đánh giá của ${decision.review.guestName}. Đánh giá hiển thị công khai trở lại và được tính lại vào điểm của Homestay.`
              : `Bạn sắp GIỮ NGUYÊN đánh giá của ${decision.review.guestName}. Đánh giá tiếp tục hiển thị công khai và được ghi nhận là đã xem xét.`
          }
          tone={ACTION_META[decision.action].danger ? 'danger' : 'primary'}
          error={dialogError}
          onCancel={() => setDecision(null)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

function ReviewDrawer({ review, onClose, onAction }: { review: AdminReview; onClose: () => void; onAction: (action: ReviewModerationAction) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <OverlayPortal>
      <div className="admin-overlay-shell z-[9998] flex justify-end bg-ink-deep/40 backdrop-blur-[2px] fade-in-overlay" onClick={onClose}>
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết đánh giá"
          onClick={(e) => e.stopPropagation()}
          className="admin-drawer flex h-full min-h-0 w-full min-w-0 max-w-md flex-col bg-white shadow-xl panel-slide-in"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0 flex-1">
              <h3 className="break-words font-display text-base font-bold leading-snug text-ink-deep">{review.placeName}</h3>
              <p className="break-words text-[11px] text-muted">
                {review.providerName ?? '—'} · {review.guestName}
                {review.bookingCode ? ` · ${review.bookingCode}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge tone={STATUS_TONE[review.status]}>{STATUS_LABEL[review.status]}</StatusBadge>
                <Stars value={review.rating} />
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain break-words px-4 py-4 text-xs sm:px-5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Nội dung · {fmtDateTime(review.createdAt)}</div>
            <p className="mt-1 whitespace-pre-line break-words leading-relaxed text-ink">{review.content || '—'}</p>
            {review.images && review.images.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {review.images.map((src) => (
                  <img key={src} src={src} alt="Ảnh đánh giá" className="h-16 w-16 rounded-md border border-border object-cover" />
                ))}
              </div>
            )}
            {review.providerReply && (
              <div className="mt-4 rounded-md bg-canvas px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Phản hồi của nhà cung cấp · {fmtDateTime(review.providerReplyAt)}</div>
                <p className="mt-1 whitespace-pre-line break-words text-ink">{review.providerReply}</p>
              </div>
            )}
            {review.moderatedAt && (
              <p className="mt-4 flex items-start gap-1.5 rounded-md bg-sun/10 px-3 py-2 text-[11px] text-amber-700">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  Xử lý {fmtDateTime(review.moderatedAt)} bởi {review.moderatedByName ?? 'quản trị viên'}
                  {review.moderationReason ? ` — ${review.moderationReason}` : ''}
                </span>
              </p>
            )}
          </div>

          {review.status !== 'REMOVED' && (
            <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-canvas/60 px-4 py-3 sm:px-5">
              {review.status === 'VISIBLE' && (
                <>
                  <button
                    type="button"
                    onClick={() => onAction('KEEP')}
                    className="flex min-h-11 min-w-[7rem] flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-accent-600 sm:min-h-9 sm:text-xs"
                  >
                    <ShieldCheck className="h-4 w-4" /> Giữ nguyên
                  </button>
                  <button
                    type="button"
                    onClick={() => onAction('HIDE')}
                    className="flex min-h-11 min-w-[5rem] flex-1 items-center justify-center gap-1.5 rounded-md border border-sun/60 bg-white px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-sun/10 sm:min-h-9 sm:text-xs"
                  >
                    <EyeOff className="h-4 w-4" /> Ẩn
                  </button>
                </>
              )}
              {review.status === 'HIDDEN' && (
                <button
                  type="button"
                  onClick={() => onAction('RESTORE')}
                  className="flex min-h-11 min-w-[8rem] flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-accent-600 sm:min-h-9 sm:text-xs"
                >
                  <RotateCcw className="h-4 w-4" /> Khôi phục
                </button>
              )}
              <button
                type="button"
                onClick={() => onAction('REMOVE')}
                className="flex min-h-11 min-w-[5rem] flex-1 items-center justify-center gap-1.5 rounded-md border border-danger/40 bg-white px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/5 sm:min-h-9 sm:text-xs"
              >
                <Trash2 className="h-4 w-4" /> Gỡ
              </button>
            </footer>
          )}
        </aside>
      </div>
    </OverlayPortal>
  );
}
