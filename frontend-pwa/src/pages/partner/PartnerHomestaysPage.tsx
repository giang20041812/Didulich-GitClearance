import { useCallback, useEffect, useState } from 'react';
import { peekPartnerStale, primePartner } from '@/lib/partnerCache';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Home,
  MapPin,
  Pencil,
  Plus,
  Search,
  QrCode,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { fetchPartnerHomestays, updateHomestayStatus, homestayError } from '@/services/partnerHomestayService';
import { isSubmittedChange } from '@/services/changeRequestService';
import type {
  PartnerHomestayPageResponse,
  PartnerHomestaySummaryDto,
  PartnerHomestayStatsDto,
  PlaceVisibility,
} from '@/types/partner';
import { Alert, EmptyState, PageHeader, PendingTag, Tabs } from '@/components/partner/PartnerUI';
import { usePendingChanges } from '@/hooks/usePendingChanges';
import { pendingWhat } from '@/lib/pendingChanges';
import type { ChangeRequestSummary } from '@/types/changeRequest';
import { ui, vnd } from '@/lib/partnerUi';

const EMPTY_STATS: PartnerHomestayStatsDto = {
  totalCount: 0,
  publishedCount: 0,
  draftCount: 0,
  unpublishedCount: 0,
  operatingCount: 0,
  tempClosedCount: 0,
};

type VisibilityTab = PlaceVisibility | 'ALL';
type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

const FULL_LIST_KEY = 'homestays-full';
/** queryKey lúc mở trang: từ khóa rỗng, tab Tất cả, chưa tải lại lần nào. */
const DEFAULT_QUERY_KEY = '|ALL|0';

/** Trang chủ quản lý cơ sở lưu trú của NCC: thống kê, lọc và danh sách Homestay. */
export default function PartnerHomestaysPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Mở lại trang (bộ lọc mặc định): hiện ngay danh sách lần trước trong tab, rồi làm mới ngầm.
  const [cached] = useState(() => peekPartnerStale<PartnerHomestayPageResponse>(FULL_LIST_KEY));
  const [homestays, setHomestays] = useState<PartnerHomestaySummaryDto[]>(cached?.homestays ?? []);
  const [stats, setStats] = useState<PartnerHomestayStatsDto>(cached?.stats ?? EMPTY_STATS);
  const [result, setResult] = useState<{ key: string; ok: boolean }>({ key: cached ? DEFAULT_QUERY_KEY : '', ok: true });
  const [reloadTick, setReloadTick] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [keyword, setKeyword] = useState('');
  const [visibility, setVisibility] = useState<VisibilityTab>('ALL');
  const [notice, setNotice] = useState<Notice>(() => {
    const state: unknown = location.state;
    if (typeof state === 'object' && state !== null && 'notice' in state && typeof state.notice === 'string') {
      return { tone: 'info', text: state.notice };
    }
    return null;
  });

  const debouncedKeyword = useDebouncedValue(keyword);
  const pending = usePendingChanges(reloadTick);

  // Đang tải = kết quả hiện có chưa ứng với bộ lọc hiện tại (tính khi render, không setState trong effect).
  const queryKey = `${debouncedKeyword}|${visibility}|${reloadTick}`;
  const isLoading = result.key !== queryKey;
  const loadError = !isLoading && !result.ok;
  const load = useCallback(() => setReloadTick((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    fetchPartnerHomestays(debouncedKeyword, visibility === 'ALL' ? undefined : visibility, undefined)
      .then((res) => {
        if (!active) return;
        setHomestays(res.homestays);
        setStats(res.stats);
        setResult({ key: queryKey, ok: true });
        if (!debouncedKeyword && visibility === 'ALL') primePartner(FULL_LIST_KEY, res);
      })
      .catch(() => { if (active) setResult({ key: queryKey, ok: false }); });
    return () => { active = false; };
  }, [debouncedKeyword, visibility, queryKey]);

  const handleToggleVisibility = async (homestay: PartnerHomestaySummaryDto) => {
    const next: PlaceVisibility = homestay.visibility === 'PUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED';
    setBusyId(homestay.id);
    setNotice(null);
    try {
      const result = await updateHomestayStatus(homestay.id, { visibility: next });
      load();
      // UC-NCC-02: xuất bản lần đầu được gửi cho Admin duyệt; chưa tự động nhận Booking.
      setNotice(isSubmittedChange(result)
        ? { tone: 'info', text: `“${homestay.name}”: ${result.message}` }
        : { tone: 'success', text: next === 'PUBLISHED' ? `Đã xuất bản “${homestay.name}”.` : `Đã ngừng hiển thị “${homestay.name}”.` });
    } catch (error) {
      setNotice({ tone: 'error', text: homestayError(error) });
    } finally {
      setBusyId(null);
    }
  };

  const filtersActive = Boolean(keyword || visibility !== 'ALL');
  const clearFilters = () => { setKeyword(''); setVisibility('ALL'); };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Bảng điều khiển', to: '/partner/overview' }, { label: 'Cơ sở lưu trú' }]}
        title="Homestay của tôi"
        description="Chọn một Homestay để cập nhật thông tin, phòng, giá và lịch đón khách."
        actions={<Link to="/partner/homestay/create" className={ui.btnCoral}><Plus className="h-4 w-4" />Đăng Homestay mới</Link>} />

      {notice && (
        <Alert tone={notice.tone} action={<button type="button" aria-label="Đóng thông báo" className="opacity-60 transition-opacity duration-200 hover:opacity-100" onClick={() => setNotice(null)}><X className="h-4 w-4" /></button>}>
          {notice.text}
        </Alert>
      )}

      {/* Removed StatCards block as requested */}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <label className="relative flex-1">
            <span className="sr-only">Tìm Homestay</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className={`${ui.input} pl-9 border-border bg-canvas`} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tìm theo tên, địa chỉ..." />
          </label>
        </div>
        <Tabs<VisibilityTab> value={visibility} onChange={setVisibility} tabs={[
          { id: 'ALL', label: 'Tất cả', badge: stats.totalCount },
          { id: 'PUBLISHED', label: 'Đang hiển thị', badge: stats.publishedCount },
          { id: 'DRAFT', label: 'Bản nháp', badge: stats.draftCount },
          { id: 'UNPUBLISHED', label: 'Ngừng hiển thị', badge: stats.unpublishedCount },
        ]} />
      </div>

      {isLoading ? (
        <div role="status" className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <span className="sr-only">Đang tải danh sách Homestay...</span>
          {[0, 1, 2].map((item) => (
            <div key={item} aria-hidden="true" className="overflow-hidden rounded-lg border border-primary/10 bg-surface">
              <div className="h-44 animate-pulse bg-primary/10" />
              <div className="space-y-3 p-5"><div className="h-5 w-2/3 animate-pulse rounded-sm bg-primary/10" /><div className="h-3 w-full animate-pulse rounded-sm bg-primary/5" /><div className="h-10 animate-pulse rounded-md bg-primary/5" /></div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <Alert tone="error" action={<button type="button" onClick={() => void load()} className={ui.btnGhost}>Thử lại</button>}>
          Không tải được danh sách. Vui lòng kiểm tra kết nối và thử lại.
        </Alert>
      ) : homestays.length === 0 ? (
        <EmptyState icon={Home}
          title={filtersActive ? 'Không có Homestay khớp bộ lọc' : 'Chưa có Homestay nào'}
          description={filtersActive ? 'Thử đổi từ khóa hoặc bỏ bớt bộ lọc.' : 'Đăng Homestay chỉ 4 bước: thông tin, ảnh, phòng & giá, gửi duyệt — xong trong khoảng 5 phút.'}
          action={filtersActive
            ? <button type="button" onClick={clearFilters} className={ui.btnOutline}>Xóa bộ lọc</button>
            : <Link to="/partner/homestay/create" className={ui.btnCoral}><Plus className="h-4 w-4" />Đăng Homestay đầu tiên</Link>} />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {homestays.map((homestay) => (
            <HomestayCard
              key={homestay.id}
              homestay={homestay}
              pending={pending.ofPlace(homestay.id)}
              busy={busyId === homestay.id}
              onToggle={() => void handleToggleVisibility(homestay)}
              onNavigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}



function HomestayCard({ homestay, pending, busy, onToggle, onNavigate }: {
  homestay: PartnerHomestaySummaryDto;
  /** Thay đổi đang chờ quản trị viên duyệt của Homestay này (xuất bản, loại phòng, giá...). */
  pending: ChangeRequestSummary[];
  busy: boolean;
  onToggle: () => void;
  onNavigate: (to: string) => void;
}) {
  const published = homestay.visibility === 'PUBLISHED';
  const draft = homestay.visibility === 'DRAFT';
  const operating = homestay.operationStatus === 'OPERATING';
  const pendingPublish = homestay.pendingPublish || pending.some((r) => r.operation === 'PUBLISH');
  const pendingCount = Math.max(pending.length, pendingPublish ? 1 : 0);
  const pendingLines = pending.length ? pending.map(pendingWhat) : pendingPublish ? ['Xuất bản Homestay'] : [];
  const canToggle = published || (homestay.isReadyToPublish && !pendingPublish);
  const needsWork = !published && !homestay.isReadyToPublish;
  const editUrl = `/partner/homestay/${homestay.id}/edit`;
  const priceText = homestay.priceRefMin == null
    ? 'Chưa có giá'
    : homestay.priceRefMax != null && homestay.priceRefMax > homestay.priceRefMin
      ? `${vnd(homestay.priceRefMin)} – ${vnd(homestay.priceRefMax)}`
      : vnd(homestay.priceRefMin);

  return (
    <article className={`group flex flex-col overflow-hidden rounded-lg border border-border bg-surface`}>
      <button type="button" onClick={() => onNavigate(editUrl)} className="relative h-44 w-full overflow-hidden bg-canvas text-left" aria-label={`Mở ${homestay.name}`}>
        <span className="absolute inset-0 flex items-center justify-center text-muted/30"><Home className="h-12 w-12" /></span>
        {homestay.coverImageUrl && (
          <img src={homestay.coverImageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }}
            className="relative h-full w-full object-cover" />
        )}
        <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-deep/50 to-transparent" />
        <span className="absolute left-2.5 top-2.5 flex gap-1.5">
          <span className={`rounded-md border bg-surface/90 px-2 py-1 text-[10px] font-bold backdrop-blur-sm ${published ? 'border-primary/40 text-primary-700' : draft ? 'border-sun/50 text-sun-700' : 'border-border text-muted'}`}>
            {published ? 'Đang hiển thị' : draft ? 'Bản nháp' : 'Ngừng hiển thị'}
          </span>
          {pendingCount > 0 && <PendingTag count={pendingCount} detail={pendingLines} />}
          {!operating && <span className="flex items-center gap-1 rounded-md border border-danger/40 bg-surface/90 px-2 py-1 text-[10px] font-bold text-danger backdrop-blur-sm"><AlertTriangle className="h-3 w-3" />Tạm đóng cửa</span>}
        </span>
        <span className="absolute bottom-2.5 left-3 right-3 truncate text-xs font-semibold text-white">{homestay.code}</span>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-base font-bold text-ink-deep">{homestay.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin className="h-3.5 w-3.5 shrink-0 text-coral/80" /><span className="line-clamp-1">{homestay.address || 'Chưa có địa chỉ'}</span></p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-canvas p-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-ink"><BedDouble className="h-4 w-4 text-primary/80" />{homestay.roomTypesCount} loại phòng</span>
          <span className="truncate text-right font-bold text-ink-deep">{priceText}</span>
        </div>

        {pendingLines.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border-2 border-sun bg-sun-light/60 p-2.5 text-xs text-ink-deep">
            <p className="flex items-center gap-1.5 font-black text-amber-800"><Clock className="h-3.5 w-3.5" />Đang chờ quản trị viên duyệt</p>
            <ul className="flex flex-col gap-0.5 pl-5">
              {pendingLines.slice(0, 3).map((line, i) => <li key={i} className="list-disc line-clamp-1">{line}</li>)}
              {pendingLines.length > 3 && <li className="list-none text-muted">và {pendingLines.length - 3} thay đổi khác</li>}
            </ul>
          </div>
        )}

        {homestay.alertNote && !(pendingPublish && homestay.alertNote === 'Homestay đang chờ duyệt') && (
          <p className={`flex items-start gap-2 rounded-md border bg-surface p-2 text-[11px] leading-tight text-ink-deep ${needsWork ? 'border-sun/50' : 'border-secondary/40'}`}>
            <AlertTriangle className={`mt-0.5 h-3 w-3 shrink-0 ${needsWork ? 'text-sun-600' : 'text-secondary-600'}`} />
            <span className="line-clamp-2">{homestay.alertNote}</span>
          </p>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span className="truncate">Cập nhật {homestay.lastUpdatedText}</span>
          <span className={`flex items-center gap-1 rounded border bg-surface px-1.5 py-0.5 text-[10px] font-semibold ${homestay.auditStatus === 'STANDARD' ? 'border-primary/30 text-primary-700' : homestay.auditStatus === 'MAINTENANCE' ? 'border-danger/30 text-danger-600' : 'border-sun/40 text-sun-700'}`}>
            {homestay.auditStatus === 'STANDARD' && <ShieldCheck className="h-3 w-3" />}
            {homestay.auditStatus === 'MAINTENANCE' && <Wrench className="h-3 w-3" />}
            {homestay.auditStatus === 'NEEDS_DATA' && <Clock className="h-3 w-3" />}
            {homestay.auditStatusText}
          </span>
        </div>

        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2">
            {needsWork ? (
              <button type="button" onClick={() => onNavigate(editUrl)} className="col-span-2 flex items-center justify-center gap-1.5 rounded-md bg-coral/90 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-coral"><Pencil className="h-3.5 w-3.5" />Hoàn thiện để xuất bản</button>
            ) : (
              <>
                <button type="button" onClick={() => onNavigate(editUrl)} className="flex items-center justify-center gap-1.5 rounded-md bg-primary/90 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-primary"><Pencil className="h-3.5 w-3.5" />Sửa thông tin</button>
                <button type="button" onClick={() => onNavigate(`/partner/homestay/${homestay.id}/rooms`)} className="flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary-700 hover:bg-primary/10"><BedDouble className="h-3.5 w-3.5" />Phòng & lịch</button>
              </>
            )}
          </div>
          <button type="button" onClick={() => onNavigate(`/in-ma-qr/${homestay.id}`)}
            className="flex items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-primary/40 px-3 py-2 text-xs font-bold text-primary-700 hover:border-primary hover:bg-primary/5">
            <QrCode className="h-4 w-4" />In mã QR nhận phòng
          </button>
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
            {needsWork
              ? <button type="button" onClick={() => onNavigate(`/partner/homestay/${homestay.id}/rooms`)} className="flex items-center gap-1 text-primary-700 hover:underline"><BedDouble className="h-3.5 w-3.5" />Phòng & lịch</button>
              : <span className="flex items-center gap-1 text-ink-deep">{operating && <><CheckCircle2 className="h-3.5 w-3.5 text-accent-600" />Đang nhận khách</>}</span>}
            {canToggle && (
              <button type="button" disabled={busy} onClick={onToggle} className="flex items-center gap-1 text-muted hover:text-ink">
                {published ? <><EyeOff className="h-3.5 w-3.5" />{busy ? 'Đang xử lý...' : 'Ngừng hiển thị'}</> : <><Eye className="h-3.5 w-3.5 text-primary/80" />{busy ? 'Đang xử lý...' : 'Gửi duyệt xuất bản'}</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
