"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cardImageUrl, getGradingProfit } from "@/lib/api";
import type {
  GradingProfitResponse,
  GradingSortOption,
} from "@/types/card";

type PresetFilter = "all" | "safe" | "high_profit" | "high_roi" | "budget" | "high_spread";

type GradingProfitDashboardProps = {
  initialData: GradingProfitResponse;
};

export function GradingProfitDashboard({ initialData }: GradingProfitDashboardProps) {
  const [data, setData] = useState<GradingProfitResponse>(initialData);
  const [loading, setLoading] = useState(false);

  // Filter & State controls
  const [gradingFee, setGradingFee] = useState<number>(initialData.grading_fee || 24.99);
  const [sortBy, setSortBy] = useState<GradingSortOption>(
    (initialData.sort_by as GradingSortOption) || "psa10_profit_desc"
  );
  const [targetGrade, setTargetGrade] = useState<"all" | "psa10" | "psa9">("all");
  const [presetFilter, setPresetFilter] = useState<PresetFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(initialData.page || 1);
  const [perPage] = useState(initialData.per_page || 12);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Derived filter arguments from preset
  const { minProfit, psa9SafeOnly } = useMemo(() => {
    let minP: number | undefined = undefined;
    let safeOnly = false;

    if (presetFilter === "safe") {
      safeOnly = true;
    } else if (presetFilter === "high_profit") {
      minP = 100;
    }

    return { minProfit: minP, psa9SafeOnly: safeOnly };
  }, [presetFilter]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGradingProfit({
        gradingFee,
        sortBy,
        targetGrade,
        minProfit,
        maxRawPrice: presetFilter === "budget" ? 25 : undefined,
        minSpread: presetFilter === "high_spread" ? 10 : undefined,
        psa9SafeOnly,
        query: debouncedQuery.trim() || undefined,
        page,
        perPage,
      });
      setData(res);
    } catch (err) {
      console.error("Failed fetching grading profit opportunities:", err);
    } finally {
      setLoading(false);
    }
  }, [gradingFee, sortBy, targetGrade, minProfit, presetFilter, psa9SafeOnly, debouncedQuery, page, perPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Local preset quick-filters apply
  const handlePresetClick = (preset: PresetFilter) => {
    const next = presetFilter === preset ? "all" : preset;
    setPresetFilter(next);
    setPage(1);
    if (next === "high_roi") {
      setSortBy("psa10_roi_desc");
    } else if (next === "budget") {
      setSortBy("raw_price_asc");
    } else if (next === "high_spread") {
      setSortBy("spread_desc");
    } else if (next === "safe") {
      setSortBy("psa9_profit_desc");
    } else {
      setSortBy("psa10_profit_desc");
    }
  };

  // Preset fee options
  const feePresets = [
    { label: "PSA Bulk ($19)", fee: 19.0 },
    { label: "PSA Value ($24.99)", fee: 24.99 },
    { label: "PSA Regular ($40)", fee: 40.0 },
    { label: "CGC / SGC ($15)", fee: 15.0 },
  ];

  // Stats calculation
  const stats = useMemo(() => {
    const items = data.items;
    if (!items.length) return { avgSpread: "0.0x", safeCount: 0, topProfit: "$0", topRoi: "0%" };

    const spreads = items
      .map((i) => i.spread_multiplier)
      .filter((s): s is number => typeof s === "number" && s > 0);
    const avgSpreadVal = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
    const safeCountVal = items.filter((i) => i.psa9_safe).length;

    const maxProfit = Math.max(...items.map((i) => i.psa10_profit || 0));
    const maxRoi = Math.max(...items.map((i) => i.psa10_roi || 0));

    return {
      avgSpread: `${avgSpreadVal.toFixed(1)}x`,
      safeCount: safeCountVal,
      topProfit: maxProfit > 0 ? `+$${maxProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0",
      topRoi: maxRoi > 0 ? `+${maxRoi.toFixed(0)}%` : "0%",
    };
  }, [data.items]);

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">
              Real-Time Grading Arbitrage
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Expected Grading Profitability
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Find the most profitable Pokémon cards to submit for grading. Calculate exact net dollar spreads and ROIs between raw market prices and verified PSA 10 &amp; PSA 9 comps.
          </p>
        </div>

        {/* Interactive Fee Simulator Inline */}
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:min-w-[300px]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Grading Fee Simulator
            </span>
            <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-xs font-black text-indigo-700 border border-indigo-200">
              ${gradingFee.toFixed(2)} / card
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-bold text-slate-400">$10</span>
            <input
              type="range"
              min="10"
              max="100"
              step="1"
              value={gradingFee}
              onChange={(e) => setGradingFee(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-indigo-600"
              aria-label="Grading Fee Slider"
            />
            <span className="text-[10px] font-bold text-slate-400">$100</span>
          </div>

          <div className="flex items-center gap-1 pt-0.5">
            {feePresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setGradingFee(preset.fee)}
                className={`flex-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition ${
                  Math.abs(gradingFee - preset.fee) < 0.01
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                ${preset.fee}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="mb-6 space-y-4">
        {/* Preset Quick-Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handlePresetClick("all")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              presetFilter === "all"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            🔥 All Opportunities
          </button>
          <button
            type="button"
            onClick={() => handlePresetClick("safe")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              presetFilter === "safe"
                ? "bg-emerald-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            🛡️ PSA 9 Safe Floor (No Loss)
          </button>
          <button
            type="button"
            onClick={() => handlePresetClick("high_profit")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              presetFilter === "high_profit"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            💰 $100+ Net Profit
          </button>
          <button
            type="button"
            onClick={() => handlePresetClick("high_roi")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              presetFilter === "high_roi"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            🚀 Highest ROI %
          </button>
          <button
            type="button"
            onClick={() => handlePresetClick("budget")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              presetFilter === "budget"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            ⚡ Budget Raw (&lt; $25)
          </button>
          <button
            type="button"
            onClick={() => handlePresetClick("high_spread")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              presetFilter === "high_spread"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            📈 Highest Multiplier (10x+)
          </button>
        </div>

        {/* Detailed Controls Grid */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search card name or set..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-4 text-xs font-medium text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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

          <div className="flex flex-wrap items-center gap-3">
            {/* Target Grade Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="target-grade-select" className="text-xs font-bold text-slate-600">Grade:</label>
              <select
                id="target-grade-select"
                value={targetGrade}
                onChange={(e) => {
                  setTargetGrade(e.target.value as "all" | "psa10" | "psa9");
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">All Grades</option>
                <option value="psa10">PSA 10 Only</option>
                <option value="psa9">PSA 9 Only</option>
              </select>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="sort-by-select" className="text-xs font-bold text-slate-600">Sort By:</label>
              <select
                id="sort-by-select"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as GradingSortOption);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="psa10_profit_desc">Highest PSA 10 Net Profit ($)</option>
                <option value="psa10_roi_desc">Highest PSA 10 ROI (%)</option>
                <option value="psa9_profit_desc">Highest PSA 9 Net Profit ($)</option>
                <option value="psa9_roi_desc">Highest PSA 9 ROI (%)</option>
                <option value="ev_desc">Risk-Adjusted Expected Value ($)</option>
                <option value="spread_desc">Highest PSA 10 / Raw Multiplier</option>
                <option value="raw_price_asc">Lowest Raw Entry Cost ($)</option>
                <option value="raw_price_desc">Highest Raw Value ($)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Card Results Grid */}
      {loading ? (
        <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <span className="text-xs font-semibold text-slate-500">Calculating grading profit margins...</span>
          </div>
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="text-4xl">🔍</span>
          <h3 className="mt-3 text-base font-bold text-slate-900">No grading opportunities found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Try adjusting your search query, grading fee, or switching the filter to &ldquo;All Opportunities&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setPresetFilter("all");
              setTargetGrade("all");
              setSortBy("psa10_profit_desc");
            }}
            className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 shadow-sm"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.items.map((item) => {
            const rawCost = item.raw_price;
            const fee = item.grading_fee;
            const totalBuyIn = rawCost + fee;

            return (
              <div
                key={item.card_id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-xl"
              >
                {/* PSA 9 Safe Banner Badge */}
                {item.psa9_safe && (
                  <div className="absolute -right-12 top-6 rotate-45 bg-emerald-600 px-12 py-0.5 text-center text-[10px] font-black uppercase tracking-wider text-white shadow-md">
                    PSA 9 Safe 🛡️
                  </div>
                )}

                <div>
                  {/* Card Thumbnail & Core Info */}
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
                        <div className="text-[11px] font-semibold text-indigo-600 truncate">
                          {item.set_name} {item.number ? `#${item.number}` : ""}
                        </div>
                        <h2 className="text-sm font-bold text-slate-950 line-clamp-2 leading-tight">
                          <Link href={`/cards/${encodeURIComponent(item.card_id)}`} className="hover:underline">
                            {item.name}
                          </Link>
                        </h2>
                        {item.rarity && (
                          <span className="mt-1 inline-block text-[10px] font-medium text-slate-500">
                            {item.rarity}
                          </span>
                        )}
                      </div>

                      {item.spread_multiplier && (
                        <div className="inline-flex items-center gap-1 text-[11px] font-black text-indigo-700">
                          <span>🚀</span>
                          <span>{item.spread_multiplier}x PSA 10 Spread</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cost & Spread Breakdown Spectrum */}
                  <div className="mt-4 space-y-2 rounded-2xl bg-slate-50/80 p-3 text-xs border border-slate-100">
                    {/* Buy-In Summary */}
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-[11px] font-medium">Raw Buy-In:</span>
                      <span className="font-bold text-slate-900">${item.raw_price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>+ Grading Fee:</span>
                      <span>${item.grading_fee.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200/80 pt-1.5 text-[11px] font-bold text-slate-800">
                      <span>Total Cost:</span>
                      <span>${totalBuyIn.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Grade Targets: PSA 10 & PSA 9 comparison */}
                  <div className="mt-3 space-y-2.5">
                    {/* PSA 10 Target */}
                    {typeof item.psa10_price === "number" && typeof item.psa10_profit === "number" && (
                      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-purple-50/40 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                            PSA 10
                          </span>
                          <span className="text-xs font-extrabold text-slate-900">
                            ${item.psa10_price.toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-emerald-700">
                            {item.psa10_profit >= 0 ? "+" : ""}
                            ${item.psa10_profit.toFixed(2)} Net Profit
                          </span>
                          {typeof item.psa10_roi === "number" && (
                            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-800">
                              +{item.psa10_roi.toFixed(0)}% ROI
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* PSA 9 Target / Floor */}
                    {typeof item.psa9_price === "number" && typeof item.psa9_profit === "number" && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-1.5 py-0.5 text-[10px] font-black text-white">
                            PSA 9
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            ${item.psa9_price.toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          <span
                            className={`font-semibold ${
                              item.psa9_profit >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {item.psa9_profit >= 0 ? "+" : ""}
                            ${item.psa9_profit.toFixed(2)} Net Profit
                          </span>
                          {typeof item.psa9_roi === "number" && (
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                item.psa9_roi >= 0
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {item.psa9_roi >= 0 ? "+" : ""}
                              {item.psa9_roi.toFixed(0)}% ROI
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Link */}
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <Link
                    href={`/cards/${encodeURIComponent(item.card_id)}`}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-800 transition hover:bg-indigo-600 hover:text-white"
                  >
                    <span>View Price History &amp; Comps</span>
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
            <span className="font-bold text-slate-900">{data.total_pages}</span> ({data.total_cards} total opportunities)
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
            <div className="text-xs font-bold text-indigo-600 px-2">
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
