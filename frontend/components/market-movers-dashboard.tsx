"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cardImageUrl, getMarketMovers } from "@/lib/api";
import type { MarketMoverItem, MarketMoversResponse, MoverDirection, MoverPeriod } from "@/types/card";

type MarketMoversDashboardProps = {
  initialData: MarketMoversResponse;
};

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercentage(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Recently updated";
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

function MoverCard({ item }: { item: MarketMoverItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isUp = item.direction === "up" || item.price_change_percentage >= 0;

  return (
    <Link
      href={`/cards/${encodeURIComponent(item.card_id)}`}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
    >
      <div className="flex gap-4">
        {/* Card Image Thumbnail */}
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 p-1">
          {imageFailed ? (
            <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs font-bold text-slate-400">
              {item.name.slice(0, 1).toUpperCase()}
            </div>
          ) : (
            <Image
              src={cardImageUrl(item.image_url)}
              alt={item.name}
              fill
              className="object-contain transition duration-300 group-hover:scale-105"
              sizes="80px"
              onError={() => setImageFailed(true)}
            />
          )}
        </div>

        {/* Card Details */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-950 group-hover:text-emerald-700">
              {item.name}
            </h3>
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{item.set_name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500">
            {item.printing && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                {item.printing}
              </span>
            )}
            {item.rarity && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
                {item.rarity}
              </span>
            )}
            {item.number && (
              <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-slate-400">
                #{item.number}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pricing & Change Footer */}
      <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
        <div>
          <p className="text-[11px] font-medium text-slate-400">Current Market</p>
          <p className="text-base font-bold tracking-tight text-slate-950">
            {formatMoney(item.market_price)}
          </p>
        </div>

        <div className="text-right">
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
              isUp
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20"
                : "bg-rose-50 text-rose-700 ring-1 ring-rose-500/20"
            }`}
          >
            <span>{isUp ? "▲" : "▼"}</span>
            <span>{formatPercentage(item.price_change_percentage)}</span>
          </span>
          {item.price_change_amount !== null && item.price_change_amount !== undefined && (
            <p className="mt-0.5 text-[10px] font-medium text-slate-400">
              {item.price_change_amount >= 0 ? "+" : ""}
              {formatMoney(item.price_change_amount)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 text-[10px] text-slate-400">
        Updated {formatRelativeTime(item.last_updated_at)}
      </div>
    </Link>
  );
}

export function MarketMoversDashboard({ initialData }: MarketMoversDashboardProps) {
  const [data, setData] = useState<MarketMoversResponse>(initialData);
  const [period, setPeriod] = useState<MoverPeriod>(initialData.period || "24h");
  const [direction, setDirection] = useState<MoverDirection>("all");
  const [game, setGame] = useState<"pokemon" | "pokemon-japan">("pokemon");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(initialData.page || 1);
  const [perPage, setPerPage] = useState(initialData.per_page || 12);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, MarketMoversResponse>>(new Map());

  const fetchMovers = useCallback(async (selectedPeriod: MoverPeriod, selectedPage: number, selectedPerPage: number, selectedGame: "pokemon" | "pokemon-japan" = game) => {
    const key = `${selectedGame}:${selectedPeriod}:all:${selectedPage}:${selectedPerPage}`;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setData(cached);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await getMarketMovers({
        direction: "all",
        period: selectedPeriod,
        game: selectedGame,
        page: selectedPage,
        perPage: selectedPerPage,
      });
      cacheRef.current.set(key, response);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load market movers");
    } finally {
      setIsLoading(false);
    }
  }, [game]);

  const handlePeriodChange = (newPeriod: MoverPeriod) => {
    setPeriod(newPeriod);
    setPage(1);
    void fetchMovers(newPeriod, 1, perPage, game);
  };

  const handleGameChange = (newGame: "pokemon" | "pokemon-japan") => {
    setGame(newGame);
    setPage(1);
    void fetchMovers(period, 1, perPage, newGame);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > (data.total_pages || 1)) return;
    setPage(newPage);
    void fetchMovers(period, newPage, perPage);
    window.scrollTo({ top: 120, behavior: "smooth" });
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setPage(1);
    void fetchMovers(period, 1, newPerPage);
  };

  const filteredGainers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return data.gainers;
    return data.gainers.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.set_name.toLowerCase().includes(term) ||
        (item.number && item.number.toLowerCase().includes(term)),
    );
  }, [data.gainers, searchTerm]);

  const filteredLosers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return data.losers;
    return data.losers.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.set_name.toLowerCase().includes(term) ||
        (item.number && item.number.toLowerCase().includes(term)),
    );
  }, [data.losers, searchTerm]);

  const topGainer = data.gainers[0] ?? null;
  const topLoser = data.losers[0] ?? null;
  const totalPages = data.total_pages || 1;

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Live Pokémon Price Momentum
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Market Movers
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Track Pokémon cards experiencing the highest price surges and steepest drops via live TCG API market pricing.
          </p>
        </div>

        {/* Stats Highlights */}
        <div className="flex flex-wrap items-center gap-3">
          {topGainer && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-50/70 px-3.5 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                ▲
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Top Gainer</p>
                <p className="max-w-[150px] truncate text-xs font-bold text-slate-950">{topGainer.name}</p>
                <p className="text-xs font-black text-emerald-700">+{topGainer.price_change_percentage}%</p>
              </div>
            </div>
          )}

          {topLoser && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-50/70 px-3.5 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-xs font-bold text-white">
                ▼
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800">Top Drop</p>
                <p className="max-w-[150px] truncate text-xs font-bold text-slate-950">{topLoser.name}</p>
                <p className="text-xs font-black text-rose-700">{topLoser.price_change_percentage}%</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar: Period, Direction & Filter */}
      <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        {/* Region & Time Period Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Region Tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleGameChange("pokemon")}
              className={`rounded-lg px-3 py-1.5 transition ${
                game === "pokemon"
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🇺🇸 English
            </button>
            <button
              type="button"
              onClick={() => handleGameChange("pokemon-japan")}
              className={`rounded-lg px-3 py-1.5 transition ${
                game === "pokemon-japan"
                  ? "bg-white text-red-950 shadow-xs font-black"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🇯🇵 Japanese
            </button>
          </div>

          {/* Time Period Tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            {(["24h", "7d", "30d"] as MoverPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePeriodChange(p)}
                className={`rounded-lg px-3 py-1.5 transition ${
                  period === p
                    ? "bg-white text-slate-950 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {p === "24h" ? "24h" : p === "7d" ? "7d" : "30d"}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode & Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setDirection("all")}
              className={`rounded-lg px-3 py-1.5 transition ${
                direction === "all" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Split View
            </button>
            <button
              type="button"
              onClick={() => setDirection("up")}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${
                direction === "up" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              <span>Gainers</span>
              <span className="rounded-full bg-emerald-800/40 px-1.5 py-0.2 text-[10px] text-white">
                {data.total_gainers || filteredGainers.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDirection("down")}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${
                direction === "down" ? "bg-rose-600 text-white shadow-sm" : "text-rose-700 hover:bg-rose-50"
              }`}
            >
              <span>Losers</span>
              <span className="rounded-full bg-rose-800/40 px-1.5 py-0.2 text-[10px] text-white">
                {data.total_losers || filteredLosers.length}
              </span>
            </button>
          </div>

          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Filter by card or set…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Main Movers Display */}
      <div className={`mt-8 ${isLoading ? "opacity-40 transition-opacity" : "transition-opacity"}`}>
        {direction === "all" ? (
          <div className="grid gap-10 lg:grid-cols-2">
            {/* Top Gainers Section */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-700">
                    ▲
                  </span>
                  <h2 className="text-lg font-bold text-slate-950">Top Price Gainers</h2>
                </div>
                <span className="text-xs font-semibold text-emerald-700">
                  {data.total_gainers || filteredGainers.length} total gainers
                </span>
              </div>

              {filteredGainers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                  No gainers found for this period.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredGainers.map((item) => (
                    <MoverCard key={`gain-${item.card_id}-${item.printing}`} item={item} />
                  ))}
                </div>
              )}
            </div>

            {/* Top Losers Section */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-100 text-xs font-bold text-rose-700">
                    ▼
                  </span>
                  <h2 className="text-lg font-bold text-slate-950">Top Price Drops</h2>
                </div>
                <span className="text-xs font-semibold text-rose-700">
                  {data.total_losers || filteredLosers.length} total drops
                </span>
              </div>

              {filteredLosers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                  No price drops recorded for this period.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredLosers.map((item) => (
                    <MoverCard key={`loss-${item.card_id}-${item.printing}`} item={item} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : direction === "up" ? (
          <div>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-950">
                Top Price Gainers ({period === "24h" ? "24 Hours" : period === "7d" ? "7 Days" : "30 Days"})
              </h2>
              <span className="text-xs font-medium text-slate-500">
                Page {page} of {totalPages} · {data.total_gainers || filteredGainers.length} cards
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredGainers.map((item) => (
                <MoverCard key={`gain-${item.card_id}-${item.printing}`} item={item} />
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-950">
                Top Price Drops ({period === "24h" ? "24 Hours" : period === "7d" ? "7 Days" : "30 Days"})
              </h2>
              <span className="text-xs font-medium text-slate-500">
                Page {page} of {totalPages} · {data.total_losers || filteredLosers.length} cards
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredLosers.map((item) => (
                <MoverCard key={`loss-${item.card_id}-${item.printing}`} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pagination Controls Bar */}
      {totalPages > 1 && (
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 sm:flex-row">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              Page <strong className="text-slate-900">{page}</strong> of <strong className="text-slate-900">{totalPages}</strong>
            </span>
            <span>·</span>
            <label className="flex items-center gap-1.5">
              <span>Per page:</span>
              <select
                value={perPage}
                onChange={(e) => handlePerPageChange(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500"
              >
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={36}>36</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => handlePageChange(page - 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => handlePageChange(pageNum)}
                  className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                    page === pageNum
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
                  }`}
                >
                  {pageNum}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => handlePageChange(page + 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
