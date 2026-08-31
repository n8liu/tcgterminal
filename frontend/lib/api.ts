import type {
  CardDetail,
  CardPricing,
  CardSetOption,
  CardSort,
  CardSummary,
  GradingProfitResponse,
  GradingSortOption,
  MarketMoversResponse,
  MoverDirection,
  MoverPeriod,
  SealedProductType,
  SealedSignalsResponse,
  SealedSignalType,
  SealedSortOption,
  PokemonVolumeResponse,
  VolumeTimeframe,
  LiveUpdatesResponse,
  LiveUpdateProviderFilter,
  LiveUpdateGradeFilter,
  GameLanguage,
} from "@/types/card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
export const CARD_PAGE_SIZE = 24;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
  });
  if (!response.ok) {
    throw new Error(`TCGTerminal API ${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

type SearchCardOptions = {
  limit?: number;
  offset?: number;
  setId?: string;
  sortBy?: CardSort;
  hideSealed?: boolean;
  sealedOnly?: boolean;
  game?: GameLanguage;
};

export function searchCards(query: string, options: SearchCardOptions = {}): Promise<CardSummary[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(options.limit ?? CARD_PAGE_SIZE),
    offset: String(options.offset ?? 0),
    sort_by: options.sortBy ?? "price_desc",
    hide_sealed: options.hideSealed === false ? "false" : "true",
  });
  if (options.setId) params.set("set_id", options.setId);
  if (options.sealedOnly) params.set("sealed_only", "true");
  if (options.game && options.game !== "all") params.set("game", options.game);
  return request<CardSummary[]>(`/cards/search?${params.toString()}`, { cache: "no-store" });
}

export function getCardSets(game?: GameLanguage): Promise<CardSetOption[]> {
  const params = new URLSearchParams();
  if (game && game !== "all") params.set("game", game);
  const qStr = params.toString();
  return request<CardSetOption[]>(`/cards/sets${qStr ? `?${qStr}` : ""}`, {
    cache: "no-store",
  });
}

export function getMarketMovers(options: {
  direction?: MoverDirection;
  period?: MoverPeriod;
  game?: "pokemon" | "pokemon-japan";
  page?: number;
  perPage?: number;
} = {}): Promise<MarketMoversResponse> {
  const params = new URLSearchParams({
    direction: options.direction ?? "all",
    period: options.period ?? "24h",
    game: options.game ?? "pokemon",
    page: String(options.page ?? 1),
    per_page: String(options.perPage ?? 12),
  });
  return request<MarketMoversResponse>(`/cards/market-movers?${params.toString()}`, {
    next: { revalidate: 300 },
  });
}

export async function getCard(cardId: string): Promise<CardDetail | null> {
  const response = await fetch(`${API_URL}/cards/${encodeURIComponent(cardId)}`, {
    next: { revalidate: 3600 },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`TCGTerminal card request returned ${response.status}`);
  }
  return response.json() as Promise<CardDetail>;
}

export async function getCardPricing(cardId: string): Promise<CardPricing | null> {
  const response = await fetch(
    `${API_URL}/cards/${encodeURIComponent(cardId)}/prices?days=365`,
    { next: { revalidate: 600 } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`TCGTerminal pricing request returned ${response.status}`);
  }
  return response.json() as Promise<CardPricing>;
}

export function getGradingProfit(options: {
  gradingFee?: number;
  sortBy?: GradingSortOption;
  targetGrade?: "all" | "psa10" | "psa9";
  minProfit?: number;
  maxRawPrice?: number;
  minSpread?: number;
  psa9SafeOnly?: boolean;
  setId?: string;
  query?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<GradingProfitResponse> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    per_page: String(options.perPage ?? 12),
    sort_by: options.sortBy ?? "psa10_profit_desc",
    target_grade: options.targetGrade ?? "all",
  });
  if (options.gradingFee !== undefined) params.set("grading_fee", String(options.gradingFee));
  if (options.minProfit !== undefined) params.set("min_profit", String(options.minProfit));
  if (options.maxRawPrice !== undefined) params.set("max_raw_price", String(options.maxRawPrice));
  if (options.minSpread !== undefined) params.set("min_spread", String(options.minSpread));
  if (options.psa9SafeOnly) params.set("psa9_safe_only", "true");
  if (options.setId) params.set("set_id", options.setId);
  if (options.query) params.set("q", options.query);
  return request<GradingProfitResponse>(`/cards/grading-profit?${params.toString()}`, {
    next: { revalidate: 300 },
  });
}

export function getSealedSignals(options: {
  signal?: SealedSignalType;
  productType?: SealedProductType;
  sortBy?: SealedSortOption;
  setId?: string;
  query?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<SealedSignalsResponse> {
  const params = new URLSearchParams({
    signal: options.signal ?? "all",
    product_type: options.productType ?? "all",
    sort_by: options.sortBy ?? "score_desc",
    page: String(options.page ?? 1),
    per_page: String(options.perPage ?? 12),
  });
  if (options.setId) params.set("set_id", options.setId);
  if (options.query) params.set("q", options.query);
  return request<SealedSignalsResponse>(`/cards/sealed-signals?${params.toString()}`, {
    next: { revalidate: 300 },
  });
}

export function getTopPokemonVolume(options: {
  timeframe?: VolumeTimeframe;
  query?: string;
} = {}): Promise<PokemonVolumeResponse> {
  const params = new URLSearchParams();
  if (options.timeframe) params.set("timeframe", options.timeframe);
  if (options.query) params.set("q", options.query);
  const queryStr = params.toString();
  return request<PokemonVolumeResponse>(`/cards/top-pokemon-volume${queryStr ? `?${queryStr}` : ""}`, {
    next: { revalidate: 600 },
  });
}

export function getLiveUpdates(options: {
  provider?: LiveUpdateProviderFilter;
  gradeFilter?: LiveUpdateGradeFilter;
  setId?: string;
  query?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<LiveUpdatesResponse> {
  const params = new URLSearchParams({
    provider: options.provider ?? "all",
    grade_filter: options.gradeFilter ?? "all",
    page: String(options.page ?? 1),
    per_page: String(options.perPage ?? 24),
  });
  if (options.setId) params.set("set_id", options.setId);
  if (options.query) params.set("q", options.query);
  return request<LiveUpdatesResponse>(`/cards/live-updates?${params.toString()}`, {
    cache: "no-store",
  });
}

export function cardImageUrl(path: string): string {
  return `${API_URL}${path}`;
}

