import { Link } from 'react-router-dom';
import { Home, BedDouble, Map as MapIcon, SearchX } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';

/**
 * Trang 404 — bắt mọi đường dẫn không tồn tại (trước đây URL sai hiện màn hình
 * trắng vì không có route bắt-all). Giữ khung SidebarLayout nên vẫn có menu;
 * nội dung: tranh ruộng bậc thang + lời nhắn thân thiện + 3 lối đi gợi ý.
 */
export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-14 text-center md:py-20">
      <div className="relative h-44 w-full max-w-sm overflow-hidden rounded-3xl border border-teal-100 bg-white shadow-xl shadow-teal-900/5 md:h-52">
        <ImagePlaceholder Icon={SearchX} variant="hero" label="Không tìm thấy trang này" />
      </div>

      <h1 className="mt-8 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
        Trang bạn tìm không có ở đây
      </h1>
      <p className="mt-2.5 max-w-md text-sm font-medium leading-relaxed text-slate-500">
        Có thể đường dẫn đã đổi hoặc nội dung chưa sẵn sàng. Đừng lo — Đi Du Lịch còn rất nhiều điểm đến tuyệt đẹp để bạn khám phá.
      </p>

      <div className="mt-8 grid w-full max-w-md grid-cols-3 gap-3">
        <Link
          to="/"
          className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 text-xs font-bold text-slate-800 shadow-2xs transition-all duration-200 hover:-translate-y-1 hover:border-[var(--color-primary)] hover:bg-teal-50/40 hover:text-[var(--color-primary)] hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 group-hover:bg-teal-100/60 group-hover:text-[var(--color-primary)] transition-colors">
            <Home className="h-5 w-5" />
          </div>
          <span>Trang chủ</span>
        </Link>
        <Link
          to="/homestays"
          className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 text-xs font-bold text-slate-800 shadow-2xs transition-all duration-200 hover:-translate-y-1 hover:border-[var(--color-primary)] hover:bg-teal-50/40 hover:text-[var(--color-primary)] hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 group-hover:bg-teal-100/60 group-hover:text-[var(--color-primary)] transition-colors">
            <BedDouble className="h-5 w-5" />
          </div>
          <span>Homestay</span>
        </Link>
        <Link
          to="/map"
          className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 text-xs font-bold text-slate-800 shadow-2xs transition-all duration-200 hover:-translate-y-1 hover:border-[var(--color-primary)] hover:bg-teal-50/40 hover:text-[var(--color-primary)] hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 group-hover:bg-teal-100/60 group-hover:text-[var(--color-primary)] transition-colors">
            <MapIcon className="h-5 w-5" />
          </div>
          <span>Bản đồ</span>
        </Link>
      </div>

      <p className="mt-8 text-xs text-slate-400">
        Hoặc quay lại trang trước đó bằng nút quay lại của trình duyệt.
      </p>
    </div>
  );
}
