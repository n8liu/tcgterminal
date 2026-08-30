"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = {
  date: string;
  price: number;
};

type PriceHistoryChartProps = {
  data: ChartPoint[];
  currency: string;
  label: string;
};

function money(value: number, currency: string, compact = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function PriceHistoryChart({ data, currency, label }: PriceHistoryChartProps) {
  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 px-6 text-center">
        <div>
          <p className="text-sm font-medium text-zinc-800">History is still being collected</p>
          <p className="mt-1 text-xs text-zinc-500">Two dated observations are needed for a trend.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-64 w-full" aria-label={`${label} price history chart`} role="img">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data} margin={{ bottom: 0, left: 0, right: 12, top: 8 }}>
          <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="date"
            minTickGap={32}
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(value: string) =>
              new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
                new Date(`${value}T00:00:00Z`),
              )
            }
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            domain={["auto", "auto"]}
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(value: number) => money(value, currency, true)}
            tickLine={false}
            width={54}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #d4d4d8",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              fontSize: "12px",
            }}
            formatter={(value) => [money(Number(value), currency), label]}
            labelFormatter={(value) =>
              new Intl.DateTimeFormat("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${String(value)}T00:00:00Z`))
            }
          />
          <Line
            activeDot={{ fill: "#4d7c0f", r: 4, stroke: "#ffffff", strokeWidth: 2 }}
            dataKey="price"
            dot={false}
            isAnimationActive={false}
            stroke="#65a30d"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
