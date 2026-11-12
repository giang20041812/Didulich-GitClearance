import { Link } from "react-router-dom"
import { VietTrackLogo } from "../ui/logo"
import {
  Compass,
  Sparkles,
  ShieldAlert,
  Heart
} from "lucide-react"

/**
 * Footer với nền xanh chàm sâu sang trọng (#16223c) — màu vải thổ cẩm Tây Bắc.
 * Tinh giản, phân cấp rõ ràng, hỗ trợ SPA routing (không reload trang), hiển thị tối ưu trên cả mobile & desktop.
 */
export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative bg-[#16223c] text-slate-300 mt-auto pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] overflow-hidden">
      {/* Viền gradient tinh tế: vàng óng nắng núi -> xanh ngọc rừng -> sương non */}
      <div className="h-[2px] w-full bg-gradient-to-r from-amber-400 via-[#0a7d64] to-emerald-300" aria-hidden="true" />

      {/* Ánh sáng mờ nghệ thuật nền footer */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-0 right-10 h-72 w-72 rounded-full bg-amber-500/5 blur-3xl" aria-hidden="true" />

      <div className="relative z-10 pt-12 pb-10 md:py-16 px-4 md:px-8 max-w-[1280px] mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 mb-10 md:mb-14">

          {/* Column 1: Brand & Sứ Mệnh */}
          <div className="md:col-span-5 lg:col-span-4 flex flex-col">
            <div className="flex items-center mb-4">
              <VietTrackLogo variant="horizontal" tone="light" size={42} className="-ml-2" />
            </div>
            <p className="-mt-2 mb-3 text-lg italic text-[var(--color-sun)]" style={{ fontFamily: 'var(--font-brush)' }}>đi như người bản địa</p>
            <p className="text-sm leading-relaxed text-slate-400 mb-6 max-w-sm">
              Nền tảng du lịch sinh thái & lưu trú bản địa kết nối du khách với văn hóa vùng cao Việt Nam. Giữ trọn sự nguyên bản, minh bạch và phát triển bền vững.
            </p>
          </div>

          {/* Navigation Links Columns */}
          <div className="md:col-span-7 lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-8">
            {/* Cột 1: Khám Phá */}
            <div className="flex flex-col">
              <h4 className="font-bold text-sm tracking-wide text-white uppercase mb-3.5 font-display flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-emerald-400" />
                Khám Phá
              </h4>
              <ul className="flex flex-col gap-2.5 text-xs sm:text-sm text-slate-300">
                <li>
                  <Link to="/homestays" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Homestay & Chốn nghỉ
                  </Link>
                </li>
                <li>
                  <Link to="/destinations" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Điểm đến theo mùa
                  </Link>
                </li>
                <li>
                  <Link to="/experiences" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Văn hóa & Lễ hội
                  </Link>
                </li>
                <li>
                  <Link to="/restaurants" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Nhà hàng & Ẩm thực
                  </Link>
                </li>
                <li>
                  <Link to="/specialties" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Đặc sản Tây Bắc
                  </Link>
                </li>
              </ul>
            </div>

            {/* Cột 2: Tiện ích & Hỗ trợ */}
            <div className="flex flex-col">
              <h4 className="font-bold text-sm tracking-wide text-white uppercase mb-3.5 font-display flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Tiện Ích
              </h4>
              <ul className="flex flex-col gap-2.5 text-xs sm:text-sm text-slate-300">
                <li>
                  <Link to="/cam-nang" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-amber-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Cẩm nang du lịch
                  </Link>
                </li>
                <li>
                  <Link to="/cam-nang#khan-cap" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-amber-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Danh bạ khẩn cấp SOS
                  </Link>
                </li>
                <li>
                  <Link to="/bookings" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-amber-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Tra cứu đơn đặt phòng
                  </Link>
                </li>
                <li>
                  <Link to="/download" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-amber-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Tải App di động (PWA)
                  </Link>
                </li>
                <li>
                  <Link to="/lich-trinh" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-amber-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Lập kế hoạch hành trình
                  </Link>
                </li>
              </ul>
            </div>

            {/* Cột 3: Dành cho Đối tác */}
            <div className="col-span-2 sm:col-span-1 flex flex-col">
              <h4 className="font-bold text-sm tracking-wide text-white uppercase mb-3.5 font-display flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-emerald-400" />
                Đối Tác
              </h4>
              <ul className="flex flex-col gap-2.5 text-xs sm:text-sm text-slate-300">
                <li>
                  <Link to="/portal/login" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Cổng đối tác lưu trú
                  </Link>
                </li>
                <li>
                  <Link to="/register/partner" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Đăng ký làm đối tác
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Chính sách & Bảo mật
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-amber-400 transition-colors inline-flex items-center gap-1 group">
                    <span className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform">›</span>
                    Điều khoản sử dụng
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Dòng bản quyền & Cam kết */}
        <div className="pt-6 border-t border-slate-700/60 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-400">
          <p className="text-center sm:text-left">
            &copy; {currentYear} Đi Du Lịch &bull; Nền tảng du lịch số Việt Nam.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-slate-400">
            <span className="inline-flex items-center gap-1 text-[11px]">
              Tôn vinh văn hóa bản địa <Heart className="w-3 h-3 text-rose-500 fill-rose-500 inline" />
            </span>
            <span>&bull;</span>
            <Link to="/cam-nang" className="hover:text-white transition-colors">Trung tâm hỗ trợ</Link>
            <span>&bull;</span>
            <Link to="/nguon-anh" className="hover:text-white transition-colors">Nguồn ảnh</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

