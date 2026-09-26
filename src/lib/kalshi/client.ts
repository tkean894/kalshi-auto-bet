import { MOCK_MARKETS } from "./mock";
import { normalizeMarket } from "./normalize";
import type { KalshiMarket, MarketQuote, MarketsResponse } from "./types";

const PRIMARY =
  process.env.KALSHI_API_BASE ??
  "https://external-api.kalshi.com/trade-api/v2";
const FALLBACK = "https://api.elections.kalshi.com/trade-api/v2";

/** Kalshi's open-market feed leads with brand-new empty books; page deeper. */
const PAGE_SIZE = 200;
const MAX_PAGES = 8;

type FetchMarketsOptions = {
  limit?: number;
  query?: string;
  cursor?: string;
};

function isScannable(market: MarketQuote): boolean {
  return (
    market.yesAsk > 0.01 &&
    market.yesAsk < 0.99 &&
    market.yesBid > 0 &&
    (market.volume > 0 || market.openInterest > 0 || market.liquidity > 0)
  );
}

async function fetchPage(
  base: string,
  options: FetchMarketsOptions,
): Promise<{ markets: MarketQuote[]; cursor: string | null }> {
  const params = new URLSearchParams({
    status: "open",
    limit: String(PAGE_SIZE),
    mve_filter: "exclude",
  });
  if (options.cursor) params.set("cursor", options.cursor);

  const res = await fetch(`${base}/markets?${params.toString()}`, {
    headers: { Accept: "application/json" },
    // Desk refresh must not serve a stale first page of empty books.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Kalshi ${base} returned ${res.status}`);
  }

  const data = (await res.json()) as {
    markets?: KalshiMarket[];
    cursor?: string;
  };
  return {
    markets: (data.markets ?? []).map(normalizeMarket),
    cursor: data.cursor || null,
  };
}

async function fetchFromBase(
  base: string,
  options: FetchMarketsOptions,
): Promise<MarketQuote[]> {
  const target = Math.max(options.limit ?? 80, 40);
  const collected: MarketQuote[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = options.cursor;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const page = await fetchPage(base, { ...options, cursor });
    pages += 1;

    for (const market of page.markets) {
      if (seen.has(market.ticker)) continue;
      seen.add(market.ticker);
      collected.push(market);
    }

    const scannable = collected.filter(isScannable).length;
    // Keep paging until we have enough books scanners can actually rank,
    // or Kalshi runs out of pages.
    if (scannable >= target || !page.cursor) {
      break;
    }
    cursor = page.cursor;
  }

  return collected;
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
      m.volume * 2 +
      m.openInterest +
      m.liquidity * 0.5 +
      (1 - m.spread) * 50 +
      (m.lastPrice > 0 ? 10 : 0) +
      (isScannable(m) ? 100 : 0);
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
      // Prefer pages that actually include scannable books; otherwise try the
      // alternate Kalshi host / mock fallback.
      if (filtered.filter(isScannable).length === 0 && !options.query) {
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
