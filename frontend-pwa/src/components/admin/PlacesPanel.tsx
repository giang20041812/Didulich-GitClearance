import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, FilePenLine, QrCode, Trash2, X } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import type {
  AdminPlaceSummaryDto,
  CategoryKind,
  PageResponse,
  PlaceVerificationStatus,
  PlaceVisibility,
} from '@/types/admin';
import {
  CompactDateRange,
  CompactSelect,
  FilterSearch,
  ReasonDialog,
  RefreshButton,
  SortSelect,
  TableFooter,
  type SelectOption,
  type SortOption,
} from './AdminFilters';
import { StatusBadge } from './StatusBadge';
import StatusFilter, { type StatusFilterItem } from './StatusFilter';
import { STATUS_COLOR } from './statusColor';
import { useUrlStatus } from '@/hooks/useUrlStatus';
import { useStatusCounts } from '@/hooks/useStatusCounts';
import { actionButtonClass } from './statusStyles';
import PlaceQuickPreview from './PlaceQuickPreview';
import AdminPlaceMediaPanel from './AdminPlaceMediaPanel';
import { DATA_VERIFIED_LABEL, DATA_VERIFIED_TONE, KIND_META, kindMeta, VERIFICATION_LABEL, VERIFICATION_TONE, VISIBILITY_LABEL, VISIBILITY_TONE } from './placeMeta';

interface PlacesPanelProps {
  notify: (type: 'success' | 'error', text: string) => void;
}

const PAGE_SIZE = 15;

/**
 * Tab trạng thái duyệt điểm đến = place.verification. Backend KHÔNG có trạng thái "Đã từ chối":
 * thay vào đó có "Cần bổ sung" (trả về NCC) và "Lưu trữ", nên giữ hai tab thật này thay vì tự tạo trạng thái mới.
 */
const STATUS_ITEMS: StatusFilterItem<PlaceVerificationStatus>[] = [
  { value: 'UNVERIFIED', label: VERIFICATION_LABEL.UNVERIFIED, tone: STATUS_COLOR.yellow },
  { value: 'VERIFIED', label: VERIFICATION_LABEL.VERIFIED, tone: STATUS_COLOR.green },
  { value: 'NEEDS_UPDATE', label: VERIFICATION_LABEL.NEEDS_UPDATE, tone: STATUS_COLOR.blue },
  { value: 'ARCHIVED', label: VERIFICATION_LABEL.ARCHIVED, tone: STATUS_COLOR.gray },
];
const STATUS_VALUES = STATUS_ITEMS.map((i) => i.value);

const VISIBILITY_OPTIONS: SelectOption<PlaceVisibility>[] = [
  { value: '', label: 'Tất cả' },
  ...(['PUBLISHED', 'UNPUBLISHED', 'DRAFT'] as PlaceVisibility[]).map((v) => ({ value: v, label: VISIBILITY_LABEL[v] })),
];
type DataVerifiedFilter = 'true' | 'false';
const DATA_VERIFIED_OPTIONS: SelectOption<DataVerifiedFilter>[] = [
  { value: '', label: 'Tất cả' },
  { value: 'true', label: DATA_VERIFIED_LABEL.true },
  { value: 'false', label: DATA_VERIFIED_LABEL.false },
];
const KIND_OPTIONS: SelectOption<CategoryKind>[] = [
  { value: '', label: 'Tất cả' },
  ...(Object.keys(KIND_META) as CategoryKind[]).map((k) => ({ value: k, label: KIND_META[k].label })),
];
const SORT_OPTIONS: SortOption[] = [
  { value: 'createdAt:desc', label: 'Mới tạo nhất' },
  { value: 'createdAt:asc', label: 'Cũ nhất' },
  { value: 'updatedAt:desc', label: 'Cập nhật gần đây' },
  { value: 'ratingAvg:desc', label: 'Đánh giá cao' },
  { value: 'name:asc', label: 'Tên A → Z' },
];

type PendingAction =
  | { type: 'verification'; ids: number[]; label: string; verification: PlaceVerificationStatus }
  | { type: 'visibility'; id: number; label: string; visibility: PlaceVisibility }
  | { type: 'delete'; ids: number[]; label: string };

export default function PlacesPanel({ notify }: PlacesPanelProps) {
  // Cấp 3 chỉ xem; duyệt / ẩn từ cấp 2; xóa chỉ cấp 1 (backend cũng chặn theo cấp).
  const { can } = useAdminPermission();
  const canOperate = can('operate');
  const canDelete = can('deletePlaces');
  const [keyword, setKeyword] = useState('');
  const [verification, setVerification] = useUrlStatus<PlaceVerificationStatus>(STATUS_VALUES, 'UNVERIFIED');
  const [visibility, setVisibility] = useState<PlaceVisibility | ''>('');
  const [kind, setKind] = useState<CategoryKind | ''>('');
  const [dataVerified, setDataVerified] = useState<DataVerifiedFilter | ''>('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(0);

  const [data, setData] = useState<PageResponse<AdminPlaceSummaryDto> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<AdminPlaceSummaryDto | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [dialogError, setDialogError] = useState('');
  /** Địa điểm đang lưu cờ dữ liệu xác thực — khóa công tắc để không gửi chồng yêu cầu. */
  const [savingDataId, setSavingDataId] = useState<number | null>(null);
  /** Địa điểm đang mở panel quản lý ảnh — null = panel đóng. */
  const [mediaPlace, setMediaPlace] = useState<AdminPlaceSummaryDto | null>(null);

  const debouncedKeyword = useDebouncedValue(keyword);
  const activeCount = [debouncedKeyword, visibility, kind, dataVerified, createdFrom || createdTo].filter(Boolean).length;

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
    setSelected([]);
  };

  const clearFilters = () => {
    setKeyword('');
    setVisibility('');
    setKind('');
    setDataVerified('');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(0);
    setSelected([]);
  };

  /** Nút tải lại: đưa màn hình về trạng thái ban đầu (bỏ mọi điều kiện tìm kiếm / lọc / sắp xếp, về tab mặc định, trang 1) rồi tải lại dữ liệu mới nhất. */
  const reloadFromStart = () => {
    clearFilters();
    setVerification('UNVERIFIED');
    setSort('createdAt:desc');
    setReload((n) => n + 1);
  };

  const load = useCallback(async () => {
    const [sortBy, sortDir] = sort.split(':') as [string, 'asc' | 'desc'];
    setLoading(true);
    setLoadError('');
    try {
      setData(
        await adminService.getPlaces({
          keyword: debouncedKeyword.trim() || undefined,
          verification: verification || undefined,
          visibility: visibility || undefined,
          kind: kind || undefined,
          dataVerified: dataVerified ? dataVerified === 'true' : undefined,
          createdFrom: createdFrom || undefined,
          createdTo: createdTo || undefined,
          sortBy,
          sortDir,
          page,
          size: PAGE_SIZE,
        }),
      );
    } catch (err: unknown) {
      setLoadError(getApiErrorMessage(err, 'Không tải được danh sách điểm đến. Vui lòng kiểm tra kết nối máy chủ và thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedKeyword, verification, visibility, kind, dataVerified, createdFrom, createdTo, sort, page]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  /** Số lượng trên từng tab: áp dụng cùng từ khóa / loại hình / hiển thị / ngày tạo, chỉ khác trạng thái duyệt. */
  const counts = useStatusCounts(
    STATUS_VALUES,
    async (s) =>
      (
        await adminService.getPlaces({
          keyword: debouncedKeyword.trim() || undefined,
          verification: s || undefined,
          visibility: visibility || undefined,
          kind: kind || undefined,
          dataVerified: dataVerified ? dataVerified === 'true' : undefined,
          createdFrom: createdFrom || undefined,
          createdTo: createdTo || undefined,
          page: 0,
          size: 1,
        })
      ).totalElements,
    JSON.stringify([debouncedKeyword.trim(), visibility, kind, dataVerified, createdFrom, createdTo]),
    reload,
  );

  const rows = data?.content ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((r) => r.id));
  const toggleOne = (id: number) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Thao tác hàng loạt chỉ áp dụng cho các mục chưa ở trạng thái đích (mục đã duyệt không bị duyệt lại).
  const selectedRows = rows.filter((r) => selected.includes(r.id));
  const approvableIds = selectedRows.filter((r) => r.verification !== 'VERIFIED').map((r) => r.id);
  const updatableIds = selectedRows.filter((r) => r.verification !== 'NEEDS_UPDATE').map((r) => r.id);

  const reasonRequired =
    pending?.type === 'verification'
      ? pending.verification === 'NEEDS_UPDATE' || pending.verification === 'ARCHIVED'
      : pending?.type === 'delete'
      ? true
      : pending?.visibility !== 'PUBLISHED';

  const confirm = async (reason: string) => {
    if (!pending) return;
    if (reasonRequired && !reason) {
      setDialogError('Vui lòng nhập lý do.');
      return;
    }
    let successText = 'Đã cập nhật điểm đến.';
    try {
      if (pending.type === 'verification') {
        const [firstId] = pending.ids;
        if (pending.ids.length === 1 && firstId !== undefined) {
          await adminService.updatePlaceVerification(firstId, {
            verification: pending.verification,
            reason: reason || 'Admin duyệt nội dung điểm đến',
          });
        } else {
          await adminService.bulkUpdatePlaceVerification({
            ids: pending.ids,
            verification: pending.verification,
            reason: reason || 'Admin duyệt nội dung điểm đến',
          });
        }
        successText =
          pending.verification === 'VERIFIED'
            ? `Đã duyệt ${pending.label}.`
            : pending.verification === 'NEEDS_UPDATE'
            ? `Đã yêu cầu bổ sung nội dung cho ${pending.label}.`
            : 'Đã cập nhật trạng thái điểm đến.';
      } else if (pending.type === 'delete') {
        await adminService.deletePlaces({ ids: pending.ids, reason });
        successText = `Đã xóa ${pending.label}.`;
      } else {
        await adminService.updatePlaceVisibility(pending.id, {
          visibility: pending.visibility,
          reason: reason || 'Admin công khai lại điểm đến',
        });
        successText = pending.visibility === 'PUBLISHED' ? 'Đã công khai điểm đến.' : 'Đã ẩn điểm đến.';
      }
      notify('success', successText);
      setPending(null);
      setDialogError('');
      setSelected([]);
      setPreview(null);
      setReload((n) => n + 1);
    } catch (err: unknown) {
      setDialogError(getApiErrorMessage(err, 'Không thể cập nhật điểm đến.'));
    }
  };

  /** Bật / tắt cờ "dữ liệu đã xác thực": lưu ngay (không cần lý do), cập nhật dòng và ngăn xem nhanh tại chỗ. */
  const toggleDataVerified = async (place: AdminPlaceSummaryDto, next: boolean) => {
    if (savingDataId !== null) return;
    setSavingDataId(place.id);
    try {
      const updated = await adminService.updatePlaceDataVerified(place.id, { dataVerified: next });
      setData((cur) => (cur ? { ...cur, content: cur.content.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)) } : cur));
      setPreview((cur) => (cur && cur.id === updated.id ? { ...cur, ...updated } : cur));
      // Không hiện hộp thoại thành công (nó chặn màn hình): chính công tắc đổi trạng thái là phản hồi. Chỉ báo khi lỗi.
      // Đang lọc theo cờ này thì dòng không còn khớp bộ lọc: tải lại danh sách và số đếm.
      if (dataVerified) setReload((n) => n + 1);
    } catch (err: unknown) {
      notify('error', getApiErrorMessage(err, 'Không thể cập nhật trạng thái xác thực dữ liệu.'));
    } finally {
      setSavingDataId(null);
    }
  };

  const ask = (action: PendingAction) => {
    setDialogError('');
    setPending(action);
  };

  const askVerify = (place: AdminPlaceSummaryDto, v: PlaceVerificationStatus) =>
    ask({ type: 'verification', ids: [place.id], label: place.name, verification: v });
  const askDelete = (place: AdminPlaceSummaryDto) => ask({ type: 'delete', ids: [place.id], label: `điểm đến "${place.name}"` });
  const askVisibility = (place: AdminPlaceSummaryDto) =>
    ask({ type: 'visibility', id: place.id, label: place.name, visibility: place.visibility === 'PUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED' });

  const th = 'px-4 py-2.5';
  const td = 'px-4 py-2.5';

  return (
    <section className="rounded-lg border border-border bg-white shadow-sm">
      <StatusFilter ariaLabel="Trạng thái kiểm duyệt" items={STATUS_ITEMS} value={verification} counts={counts} onChange={resetPage(setVerification)} />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FilterSearch value={keyword} onChange={resetPage(setKeyword)} placeholder="Tìm theo tên, slug, địa chỉ hoặc nhà cung cấp..." />
        <CompactSelect label="Loại hình" value={kind} options={KIND_OPTIONS} onChange={resetPage(setKind)} />
        <CompactSelect label="Hiển thị" value={visibility} options={VISIBILITY_OPTIONS} onChange={resetPage(setVisibility)} />
        <CompactSelect label="Dữ liệu" value={dataVerified} options={DATA_VERIFIED_OPTIONS} onChange={resetPage(setDataVerified)} />
        <CompactDateRange
          label="Ngày tạo"
          from={createdFrom}
          to={createdTo}
          onChange={(f, t) => {
            setCreatedFrom(f);
            setCreatedTo(t);
            setPage(0);
            setSelected([]);
          }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SortSelect value={sort} options={SORT_OPTIONS} onChange={resetPage(setSort)} />
          <RefreshButton loading={loading} onClick={reloadFromStart} />
        </div>
      </div>

      {canOperate && selected.length > 0 && (
        <div className="rise-in flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary-50 px-4 py-2 text-xs">
          <strong className="text-primary">Đã chọn {selected.length} điểm đến</strong>
          {/* Chỉ áp dụng cho các mục chưa ở trạng thái đích: mục đã duyệt không bị duyệt lại. */}
          {approvableIds.length > 0 && (
            <button
              type="button"
              onClick={() => ask({ type: 'verification', ids: approvableIds, label: `${approvableIds.length} điểm đến`, verification: 'VERIFIED' })}
              className="flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 font-semibold text-white transition-colors hover:bg-accent-600"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt ({approvableIds.length})
            </button>
          )}
          {updatableIds.length > 0 && (
            <button
              type="button"
              onClick={() => ask({ type: 'verification', ids: updatableIds, label: `${updatableIds.length} điểm đến`, verification: 'NEEDS_UPDATE' })}
              className="flex h-7 items-center gap-1 rounded-md border border-sun/60 bg-white px-2.5 font-semibold text-amber-700 transition-colors hover:bg-sun/10"
            >
              <FilePenLine className="h-3.5 w-3.5" /> Yêu cầu bổ sung ({updatableIds.length})
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => ask({ type: 'delete', ids: selected, label: `${selected.length} điểm đến` })}
              className="flex h-7 items-center gap-1 rounded-md border border-danger/40 bg-white px-2.5 font-semibold text-danger transition-colors hover:bg-danger/5"
            >
              <Trash2 className="h-3.5 w-3.5" /> Xóa ({selected.length})
            </button>
          )}
          <button type="button" onClick={() => setSelected([])} className="ml-auto flex items-center gap-1 text-muted hover:text-ink">
            <X className="h-3.5 w-3.5" /> Bỏ chọn
          </button>
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
              {canOperate && (
                <th className={`${th} w-10`}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Chọn tất cả" className="accent-[var(--color-primary)]" />
                </th>
              )}
              <th className={th}>Điểm đến</th>
              <th className={th}>Loại hình</th>
              <th className={th}>NCC / Khu vực</th>
              <th className={th}>Hiển thị</th>
              <th className={th}>Trạng thái</th>
              <th className={th}>Xác thực dữ liệu</th>
              {canOperate && <th className={`${th} text-right`}>Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((place) => {
              const k = kindMeta(place.kind);
              const KindIcon = k.icon;
              const isSel = selected.includes(place.id);
              return (
                <tr
                  key={place.id}
                  onClick={() => setPreview(place)}
                  className={`cursor-pointer transition-colors duration-150 ${isSel ? 'bg-primary-50/60' : 'hover:bg-canvas'}`}
                >
                  {canOperate && (
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleOne(place.id)}
                        aria-label={`Chọn ${place.name}`}
                        className="accent-[var(--color-primary)]"
                      />
                    </td>
                  )}
                  <td className={td}>
                    <div className="flex items-center gap-2.5">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${k.tone}`} aria-hidden>
                        <KindIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="max-w-[260px] truncate font-semibold text-ink-deep" title={place.name}>{place.name}</div>
                        <div className="max-w-[260px] truncate font-mono text-[11px] text-muted">#{place.id} · {place.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className={td}>
                    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${k.tone}`}>
                      <KindIcon className="h-3 w-3" /> {k.label}
                    </span>
                  </td>
                  <td className={`${td} text-ink`}>
                    <div className="max-w-[200px] truncate">{place.providerName || 'Hệ thống du lịch'}</div>
                    <div className="max-w-[200px] truncate text-[11px] text-muted">{place.regionName || place.address || '—'}</div>
                  </td>
                  <td className={td}>
                    <StatusBadge tone={VISIBILITY_TONE[place.visibility]}>{VISIBILITY_LABEL[place.visibility]}</StatusBadge>
                  </td>
                  <td className={td}>
                    <StatusBadge tone={VERIFICATION_TONE[place.verification]} pulse={place.verification === 'UNVERIFIED'}>
                      {VERIFICATION_LABEL[place.verification]}
                    </StatusBadge>
                  </td>
                  <td className={td} onClick={(e) => e.stopPropagation()}>
                    {canOperate ? (
                      <span title={DATA_VERIFIED_LABEL[place.dataVerified ? 'true' : 'false']} className="inline-flex">
                        <ToggleSwitch
                          checked={place.dataVerified}
                          onChange={(next) => void toggleDataVerified(place, next)}
                          label={`Xác thực dữ liệu ${place.name}`}
                          showState={false}
                          disabled={savingDataId === place.id}
                        />
                      </span>
                    ) : (
                      <StatusBadge tone={DATA_VERIFIED_TONE[place.dataVerified ? 'true' : 'false']}>
                        {DATA_VERIFIED_LABEL[place.dataVerified ? 'true' : 'false']}
                      </StatusBadge>
                    )}
                  </td>
                  {canOperate && (
                  <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {place.verification !== 'VERIFIED' && (
                        <button type="button" onClick={() => askVerify(place, 'VERIFIED')} className={actionButtonClass('success')}>
                          Duyệt
                        </button>
                      )}
                      {place.verification !== 'NEEDS_UPDATE' && (
                        <button type="button" onClick={() => askVerify(place, 'NEEDS_UPDATE')} className={actionButtonClass('warning')}>
                          Bổ sung
                        </button>
                      )}
                      {place.kind === 'HOMESTAY' && (
                        <a
                          href={`/in-ma-qr/${place.id}`}
                          target="_blank"
                          rel="noopener"
                          title="In mã QR nhận phòng"
                          aria-label={`In mã QR nhận phòng ${place.name}`}
                          className="rounded-md p-1.5 text-muted transition-colors hover:bg-canvas hover:text-primary"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => askVisibility(place)}
                        title={place.visibility === 'PUBLISHED' ? 'Ẩn điểm đến' : 'Công khai'}
                        aria-label={place.visibility === 'PUBLISHED' ? `Ẩn ${place.name}` : `Công khai ${place.name}`}
                        className="rounded-md p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
                      >
                        {place.visibility === 'PUBLISHED' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => askDelete(place)}
                          title="Xóa điểm đến"
                          aria-label={`Xóa ${place.name}`}
                          className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !loadError && (
          <div className="py-12 text-center text-xs text-muted">Không có điểm đến nào khớp bộ lọc.</div>
        )}
      </div>

      <TableFooter
        total={data?.totalElements ?? 0}
        activeCount={activeCount}
        onClear={clearFilters}
        page={page}
        totalPages={data?.totalPages ?? 0}
        onPage={(p) => {
          setPage(p);
          setSelected([]);
        }}
      />

      {preview && (
        <PlaceQuickPreview
          key={preview.id}
          place={preview}
          onClose={() => setPreview(null)}
          onApprove={() => askVerify(preview, 'VERIFIED')}
          onRequestUpdate={() => askVerify(preview, 'NEEDS_UPDATE')}
          onToggleVisibility={() => askVisibility(preview)}
          onToggleDataVerified={(next) => void toggleDataVerified(preview, next)}
          savingDataVerified={savingDataId === preview.id}
          onAddMedia={() => setMediaPlace(preview)}
        />
      )}

      {mediaPlace && (
        <AdminPlaceMediaPanel
          place={mediaPlace}
          onClose={() => setMediaPlace(null)}
        />
      )}

      {pending && (
        <ReasonDialog
          title={
            pending.type === 'verification'
              ? pending.verification === 'VERIFIED'
                ? 'Duyệt điểm đến'
                : 'Yêu cầu bổ sung nội dung'
              : pending.type === 'delete'
              ? 'Xóa điểm đến'
              : pending.visibility === 'PUBLISHED'
              ? 'Công khai điểm đến'
              : 'Ẩn điểm đến'
          }
          description={
            pending.type === 'delete'
              ? `Sẽ xóa ${pending.label} khỏi hệ thống (không còn hiển thị cho khách). Thao tác được ghi vào nhật ký hoạt động.`
              : `Áp dụng cho: ${pending.label}.`
          }
          confirmLabel={pending.type === 'delete' ? 'Xóa' : 'Xác nhận'}
          reasonRequired={reasonRequired}
          finalConfirm={
            pending.type === 'delete'
              ? `Bạn sắp XÓA ${pending.label}. Điểm đến sẽ biến mất khỏi hệ thống và khách không còn thấy; thao tác này không thể hoàn tác từ giao diện quản trị.`
              : pending.type === 'verification' && pending.verification === 'NEEDS_UPDATE'
              ? `Bạn sắp trả ${pending.label} về cho nhà cung cấp để bổ sung nội dung. Nhà cung cấp sẽ thấy lý do bạn nhập.`
              : pending.type === 'verification' && pending.verification === 'ARCHIVED'
              ? `Bạn sắp lưu trữ ${pending.label}.`
              : pending.type === 'visibility' && pending.visibility !== 'PUBLISHED'
              ? `Bạn sắp ẨN điểm đến "${pending.label}" khỏi khách du lịch.`
              : pending.type === 'verification'
              ? `Bạn sắp duyệt ${pending.label}. Điểm đến được đánh dấu đã xác minh và nhà cung cấp được báo kết quả.`
              : `Bạn sắp CÔNG KHAI ${pending.label}. Khách du lịch sẽ tìm thấy và xem được điểm đến này ngay.`
          }
          hideReason={!reasonRequired}
          tone={reasonRequired ? 'danger' : 'primary'}
          error={dialogError}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
        />
      )}
    </section>
  );
}
