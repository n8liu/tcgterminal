"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { getTopPokemonVolume } from "@/lib/api";
import type { PokemonVolumeItem, PokemonVolumeResponse, VolumeTimeframe } from "@/types/card";

type TopVolumeDashboardProps = {
  initialData: PokemonVolumeResponse;
};

function TrendBadge({ item }: { item: PokemonVolumeItem }) {
  if (item.yoy_trend === "up") {
    return (
      <div className="flex items-center gap-1.5" title={`+${item.yoy_percentage}% Year-over-Year`}>
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500 text-[10px] font-black text-white shadow-xs">
          ▲
        </span>
        <span className="hidden text-[11px] font-bold text-emerald-700 sm:inline">
          +{item.yoy_percentage.toFixed(1)}%
        </span>
      </div>
    );
  }
  if (item.yoy_trend === "down") {
    return (
      <div className="flex items-center gap-1.5" title={`${item.yoy_percentage}% Year-over-Year`}>
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-rose-500 text-[10px] font-black text-white shadow-xs">
          ▼
        </span>
        <span className="hidden text-[11px] font-bold text-rose-700 sm:inline">
          {item.yoy_percentage.toFixed(1)}%
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5" title="Stable Year-over-Year">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-400 text-[11px] font-black text-white shadow-xs">
        ▬
      </span>
      <span className="hidden text-[11px] font-bold text-slate-500 sm:inline">
        0.0%
      </span>
    </div>
  );
}

function VolumeRow({ item }: { item: PokemonVolumeItem }) {
  const isHighlighted = item.yoy_trend === "up";

  return (
    <div
      className={`group relative flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-all duration-150 ${
        isHighlighted
          ? "border-amber-300/80 bg-amber-300 hover:bg-amber-350 hover:shadow-md"
          : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/90 hover:shadow-sm"
      }`}
    >
      {/* Left section: YOY, Rank, Icon, Name */}
      <div className="flex min-w-0 items-center gap-3">
        {/* YOY Indicator */}
        <div className="flex w-6 shrink-0 justify-center sm:w-14">
          <TrendBadge item={item} />
        </div>

        {/* Rank Number */}
        <div className="w-7 shrink-0 text-center font-black text-slate-900 sm:w-8 sm:text-base">
          {item.rank}
        </div>

        {/* Pokémon Icon Sprite */}
        <div className="relative h-10 w-10 shrink-0 overflow-hidden drop-shadow-sm transition-transform duration-200 group-hover:scale-110 sm:h-11 sm:w-11">
          <Image
            src={item.sprite_url}
            alt={item.pokemon_name}
            fill
            className="object-contain"
            sizes="44px"
            unoptimized
          />
        </div>

        {/* Pokémon Name & DB Meta */}
        <div className="min-w-0">
          <Link
            href={`/?q=${encodeURIComponent(item.pokemon_name)}`}
            className="truncate text-sm font-extrabold text-slate-950 hover:text-emerald-700 hover:underline sm:text-base"
          >
            {item.pokemon_name}
          </Link>
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-600 sm:text-[11px]">
            <span>#{item.dex_number}</span>
            {item.cards_count > 0 && (
              <>
                <span>•</span>
                <span>{item.cards_count} cards</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right section: Volume & Top Card */}
      <div className="shrink-0 text-right">
        <div className="text-sm font-black tracking-tight text-slate-950 sm:text-base">
          {item.volume_formatted}
          <span className="ml-1 hidden text-[10px] font-bold text-slate-500 sm:inline">
            USD
          </span>
        </div>
        {item.top_card_name && item.top_card_price && (
          <Link
            href={item.top_card_id ? `/cards/${encodeURIComponent(item.top_card_id)}` : `/?q=${encodeURIComponent(item.pokemon_name)}`}
            className="hidden max-w-[130px] truncate text-[10px] font-semibold text-slate-600 hover:text-emerald-700 md:block"
            title={`Top: ${item.top_card_name} ($${item.top_card_price.toLocaleString()})`}
          >
            Top: ${item.top_card_price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Link>
        )}
      </div>
    </div>
  );
}

export function TopVolumeDashboard({ initialData }: TopVolumeDashboardProps) {
  const [data, setData] = useState<PokemonVolumeResponse>(initialData);
  const [timeframe, setTimeframe] = useState<VolumeTimeframe>("2026_ytd");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"dual" | "single">("dual");
  const [isLoading, setIsLoading] = useState(false);

  // Timeframe switch
  const handleTimeframeChange = async (tf: VolumeTimeframe) => {
    setTimeframe(tf);
    setIsLoading(true);
    try {
      const res = await getTopPokemonVolume({ timeframe: tf, query: searchQuery.trim() || undefined });
      setData(res);
    } catch (err) {
      console.error("Failed fetching top volume timeframe:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered list based on search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return data.items;
    const q = searchQuery.toLowerCase().trim();
    return data.items.filter(
      (item) =>
        item.pokemon_name.toLowerCase().includes(q) ||
        String(item.dex_number).includes(q) ||
        String(item.rank).includes(q)
    );
  }, [data.items, searchQuery]);

  // Dual column split: items 1-25 and 26-50
  const column1 = useMemo(() => {
    if (viewMode === "single") return filteredItems;
    if (searchQuery.trim()) {
      const mid = Math.ceil(filteredItems.length / 2);
      return filteredItems.slice(0, mid);
    }
    return filteredItems.slice(0, 25);
  }, [filteredItems, viewMode, searchQuery]);

  const column2 = useMemo(() => {
    if (viewMode === "single") return [];
    if (searchQuery.trim()) {
      const mid = Math.ceil(filteredItems.length / 2);
      return filteredItems.slice(mid);
    }
    return filteredItems.slice(25, 50);
  }, [filteredItems, viewMode, searchQuery]);

  // Summary stats
  const totalVolumeFormatted = useMemo(() => {
    const sum = data.items.reduce((acc, curr) => acc + curr.volume_usd, 0);
    if (sum >= 1_000_000_000) return `$${(sum / 1_000_000_000).toFixed(2)}B`;
    return `$${(sum / 1_000_000).toFixed(1)}M`;
  }, [data.items]);

  const topGainer = useMemo(() => {
    const ups = [...data.items].filter((i) => i.yoy_trend === "up");
    ups.sort((a, b) => b.yoy_percentage - a.yoy_percentage);
    return ups[0];
  }, [data.items]);

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
              Market Share &amp; Liquidity Leaderboard
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Top 50 Pokémon Sales by Volume
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Ranking the most traded Pokémon characters by aggregated observed market value, active buyer depth, and year-over-year price momentum from real price observations.
          </p>
        </div>

        {/* Top Summary Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-50/70 px-3.5 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 text-xs font-bold text-white shadow-xs">
              💰
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Tracked Volume</p>
              <p className="text-xs font-black text-slate-950">{totalVolumeFormatted} USD</p>
            </div>
          </div>

          {topGainer && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-50/70 px-3.5 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white shadow-xs">
                ▲
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Fastest Growth</p>
                <p className="text-xs font-black text-emerald-950">{topGainer.pokemon_name} (+{topGainer.yoy_percentage}%)</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar: Timeframe, View Mode & Search */}
      <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        {/* Timeframe selector */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => handleTimeframeChange("2026_ytd")}
            className={`rounded-lg px-3.5 py-1.5 transition ${
              timeframe === "2026_ytd"
                ? "bg-white text-slate-950 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            2026 YTD Volume
          </button>
          <button
            type="button"
            onClick={() => handleTimeframeChange("all_time")}
            className={`rounded-lg px-3.5 py-1.5 transition ${
              timeframe === "all_time"
                ? "bg-white text-slate-950 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All-Time Volume
          </button>
          <button
            type="button"
            onClick={() => handleTimeframeChange("30d")}
            className={`rounded-lg px-3.5 py-1.5 transition ${
              timeframe === "30d"
                ? "bg-white text-slate-950 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Last 30 Days
          </button>
        </div>

        {/* View Mode & Search Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Dual vs Single Column Toggle */}
          <div className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold md:flex">
            <button
              type="button"
              onClick={() => setViewMode("dual")}
              className={`rounded-lg px-3 py-1.5 transition ${
                viewMode === "dual"
                  ? "bg-white text-slate-950 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Side-by-Side (1-50)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("single")}
              className={`rounded-lg px-3 py-1.5 transition ${
                viewMode === "single"
                  ? "bg-white text-slate-950 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Single List
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <input
              type="text"
              placeholder="Search top 50 Pokémon..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Leaderboard Table Grid */}
      <div className="mt-6">
        {isLoading ? (
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
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-base font-bold text-slate-800">No Pokémon found matching “{searchQuery}”</p>
            <p className="mt-1 text-xs text-slate-500">Try searching for Charizard, Pikachu, Gengar, or Mew.</p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-600"
            >
              Clear Search
            </button>
          </div>
        ) : viewMode === "dual" ? (
          /* Dual Column Layout (Matching Image: Rank 1-25 Left, Rank 26-50 Right) */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
            {/* Column 1: Rank 1 to 25 */}
            <div className="space-y-1.5">
              {/* Column Header */}
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center sm:w-14">▲ YOY</span>
                  <span className="w-7 text-center sm:w-8">RANK</span>
                  <span>POKEMON</span>
                </div>
                <span>VOLUME ({timeframe === "2026_ytd" ? "2026 YTD" : timeframe === "all_time" ? "ALL-TIME" : "30D"})</span>
              </div>

              {column1.map((item) => (
                <VolumeRow key={item.rank} item={item} />
              ))}
            </div>

            {/* Column 2: Rank 26 to 50 */}
            <div className="space-y-1.5">
              {/* Column Header */}
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center sm:w-14">▲ YOY</span>
                  <span className="w-7 text-center sm:w-8">RANK</span>
                  <span>POKEMON</span>
                </div>
                <span>VOLUME ({timeframe === "2026_ytd" ? "2026 YTD" : timeframe === "all_time" ? "ALL-TIME" : "30D"})</span>
              </div>

              {column2.map((item) => (
                <VolumeRow key={item.rank} item={item} />
              ))}
            </div>
          </div>
        ) : (
          /* Single Column Long List View */
          <div className="space-y-1.5">
            {/* Column Header */}
            <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
              <div className="flex items-center gap-3">
                <span className="w-6 text-center sm:w-14">▲ YOY</span>
                <span className="w-7 text-center sm:w-8">RANK</span>
                <span>POKEMON</span>
              </div>
              <span>VOLUME ({timeframe === "2026_ytd" ? "2026 YTD" : timeframe === "all_time" ? "ALL-TIME" : "30D"})</span>
            </div>

            {filteredItems.map((item) => (
              <VolumeRow key={item.rank} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
