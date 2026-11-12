/** Khung chờ của một bài (cùng bố cục bài thật để danh sách không giật khi tải xong). */
export function FeedCardSkeleton() {
  return (
    <div className="flex gap-3.5 px-3.5 py-4 sm:gap-5 sm:p-5" aria-hidden>
      <div className="h-[104px] w-[104px] shrink-0 animate-pulse rounded-xl bg-slate-200/80 sm:h-[136px] sm:w-[176px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200/80 sm:h-5" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-2 flex items-center gap-2">
          <div className="h-6 w-6 animate-pulse rounded-full bg-slate-200/80" />
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

/** Danh sách bài đang tải — cùng khung bo góc với danh sách thật. */
export function FeedListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-slate-200/80 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80" role="status" aria-label="Đang tải lịch trình du khách">
      {Array.from({ length: count }, (_, i) => <FeedCardSkeleton key={i} />)}
    </div>
  );
}

/** Lịch trình "Của tôi" đang tải (MyJourneysList). */
export function MyJourneysSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Đang tải lịch trình">
      {[0, 1].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-white ring-1 ring-slate-200" />)}
    </div>
  );
}
