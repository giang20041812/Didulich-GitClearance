import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Eye, ExternalLink, Home, Mail, Phone, Users } from 'lucide-react';
import {
  adminService,
  type AdminCalendarHomestay,
  type AdminTravelerViews,
  type AdminHomestayViewSummary,
} from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { PageResponse } from '@/types/admin';
import { CompactDateRange, CompactSelect, FilterSearch, RefreshButton, TableFooter, type SelectOption } from './AdminFilters';
import Avatar from './Avatar';

const PAGE_SIZE = 10;
/** Số homestay hiện sẵn trong mỗi thẻ; nhiều hơn thì bấm "Xem thêm". */
const PREVIEW = 5;

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

/** "5 phút trước", "3 giờ trước", "2 ngày trước" — dễ đọc hơn khi xem nhanh. */
function ago(d: string) {
  const minutes = Math.floor((Date.now() - new Date(d).getTime()) / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} ngày trước` : fmtDateTime(d);
}

/**
 * Homestay khách đã xem, gom theo người dùng: mỗi thẻ là một người dùng (người xem gần nhất lên trước) và danh sách
 * homestay người đó đã xem — số lần xem, lần đầu / lần cuối. Bấm tên homestay để chỉ xem những ai đã xem nơi đó.
 */
export default function HomestayViewsPanel() {
  const [keyword, setKeyword] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);

  const [data, setData] = useState<PageResponse<AdminTravelerViews> | null>(null);
  const [summary, setSummary] = useState<AdminHomestayViewSummary | null>(null);
  const [homestays, setHomestays] = useState<AdminCalendarHomestay[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const trimmed = useDebouncedValue(keyword).trim();
  const activeCount = [trimmed, placeId, from || to].filter(Boolean).length;

  useEffect(() => {
    adminService.getCalendarHomestays().then(setHomestays).catch(() => setHomestays([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const params = {
      keyword: trimmed || undefined,
      placeId: placeId ? Number(placeId) : undefined,
      from: from || undefined,
      to: to || undefined,
    };
    try {
      const [list, sum] = await Promise.all([
        adminService.getHomestayViews({ ...params, page, size: PAGE_SIZE }),
        adminService.getHomestayViewSummary(params),
      ]);
      setData(list);
      setSummary(sum);
    } catch (err: unknown) {
      setLoadError(getApiErrorMessage(err, 'Không tải được lịch sử xem homestay. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [trimmed, placeId, from, to, page]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  const clearAll = () => {
    setKeyword('');
    setPlaceId('');
    setFrom('');
    setTo('');
    setPage(0);
  };

  const homestayOptions: SelectOption<string>[] = [
    { value: '', label: 'Tất cả' },
    ...homestays.map((h) => ({ value: String(h.id), label: h.name })),
  ];
  const users = data?.content ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={<Users className="h-4 w-4" />} label="Tài khoản đã xem" value={summary?.travelers} />
        <Stat icon={<Home className="h-4 w-4" />} label="Homestay được xem" value={summary?.homestays} />
        <Stat icon={<Eye className="h-4 w-4" />} label="Tổng lượt xem" value={summary?.totalViews} />
      </div>

      <section className="rounded-lg border border-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <FilterSearch
            value={keyword}
            onChange={(v) => { setKeyword(v); setPage(0); }}
            placeholder="Tìm tài khoản theo tên, email, số điện thoại — hoặc tên homestay..."
          />
          {/* Tên homestay dài làm ô chọn giãn quá khung trên điện thoại: giới hạn theo bề rộng khung, cắt chữ. */}
          <div className="min-w-0 max-w-full sm:max-w-[260px] [&_label]:max-w-full [&_select]:w-full [&_select]:max-w-full [&_select]:truncate">
            <CompactSelect label="Homestay" value={placeId} options={homestayOptions} onChange={(v) => { setPlaceId(v); setPage(0); }} />
          </div>
          <CompactDateRange label="Thời gian" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(0); }} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <RefreshButton loading={loading} onClick={() => { clearAll(); setReload((n) => n + 1); }} />
          </div>
        </div>

        {loadError && (
          <div role="alert" className="border-b border-danger/20 bg-danger/5 px-4 py-2.5 text-xs text-danger">{loadError}</div>
        )}

        <div className={`flex flex-col gap-3 p-4 transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
          {users.map((user) => (
            <UserCard key={user.travelerId} user={user} onPickHomestay={(id) => { setPlaceId(String(id)); setPage(0); }} />
          ))}
          {!loading && users.length === 0 && !loadError && (
            <div className="py-10 text-center text-xs text-muted">
              Chưa có tài khoản nào xem homestay khớp bộ lọc. Lượt xem chỉ được ghi khi khách đã đăng nhập mở trang chi tiết homestay.
            </div>
          )}
        </div>

        <TableFooter
          total={data?.totalElements ?? 0}
          activeCount={activeCount}
          onClear={clearAll}
          page={page}
          totalPages={data?.totalPages ?? 0}
          onPage={setPage}
        />
      </section>
    </div>
  );
}

/** Thẻ một người dùng: thông tin liên hệ + các homestay đã xem (xem gần nhất lên trước). */
function UserCard({ user, onPickHomestay }: { user: AdminTravelerViews; onPickHomestay: (placeId: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? user.homestays : user.homestays.slice(0, PREVIEW);
  const hidden = user.homestays.length - shown.length;

  return (
    <article className="overflow-hidden rounded-lg border border-border">
      <header className="flex flex-wrap items-center gap-3 bg-canvas/60 px-4 py-3">
        <Avatar name={user.name || user.email || 'Khách'} src={user.picture} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-bold text-ink-deep">
            {user.name || 'Tài khoản chưa đặt tên'}
            <span className="ml-1.5 text-[11px] font-medium text-muted">Tài khoản #{user.travelerId}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            {user.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</span>}
            {user.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</span>}
          </div>
        </div>
        <div className="text-right text-[11px] text-muted">
          <div>
            Đã xem <span className="font-bold text-ink-deep">{user.homestays.length}</span> homestay ·{' '}
            <span className="font-bold text-ink-deep">{user.totalViews}</span> lượt
          </div>
          <div>Truy cập gần nhất: <span className="font-semibold text-ink">{ago(user.lastViewedAt)}</span></div>
        </div>
      </header>

      <ul className="divide-y divide-border/70">
        {shown.map((h) => (
          <li key={h.placeId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs hover:bg-canvas/50">
            <Home className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 basis-[200px]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onPickHomestay(h.placeId)}
                  title="Xem những ai đã xem homestay này"
                  className="truncate font-semibold text-ink-deep hover:text-primary hover:underline"
                >
                  {h.placeName}
                </button>
                <a href={`/homestays/${h.placeId}`} target="_blank" rel="noopener noreferrer" title="Mở trang homestay" className="text-muted hover:text-primary">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="text-[11px] text-muted">
                {[h.providerName && `NCC: ${h.providerName}`, h.regionName].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <span className="rounded-md bg-primary-50 px-2 py-0.5 text-[11px] font-bold text-primary">{h.views} lần xem</span>
            <div className="w-[190px] text-[11px] text-muted">
              <div>Lần cuối: <span className="font-semibold text-ink">{fmtDateTime(h.lastViewedAt)}</span></div>
              {h.views > 1 && <div>Lần đầu: {fmtDateTime(h.firstViewedAt)}</div>}
            </div>
          </li>
        ))}
      </ul>

      {user.homestays.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-border py-2 text-[11px] font-semibold text-primary hover:bg-canvas/50"
        >
          {expanded ? 'Thu gọn' : `Xem thêm ${hidden} homestay`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </article>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 shadow-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary">{icon}</span>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
        <div className="text-lg font-black tabular-nums text-ink-deep">{value == null ? '—' : value.toLocaleString('vi-VN')}</div>
      </div>
    </div>
  );
}
