export default function TopVolumeLoading() {
  return (
    <main className="min-h-[calc(100vh-65px)] bg-[#f7f8f6] text-slate-950">
      <div className="mx-auto min-w-0 max-w-[1600px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        {/* Header Skeleton */}
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
          <div className="space-y-2.5 max-w-xl">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
            <div className="h-8 w-80 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-96 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="flex gap-3">
            <div className="h-16 w-40 animate-pulse rounded-xl bg-slate-200" />
            <div className="h-16 w-40 animate-pulse rounded-xl bg-slate-200" />
          </div>
        </div>

        {/* Controls Skeleton */}
        <div className="mb-6 h-16 w-full animate-pulse rounded-2xl bg-slate-200/80" />

        {/* Dual Column Skeleton */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="h-14 w-full animate-pulse rounded-xl bg-slate-200/70" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="h-14 w-full animate-pulse rounded-xl bg-slate-200/70" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
