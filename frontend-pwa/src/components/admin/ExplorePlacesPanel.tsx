import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown, ArrowUp, CheckCircle2, Compass, Eye, EyeOff, Loader2, MapPin, MapPinned, Pencil, Pin, PinOff, Plus, Search, X,
} from 'lucide-react';
import ExplorePlaceForm from '@/components/explore/ExplorePlaceForm';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getApiErrorMessage } from '@/lib/apiError';
import { EXPLORE_CATEGORIES, PIN_MAX, RADIUS_MAX_KM, RADIUS_MIN_KM, REJECT_REASON_MAX, REJECT_REASON_MIN } from '@/lib/exploreRules';
import {
  adminApproveEdit, adminApprovePlace, adminBulkVerify, adminCreatePlace, adminGetPlace, adminListPlaces, adminRejectEdit,
  adminRejectPlace, adminSetCoordVerified, adminSetVisible, adminUpdatePlace, fetchExploreSettings, fetchHomestayExplore,
  pinPlace, reorderPins, searchHomestays, searchPlacesToPin, unpinPlace, updateExploreRadius,
} from '@/services/exploreService';
import type { PageResponse } from '@/types/admin';
import type {
  AdminExploreItem, AdminHomestayExplore, CoordFilter, ExploreCategory, HomestayOption, PlaceForm, PlaceRow, StatusFilter,
} from '@/types/explore';
import { ReasonDialog, RefreshButton } from './AdminFilters';
import { StatusBadge } from './StatusBadge';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

type Notify = (type: 'success' | 'error', text: string) => void;
type Tab = 'places' | 'homestays';

const STATUS_FILTERS: { value: StatusFilter | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'VISIBLE', label: 'Hiển thị' },
  { value: 'HIDDEN', label: 'Ẩn' },
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'REJECTED', label: 'Bị từ chối' },
];
const COORD_FILTERS: { value: CoordFilter | ''; label: string }[] = [
  { value: '', label: 'Mọi tọa độ' },
  { value: 'VERIFIED', label: 'Đã xác minh' },
  { value: 'UNVERIFIED', label: 'Chưa xác minh' },
  { value: 'MISSING', label: 'Chưa có tọa độ' },
];

/** BR-C02 / V19: kiểm lý do từ chối trước khi gửi. */
const reasonProblem = (reason: string) =>
  reason.trim().length < REJECT_REASON_MIN || reason.trim().length > REJECT_REASON_MAX
    ? `Lý do từ chối phải từ ${REJECT_REASON_MIN} đến ${REJECT_REASON_MAX} ký tự.` : null;

/**
 * EP02 phía Admin: "Địa điểm khám phá" (AD-01 / AD-02, US02.01) và "Quanh homestay" (AD-03, US02.02). Cấp 3 chỉ xem.
 */
export default function ExplorePlacesPanel({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<Tab>('places');
  const tabCls = (active: boolean) =>
    `min-h-9 rounded-md px-3 py-1.5 text-xs font-semibold ${active ? 'bg-primary text-white' : 'text-ink hover:bg-hover'}`;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-white pb-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink-deep"><Compass className="h-4 w-4 text-primary" /> Địa điểm khám phá</h2>
          <p className="text-xs text-muted">Địa điểm ăn uống, tham quan, check-in, trải nghiệm, dịch vụ hiển thị ở mục "Khám phá quanh đây" của homestay.</p>
        </div>
        <div role="tablist" className="flex gap-1 rounded-lg bg-canvas p-1">
          <button role="tab" aria-selected={tab === 'places'} type="button" onClick={() => setTab('places')} className={tabCls(tab === 'places')}>Địa điểm</button>
          <button role="tab" aria-selected={tab === 'homestays'} type="button" onClick={() => setTab('homestays')} className={tabCls(tab === 'homestays')}>Quanh homestay</button>
        </div>
      </div>
      {tab === 'places' ? <PlacesTab notify={notify} /> : <HomestayTab notify={notify} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════ AD-01

function PlacesTab({ notify }: { notify: Notify }) {
  const { can } = useAdminPermission();
  const canEdit = can('operate');
  const [category, setCategory] = useState<ExploreCategory | ''>('');
  const [status, setStatus] = useState<StatusFilter | ''>('');
  const [coord, setCoord] = useState<CoordFilter | ''>('');
  const [keyword, setKeyword] = useState('');
  const debounced = useDebouncedValue(keyword, 350);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<PlaceRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<PlaceForm | 'new' | null>(null);
  const [rejecting, setRejecting] = useState<{ row: PlaceRow; edit: boolean } | null>(null);
  const [reviewing, setReviewing] = useState<PlaceForm | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    adminListPlaces({ category: category || undefined, status: status || undefined, coord: coord || undefined, keyword: debounced || undefined, page, size: 20 })
      .then((res) => { if (alive) { setData(res); setError(''); } })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được danh sách địa điểm.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category, status, coord, debounced, page, reload]);

  const refresh = () => { setLoading(true); setReload((r) => r + 1); };
  const changeFilter = (apply: () => void) => { apply(); setPage(0); setSelected([]); setLoading(true); };

  const run = async (row: PlaceRow, action: () => Promise<unknown>, success: string, failure: string) => {
    setBusyId(row.id);
    try {
      await action();
      notify('success', success);
      refresh();
    } catch (err) {
      notify('error', getApiErrorMessage(err, failure));
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = async (row: PlaceRow) => {
    setBusyId(row.id);
    try {
      setEditing(await adminGetPlace(row.id));
    } catch (err) {
      notify('error', getApiErrorMessage(err, 'Không mở được địa điểm.'));
    } finally {
      setBusyId(null);
    }
  };

  const openReview = async (row: PlaceRow) => {
    setBusyId(row.id);
    try {
      setReviewing(await adminGetPlace(row.id));
    } catch (err) {
      notify('error', getApiErrorMessage(err, 'Không mở được thay đổi.'));
    } finally {
      setBusyId(null);
    }
  };

  const bulkVerify = async () => {
    try {
      const result = await adminBulkVerify(selected);
      notify('success', `Đã xác minh tọa độ ${result.updated} địa điểm.${result.skipped.length ? ` Bỏ qua: ${result.skipped.join('; ')}.` : ''}`);
      setSelected([]);
      refresh();
    } catch (err) {
      notify('error', getApiErrorMessage(err, 'Không xác minh được tọa độ.'));
    }
  };

  const rows = data?.content ?? [];
  const select = 'min-h-9 rounded-md border border-border bg-white px-2 text-xs';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <label className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={keyword} onChange={(e) => changeFilter(() => setKeyword(e.target.value))} placeholder="Tìm theo tên"
            aria-label="Tìm địa điểm theo tên" className="min-h-9 w-full rounded-md border border-border pl-8 pr-2 text-xs" />
        </label>
        <select aria-label="Danh mục" value={category} onChange={(e) => changeFilter(() => setCategory(e.target.value as ExploreCategory | ''))} className={select}>
          <option value="">Mọi danh mục</option>
          {EXPLORE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select aria-label="Trạng thái" value={status} onChange={(e) => changeFilter(() => setStatus(e.target.value as StatusFilter | ''))} className={select}>
          {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Tọa độ" value={coord} onChange={(e) => changeFilter(() => setCoord(e.target.value as CoordFilter | ''))} className={select}>
          {COORD_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <RefreshButton onClick={refresh} loading={loading} />
        {canEdit && (
          <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-600">
            <Plus className="h-4 w-4" /> Thêm địa điểm
          </button>
        )}
      </div>

      {canEdit && selected.length > 0 && (
        <div className="mx-4 flex flex-wrap items-center gap-2 rounded-md bg-primary-50 px-3 py-2 text-xs">
          Đã chọn {selected.length} địa điểm
          <button type="button" onClick={() => { void bulkVerify(); }} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-semibold text-white">
            <CheckCircle2 className="h-3.5 w-3.5" /> Xác minh tọa độ
          </button>
          <button type="button" onClick={() => setSelected([])} className="text-muted hover:underline">Bỏ chọn</button>
        </div>
      )}

      {error && <p role="alert" className="px-4 text-sm text-danger">{error}</p>}
      {!data && loading ? (
        <ListSkeleton className="px-4" rows={4} />
      ) : rows.length === 0 ? (
        <p className="px-4 text-sm text-muted">{category || status || coord || keyword ? 'Không có địa điểm phù hợp bộ lọc.' : 'Chưa có địa điểm nào.'}</p>
      ) : (
        <ul className="flex flex-col gap-2 px-4">
          {rows.map((row) => {
            const busy = busyId === row.id;
            return (
              <li key={row.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {canEdit && (
                    <input type="checkbox" aria-label={`Chọn ${row.name}`} className="mt-3 h-4 w-4" checked={selected.includes(row.id)}
                      onChange={(e) => setSelected((list) => (e.target.checked ? [...list, row.id] : list.filter((id) => id !== row.id)))} />
                  )}
                  <span className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-canvas">
                    {row.imageUrl ? <img src={row.imageUrl} alt="" className="h-full w-full object-cover" /> : <MapPin className="m-auto mt-3 h-5 w-5 text-muted" />}
                  </span>
                  <div className="min-w-0 text-xs">
                    <p className="break-words text-sm font-bold text-ink-deep">{row.name}</p>
                    <p className="mt-0.5 text-muted">{row.categoryLabel}{row.providerName ? ` · NCC: ${row.providerName}` : ' · Admin tạo'}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {row.approvalStatus === 'PENDING' && <StatusBadge tone="warning" pulse>Chờ duyệt</StatusBadge>}
                      {row.approvalStatus === 'REJECTED' && <StatusBadge tone="danger">Bị từ chối</StatusBadge>}
                      {row.approvalStatus === 'APPROVED' && (row.visible ? <StatusBadge tone="success">Hiển thị</StatusBadge> : <StatusBadge tone="neutral">Ẩn</StatusBadge>)}
                      {!row.hasCoordinates
                        ? <StatusBadge tone="warning">Chưa có tọa độ</StatusBadge>
                        : row.coordVerified ? <StatusBadge tone="info">Tọa độ đã xác minh</StatusBadge> : <StatusBadge tone="neutral">Tọa độ chưa xác minh</StatusBadge>}
                      {row.pendingEdit && <StatusBadge tone="warning" pulse>Có thay đổi chờ duyệt</StatusBadge>}
                    </div>
                    {row.approvalStatus === 'REJECTED' && row.rejectReason && <p className="mt-1 text-danger">Lý do: {row.rejectReason}</p>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
                    <button type="button" disabled={busy} onClick={() => { void openEdit(row); }} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 font-semibold hover:bg-hover"><Pencil className="h-3.5 w-3.5" /> Sửa</button>
                    {row.approvalStatus === 'APPROVED' && (
                      <button type="button" disabled={busy} onClick={() => { void run(row, () => adminSetVisible(row.id, !row.visible), row.visible ? `Đã ẩn "${row.name}".` : `Đã hiển thị "${row.name}".`, 'Không đổi được trạng thái hiển thị.'); }}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 font-semibold hover:bg-hover">
                        {row.visible ? <><EyeOff className="h-3.5 w-3.5" /> Ẩn</> : <><Eye className="h-3.5 w-3.5" /> Hiển thị</>}
                      </button>
                    )}
                    <button type="button" disabled={busy || !row.hasCoordinates} title={row.hasCoordinates ? undefined : 'Nhập tọa độ trước khi xác minh'}
                      onClick={() => { void run(row, () => adminSetCoordVerified(row.id, !row.coordVerified), row.coordVerified ? 'Đã bỏ xác minh tọa độ.' : 'Đã xác minh tọa độ.', 'Không đổi được cờ xác minh tọa độ.'); }}
                      className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 font-semibold hover:bg-hover disabled:opacity-40">
                      <MapPinned className="h-3.5 w-3.5" /> {row.coordVerified ? 'Bỏ xác minh' : 'Xác minh tọa độ'}
                    </button>
                    {row.approvalStatus === 'PENDING' && (
                      <>
                        <button type="button" disabled={busy} onClick={() => { void run(row, () => adminApprovePlace(row.id), `Đã duyệt "${row.name}".`, 'Không duyệt được.'); }}
                          className="inline-flex min-h-9 items-center gap-1 rounded-md bg-primary px-2.5 font-semibold text-white">Duyệt</button>
                        <button type="button" disabled={busy} onClick={() => { setDialogError(''); setRejecting({ row, edit: false }); }}
                          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-danger/40 px-2.5 font-semibold text-danger">Từ chối</button>
                      </>
                    )}
                    {row.pendingEdit && (
                      <button type="button" disabled={busy} onClick={() => { void openReview(row); }}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md bg-primary px-2.5 font-semibold text-white">Xem thay đổi</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 px-4 text-xs">
          <button type="button" disabled={page === 0} onClick={() => { setLoading(true); setPage((p) => p - 1); }} className="min-h-9 rounded-md border border-border px-3 disabled:opacity-40">Trước</button>
          <span>Trang {page + 1}/{data.totalPages}</span>
          <button type="button" disabled={page + 1 >= data.totalPages} onClick={() => { setLoading(true); setPage((p) => p + 1); }} className="min-h-9 rounded-md border border-border px-3 disabled:opacity-40">Sau</button>
        </div>
      )}

      {editing && (
        <FormModal title={editing === 'new' ? 'Thêm địa điểm' : 'Sửa địa điểm'} onClose={() => setEditing(null)}>
          <ExplorePlaceForm
            initial={editing === 'new' ? null : editing}
            scope="admin"
            submitLabel={editing === 'new' ? 'Thêm địa điểm' : 'Lưu thay đổi'}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              const saved = editing === 'new' ? await adminCreatePlace(input) : await adminUpdatePlace(editing.id, input);
              setEditing(null);
              notify('success', saved.latitude == null
                ? `Đã lưu "${saved.name}". Địa điểm chưa có tọa độ nên chưa xuất hiện ở "Khám phá quanh đây".`
                : `Đã lưu "${saved.name}".`);
              refresh();
            }}
          />
        </FormModal>
      )}

      {reviewing?.pendingEdit && (
        <EditReviewModal
          place={reviewing}
          onClose={() => setReviewing(null)}
          onApprove={async () => {
            await adminApproveEdit(reviewing.id);
            notify('success', `Đã duyệt thay đổi của "${reviewing.name}".`);
            setReviewing(null);
            refresh();
          }}
          onReject={() => {
            const row = rows.find((r) => r.id === reviewing.id);
            setReviewing(null);
            if (row) { setDialogError(''); setRejecting({ row, edit: true }); }
          }}
        />
      )}

      {rejecting && (
        <ReasonDialog
          title={rejecting.edit ? 'Từ chối thay đổi' : 'Từ chối địa điểm'}
          description={`${rejecting.edit ? 'Bản đang hiển thị giữ nguyên. ' : ''}NCC sẽ nhận lý do và có thể sửa rồi gửi lại. Lý do ${REJECT_REASON_MIN}–${REJECT_REASON_MAX} ký tự.`}
          confirmLabel="Từ chối"
          reasonRequired
          error={dialogError}
          onCancel={() => setRejecting(null)}
          onConfirm={async (reason) => {
            const problem = reasonProblem(reason);
            if (problem) { setDialogError(problem); return; }
            try {
              if (rejecting.edit) await adminRejectEdit(rejecting.row.id, reason);
              else await adminRejectPlace(rejecting.row.id, reason);
              notify('success', 'Đã từ chối và gửi lý do cho NCC.');
              setRejecting(null);
              refresh();
            } catch (err) {
              setDialogError(getApiErrorMessage(err, 'Không từ chối được.'));
            }
          }}
        />
      )}
    </div>
  );
}

/** Khung modal lớn cho form (toàn màn hình trên điện thoại). */
function FormModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-stretch justify-center bg-ink-deep/60 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-full w-full flex-col bg-white shadow-xl sm:max-h-[92vh] sm:max-w-2xl sm:rounded-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <h3 className="font-display text-base font-bold text-ink-deep">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-hover sm:h-9 sm:w-9"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** L3 — so sánh bản đang hiển thị với bản sửa NCC gửi (BR-C03). */
function EditReviewModal({ place, onClose, onApprove, onReject }: {
  place: PlaceForm; onClose: () => void; onApprove: () => Promise<void>; onReject: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = place.pendingEdit!.changes;
  const fmtCoord = (lat: number | null | undefined, lng: number | null | undefined) => (lat == null || lng == null ? '—' : `${lat}, ${lng}`);
  const fields: [string, string, string][] = [
    ['Tên', place.name, next.name],
    ['Danh mục', EXPLORE_CATEGORIES.find((c) => c.value === place.category)?.label ?? '', EXPLORE_CATEGORIES.find((c) => c.value === next.category)?.label ?? ''],
    ['Mô tả ngắn', place.summary ?? '', next.summary ?? ''],
    ['Mô tả chi tiết', place.description ?? '', next.description ?? ''],
    ['Địa chỉ', place.address ?? '', next.address ?? ''],
    ['Tọa độ', fmtCoord(place.latitude, place.longitude), fmtCoord(next.latitude, next.longitude)],
    ['Số điện thoại', place.phone ?? '', next.phone ?? ''],
    ['Website', place.website ?? '', next.website ?? ''],
    ['Số ảnh', String(place.images.length), String(next.images?.length ?? 0)],
    ['Giờ mở cửa', `${place.openingHours.length} ngày khai báo`, `${next.openingHours?.length ?? 0} ngày khai báo`],
  ];
  const changed = fields.filter(([, a, b]) => (a || '') !== (b || ''));
  return (
    <FormModal title={`Thay đổi chờ duyệt — ${place.name}`} onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-xs sm:px-5">
        {changed.length === 0 ? <p className="text-muted">Không có trường nào khác bản đang hiển thị.</p> : (
          <table className="w-full border-collapse">
            <thead><tr className="text-left text-muted"><th className="py-1 pr-2">Trường</th><th className="py-1 pr-2">Đang hiển thị</th><th className="py-1">Bản sửa</th></tr></thead>
            <tbody>
              {changed.map(([label, before, after]) => (
                <tr key={label} className="border-t border-border align-top">
                  <td className="py-1.5 pr-2 font-semibold">{label}</td>
                  <td className="py-1.5 pr-2 text-muted line-through">{before || '—'}</td>
                  <td className="py-1.5 text-ink">{after || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {changed.some(([label]) => label === 'Tọa độ') && <p className="mt-2 text-amber-700">Tọa độ đổi: duyệt xong cờ "Tọa độ đã xác minh" sẽ tự tắt.</p>}
        {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
        <button type="button" disabled={busy} onClick={onReject} className="min-h-9 rounded-md border border-danger/40 px-3 text-xs font-semibold text-danger">Từ chối</button>
        <button type="button" disabled={busy} onClick={() => {
          setBusy(true);
          onApprove().catch((err: unknown) => { setError(getApiErrorMessage(err, 'Không duyệt được thay đổi.')); setBusy(false); });
        }} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-white">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Duyệt thay đổi
        </button>
      </div>
    </FormModal>
  );
}

// ═══════════════════════════════════════════════════════════════ AD-03

function HomestayTab({ notify }: { notify: Notify }) {
  const { can } = useAdminPermission();
  const canEdit = can('operate');
  const [radius, setRadius] = useState('');
  const [radiusError, setRadiusError] = useState('');
  const [keyword, setKeyword] = useState('');
  const debounced = useDebouncedValue(keyword, 350);
  const [options, setOptions] = useState<HomestayOption[]>([]);
  const [homestayId, setHomestayId] = useState<number | null>(null);
  const [config, setConfig] = useState<AdminHomestayExplore | null>(null);
  const [placeKeyword, setPlaceKeyword] = useState('');
  const debouncedPlace = useDebouncedValue(placeKeyword, 350);
  const [found, setFound] = useState<AdminExploreItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchExploreSettings().then((s) => setRadius(String(s.radiusKm))).catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    searchHomestays(debounced).then((list) => { if (alive) setOptions(list); }).catch(() => undefined);
    return () => { alive = false; };
  }, [debounced]);

  useEffect(() => {
    if (homestayId == null) return undefined;
    let alive = true;
    fetchHomestayExplore(homestayId)
      .then((c) => { if (alive) setConfig(c); })
      .catch((err: unknown) => notify('error', getApiErrorMessage(err, 'Không tải được cấu hình homestay.')));
    return () => { alive = false; };
  }, [homestayId, notify]);

  useEffect(() => {
    if (homestayId == null || !debouncedPlace.trim()) return undefined;
    let alive = true;
    searchPlacesToPin(homestayId, debouncedPlace).then((list) => { if (alive) setFound(list); }).catch(() => undefined);
    return () => { alive = false; };
  }, [homestayId, debouncedPlace, config]);

  const saveRadius = async () => {
    const value = Number(radius);
    if (!/^\d+$/.test(radius.trim()) || value < RADIUS_MIN_KM || value > RADIUS_MAX_KM) {
      setRadiusError(`Bán kính phải từ ${RADIUS_MIN_KM} đến ${RADIUS_MAX_KM} km.`);
      return;
    }
    try {
      const s = await updateExploreRadius(value);
      setRadius(String(s.radiusKm));
      setRadiusError('');
      notify('success', `Đã lưu bán kính ${s.radiusKm} km cho toàn hệ thống.`);
      if (homestayId != null) setConfig(await fetchHomestayExplore(homestayId));
    } catch (err) {
      setRadiusError(getApiErrorMessage(err, 'Không lưu được bán kính.'));
    }
  };

  const act = async (action: () => Promise<AdminHomestayExplore>, success: string) => {
    setBusy(true);
    try {
      setConfig(await action());
      notify('success', success);
    } catch (err) {
      notify('error', getApiErrorMessage(err, 'Không thực hiện được thao tác.'));
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, delta: -1 | 1) => {
    if (!config || homestayId == null) return;
    const ids = config.pins.map((p) => p.id);
    const a = ids[index];
    const b = ids[index + delta];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[index + delta] = a;
    void act(() => reorderPins(homestayId, ids), 'Đã lưu thứ tự ghim.');
  };

  const pinFull = (config?.pins.length ?? 0) >= PIN_MAX;
  const pinButton = (item: AdminExploreItem) => (canEdit && config?.hasCoordinates ? (
    <button type="button" disabled={busy || item.pinned || pinFull} title={pinFull ? `Đã đủ ${PIN_MAX} địa điểm ghim` : undefined}
      onClick={() => homestayId != null && void act(() => pinPlace(homestayId, item.id), `Đã ghim "${item.name}".`)}
      className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-hover disabled:opacity-40">
      <Pin className="h-3.5 w-3.5" /> {item.pinned ? 'Đã ghim' : 'Ghim'}
    </button>
  ) : null);

  const itemLine = (item: AdminExploreItem) => (
    <div className="min-w-0 text-xs">
      <p className="font-semibold text-ink-deep">{item.name}</p>
      <p className="text-muted">
        {item.categoryLabel ?? ''}{item.distanceText ? ` · ${item.distanceText}` : ''}
        {!item.eligible && item.notEligibleReason && <span className="text-amber-700"> · Khách chưa thấy: {item.notEligibleReason}</span>}
      </p>
    </div>
  );

  return (
    <div className="grid gap-4 px-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border p-3">
          <label htmlFor="explore-radius" className="mb-1 block text-xs font-semibold text-ink-deep">Bán kính hệ thống (km)</label>
          <div className="flex gap-2">
            <input id="explore-radius" inputMode="numeric" value={radius} disabled={!canEdit} onChange={(e) => { setRadius(e.target.value); setRadiusError(''); }}
              className={`min-h-9 w-24 rounded-md border px-2 text-sm ${radiusError ? 'border-danger' : 'border-border'}`} />
            {canEdit && <button type="button" onClick={() => { void saveRadius(); }} className="min-h-9 rounded-md bg-primary px-3 text-xs font-semibold text-white">Lưu</button>}
          </div>
          {radiusError ? <p role="alert" className="mt-1 text-xs text-danger">{radiusError}</p>
            : <p className="mt-1 text-[11px] text-muted">{RADIUS_MIN_KM}–{RADIUS_MAX_KM} km, áp dụng cho mọi homestay.</p>}
        </div>
        <div className="rounded-lg border border-border p-3">
          <label htmlFor="explore-homestay" className="mb-1 block text-xs font-semibold text-ink-deep">Chọn homestay</label>
          <input id="explore-homestay" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tìm theo tên" className="min-h-9 w-full rounded-md border border-border px-2 text-sm" />
          <ul className="mt-2 max-h-72 overflow-y-auto">
            {options.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => { setHomestayId(h.id); setConfig(null); setFound([]); setPlaceKeyword(''); }}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${homestayId === h.id ? 'bg-primary-50 font-semibold text-primary' : 'hover:bg-hover'}`}>
                  {h.name}{!h.hasCoordinates && <span className="text-amber-700"> · chưa có tọa độ</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="min-w-0">
        {homestayId == null ? <p className="text-sm text-muted">Chọn một homestay để cấu hình mục "Khám phá quanh đây".</p>
          : !config ? <ListSkeleton rows={3} />
          : !config.hasCoordinates ? (
            <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Cần bổ sung tọa độ homestay trước khi cấu hình.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <section>
                <h3 className="mb-2 text-sm font-bold text-ink-deep">Địa điểm ghim ({config.pins.length}/{config.pinMax})</h3>
                {config.pins.length === 0 ? <p className="text-xs text-muted">Chưa ghim địa điểm nào. Địa điểm ghim luôn đứng đầu danh sách, kể cả khi ở xa.</p> : (
                  <ul className="flex flex-col gap-1.5">
                    {config.pins.map((item, index) => (
                      <li key={item.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                        {canEdit && (
                          <span className="flex flex-col">
                            <button type="button" aria-label="Lên trên" disabled={busy || index === 0} onClick={() => move(index, -1)} className="h-5 w-7 disabled:opacity-30"><ArrowUp className="mx-auto h-3.5 w-3.5" /></button>
                            <button type="button" aria-label="Xuống dưới" disabled={busy || index === config.pins.length - 1} onClick={() => move(index, 1)} className="h-5 w-7 disabled:opacity-30"><ArrowDown className="mx-auto h-3.5 w-3.5" /></button>
                          </span>
                        )}
                        <span className="w-5 text-center text-xs font-bold text-muted">{index + 1}</span>
                        <div className="min-w-0 flex-1">{itemLine(item)}</div>
                        {canEdit && (
                          <button type="button" disabled={busy} onClick={() => void act(() => unpinPlace(config.homestayId, item.id), `Đã bỏ ghim "${item.name}".`)}
                            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-hover"><PinOff className="h-3.5 w-3.5" /> Bỏ ghim</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {canEdit && (
                <section>
                  <h3 className="mb-2 text-sm font-bold text-ink-deep">Tìm địa điểm để ghim (kể cả ngoài bán kính)</h3>
                  <input value={placeKeyword} onChange={(e) => setPlaceKeyword(e.target.value)} placeholder="Nhập tên địa điểm" aria-label="Tìm địa điểm để ghim" className="min-h-9 w-full rounded-md border border-border px-2 text-sm" />
                  {placeKeyword.trim() && (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {found.length === 0 ? <li className="text-xs text-muted">Không tìm thấy địa điểm đã duyệt nào.</li> : found.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 rounded-md border border-border p-2"><div className="min-w-0 flex-1">{itemLine(item)}</div>{pinButton(item)}</li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-bold text-ink-deep">Trong bán kính {config.radiusKm} km</h3>
                {config.inRadius.length === 0 ? <p className="text-xs text-muted">Không có địa điểm đủ điều kiện trong {config.radiusKm} km. Có thể tăng bán kính hoặc ghim địa điểm xa hơn.</p> : (
                  <ul className="flex flex-col gap-1.5">
                    {config.inRadius.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 rounded-md border border-border p-2"><div className="min-w-0 flex-1">{itemLine(item)}</div>{pinButton(item)}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold text-ink-deep">Khách sẽ thấy (10 thẻ đầu)</h3>
                {config.preview.length === 0 ? <p className="text-xs text-muted">Mục "Khám phá quanh đây" đang ẩn với homestay này.</p> : (
                  <ol className="list-decimal space-y-0.5 pl-5 text-xs">
                    {config.preview.map((c) => <li key={c.id}>{c.name} · {c.distanceText}{c.pinned ? ' · ghim' : ''}</li>)}
                  </ol>
                )}
              </section>
            </div>
          )}
      </div>
    </div>
  );
}
