import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import bannerAuth from '@/assets/photos/banner-auth.webp';
import { ArrowLeft, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { LogoMark } from '@/components/ui/logo';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Khung giao diện xác thực cao cấp lồng trực tiếp trên nền ảnh di sản Tây Bắc (Full-bleed Heritage Auth):
 * - Toàn màn hình là bức tranh ruộng bậc thang Tây Bắc hùng vĩ với lớp phủ chuyển sắc điện ảnh.
 * - Cột trái (Desktop): Logo nhận diện, khẩu hiệu cảm hứng và 3 cam kết vàng nổi bật.
 * - Khối Form Đăng nhập / Đăng ký: Lồng trực tiếp trên nền ảnh với hiệu ứng kính mờ (Glassmorphism) sang trọng,
 *   giúp thao tác nhập liệu rõ nét, trực quan và cuốn hút.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const navigate = useNavigate();
  return (
    <main className="relative flex min-h-dvh w-full flex-col justify-between lg:h-dvh lg:overflow-y-hidden overflow-x-hidden bg-[#04261f] font-body text-slate-800 antialiased selection:bg-emerald-500 selection:text-white">
      {/* ── BỨC TRANH DI SẢN TÂY BẮC TOÀN MÀN HÌNH (FULL-BLEED BACKGROUND) ── */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center transition-transform duration-1000 ease-out scale-100"
        style={{
          backgroundImage: `url(${bannerAuth})`,
        }}
      >
        {/* Lớp phủ chuyển sắc đa tầng mang lại chiều sâu điện ảnh */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#021813]/95 via-[#052b21]/75 to-[#031d17]/90" />
        <div className="absolute inset-0 bg-radial-[at_top_left] from-emerald-500/25 via-transparent to-black/60" />
        <div className="absolute inset-0 backdrop-blur-[0.5px]" />
      </div>

      {/* ── THANH ĐIỀU HƯỚNG TRÊN CÙNG (TOP BAR) ── */}
      <header className="relative z-20 flex w-full items-center justify-between px-4 py-5 sm:px-8 lg:px-12 lg:py-3">
        <Link
          to="/"
          onClick={(e) => {
            if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
              e.preventDefault();
              navigate(-1);
            }
          }}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-white/20 hover:border-white/40 hover:scale-105 active:scale-95"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Quay về</span>
        </Link>

        {/* Logo thu nhỏ trên Mobile */}
        <div className="flex items-center gap-2.5 lg:hidden">
          <div className="rounded-xl p-1 bg-white/20 backdrop-blur-md border border-white/30 shadow-md">
            <LogoMark size={26} plate className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-base tracking-tight text-white drop-shadow-md">
            Đi Du Lịch
          </span>
        </div>
      </header>

      {/* ── NỘI DUNG CHÍNH (MAIN CONTAINER) ── */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center px-4 py-6 sm:px-6 lg:min-h-0 lg:px-8 lg:py-2">
        <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
          
          {/* CỘT TRÁI (DESKTOP): Thông điệp thương hiệu & 3 cam kết vàng */}
          <div className="hidden flex-col justify-between space-y-7 text-white lg:col-span-6 lg:flex xl:col-span-7">
            {/* Header thương hiệu */}
            <Link to="/" className="group inline-flex items-center gap-3.5 focus:outline-none w-fit">
              <div className="rounded-2xl p-1.5 bg-white/20 backdrop-blur-md border border-white/30 shadow-xl transition-transform duration-300 group-hover:scale-105">
                <LogoMark size={44} plate className="w-11 h-11" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-extrabold text-2xl xl:text-3xl tracking-tight text-white drop-shadow-md">
                  Đi Du Lịch
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Nền tảng du lịch bản địa & di sản
                </span>
              </div>
            </Link>

            {/* Nội dung truyền cảm hứng */}
            <div className="space-y-5 max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold text-emerald-200 backdrop-blur-md border border-white/20 shadow-md">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Trải nghiệm nguyên bản vùng cao</span>
              </div>

              <h2 className="text-3xl xl:text-4xl 2xl:text-5xl font-black leading-tight text-white drop-shadow-lg tracking-tight">
                Mỗi chuyến đi là một câu chuyện di sản được viết tiếp
              </h2>

              <p className="text-sm xl:text-base leading-relaxed text-emerald-50/90 font-medium drop-shadow-sm">
                Kết nối trực tiếp du khách với các homestay chân thực, ẩm thực truyền thống và người dân bản địa Tây Bắc.
              </p>
            </div>

            {/* 3 cam kết vàng */}
            <div className="grid grid-cols-3 gap-3.5 pt-2 max-w-xl">
              <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/15 shadow-lg transition-transform hover:-translate-y-0.5 duration-200">
                <div className="text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> 100% Thật
                </div>
                <p className="text-[11px] text-white/85 leading-snug">
                  Hình ảnh thực tế xác thực từ địa phương
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/15 shadow-lg transition-transform hover:-translate-y-0.5 duration-200">
                <div className="text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-4 h-4 shrink-0" /> An tâm
                </div>
                <p className="text-[11px] text-white/85 leading-snug">
                  Đặt phòng trực tiếp không phụ phí ẩn
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/15 shadow-lg transition-transform hover:-translate-y-0.5 duration-200">
                <div className="text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-4 h-4 shrink-0" /> Đồng hành
                </div>
                <p className="text-[11px] text-white/85 leading-snug">
                  Hỗ trợ du khách suốt hành trình 24/7
                </p>
              </div>
            </div>

            {/* Chân trang cột trái */}
            <div className="text-xs text-white/70 pt-2 font-medium">
              © {new Date().getFullYear()} Đi Du Lịch Vietnam. Giữ trọn vẻ đẹp Tây Bắc.
            </div>
          </div>

          {/* CỘT PHẢI: KHỐI FORM LỒNG TRỰC TIẾP TRÊN NỀN ẢNH (GLASSMORPHISM) */}
          <div className="flex w-full justify-center lg:col-span-6 lg:justify-end xl:col-span-5">
            <div className="w-full max-w-[440px]">
              <div className="rounded-3xl border border-white/40 bg-white/95 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-8 lg:max-h-[calc(100dvh-8.5rem)] lg:overflow-y-auto lg:p-6 transition-all duration-300">
                <h1 className="text-2xl font-black tracking-tight text-slate-900">{title}</h1>
                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-500">{subtitle}</p>
                <div className="mt-6 lg:mt-4">{children}</div>
              </div>

              {footer && (
                <div className="mt-4 text-center text-xs text-emerald-100/80 leading-relaxed drop-shadow-sm">
                  {footer}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── CHÂN TRANG ĐIỀU KHOẢN (FOOTER DISCLAIMER) ── */}
      <footer className="relative z-20 py-4 lg:py-2 text-center text-[11px] text-white/70 drop-shadow-sm px-4">
        Bằng việc tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của Đi Du Lịch.
      </footer>
    </main>
  );
}

/** Đường kẻ "hoặc" giữa nút Google và biểu mẫu nhập liệu. */
export function AuthDivider({ label = 'hoặc dùng email' }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      <span className="h-px flex-1 bg-slate-200/80" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-slate-200/80" />
    </div>
  );
}

export const authInputClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-2xs transition-all duration-200 focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-3 focus:ring-[var(--color-primary)]/15 hover:border-slate-300';
