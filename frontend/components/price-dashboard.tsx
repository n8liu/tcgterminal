import dynamic from "next/dynamic";
import type { CardPricing, PriceObservation } from "@/types/card";

const PriceHistoryChart = dynamic(
  () => import("@/components/price-history-chart").then((mod) => mod.PriceHistoryChart),
  {
    loading: () => (
      <div className="flex h-64 w-full items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 animate-pulse text-xs text-zinc-400">
        Loading price history chart...
      </div>
    ),
  },
);

type PriceDashboardProps = {
  pricing: CardPricing;
};

function timestamp(item: PriceObservation): number {
  return new Date(item.provider_updated_at ?? item.observed_at).getTime();
}

function latestByVariant(observations: PriceObservation[]): PriceObservation[] {
  const latest = new Map<string, PriceObservation>();
  for (const observation of observations) {
    const key = `${observation.provider}:${observation.variant_id}`;
    const current = latest.get(key);
    if (!current || timestamp(observation) > timestamp(current)) latest.set(key, observation);
  }
  return [...latest.values()];
}

function providerName(value: string): string {
  if (value.toLowerCase().includes("ebay")) return "eBay listings";
  if (value === "tcgapi") return "TCG API";
  return value;
}

function isEbayObservation(item: PriceObservation): boolean {
  return item.provider.toLowerCase().includes("ebay");
}

function dailyHistory(items: PriceObservation[]): { date: string; price: number }[] {
  const days = new Map<string, { total: number; count: number }>();
  for (const item of items) {
    const date = (item.provider_updated_at ?? item.observed_at).slice(0, 10);
    const current = days.get(date) ?? { total: 0, count: 0 };
    days.set(date, { total: current.total + item.price, count: current.count + 1 });
  }
  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, price: values.total / values.count }));
}

function money(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function variantLabel(item: PriceObservation): string {
  if (item.grading_company) return `${item.grading_company} ${item.grade ?? "Authentic"}`;
  return item.condition ?? "Raw";
}

function choosePrimaryRaw(items: PriceObservation[]): PriceObservation | null {
  const raw = items.filter((item) => !item.grading_company);
  return (
    raw.sort((a, b) => {
      const score = (item: PriceObservation) =>
        (item.provider === "tcgapi" ? 4 : 0) +
        (item.condition === "Near Mint" ? 3 : 0) +
        (/unlimited/i.test(item.printing ?? "") ? 2 : 0);
      return score(b) - score(a) || timestamp(b) - timestamp(a);
    })[0] ?? null
  );
}

function getListingUrl(item: PriceObservation): string | null {
  if (item.listing_url) return item.listing_url;
  if (isEbayObservation(item)) {
    const rawId = item.provider_card_id.replace(/^v1\|/, "").split("|")[0];
    if (rawId && /^\d+$/.test(rawId)) {
      return `https://www.ebay.com/itm/${rawId}`;
    }
  }
  return null;
}

function formatUpdatedDate(value: string | null): string {
  if (!value) return "Recent";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "Recent";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return "Recent";
  }
}

export function PriceDashboard({ pricing }: PriceDashboardProps) {
  const latest = latestByVariant(pricing.observations);
  const primaryRaw = choosePrimaryRaw(latest);
  const tcgPrimary = latest.find((item) => item.provider === "tcgapi") ?? primaryRaw;

  const psaTen = latest
    .filter((item) => item.grading_company === "PSA" && item.grade === 10)
    .sort((a, b) => timestamp(b) - timestamp(a))[0] ?? null;
  const graded = latest.filter((item) => item.grading_company);
  const matchedSources = pricing.provider_states.filter((item) => item.match_status === "matched").length;

  const ebayRawHistory = pricing.observations.filter(
    (item) => isEbayObservation(item) && !item.grading_company,
  );
  const fallbackHistory = primaryRaw
    ? pricing.observations.filter(
        (item) => item.provider === primaryRaw.provider && item.variant_id === primaryRaw.variant_id,
      )
    : [];
  const hasEbayHistory = ebayRawHistory.length > 0;
  const history = dailyHistory(hasEbayHistory ? ebayRawHistory : fallbackHistory);
  const historyCurrency = (hasEbayHistory ? ebayRawHistory[0] : primaryRaw)?.currency ?? "USD";
  const historyLabel = hasEbayHistory ? "eBay listings" : primaryRaw ? variantLabel(primaryRaw) : "Raw";
  const gradedMin = graded.length ? Math.min(...graded.map((item) => item.price)) : null;
  const gradedMax = graded.length ? Math.max(...graded.map((item) => item.price)) : null;

  const p24h = tcgPrimary?.price_change_24h;
  const p7d = tcgPrimary?.price_change_7d;
  const p30d = tcgPrimary?.price_change_30d;

  if (pricing.observations.length === 0) {
    return (
      <section className="mt-14 border-t border-stone-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-700">Market data</p>
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_8px_30px_rgba(33,45,25,0.04)] sm:p-6">
          <h2 className="text-lg font-bold text-slate-950">eBay listings price history</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            No verified exact-match eBay listings have been collected for this card yet. Its history will appear here as listings are verified.
          </p>
          <div className="mt-5">
            <PriceHistoryChart data={[]} currency="USD" label="eBay listings" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-14 border-t border-stone-200 pt-10">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-700">Market data</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Price overview</h2>
        </div>
        <p className="text-xs text-slate-500">Exact card matches only · Live TCG API & eBay market pricing</p>
      </div>

      {/* TCGPlayer Comprehensive Price Breakdown Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* TCG Market Price Card with Momentum */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">TCG Market Price</span>
            {tcgPrimary?.printing && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                {tcgPrimary.printing}
              </span>
            )}
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {money(tcgPrimary?.price, tcgPrimary?.currency)}
          </p>
          {/* 24h / 7d / 30d Momentum Pills */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p24h !== null && p24h !== undefined && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  p24h >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}
                title="24-Hour Price Change"
              >
                24h: {formatPercent(p24h)}
              </span>
            )}
            {p7d !== null && p7d !== undefined && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  p7d >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}
                title="7-Day Price Change"
              >
                7d: {formatPercent(p7d)}
              </span>
            )}
            {p30d !== null && p30d !== undefined && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  p30d >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}
                title="30-Day Price Change"
              >
                30d: {formatPercent(p30d)}
              </span>
            )}
          </div>
        </div>

        {/* Lowest Verified Listing */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lowest Verified</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {money(tcgPrimary?.low_price)}
          </p>
          <p className="mt-2 text-xs text-slate-400">Lowest active listing price</p>
        </div>

        {/* Lowest With Shipping */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lowest w/ Shipping</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {money(tcgPrimary?.lowest_with_shipping)}
          </p>
          <p className="mt-2 text-xs text-slate-400">Direct buyer out-of-pocket</p>
        </div>

        {/* Median Price */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Median Listing</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {money(tcgPrimary?.median_price)}
          </p>
          <p className="mt-2 text-xs text-slate-400">Midpoint across sellers</p>
        </div>

        {/* Buylist Price */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Store Buylist</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {money(tcgPrimary?.buylist_price)}
          </p>
          <p className="mt-2 text-xs text-slate-400">Store cash buyout rate</p>
        </div>
      </div>

      {/* Graded & Coverage Summary */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="PSA 10 Comps" value={money(psaTen?.price ?? null, psaTen?.currency)} note={psaTen ? providerName(psaTen.provider) : "No recent exact match"} />
        <Metric label="Graded Range" value={gradedMin === null ? "—" : `${money(gradedMin)}–${money(gradedMax)}`} note={`${graded.length} graded variants`} />
        <Metric label="Source Coverage" value={`${matchedSources}/${pricing.provider_states.length || 1}`} note={`${pricing.observations.length} observations`} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_8px_30px_rgba(33,45,25,0.04)] sm:p-6">
          <div>
            <h3 className="text-sm font-bold text-slate-950">
              {hasEbayHistory ? "eBay listings price history" : "Market price history"}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {hasEbayHistory
                ? "Daily average from exact-match, raw eBay listings"
                : primaryRaw
                  ? `Verified eBay sales are not loaded yet · showing ${providerName(primaryRaw.provider)} ${variantLabel(primaryRaw)}`
                  : "No exact-match raw history"}
            </p>
          </div>
          <div className="mt-5">
            <PriceHistoryChart data={history} currency={historyCurrency} label={historyLabel} />
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-5 sm:p-6">
          <h3 className="text-sm font-bold text-slate-950">Provider status</h3>
          <div className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200">
            {pricing.provider_states.map((state) => (
              <div className="flex items-center justify-between gap-4 py-3" key={state.provider}>
                <span className="text-sm text-zinc-700">{providerName(state.provider)}</span>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${state.match_status === "matched" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-white text-zinc-500"}`}>
                  {state.match_status === "matched" ? "Matched" : "No exact match"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            Unmatched provider results are excluded from every displayed price.
          </p>
        </div>
      </div>

      {/* Latest Variants Table with Complete Breakdown */}
      <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200">
        <div className="border-b border-zinc-200 bg-zinc-50/70 px-5 py-4">
          <h3 className="text-sm font-semibold text-zinc-950">Latest variants & pricing data</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                <th className="px-5 py-3 font-medium">Variant / Condition</th>
                <th className="px-5 py-3 font-medium">Printing</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Lowest / Shipping</th>
                <th className="px-5 py-3 font-medium">Median</th>
                <th className="px-5 py-3 font-medium">Buylist</th>
                <th className="px-5 py-3 font-medium">Last updated</th>
                <th className="px-5 py-3 text-right font-medium">Market price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {latest.sort((a, b) => b.price - a.price).slice(0, 12).map((item) => {
                const listingUrl = getListingUrl(item);
                return (
                  <tr key={`${item.provider}:${item.variant_id}`}>
                    <td className="px-5 py-3 text-sm font-medium text-zinc-900">{variantLabel(item)}</td>
                    <td className="px-5 py-3 text-sm text-zinc-600">{item.printing ?? "Standard"}</td>
                    <td className="px-5 py-3 text-sm">
                      {listingUrl ? (
                        <a
                          href={listingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                          title="View listing on eBay"
                        >
                          <span>{providerName(item.provider)}</span>
                          <svg
                            className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-zinc-600">{providerName(item.provider)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-600">
                      {item.low_price !== null && item.low_price !== undefined
                        ? `${money(item.low_price)} (${money(item.lowest_with_shipping)})`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-600">{money(item.median_price)}</td>
                    <td className="px-5 py-3 text-xs text-zinc-600">{money(item.buylist_price)}</td>
                    <td className="px-5 py-3 text-xs text-zinc-500">{formatUpdatedDate(item.provider_updated_at ?? item.observed_at)}</td>
                    <td className="px-5 py-3 text-right font-mono text-sm font-bold text-zinc-950">{money(item.price, item.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_8px_24px_rgba(33,45,25,0.035)]">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 truncate text-xs text-slate-500">{note}</p>
    </div>
  );
}
