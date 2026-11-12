import { useEffect, type ReactNode } from 'react';
import { animate, motion, MotionConfig, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Building2, CalendarCheck, ChartNoAxesCombined,
  CheckCircle2, ChevronRight, FilePenLine, Inbox, MapPin, MessageSquare, RefreshCw, Undo2, UserX, Users, Wallet,
} from 'lucide-react';
import type { AdminDashboardSummaryDto, BookingStatusSummary } from '@/types/admin';
import type { StatusTone } from './StatusBadge';
import '@/styles/admin-overview.css';

export type OverviewTarget = 'accounts' | 'providers' | 'places' | 'finance' | 'bookings' | 'applications' | 'changes' | 'reviews';

interface OverviewPanelProps {
  data: AdminDashboardSummaryDto | null;
  bookingSummary: BookingStatusSummary | null;
  pendingApplications?: number | null;
  pendingChanges?: number | null;
  canOpen: (target: OverviewTarget) => boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onNavigate: (tab: OverviewTarget) => void;
  reports?: ReactNode;
}

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const formatMoney = (value: number) => vnd.format(value);
const formatNumber = (value: number) => value.toLocaleString('vi-VN');
const pct = (part: number, total: number) => total > 0 ? Math.max(0, Math.min(100, Math.round(part / total * 100))) : 0;
const sectionMotion = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function OverviewPanel({
  data, bookingSummary, pendingApplications, pendingChanges, canOpen, loading, error, onRetry, onNavigate, reports,
}: OverviewPanelProps) {
  const reducedMotion = useReducedMotion();

  if (error && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-white p-10 text-center shadow-sm">
        <AlertTriangle className="h-7 w-7 text-danger" />
        <p className="text-sm text-danger">Không tải được số liệu tổng quan. Vui lòng kiểm tra kết nối máy chủ.</p>
        <button type="button" onClick={onRetry} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600">Thử lại</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div aria-busy="true" aria-label="Đang tải tổng quan" className="flex flex-col gap-5">
        <div className="h-52 animate-pulse rounded-2xl bg-primary/10 motion-reduce:animate-none" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-48 animate-pulse rounded-2xl border border-border bg-white motion-reduce:animate-none" />)}
        </div>
      </div>
    );
  }

  const reviewed = data.totalPlaces - data.unverifiedPlaces;
  const stoppedProviders = data.suspendedProviders + data.terminatedProviders;
  const activeTravelers = data.totalTravelers - data.lockedTravelers;
  const bookingsTotal = bookingSummary ? Object.values(bookingSummary).reduce((a, b) => a + b, 0) : 0;
  const bookingsConfirmed = bookingSummary ? bookingSummary.CONFIRMED + bookingSummary.PAID : 0;
  const bookingsPending = bookingSummary ? bookingSummary.PENDING + bookingSummary.CONFIRMED : 0;
  const attention: { key: string; label: string; count: number; icon: ReactNode; tone: string; target: OverviewTarget }[] = [
    { key: 'applications', label: 'Hồ sơ đăng ký NCC chờ duyệt', count: pendingApplications ?? 0, icon: <Inbox className="h-5 w-5" />, tone: 'text-amber-700 bg-sun/15', target: 'applications' },
    { key: 'unverified', label: 'Điểm đến chờ duyệt', count: data.unverifiedPlaces, icon: <MapPin className="h-5 w-5" />, tone: 'text-amber-700 bg-sun/15', target: 'places' },
    { key: 'changes', label: 'Yêu cầu thay đổi của NCC chờ duyệt', count: pendingChanges ?? 0, icon: <FilePenLine className="h-5 w-5" />, tone: 'text-amber-700 bg-sun/15', target: 'changes' },
    { key: 'bookings', label: 'Đơn chờ xác nhận / chờ thanh toán', count: bookingsPending, icon: <CalendarCheck className="h-5 w-5" />, tone: 'text-primary-700 bg-accent/15', target: 'bookings' },
    { key: 'refunds', label: 'Hoàn tiền chờ duyệt', count: data.pendingRefundsCount, icon: <Undo2 className="h-5 w-5" />, tone: 'text-secondary-700 bg-secondary/10', target: 'finance' },
    { key: 'needsUpdate', label: 'Điểm đến chờ NCC bổ sung', count: data.needsUpdatePlaces, icon: <MessageSquare className="h-5 w-5" />, tone: 'text-amber-700 bg-sun/15', target: 'places' },
    { key: 'suspended', label: 'NCC đang bị đình chỉ', count: data.suspendedProviders, icon: <Building2 className="h-5 w-5" />, tone: 'text-danger bg-danger/10', target: 'providers' },
    { key: 'locked', label: 'Tài khoản khách bị khóa', count: data.lockedTravelers, icon: <UserX className="h-5 w-5" />, tone: 'text-muted bg-canvas', target: 'accounts' },
  ];
  const openItems = attention.filter(a => a.count > 0 && canOpen(a.target));
  const firstItem = openItems[0];
  const monthLabel = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="admin-overview flex min-w-0 flex-col gap-7" initial={reducedMotion ? false : 'hidden'} animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.08 } } }}>
        <motion.section variants={sectionMotion} aria-label="Tình hình hệ thống"
          className="overview-hero relative isolate overflow-hidden p-5 text-white sm:p-8 xl:p-10">
          <HeroLandscape />
          <div aria-hidden className="overview-hero-glow" />
          <div className="relative grid gap-7 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-10">
            <div>
              <p className="overview-eyebrow mb-4">VIETTREK <span aria-hidden>/</span> QUẢN TRỊ</p>
              <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-medium text-white/75">
                <span className="overview-system-pill flex items-center gap-2 rounded-full px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Toàn hệ thống
                </span>
                <span className="capitalize">{monthLabel}</span>
              </div>
              <h2 className="overview-hero-title font-display font-bold tracking-tight text-white">Tình hình vận hành</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75">Theo dõi hoạt động toàn sàn và mở nhanh những mục cần xử lý.</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {firstItem ? (
                  <button type="button" onClick={() => onNavigate(firstItem.target)}
                    className="overview-hero-action group flex min-h-11 items-center gap-3 rounded-xl px-5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary">
                    Mở mục cần xử lý <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                  </button>
                ) : <span className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-5 w-5 text-accent" /> Các mục đang theo dõi đã ổn</span>}
                <span className="text-xs text-white/75">{openItems.length} nhóm cần chú ý</span>
              </div>
            </div>
            <div className="overview-revenue relative overflow-hidden p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white/80">Doanh thu tháng này</p>
                <span className="overview-revenue-icon flex h-10 w-10 items-center justify-center rounded-xl"><Wallet className="h-5 w-5" /></span>
              </div>
              <p className="overview-revenue-value mt-4 break-words font-display font-bold tracking-tight tabular-nums"><AnimatedNumber value={data.monthlyRevenue ?? 0} format={formatMoney} /></p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3 text-xs text-white/75">
                <span>{formatNumber(data.monthlyBookingsCount)} đơn đặt trong tháng</span>
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> +{formatNumber(data.newTravelers7d)} khách / 7 ngày</span>
              </div>
            </div>
          </div>
        </motion.section>

        {error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">Chưa cập nhật được số liệu mới. Các số dưới đây là dữ liệu đã tải trước đó.</p>}

        <motion.section variants={sectionMotion} aria-label="Các chỉ số tổng quan" aria-busy={loading}>
          <SectionHeading number="01" title="Các chỉ số tổng quan" description="Quy mô hệ thống và tình trạng hoạt động hiện tại." />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <KpiCard icon={<MapPin className="h-5 w-5" />} iconTone="bg-primary-50 text-primary" label="Điểm đến toàn sàn" value={data.totalPlaces}
              badge={data.unverifiedPlaces > 0 ? { tone: 'warning', text: `${data.unverifiedPlaces} chờ duyệt` } : { tone: 'success', text: 'Đã duyệt hết' }}
              progress={{ value: pct(reviewed, data.totalPlaces), label: 'Đã kiểm duyệt', bar: 'bg-primary' }}
              onClick={canOpen('places') ? () => onNavigate('places') : undefined} />
            <KpiCard icon={<Building2 className="h-5 w-5" />} iconTone="bg-secondary/10 text-secondary-700" label="Đối tác / NCC" value={data.totalProviders}
              badge={stoppedProviders > 0 ? { tone: 'danger', text: `${stoppedProviders} ngừng hoạt động` } : { tone: 'success', text: 'Tất cả hoạt động' }}
              progress={{ value: pct(data.activeProviders, data.totalProviders), label: 'Đang hoạt động', bar: 'bg-secondary' }}
              onClick={canOpen('providers') ? () => onNavigate('providers') : undefined} />
            <KpiCard icon={<Users className="h-5 w-5" />} iconTone="bg-accent/10 text-primary-700" label="Khách du lịch" value={data.totalTravelers}
              badge={data.newTravelers7d > 0 ? { tone: 'success', text: `+${data.newTravelers7d} trong 7 ngày`, up: true } : { tone: 'neutral', text: `+${data.newTravelers30d} trong 30 ngày` }}
              progress={{ value: pct(activeTravelers, data.totalTravelers), label: 'Đang hoạt động', bar: 'bg-accent' }}
              onClick={canOpen('accounts') ? () => onNavigate('accounts') : undefined} />
            <KpiCard icon={<CalendarCheck className="h-5 w-5" />} iconTone="bg-sun/15 text-amber-700" label="Đặt phòng tháng này" value={data.monthlyBookingsCount}
              badge={bookingsPending > 0 ? { tone: 'warning', text: `${bookingsPending} đơn chờ xử lý` } : { tone: 'neutral', text: 'Không có đơn chờ xử lý' }}
              progress={bookingSummary ? { value: pct(bookingsConfirmed, bookingsTotal), label: `Xác nhận toàn sàn · ${bookingsConfirmed}/${bookingsTotal}`, bar: 'bg-sun' } : null}
              onClick={canOpen('bookings') ? () => onNavigate('bookings') : undefined} />
          </div>
        </motion.section>

        <motion.section variants={sectionMotion} aria-label="Cần xử lý" className="overview-queue overflow-hidden border bg-white">
          <header className="overview-queue-header flex items-start justify-between gap-3 border-b p-4 sm:p-6">
            <SectionHeading number="02" title="Cần xử lý & theo dõi" description="Chọn một nhóm để mở danh sách tương ứng." />
            <button type="button" onClick={onRetry} disabled={loading} aria-label="Tải lại số liệu"
              className="overview-refresh flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-primary transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            </button>
          </header>
          <div className="overview-queue-summary flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted sm:px-6">
            <span><strong className="text-ink-deep">{openItems.length} nhóm</strong> có nội dung cần chú ý</span>
            <span role="status">{loading ? 'Đang cập nhật số liệu...' : 'Hiển thị theo quyền quản trị của bạn'}</span>
          </div>
          {openItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary"><CheckCircle2 className="h-6 w-6" /></span>
              <p className="text-sm font-semibold text-ink-deep">Không có việc tồn đọng</p>
              <p className="text-xs text-muted">Những mục bạn được theo dõi hiện không có nội dung cần chú ý.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
              {openItems.map(a => (
                <li key={a.key}>
                  <button type="button" onClick={() => onNavigate(a.target)}
                    className="overview-task group block h-full w-full rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transform-none">
                    <span className="flex w-full items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.tone}`}>{a.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-2xl font-bold leading-none tabular-nums text-ink-deep"><AnimatedNumber value={a.count} /></span>
                        <span className="mt-2 block text-xs leading-relaxed text-muted">{a.label}</span>
                      </span>
                      <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {reports && (
          <motion.section variants={sectionMotion} aria-label="Báo cáo đặt phòng" className="admin-overview-reports flex min-w-0 flex-col gap-4">
            <SectionHeading number="03" title="Báo cáo đặt phòng" description="Lọc theo kỳ, nhà cung cấp và nhóm đơn. Chọn số liệu hoặc cột biểu đồ để xem các đơn liên quan." icon={<ChartNoAxesCombined className="h-4 w-4" />} />
            {reports}
          </motion.section>
        )}
      </motion.div>
    </MotionConfig>
  );
}

function HeroLandscape() {
  const reducedMotion = useReducedMotion();
  return (
    <svg className="overview-landscape" viewBox="0 0 1000 420" fill="none" aria-hidden="true" focusable="false">
      <circle cx="805" cy="92" r="62" stroke="currentColor" strokeWidth="0.7" />
      <circle cx="805" cy="92" r="75" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 9" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <motion.path key={i} transform={`translate(0 ${i * 19})`}
          d="M-40 252C100 305 194 171 325 196S508 291 617 213 797 149 1040 212"
          stroke="currentColor" strokeWidth={i === 0 ? '1.2' : '0.7'}
          initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 - i * 0.075 }}
          transition={{ duration: reducedMotion ? 0 : 1.4, delay: reducedMotion ? 0 : i * 0.06, ease: 'easeOut' }} />
      ))}
      <path d="M630 173 689 111 746 177M666 137l23-26 23 27" stroke="currentColor" strokeWidth="0.7" />
    </svg>
  );
}

function SectionHeading({ number, title, description, icon }: { number: string; title: string; description: string; icon?: ReactNode }) {
  return (
    <div className="overview-section-heading flex min-w-0 items-start gap-3">
      <span className="overview-section-number flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xs font-bold">{icon ?? number}</span>
      <div className="min-w-0"><h3 className="font-display text-base font-bold text-ink-deep">{title}</h3><p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p></div>
    </div>
  );
}

function AnimatedNumber({ value, format = formatNumber }: { value: number; format?: (value: number) => string }) {
  const reducedMotion = useReducedMotion();
  const amount = useMotionValue(reducedMotion ? value : 0);
  const display = useTransform(amount, latest => format(Math.round(latest)));
  useEffect(() => {
    if (reducedMotion) { amount.set(value); return; }
    const controls = animate(amount, value, { duration: 0.7, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [amount, value, reducedMotion]);
  return <span aria-label={format(value)}><motion.span aria-hidden>{display}</motion.span></span>;
}

const BADGE_TONE: Record<StatusTone, string> = {
  success: 'bg-accent/10 text-primary-700', warning: 'bg-sun/15 text-amber-700', danger: 'bg-danger/10 text-danger',
  info: 'bg-secondary/10 text-secondary-700', brand: 'bg-primary-50 text-primary', neutral: 'bg-canvas text-muted',
};

function KpiCard({ icon, iconTone, label, value, badge, progress, onClick }: {
  icon: ReactNode; iconTone: string; label: string; value: number;
  badge: { tone: StatusTone; text: string; up?: boolean };
  progress: { value: number; label: string; bar: string } | null;
  onClick?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const body = (
    <div className="flex h-full w-full flex-col">
      <div className="flex w-full items-start justify-between gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${iconTone}`}>{icon}</span>
        {onClick && <ArrowUpRight className="h-4 w-4 text-muted/60 transition-colors group-hover:text-primary" />}
      </div>
      <span className="mt-3 text-xs font-semibold leading-relaxed text-muted">{label}</span>
      <span className="overview-kpi-value mt-1 font-display text-3xl font-bold tabular-nums tracking-tight text-ink-deep"><AnimatedNumber value={value} /></span>
      <span className={`mt-2 inline-flex w-fit max-w-full items-start gap-0.5 rounded-md px-2 py-1 text-[11px] font-semibold leading-snug ${BADGE_TONE[badge.tone]}`}>
        {badge.up && <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />}{badge.text}
      </span>
      {progress ? (
        <div className="mt-auto w-full pt-4">
          <div className="overview-kpi-progress h-1.5 w-full overflow-hidden rounded-full bg-canvas">
            <motion.div className={`h-full rounded-full ${progress.bar}`} initial={reducedMotion ? false : { width: 0 }}
              animate={{ width: `${progress.value}%` }} transition={{ duration: reducedMotion ? 0 : 0.8, ease: 'easeOut' }} />
          </div>
          <div className="mt-2 flex w-full items-start justify-between gap-2 text-[11px] text-muted">
            <span className="min-w-0 leading-snug">{progress.label}</span><strong className="shrink-0 tabular-nums text-ink">{progress.value}%</strong>
          </div>
        </div>
      ) : <div className="min-h-10" />}
    </div>
  );
  const base = 'overview-kpi group relative isolate block h-full min-w-0 w-full overflow-hidden border bg-white p-4 text-left sm:p-5';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transform-none`}>{body}</button>
  ) : <div className={base}>{body}</div>;
}
