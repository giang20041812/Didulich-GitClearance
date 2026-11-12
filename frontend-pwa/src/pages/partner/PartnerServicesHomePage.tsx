import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Inbox, MapPinned, Package, Plus, Route as RouteIcon } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiError';
import { portalServiceType } from '@/lib/partnerServiceType';
import { partnerTheme } from '@/lib/partnerTheme';
import { ExperienceCard, RouteRow } from '@/components/partner/ServiceListingViews';
import { comboPartnerApi, listingApi, nearbyPartnerApi, type ListingRow } from '@/services/portalServicesApi';
import type { ComboRow } from '@/types/combo';
import type { PartnerOffers } from '@/types/nearby';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

interface Summary {
  listings: ListingRow[];
  combos: ComboRow[];
  offers: PartnerOffers;
}

function useSummary() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.all([listingApi.list(), comboPartnerApi.list(), nearbyPartnerApi.list()])
      .then(([listings, combos, offers]) => { if (alive) setData({ listings: listings.content, combos: combos.content, offers }); })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được tổng quan.')); });
    return () => { alive = false; };
  }, []);
  return { data, error };
}

function counts(data: Summary) {
  const live = data.listings.filter((r) => r.place.approvalStatus === 'APPROVED' && r.place.visible);
  return {
    live,
    pending: data.listings.filter((r) => r.place.approvalStatus === 'PENDING' || r.place.pendingEdit).length,
    rejected: data.listings.filter((r) => r.place.approvalStatus === 'REJECTED'),
    newRequests: data.combos.reduce((s, c) => s + c.newRequests, 0),
    liveCombos: data.combos.filter((c) => c.publiclyVisible).length,
    liveOffers: data.offers.places.filter((o) => o.configured && o.enabled && o.eligible && !o.hiddenByAdmin).length,
  };
}

/** Trang đầu của cổng đối tác cho nhà xe (bảng điều hành) và nhà cung cấp trải nghiệm — mọi con số lấy từ máy chủ. */
export default function PartnerServicesHomePage() {
  const type = portalServiceType();
  const { data, error } = useSummary();
  if (error) return <p role="alert" className="m-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
  if (!data) return <ListSkeleton className="m-4" rows={4} />;
  return type === 'TRANSPORT' ? <TransportBoard data={data} /> : <ExperienceHome data={data} />;
}

/** Nhà xe: bảng điều hành — dải chỉ số, bảng tuyến đang chạy, việc cần làm. */
function TransportBoard({ data }: { data: Summary }) {
  const theme = partnerTheme('TRANSPORT');
  const c = counts(data);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4">
      <section className="relative overflow-hidden rounded-xl bg-primary p-5 text-white sm:p-6">
        <img src={theme.image} alt="" aria-hidden width={120} height={120} className="pointer-events-none absolute -bottom-3 right-3 h-24 w-24 object-contain opacity-90 sm:h-32 sm:w-32" />
        <p className="text-xs font-bold uppercase tracking-wider text-white/70">Bảng điều hành nhà xe</p>
        <h1 className="mt-1 text-xl font-extrabold !text-white sm:text-2xl">Tuyến xe hôm nay</h1>
        <p className="mt-1 max-w-md text-sm text-white/80">{theme.tagline}. Tuyến mới và thay đổi giá cần quản trị viên duyệt.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/partner/listings?moi=1" className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-white px-4 text-sm font-bold text-primary hover:bg-primary-50">
            <Plus className="h-4 w-4" /> Thêm tuyến xe
          </Link>
          <Link to="/partner/combos?moi=1" className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-white/40 px-4 text-sm font-semibold text-white hover:bg-white/10">
            <Package className="h-4 w-4" /> Tạo combo
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Chỉ số">
        <Kpi label="Tuyến đang chạy" value={c.live.length} to="/partner/listings" />
        <Kpi label="Chờ duyệt" value={c.pending} to="/partner/listings" tone={c.pending ? 'warn' : undefined} />
        <Kpi label="Yêu cầu đặt combo mới" value={c.newRequests} to="/partner/combos?tab=yeu-cau" tone={c.newRequests ? 'hot' : undefined} />
        <Kpi label="Gợi ý quanh đây đang bật" value={c.liveOffers} to="/partner/nearby" />
      </section>

      <section>
        <SectionHead title="Tuyến đang chạy" to="/partner/listings" link="Tất cả tuyến" />
        {c.live.length === 0 ? (
          <Empty text="Chưa có tuyến nào hiển thị với khách. Thêm tuyến xe, quản trị viên duyệt xong là khách thấy ở trang Di chuyển." />
        ) : (
          <ul className="flex flex-col gap-3">{c.live.slice(0, 4).map((row) => <RouteRow key={row.place.id} row={row} />)}</ul>
        )}
      </section>

      <Todo data={data} rejected={c.rejected} newRequests={c.newRequests} />
    </div>
  );
}

/** Trải nghiệm: lời chào ấm, thẻ trải nghiệm, cột việc cần làm bên cạnh. */
function ExperienceHome({ data }: { data: Summary }) {
  const theme = partnerTheme('EXPERIENCE');
  const c = counts(data);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4">
      <section className="flex flex-col gap-4 rounded-xl border border-primary-100 bg-primary-50 p-5 sm:flex-row sm:items-center sm:p-6">
        <img src={theme.image} alt="" aria-hidden width={96} height={96} className="h-20 w-20 shrink-0 object-contain sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold text-ink-deep sm:text-2xl">Trải nghiệm của bạn</h1>
          <p className="mt-1 text-sm text-ink">{theme.tagline}. Trải nghiệm đã duyệt hiện ở trang Văn hóa (mục Trải nghiệm bản địa).</p>
          <p className="mt-2 text-xs text-muted">
            {c.live.length} trải nghiệm đang hiển thị · {c.liveCombos} combo khách đang thấy · {c.liveOffers} gợi ý quanh đây đang bật
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          <Link to="/partner/listings?moi=1" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-white hover:bg-primary-600">
            <Plus className="h-4 w-4" /> Thêm trải nghiệm
          </Link>
          <Link to="/partner/combos?moi=1" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-primary-200 bg-white px-4 text-sm font-semibold text-primary hover:bg-primary-100">
            <Package className="h-4 w-4" /> Tạo combo
          </Link>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <section>
          <SectionHead title="Trải nghiệm đang mở" to="/partner/listings" link="Tất cả trải nghiệm" />
          {c.live.length === 0 ? (
            <Empty text="Chưa có trải nghiệm nào hiển thị với khách. Thêm trải nghiệm đầu tiên — quản trị viên duyệt xong là khách thấy." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">{c.live.slice(0, 4).map((row) => <ExperienceCard key={row.place.id} row={row} />)}</ul>
          )}
        </section>
        <Todo data={data} rejected={c.rejected} newRequests={c.newRequests} compact />
      </div>
    </div>
  );
}

function Kpi({ label, value, to, tone }: { label: string; value: number; to: string; tone?: 'warn' | 'hot' }) {
  return (
    <Link to={to} className={`rounded-lg border bg-white p-3 transition-colors hover:border-primary/40 ${tone === 'hot' ? 'border-primary/50' : 'border-border'}`}>
      <p className={`text-2xl font-extrabold tabular-nums ${tone === 'warn' ? 'text-amber-700' : tone === 'hot' ? 'text-primary' : 'text-ink-deep'}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Link>
  );
}

function SectionHead({ title, to, link }: { title: string; to: string; link: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-base font-bold text-ink-deep">{title}</h2>
      <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{link} <ArrowRight className="h-3.5 w-3.5" /></Link>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border bg-white p-5 text-sm text-muted">{text}</p>;
}

/** Việc cần làm: dịch vụ bị từ chối, yêu cầu đặt combo mới, địa điểm chưa bật gợi ý quanh đây. */
function Todo({ data, rejected, newRequests, compact = false }: { data: Summary; rejected: ListingRow[]; newRequests: number; compact?: boolean }) {
  const offOffers = data.offers.places.filter((o) => o.eligible && !(o.configured && o.enabled)).length;
  const items: { icon: ReactNode; text: string; to: string }[] = [];
  if (newRequests) items.push({ icon: <Inbox className="h-4 w-4" />, text: `${newRequests} yêu cầu đặt combo đang chờ bạn gọi lại`, to: '/partner/combos?tab=yeu-cau' });
  for (const r of rejected) items.push({ icon: <AlertCircle className="h-4 w-4" />, text: `"${r.place.name}" bị từ chối — sửa và gửi lại`, to: '/partner/listings' });
  if (offOffers) items.push({ icon: <MapPinned className="h-4 w-4" />, text: `${offOffers} địa điểm chưa bật gợi ý quanh đây`, to: '/partner/nearby' });
  if (data.listings.length === 0) items.push({ icon: <RouteIcon className="h-4 w-4" />, text: 'Đăng dịch vụ đầu tiên của bạn', to: '/partner/listings?moi=1' });
  return (
    <section className={compact ? 'lg:pt-0' : ''}>
      <h2 className="mb-2 text-base font-bold text-ink-deep">Việc cần làm</h2>
      {items.length === 0 ? (
        <Empty text="Không có việc nào đang chờ." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
          {items.map((item) => (
            <li key={item.text}>
              <Link to={item.to} className="flex items-center gap-3 px-3 py-3 text-sm text-ink hover:bg-primary-50">
                <span className="text-primary">{item.icon}</span>
                <span className="flex-1">{item.text}</span>
                <ArrowRight className="h-4 w-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
