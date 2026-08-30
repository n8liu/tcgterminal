"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavHeader() {
  const pathname = usePathname();

  const isCatalog = pathname === "/" || (pathname.startsWith("/cards") && !pathname.startsWith("/cards/"));
  const isMovers = pathname.startsWith("/market-movers");
  const isLiveUpdates = pathname.startsWith("/live-updates");
  const isTopVolume = pathname.startsWith("/top-volume");
  const isGrading = pathname.startsWith("/grading-profit");
  const isSealed = pathname.startsWith("/sealed-signals");

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 lg:gap-8">
          <Link className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-950 transition hover:opacity-90" href="/">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 font-mono text-sm font-black text-white shadow-sm">
              T
            </span>
            <span className="hidden sm:inline">TCGTerminal</span>
          </Link>

          <nav className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1 text-xs font-semibold text-slate-600" aria-label="Main Navigation">
            <Link
              href="/"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                pathname === "/" || (pathname.startsWith("/cards") && !isMovers && !isLiveUpdates && !isTopVolume && !isGrading && !isSealed)
                  ? "bg-white text-slate-950 shadow-sm font-bold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span>🔍</span>
              <span>Catalog</span>
            </Link>
            <Link
              href="/market-movers"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                isMovers
                  ? "bg-white text-emerald-950 shadow-sm font-bold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>Movers</span>
            </Link>
            <Link
              href="/sealed-signals"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                isSealed
                  ? "bg-white text-amber-950 shadow-sm font-bold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="text-amber-600">📦</span>
              <span>Sealed Signals</span>
            </Link>
            <Link
              href="/grading-profit"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                isGrading
                  ? "bg-white text-indigo-950 shadow-sm font-bold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="text-indigo-600">💎</span>
              <span>Grading Profit</span>
            </Link>
            <Link
              href="/top-volume"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                isTopVolume
                  ? "bg-white text-amber-950 shadow-sm font-bold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="text-amber-500">🏆</span>
              <span>Top 50 Volume</span>
            </Link>
            <Link
              href="/live-updates"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                isLiveUpdates
                  ? "bg-white text-sky-950 shadow-sm font-bold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="text-sky-500">⚡</span>
              <span>Live Updates</span>
            </Link>
          </nav>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-50/60 px-2.5 py-1 text-xs font-medium text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> TCG API & eBay Live Comps
          </span>
        </div>
      </div>
    </header>
  );
}
