import { Suspense } from "react";

import { CatalogBrowser } from "@/components/catalog-browser";
import { getCardSets, searchCards } from "@/lib/api";
import type { CardSort } from "@/types/card";

type HomeProps = {
  searchParams: Promise<{ q?: string; set?: string; sort?: string; hide_sealed?: string; sealed?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const setId = params.set?.trim() ?? "";
  const hideSealed = params.hide_sealed === "false" || params.sealed === "true" ? false : true;
  const validSorts: CardSort[] = ["price_desc", "price_asc", "number_asc", "number_desc", "name", "set"];
  const sortBy: CardSort = validSorts.includes(params.sort as CardSort)
    ? (params.sort as CardSort)
    : "price_desc";
  const [cards, sets] = await Promise.all([
    searchCards(query, { setId, sortBy, hideSealed }),
    getCardSets(),
  ]);

  return (
    <main className="min-h-[calc(100vh-65px)] bg-[#f7f8f6] text-slate-950">
      <Suspense fallback={null}>
        <CatalogBrowser
          initialCards={cards}
          initialHideSealed={hideSealed}
          initialQuery={query}
          initialSetId={setId}
          initialSortBy={sortBy}
          sets={sets}
        />
      </Suspense>
    </main>
  );
}
