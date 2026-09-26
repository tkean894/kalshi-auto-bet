import { MOCK_MARKETS } from "./mock";
import { normalizeMarket } from "./normalize";
import type { KalshiMarket, MarketQuote, MarketsResponse } from "./types";

const PRIMARY =
  process.env.KALSHI_API_BASE ??
  "https://external-api.kalshi.com/trade-api/v2";
const FALLBACK = "https://api.elections.kalshi.com/trade-api/v2";

type FetchMarketsOptions = {
  limit?: number;
  query?: string;
  cursor?: string;
};

async function fetchFromBase(
  base: string,
  options: FetchMarketsOptions,
): Promise<MarketQuote[]> {
  const params = new URLSearchParams({
    status: "open",
    limit: String(Math.min(options.limit ?? 100, 200)),
    mve_filter: "exclude",
  });
  if (options.cursor) params.set("cursor", options.cursor);

  const res = await fetch(`${base}/markets?${params.toString()}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`Kalshi ${base} returned ${res.status}`);
  }

  const data = (await res.json()) as { markets?: KalshiMarket[] };
  return (data.markets ?? []).map(normalizeMarket);
}

function filterMarkets(markets: MarketQuote[], query?: string): MarketQuote[] {
  if (!query?.trim()) return markets;
  const q = query.trim().toLowerCase();
  return markets.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      m.ticker.toLowerCase().includes(q) ||
      m.subtitle.toLowerCase().includes(q) ||
      m.eventTicker.toLowerCase().includes(q),
  );
}

function rankMarkets(markets: MarketQuote[]): MarketQuote[] {
  return [...markets].sort((a, b) => {
    const score = (m: MarketQuote) =>
      m.volume * 2 + m.openInterest + (1 - m.spread) * 50 + (m.lastPrice > 0 ? 10 : 0);
    return score(b) - score(a);
  });
}

export async function getMarkets(
  options: FetchMarketsOptions = {},
): Promise<MarketsResponse> {
  const limit = options.limit ?? 80;
  const fetchedAt = new Date().toISOString();

  for (const base of [PRIMARY, FALLBACK]) {
    try {
      const live = await fetchFromBase(base, { ...options, limit });
      const filtered = rankMarkets(filterMarkets(live, options.query)).slice(
        0,
        limit,
      );
      if (filtered.length === 0 && options.query) {
        return { markets: [], source: "live", fetchedAt };
      }
      if (filtered.length === 0) {
        continue;
      }
      return { markets: filtered, source: "live", fetchedAt };
    } catch {
      // try next base
    }
  }

  const mock = rankMarkets(filterMarkets(MOCK_MARKETS, options.query)).slice(
    0,
    limit,
  );
  return {
    markets: mock,
    source: "mock",
    fetchedAt,
    error:
      "Live Kalshi markets unavailable from this environment — showing demo markets.",
  };
}

export async function getMarketByTicker(
  ticker: string,
): Promise<MarketQuote | null> {
  const { markets } = await getMarkets({ limit: 200, query: ticker });
  return markets.find((m) => m.ticker === ticker) ?? null;
}
