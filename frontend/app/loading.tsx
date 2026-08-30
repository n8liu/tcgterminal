export default function RootLoading() {
  return (
    <main className="min-h-[calc(100vh-65px)] bg-[#f7f8f6] text-slate-950">
      <div className="mx-auto min-w-0 max-w-[1600px] animate-pulse px-4 pb-14 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <div className="h-14 max-w-4xl rounded-2xl bg-slate-200" />
        <div className="mt-10 grid items-start gap-7 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="h-80 rounded-2xl bg-slate-200" />
          <div>
            <div className="mb-5 flex justify-between">
              <div className="h-6 w-48 rounded-md bg-slate-200" />
              <div className="h-4 w-32 rounded-md bg-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`card-skel-${i}`} className="aspect-[5/7] rounded-2xl border border-slate-200 bg-white p-3" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
