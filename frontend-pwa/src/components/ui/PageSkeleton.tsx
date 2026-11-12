import { Skeleton } from './skeleton';
import { CardGridSkeleton } from './ListPageSkeleton';

const bar = 'bg-slate-200 opacity-100';

function Status({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** Khung chờ chung của một trang (dùng cho Suspense / route fallback): tiêu đề + lưới thẻ. */
export function PageSkeleton({ label = 'Đang tải' }: { label?: string }) {
  return (
    <Status label={label} className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div className="space-y-2">
        <Skeleton className={`${bar} h-7 w-1/3`} />
        <Skeleton className={`${bar} h-4 w-1/2`} />
      </div>
      <CardGridSkeleton count={8} />
    </Status>
  );
}

/** Khung chờ trang chi tiết: ảnh bìa lớn + tiêu đề + đoạn văn + khối thông tin bên cạnh. */
export function DetailSkeleton({ label = 'Đang tải' }: { label?: string }) {
  return (
    <Status label={label} className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <Skeleton className={`${bar} h-56 w-full rounded-2xl sm:h-80`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Skeleton className={`${bar} h-7 w-2/3`} />
          <Skeleton className={`${bar} h-4 w-1/3`} />
          <div className="space-y-2 pt-2">
            <Skeleton className={`${bar} h-3 w-full`} />
            <Skeleton className={`${bar} h-3 w-full`} />
            <Skeleton className={`${bar} h-3 w-5/6`} />
            <Skeleton className={`${bar} h-3 w-2/3`} />
          </div>
        </div>
        <Skeleton className={`${bar} h-48 w-full rounded-2xl`} />
      </div>
    </Status>
  );
}

/** Khung chờ danh sách dòng (đơn đặt, yêu cầu, bảng quản trị…). */
export function ListSkeleton({ label = 'Đang tải', rows = 4, className }: { label?: string; rows?: number; className?: string }) {
  return (
    <Status label={label} className={className}>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
            <Skeleton className={`${bar} h-12 w-12 shrink-0 rounded-lg`} />
            <div className="flex-1 space-y-2">
              <Skeleton className={`${bar} h-4 w-2/3`} />
              <Skeleton className={`${bar} h-3 w-1/3`} />
            </div>
            <Skeleton className={`${bar} hidden h-6 w-16 rounded-full sm:block`} />
          </div>
        ))}
      </div>
    </Status>
  );
}

/** Khung chờ một khối nội dung ngắn (thay cho dòng "Đang tải…" kèm spinner). */
export function BlockSkeleton({ label = 'Đang tải', lines = 3, className }: { label?: string; lines?: number; className?: string }) {
  return (
    <Status label={label} className={className}>
      <div className="space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={`${bar} h-4 ${i === lines - 1 ? 'w-1/2' : 'w-full'}`} />
        ))}
      </div>
    </Status>
  );
}

/** Khung chờ trang tổng quan (Admin / NCC): hàng số liệu + biểu đồ + bảng. */
export function DashboardSkeleton({ label = 'Đang tải' }: { label?: string }) {
  return (
    <Status label={label} className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <Skeleton className={`${bar} h-7 w-1/4`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/80">
            <Skeleton className={`${bar} h-3 w-1/2`} />
            <Skeleton className={`${bar} h-7 w-2/3`} />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton className={`${bar} h-64 w-full rounded-2xl`} />
        <Skeleton className={`${bar} h-64 w-full rounded-2xl`} />
      </div>
      <ListSkeleton rows={3} label={label} />
    </Status>
  );
}

/** Khung chờ trang biểu mẫu / đăng nhập / hồ sơ: tiêu đề + vài ô nhập + nút. */
export function FormSkeleton({ label = 'Đang tải' }: { label?: string }) {
  return (
    <Status label={label} className="mx-auto w-full max-w-md space-y-5 px-4 py-10 sm:px-6">
      <Skeleton className={`${bar} mx-auto h-8 w-1/2`} />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className={`${bar} h-3 w-24`} />
          <Skeleton className={`${bar} h-11 w-full rounded-xl`} />
        </div>
      ))}
      <Skeleton className={`${bar} h-11 w-full rounded-xl`} />
    </Status>
  );
}

/** Khung chờ trang danh sách dòng có tiêu đề (đơn đặt, đánh giá…). */
export function ListPageFallback({ label = 'Đang tải' }: { label?: string }) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <Skeleton className={`${bar} h-7 w-1/3`} />
      <ListSkeleton rows={6} label={label} />
    </div>
  );
}
