import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { LogoMark, BRAND_NAME } from '@/components/ui/logo';
import { PROVIDER_SERVICES, providerServiceByType } from '@/components/layout/providerServices';
import type { ProviderServiceType } from '@/types/partner';

/** Quyền lợi sau khi được duyệt — chỉ liệt kê việc hệ thống thật sự làm được cho từng loại hình. */
const AFTER_APPROVAL: Record<ProviderServiceType, string[]> = {
  HOMESTAY: [
    'Đăng homestay, loại phòng, giá và lịch phòng trống',
    'Nhận đơn đặt phòng và thông báo trên điện thoại',
    'Ghép combo cùng nhà xe, trải nghiệm trên hệ thống',
    'Bật gợi ý cho khách đang ở gần điểm nổi tiếng',
  ],
  TRANSPORT: [
    'Đăng tuyến xe, giờ chạy, loại xe, giá vé — hiện ở trang Di chuyển',
    'Tạo combo có tuyến xe của bạn, nhận yêu cầu đặt',
    'Bật gợi ý cho khách đang ở gần điểm nổi tiếng',
  ],
  EXPERIENCE: [
    'Đăng trải nghiệm: thời lượng, số khách, ngôn ngữ, giá — hiện ở trang Văn hóa',
    'Tạo combo cùng homestay và nhà xe, nhận yêu cầu đặt',
    'Bật gợi ý cho khách đang ở gần điểm nổi tiếng',
  ],
};

export const REGISTER_STEPS = ['Chọn loại hình', 'Người đại diện', 'Thông tin cơ sở', 'Xem lại & gửi'];

/**
 * Khung trang đăng ký nhà cung cấp: thanh trên cùng, cột giới thiệu theo loại hình (máy tính) / đầu trang gọn có thanh tiến
 * trình (điện thoại) và vùng nội dung. Màu chủ đạo đổi theo loại hình qua data-partner-type (globals.css).
 */
export default function RegisterShell({ type, step, title, subtitle, children, footer }: {
  type: ProviderServiceType | null;
  /** Chỉ số bước trong REGISTER_STEPS; null = không thuộc luồng đăng ký (tra cứu, đã gửi). */
  step: number | null;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const service = type ? providerServiceByType(type) : null;
  const navigate = useNavigate();
  return (
    <div data-partner-type={type ?? 'NONE'} className="min-h-dvh bg-canvas font-body text-ink">
      <header className="border-b border-border bg-white pt-[var(--safe-top)]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2" aria-label={`${BRAND_NAME} — Trang chủ`}>
            <LogoMark size={32} />
            <span className="hidden text-base font-black text-ink-deep sm:inline">{BRAND_NAME}</span>
          </Link>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <span className="text-sm font-semibold text-muted">Đăng ký đối tác</span>
          <Link
            to="/"
            onClick={(e) => {
              if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
                e.preventDefault();
                navigate(-1);
              }
            }}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Quay về</span>
          </Link>
          <Link to="/portal/login" className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white">Đăng nhập</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-[calc(2.5rem+var(--safe-bottom))] pt-5 sm:px-6 lg:grid-cols-[340px_1fr] lg:gap-10 lg:pt-10">
        {/* Cột giới thiệu (máy tính) */}
        <aside className="hidden lg:block">
          <div className="sticky top-8 space-y-6">
            {service ? (
              <>
                <img src={service.image} alt="" aria-hidden width={112} height={112} className="h-28 w-28 object-contain" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">Đối tác {service.label.toLowerCase()}</p>
                  <p className="mt-1 text-2xl font-extrabold leading-tight text-ink-deep">Trở thành đối tác {service.label}</p>
                  <p className="mt-2 text-sm text-muted">{service.description}</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex -space-x-4">
                  {PROVIDER_SERVICES.map((o) => <img key={o.type} src={o.image} alt="" aria-hidden width={72} height={72} className="h-[72px] w-[72px] object-contain" />)}
                </div>
                <p className="text-2xl font-extrabold leading-tight text-ink-deep">Cùng {BRAND_NAME} đón khách tới vùng cao</p>
              </>
            )}
            {step !== null && <StepList current={step} />}
            {type && (
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Sau khi được duyệt</p>
                <ul className="mt-2 space-y-2 text-sm text-ink">
                  {AFTER_APPROVAL[type].map((t) => (
                    <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0">
          {/* Đầu trang gọn (điện thoại / máy tính bảng) */}
          {step !== null && (
            <div className="mb-4 lg:hidden">
              <div className="flex items-center gap-3">
                {service && <img src={service.image} alt="" aria-hidden width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />}
                <p className="text-xs font-semibold text-muted">Bước {step + 1}/{REGISTER_STEPS.length} · {REGISTER_STEPS[step]}</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((step + 1) / REGISTER_STEPS.length) * 100}%` }} />
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-white p-5 shadow-[var(--shadow-sm)] sm:p-8">
            <h1 className="text-xl font-extrabold text-ink-deep sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-4 text-center text-xs text-muted">{footer}</div>}
        </main>
      </div>
    </div>
  );
}

function StepList({ current }: { current: number }) {
  return (
    <ol className="space-y-3" aria-label="Các bước đăng ký">
      {REGISTER_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className="flex items-center gap-3">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              done ? 'bg-primary text-white' : active ? 'border-2 border-primary bg-white text-primary' : 'border border-border bg-white text-muted'
            }`}>
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`text-sm ${active ? 'font-bold text-ink-deep' : done ? 'font-semibold text-ink' : 'text-muted'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
