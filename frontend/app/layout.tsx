import type { Metadata } from "next";

import { NavHeader } from "@/components/nav-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "TCGTerminal - Pokémon Card Price Tracker & Market Analytics",
  description: "Pokémon card catalog and market analytics powered by TCG API and verified eBay listings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <NavHeader />
        {children}
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-[1600px] px-5 py-8 text-xs text-slate-500 sm:px-8">
            Pokémon catalog and market pricing via TCG API. Sold-market analytics via verified eBay listings.
          </div>
        </footer>
      </body>
    </html>
  );
}
