export default function MarketMoversLoading() {
  return (
    <main className="min-h-[calc(100vh-65px)] bg-[#f7f8f6] text-slate-950">
      <div className="mx-auto min-w-0 max-w-[1600px] animate-pulse px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        {/* Header Skeleton */}
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
          <div>
            <div className="h-4 w-44 rounded-md bg-slate-200" />
            <div className="mt-3 h-9 w-64 rounded-xl bg-slate-200" />
            <div className="mt-2 h-4 w-96 max-w-full rounded-md bg-slate-200" />
          </div>
          <div className="flex gap-3">
            <div className="h-14 w-40 rounded-xl bg-slate-200" />
            <div className="h-14 w-40 rounded-xl bg-slate-200" />
          </div>
        </div>

        {/* Control Bar Skeleton */}
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="h-10 w-72 rounded-xl bg-slate-100" />
          <div className="flex gap-3">
            <div className="h-10 w-56 rounded-xl bg-slate-100" />
            <div className="h-10 w-48 rounded-xl bg-slate-100" />
          </div>
        </div>

        {/* Grid Skeleton */}
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-4 h-6 w-40 rounded-md bg-slate-200" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`g-skel-${i}`} className="h-36 rounded-2xl border border-slate-200 bg-white p-4" />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-4 h-6 w-40 rounded-md bg-slate-200" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`l-skel-${i}`} className="h-36 rounded-2xl border border-slate-200 bg-white p-4" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
