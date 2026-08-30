import type { Metadata } from "next";
import { getTopPokemonVolume } from "@/lib/api";
import { TopVolumeDashboard } from "@/components/top-volume-dashboard";

export const metadata: Metadata = {
  title: "Top 50 Pokémon Sales by Volume | TCGTerminal",
  description: "Rankings of the top 50 Pokémon characters by total market sales volume, transaction liquidity, and year-over-year market momentum.",
};

export const dynamic = "force-dynamic";

export default async function TopVolumePage() {
  const initialData = await getTopPokemonVolume({ timeframe: "2026_ytd" });

  return (
    <main className="min-h-[calc(100vh-65px)] bg-[#f7f8f6] text-slate-950">
      <TopVolumeDashboard initialData={initialData} />
    </main>
  );
}
