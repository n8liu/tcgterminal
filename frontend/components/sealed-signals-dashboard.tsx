"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cardImageUrl, getSealedSignals } from "@/lib/api";
import type {
  SealedProductType,
  SealedSignalsResponse,
  SealedSignalType,
  SealedSortOption,
} from "@/types/card";

type SealedSignalsDashboardProps = {
  initialData: SealedSignalsResponse;
};

export function SealedSignalsDashboard({ initialData }: SealedSignalsDashboardProps) {
  const [data, setData] = useState<SealedSignalsResponse>(initialData);
  const [loading, setLoading] = useState(false);

  // Filters & State
  const [signal, setSignal] = useState<SealedSignalType>(
    (initialData.signal_filter as SealedSignalType) || "all"
  );
  const [productType, setProductType] = useState<SealedProductType>(
    (initialData.product_type_filter as SealedProductType) || "all"
  );
  const [sortBy, setSortBy] = useState<SealedSortOption>(
    (initialData.sort_by as SealedSortOption) || "score_desc"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(initialData.page || 1);
  const [perPage, setPerPage] = useState(initialData.per_page || 12);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSealedSignals({
        signal,
        productType,
        sortBy,
        query: debouncedQuery.trim() || undefined,
        page,
        perPage,
      });
      setData(res);
    } catch (err) {
      console.error("Failed fetching sealed investment signals:", err);
    } finally {
      setLoading(false);
    }
  }, [signal, productType, sortBy, debouncedQuery, page, perPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Stats calculation
  const stats = useMemo(() => {
    const items = data.items;
    if (!items.length) {
      return {
        strongBuyCount: data.strong_buy_count || 0,
        lowSupplyCount: 0,
        avgScore: "0",
        topGain30d: "0%",
      };
    }

    const lowSupply = items.filter((i) => i.total_listings > 0 && i.total_listings < 15).length;
    const scores = items.map((i) => i.signal_score);
    const avgScoreVal = scores.reduce((a, b) => a + b, 0) / scores.length;

    const max30d = Math.max(...items.map((i) => i.price_change_30d || 0));

    return {
      strongBuyCount: data.strong_buy_count || 0,
      lowSupplyCount: lowSupply,
      avgScore: avgScoreVal.toFixed(0),
      topGain30d: max30d > 0 ? `+${max30d.toFixed(1)}%` : "0%",
    };
  }, [data]);

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
              Quantitative Sealed Analytics
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Invest with data, not opinions.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Real-time supply float, retail buylist demand, and pricing momentum metrics generating quantitative 0–100 buy signals for sealed Pokémon TCG products.
          </p>
        </div>

        {/* Stats Highlights */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-50/70 px-3.5 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
              🟢
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Strong Buys</p>
              <p className="text-xs font-black text-emerald-950">{data.strong_buy_count} Products</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-50/70 px-3.5 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 text-xs font-bold text-white">
              📦
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Low Supply Float</p>
              <p className="text-xs font-black text-amber-950">{stats.lowSupplyCount} Items &lt; 15 listings</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="mb-6 space-y-4">
        {/* Signal Status Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSignal("all");
              setPage(1);
            }}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              signal === "all"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            🔥 All Signals ({data.total_items})
          </button>
          <button
            type="button"
            onClick={() => {
              setSignal("strong_buy");
              setPage(1);
            }}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              signal === "strong_buy"
                ? "bg-emerald-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            🟢 Strong Buy ({data.strong_buy_count})
          </button>
          <button
            type="button"
            onClick={() => {
              setSignal("buy");
              setPage(1);
            }}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              signal === "buy"
                ? "bg-amber-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            🟡 Buy ({data.buy_count})
          </button>
          <button
            type="button"
            onClick={() => {
              setSignal("hold");
              setPage(1);
            }}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              signal === "hold"
                ? "bg-slate-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            ⚖️ Hold ({data.hold_count})
          </button>
          <button
            type="button"
            onClick={() => {
              setSignal("underperform");
              setPage(1);
            }}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              signal === "underperform"
                ? "bg-rose-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            🔴 Underperform ({data.underperform_count})
          </button>
        </div>

        {/* Product Type Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs font-bold text-slate-500 mr-1">Category:</span>
          {[
            { id: "all", label: "All Products" },
            { id: "booster_box", label: "📦 Booster Boxes" },
            { id: "etb", label: "🏆 Elite Trainer Boxes (ETBs)" },
            { id: "bundle", label: "🎁 Booster Bundles" },
            { id: "case", label: "💼 Cases" },
            { id: "blister", label: "🃏 Blisters" },
            { id: "pack", label: "✨ Booster Packs" },
            { id: "collection", label: "🗃️ Collections & Tins" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setProductType(cat.id as SealedProductType);
                setPage(1);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                productType === cat.id
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Detailed Search & Sort Controls */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search sealed item (e.g. 151 Booster Bundle, Evolving Skies ETB)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-4 text-xs font-medium text-slate-900 placeholder-slate-400 transition focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Sort Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="sealed-sort-by-select" className="text-xs font-bold text-slate-600">Sort By:</label>
              <select
                id="sealed-sort-by-select"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SealedSortOption);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="score_desc">Highest Buy Signal Score (0-100)</option>
                <option value="supply_asc">Lowest Supply / Tightest Float</option>
                <option value="momentum_desc">Highest 30D Momentum Velocity</option>
                <option value="price_desc">Highest Market Price ($)</option>
                <option value="price_asc">Lowest Market Price ($)</option>
                <option value="age_desc">Oldest Set Vintage (Out of Print)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Sealed Products Grid */}
      {loading ? (
        <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
            <span className="text-xs font-semibold text-slate-500">Computing quantitative supply &amp; demand signals...</span>
          </div>
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="text-4xl">📦</span>
          <h3 className="mt-3 text-base font-bold text-slate-900">No sealed products match your criteria</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Try adjusting your search query, product type filter, or selecting &ldquo;All Signals&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSignal("all");
              setProductType("all");
              setSortBy("score_desc");
            }}
            className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700 shadow-sm"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.items.map((item) => {
            const isStrongBuy = item.signal_label === "STRONG BUY";
            const isBuy = item.signal_label === "BUY";
            const isHold = item.signal_label === "HOLD";

            return (
              <div
                key={item.card_id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-amber-400 hover:shadow-xl"
              >
                <div>
                  {/* Top Bar: Product Type & Signal Tag */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-700">
                      {item.product_type}
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider shadow-sm ${
                        isStrongBuy
                          ? "bg-emerald-600 text-white"
                          : isBuy
                          ? "bg-amber-600 text-white"
                          : isHold
                          ? "bg-slate-600 text-white"
                          : "bg-rose-600 text-white"
                      }`}
                    >
                      {item.signal_label}
                    </span>
                  </div>

                  {/* Thumbnail & Product Details */}
                  <div className="flex gap-4">
                    <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
                      <Image
                        src={cardImageUrl(item.image_url)}
                        alt={item.name}
                        fill
                        sizes="80px"
                        className="object-contain p-1 transition duration-300 group-hover:scale-105"
                      />
                    </div>

                    <div className="flex flex-1 flex-col justify-between overflow-hidden">
                      <div>
                        <div className="text-[11px] font-semibold text-amber-700 truncate">
                          {item.set_name}
                        </div>
                        <h2 className="text-sm font-bold text-slate-950 line-clamp-2 leading-tight">
                          <Link href={`/cards/${encodeURIComponent(item.card_id)}`} className="hover:underline">
                            {item.name}
                          </Link>
                        </h2>
                        {item.set_age_months > 0 && (
                          <span className="mt-1 inline-block text-[10px] font-medium text-slate-500">
                            {item.set_age_months} months vintage • {item.set_age_months >= 24 ? "Out of Print" : "Active Era"}
                          </span>
                        )}
                      </div>

                      {/* Score Gauge Pill */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-900 border border-amber-200">
                          <span>🎯</span>
                          <span>Score: {item.signal_score}/100</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4-Factor Breakdown Metrics Bar */}
                  <div className="mt-4 rounded-2xl bg-slate-50 p-3 border border-slate-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Factor Breakdown
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="flex items-center gap-1">📦 Supply:</span>
                        <span className="font-bold text-slate-900">{item.supply_score}/30</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="flex items-center gap-1">🏦 Demand:</span>
                        <span className="font-bold text-slate-900">{item.demand_score}/25</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="flex items-center gap-1">🚀 Velocity:</span>
                        <span className="font-bold text-slate-900">{item.momentum_score}/25</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="flex items-center gap-1">⏳ Vintage:</span>
                        <span className="font-bold text-slate-900">{item.vintage_score}/20</span>
                      </div>
                    </div>
                  </div>

                  {/* Pricing and Supply Float Grid */}
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-900 p-3 text-white">
                    <div>
                      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        Market Price
                      </div>
                      <div className="text-base font-black text-white">
                        ${item.market_price.toFixed(2)}
                      </div>
                      {typeof item.price_change_30d === "number" && (
                        <div
                          className={`text-[10px] font-bold ${
                            item.price_change_30d >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {item.price_change_30d >= 0 ? "+" : ""}
                          {item.price_change_30d.toFixed(1)}% 30d
                        </div>
                      )}
                    </div>

                    <div className="border-l border-slate-800 pl-3">
                      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        Market Float
                      </div>
                      <div className="text-sm font-bold text-amber-400">
                        {item.total_listings > 0 ? `${item.total_listings} Listings` : "Low Float"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {item.supply_rating}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Link */}
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <Link
                    href={`/cards/${encodeURIComponent(item.card_id)}`}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-800 transition hover:bg-amber-600 hover:text-white"
                  >
                    <span>View Product Details &amp; Comps</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {data.total_pages > 1 && (
        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
          <div className="text-xs font-medium text-slate-500">
            Showing Page <span className="font-bold text-slate-900">{data.page}</span> of{" "}
            <span className="font-bold text-slate-900">{data.total_pages}</span> ({data.total_items} total sealed items)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white shadow-sm"
            >
              ← Previous
            </button>
            <div className="text-xs font-bold text-amber-600 px-2">
              {data.page} / {data.total_pages}
            </div>
            <button
              type="button"
              disabled={data.page >= data.total_pages}
              onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white shadow-sm"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
