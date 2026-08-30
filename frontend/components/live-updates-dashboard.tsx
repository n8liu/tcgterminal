"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cardImageUrl, getLiveUpdates } from "@/lib/api";
import type {
  LiveUpdateGradeFilter,
  LiveUpdateItem,
  LiveUpdateProviderFilter,
  LiveUpdatesResponse,
} from "@/types/card";

type LiveUpdatesDashboardProps = {
  initialData: LiveUpdatesResponse;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Recently updated";
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  } catch {
    return "Recently updated";
  }
}

function GradeBadge({ item }: { item: LiveUpdateItem }) {
  if (item.grading_company && item.grade) {
    const gradeStr = `${item.grading_company} ${item.grade}`;
    if (gradeStr.includes("PSA 10") || gradeStr.includes("10")) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2 py-0.5 text-[10px] font-black text-white shadow-xs">
          💎 {gradeStr}
        </span>
      );
    }
    if (gradeStr.includes("PSA 9") || gradeStr.includes("9")) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
          🛡️ {gradeStr}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
        🏷️ {gradeStr}
      </span>
    );
  }

  if (item.condition) {
    return (
      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
        {item.condition}
      </span>
    );
  }

  return (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
      Raw / Ungraded
    </span>
  );
}

function LiveUpdateRow({ item }: { item: LiveUpdateItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isEbay = item.provider.toLowerCase().includes("ebay");

  return (
    <div className="group relative flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition duration-150 hover:border-slate-300 hover:bg-slate-50/60 hover:shadow-md sm:flex-row sm:items-center">
      {/* Left: Thumbnail & Card Details */}
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100 p-0.5 shadow-xs">
          {imageFailed ? (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-bold text-slate-400">
              {item.card_name.slice(0, 1).toUpperCase()}
            </div>
          ) : (
            <Image
              src={cardImageUrl(item.image_url)}
              alt={item.card_name}
              fill
              className="object-contain transition group-hover:scale-105"
              sizes="40px"
              onError={() => setImageFailed(true)}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/cards/${encodeURIComponent(item.card_id)}`}
              className="truncate text-sm font-bold text-slate-950 transition hover:text-emerald-700 hover:underline"
            >
              {item.card_name}
            </Link>
            {item.number && (
              <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-500">
                #{item.number}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{item.set_name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <GradeBadge item={item} />
            {item.printing && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                {item.printing}
              </span>
            )}
            {item.listing_title && (
              <span className="hidden max-w-[240px] truncate text-[10px] text-slate-400 lg:inline">
                “{item.listing_title}”
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Price, Source & Link */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-100 pt-2 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
        <div className="text-left sm:text-right">
          <div className="text-base font-black tracking-tight text-slate-950">
            {formatMoney(item.price)}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                isEbay ? "bg-sky-500" : "bg-emerald-500"
              }`}
            />
            <span>{isEbay ? "eBay Verified Comp" : "TCG API Sync"}</span>
            <span>•</span>
            <span>{formatRelativeTime(item.observed_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {item.listing_url && (
            <a
              href={item.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span>Listing</span>
              <span className="text-[10px]">↗</span>
            </a>
          )}
          <Link
            href={`/cards/${encodeURIComponent(item.card_id)}`}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-900 transition hover:bg-emerald-600 hover:text-white"
          >
            <span>View Card</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function LiveUpdatesDashboard({ initialData }: LiveUpdatesDashboardProps) {
  const [data, setData] = useState<LiveUpdatesResponse>(initialData);
  const [provider, setProvider] = useState<LiveUpdateProviderFilter>("all");
  const [gradeFilter, setGradeFilter] = useState<LiveUpdateGradeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number | null>(15);
  const [isLoading, setIsLoading] = useState(false);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(15);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch updates
  const fetchData = useCallback(
    async (p: number, prov: LiveUpdateProviderFilter, gf: LiveUpdateGradeFilter, q: string) => {
      setIsLoading(true);
      try {
        const res = await getLiveUpdates({
          provider: prov,
          gradeFilter: gf,
          query: q.trim() || undefined,
          page: p,
          perPage: 24,
        });
        setData(res);
      } catch (err) {
        console.error("Failed fetching live updates:", err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Auto-refresh countdown
  useEffect(() => {
    if (!autoRefreshInterval) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setSecondsUntilRefresh(autoRefreshInterval);
    const interval = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          fetchData(page, provider, gradeFilter, searchQuery);
          return autoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    timerRef.current = interval;
    return () => clearInterval(interval);
  }, [autoRefreshInterval, page, provider, gradeFilter, searchQuery, fetchData]);

  const handleProviderChange = (newProv: LiveUpdateProviderFilter) => {
    setProvider(newProv);
    setPage(1);
    fetchData(1, newProv, gradeFilter, searchQuery);
  };

  const handleGradeChange = (newGf: LiveUpdateGradeFilter) => {
    setGradeFilter(newGf);
    setPage(1);
    fetchData(1, provider, newGf, searchQuery);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData(1, provider, gradeFilter, searchQuery);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchData(newPage, provider, gradeFilter, searchQuery);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-sky-500 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
              Real-Time Ingestion Stream
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Live Updated Items &amp; Comps
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Streaming feed of verified market comps, eBay sold listings, graded slab submissions, and TCG API price syncs in real-time chronological order.
          </p>
        </div>

        {/* Top KPI Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-sky-500/20 bg-sky-50/70 px-3.5 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold text-white shadow-xs">
              ⚡
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">Total Observations</p>
              <p className="text-xs font-black text-slate-950">{data.total_items.toLocaleString()} Comps</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-purple-500/20 bg-purple-50/70 px-3.5 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600 text-xs font-bold text-white shadow-xs">
              💎
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-800">Graded Slabs</p>
              <p className="text-xs font-black text-purple-950">{data.graded_updates_count.toLocaleString()} Tracked</p>
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Providers, Grades, Search & Auto-Refresh */}
      <div className="mt-8 space-y-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between">
          {/* Source Tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleProviderChange("all")}
              className={`rounded-lg px-3.5 py-1.5 transition ${
                provider === "all"
                  ? "bg-white text-slate-950 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Sources ({data.total_items.toLocaleString()})
            </button>
            <button
              type="button"
              onClick={() => handleProviderChange("ebay")}
              className={`rounded-lg px-3.5 py-1.5 transition ${
                provider === "ebay"
                  ? "bg-white text-slate-950 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              eBay Comps 🛒
            </button>
            <button
              type="button"
              onClick={() => handleProviderChange("tcgapi")}
              className={`rounded-lg px-3.5 py-1.5 transition ${
                provider === "tcgapi"
                  ? "bg-white text-slate-950 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              TCG API Prices 📊
            </button>
          </div>

          {/* Search Bar & Auto-Refresh */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Auto-Refresh Ticker */}
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
              <span className="relative flex h-2 w-2">
                {autoRefreshInterval && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    autoRefreshInterval ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                />
              </span>
              <span className="text-[11px] font-medium">
                {autoRefreshInterval ? `Auto-refresh: ${secondsUntilRefresh}s` : "Auto-refresh: Paused"}
              </span>
              <button
                type="button"
                onClick={() => setAutoRefreshInterval((prev) => (prev ? null : 15))}
                className="text-[10px] font-bold uppercase text-sky-600 hover:underline"
              >
                {autoRefreshInterval ? "Pause" : "Resume"}
              </button>
            </div>

            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-64 sm:flex-none">
              <input
                type="text"
                placeholder="Search card, set, or comp..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    fetchData(1, provider, gradeFilter, "");
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Grade Filter Sub-Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Grade:</span>
          {(
            [
              { id: "all", label: "All Items" },
              { id: "psa10", label: "PSA 10 Gem Mint 💎" },
              { id: "psa9", label: "PSA 9 Mint 🛡️" },
              { id: "graded", label: "All Graded Slabs" },
              { id: "raw", label: "Raw / Ungraded" },
            ] as { id: LiveUpdateGradeFilter; label: string }[]
          ).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => handleGradeChange(g.id)}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition shadow-2xs ${
                gradeFilter === g.id
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Stream List */}
      <div className="mt-6 space-y-2.5">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 w-full animate-pulse rounded-2xl bg-slate-200/70" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-base font-bold text-slate-800">No live updates found matching your filters</p>
            <p className="mt-1 text-xs text-slate-500">Try switching the source to &ldquo;All Sources&rdquo; or clearing the search.</p>
            <button
              type="button"
              onClick={() => {
                setProvider("all");
                setGradeFilter("all");
                setSearchQuery("");
                fetchData(1, "all", "all", "");
              }}
              className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-sky-700"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          data.items.map((item) => <LiveUpdateRow key={item.id} item={item} />)
        )}
      </div>

      {/* Pagination Controls */}
      {data.total_pages > 1 && (
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-6 sm:flex-row">
          <div className="text-xs font-medium text-slate-500">
            Showing page <span className="font-bold text-slate-900">{data.page}</span> of{" "}
            <span className="font-bold text-slate-900">{data.total_pages}</span> ({data.total_items.toLocaleString()} total items)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={data.page <= 1}
              onClick={() => handlePageChange(data.page - 1)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
            >
              ← Previous
            </button>

            {Array.from({ length: Math.min(5, data.total_pages) }).map((_, i) => {
              let pNum = i + 1;
              if (data.total_pages > 5 && data.page > 3) {
                pNum = data.page - 2 + i;
                if (pNum > data.total_pages) pNum = data.total_pages - 4 + i;
              }
              if (pNum < 1 || pNum > data.total_pages) return null;
              return (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => handlePageChange(pNum)}
                  className={`h-8 w-8 rounded-xl text-xs font-bold transition ${
                    data.page === pNum
                      ? "bg-slate-900 text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {pNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={data.page >= data.total_pages}
              onClick={() => handlePageChange(data.page + 1)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
