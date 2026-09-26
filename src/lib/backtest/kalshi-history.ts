import { midPrice, parseDollars, spreadWidth } from "@/lib/format";
import type { KalshiMarket, MarketQuote } from "@/lib/kalshi/types";
import {
  defaultFeatures,
  normalizeCategory,
  type SignalFeatures,
} from "@/lib/trading/features";

const BASE =
  process.env.KALSHI_API_BASE ??
  "https://external-api.kalshi.com/trade-api/v2";

export const HISTORY_CACHE_VERSION = 3;

export type SettledMarket = KalshiMarket & {
  result: "yes" | "no";
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function getJson<T>(url: string, retries = 6): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) {
        const backoff = Math.min(30_000, 1000 * 2 ** attempt);
        await sleep(backoff);
        lastError = new Error(`${res.status} ${url}`);
        continue;
      }
      if (!res.ok) {
        throw new Error(`${res.status} ${url}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
    }
  }
  throw lastError ?? new Error(`Failed ${url}`);
}

export async function fetchSettledMarketsForDay(opts: {
  startTs: number;
  endTs: number;
  maxPages?: number;
}): Promise<SettledMarket[]> {
  const maxPages = opts.maxPages ?? 5;
  const out: SettledMarket[] = [];
  let cursor = "";

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      status: "settled",
      limit: "1000",
      mve_filter: "exclude",
      min_settled_ts: String(opts.startTs),
      max_settled_ts: String(opts.endTs),
    });
    if (cursor) params.set("cursor", cursor);
    const data = await getJson<{
      markets?: KalshiMarket[];
      cursor?: string;
    }>(`${BASE}/markets?${params}`);
    const batch = data.markets ?? [];
    for (const m of batch) {
      if (m.result === "yes" || m.result === "no") {
        out.push(m as SettledMarket);
      }
    }
    cursor = data.cursor ?? "";
    if (!cursor || batch.length === 0) break;
    await sleep(250);
  }

  return out;
}

type EventMeta = {
  seriesTicker: string | null;
  category: string;
};

async function fetchEventMeta(eventTicker: string): Promise<EventMeta> {
  try {
    const data = await getJson<{
      event?: { series_ticker?: string; category?: string; title?: string };
    }>(`${BASE}/events/${encodeURIComponent(eventTicker)}`);
    return {
      seriesTicker: data.event?.series_ticker ?? eventTicker.split("-")[0] ?? null,
      category: normalizeCategory(
        data.event?.category || data.event?.title || "unknown",
      ),
    };
  } catch {
    return {
      seriesTicker: eventTicker.split("-")[0] || null,
      category: "unknown",
    };
  }
}

type Candle = {
  end_period_ts: number;
  volume_fp?: string;
  open_interest_fp?: string;
  price?: {
    close_dollars?: string;
    previous_dollars?: string;
    open_dollars?: string;
  };
  yes_ask?: { close_dollars?: string };
  yes_bid?: { close_dollars?: string };
};

async function fetchCandles(
  seriesTicker: string,
  marketTicker: string,
  startTs: number,
  endTs: number,
): Promise<Candle[]> {
  const params = new URLSearchParams({
    start_ts: String(startTs),
    end_ts: String(endTs),
    period_interval: "60",
  });
  const url = `${BASE}/series/${encodeURIComponent(seriesTicker)}/markets/${encodeURIComponent(marketTicker)}/candlesticks?${params}`;
  try {
    const data = await getJson<{ candlesticks?: Candle[] }>(url);
    return data.candlesticks ?? [];
  } catch {
    return [];
  }
}

function buildQuote(
  market: SettledMarket,
  yesBid: number,
  yesAsk: number,
  lastPrice: number,
  previousPrice: number,
  volumeExtra = 0,
  openInterestExtra = 0,
): MarketQuote | null {
  if (!(yesAsk > 0.01 && yesAsk < 0.99 && yesBid > 0)) return null;
  const noBid = Math.max(0, 1 - yesAsk);
  const noAsk = Math.max(0, 1 - yesBid);
  const last = lastPrice || midPrice(yesBid, yesAsk);
  return {
    ticker: market.ticker,
    eventTicker: market.event_ticker,
    title: market.title || market.yes_sub_title || market.ticker,
    subtitle: market.yes_sub_title || market.event_ticker,
    status: "active",
    yesBid,
    yesAsk,
    noBid,
    noAsk,
    lastPrice: last,
    previousPrice: previousPrice || last,
    volume: Math.max(parseDollars(market.volume_fp), volumeExtra),
    openInterest: Math.max(
      parseDollars(market.open_interest_fp),
      openInterestExtra,
    ),
    liquidity: parseDollars(market.liquidity_dollars),
    closeTime: market.close_time ?? null,
    mid: midPrice(yesBid, yesAsk) || last,
    spread: spreadWidth(yesBid, yesAsk),
  };
}

function quoteFromCandle(
  market: SettledMarket,
  candle: Candle,
  prevCandle?: Candle,
): MarketQuote | null {
  const yesAsk = parseDollars(candle.yes_ask?.close_dollars);
  const yesBid = parseDollars(candle.yes_bid?.close_dollars);
  const lastPrice = parseDollars(candle.price?.close_dollars);
  const previousPrice =
    parseDollars(candle.price?.previous_dollars) ||
    parseDollars(prevCandle?.price?.close_dollars) ||
    parseDollars(prevCandle?.yes_ask?.close_dollars);
  return buildQuote(
    market,
    yesBid,
    yesAsk,
    lastPrice,
    previousPrice,
    parseDollars(candle.volume_fp),
    parseDollars(candle.open_interest_fp),
  );
}

function quoteFromSettledSnapshot(market: SettledMarket): MarketQuote | null {
  const yesAsk = parseDollars(market.previous_yes_ask_dollars);
  const yesBid = parseDollars(market.previous_yes_bid_dollars);
  const last = parseDollars(market.previous_price_dollars);
  return buildQuote(market, yesBid, yesAsk, last, last);
}

function candleMid(c: Candle): number {
  const ask = parseDollars(c.yes_ask?.close_dollars);
  const bid = parseDollars(c.yes_bid?.close_dollars);
  const px = parseDollars(c.price?.close_dollars);
  if (ask > 0 && bid > 0) return midPrice(bid, ask);
  return px || ask || bid || 0;
}

/**
 * Prefer an earlier intraday tradeable candle with volume (≈40–70% through the day)
 * instead of the last pre-settlement print.
 */
function pickEntryCandleIndex(candles: Candle[]): number {
  const tradeable: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const ask = parseDollars(candles[i].yes_ask?.close_dollars);
    const bid = parseDollars(candles[i].yes_bid?.close_dollars);
    if (ask > 0.01 && ask < 0.99 && bid > 0) tradeable.push(i);
  }
  if (tradeable.length === 0) return -1;

  const withVol = tradeable.filter(
    (i) => parseDollars(candles[i].volume_fp) > 0,
  );
  const pool = withVol.length ? withVol : tradeable;
  // Target ~55% through the tradeable session
  const target = pool[Math.floor(pool.length * 0.55)] ?? pool[0];
  return target;
}

function buildFeatures(opts: {
  market: SettledMarket;
  quote: MarketQuote;
  candles: Candle[];
  entryIdx: number;
  category: string;
}): SignalFeatures {
  const vols = opts.candles.map((c) => parseDollars(c.volume_fp));
  const avgVol =
    vols.reduce((a, b) => a + b, 0) / Math.max(vols.length, 1) || 1;
  const entryVol =
    opts.entryIdx >= 0 ? parseDollars(opts.candles[opts.entryIdx].volume_fp) : 0;
  const earlyIdx = opts.entryIdx > 2 ? Math.floor(opts.entryIdx * 0.3) : 0;
  const earlyMid =
    opts.entryIdx >= 0 ? candleMid(opts.candles[earlyIdx]) : opts.quote.mid;
  const pathDelta = opts.quote.mid - earlyMid;

  let hoursToClose: number | null = null;
  if (opts.market.close_time) {
    const closeMs = Date.parse(opts.market.close_time);
    const entryTs =
      opts.entryIdx >= 0
        ? opts.candles[opts.entryIdx].end_period_ts * 1000
        : closeMs - 6 * 3600_000;
    hoursToClose = Math.max(0, (closeMs - entryTs) / 3600_000);
  }

  return defaultFeatures({
    category: opts.category,
    hoursToClose,
    spread: opts.quote.spread,
    volume: opts.quote.volume,
    logVolume: Math.log10(opts.quote.volume + 1),
    mid: opts.quote.mid,
    pathDelta,
    volumeSpike: entryVol / avgVol,
    bookTightness: Math.max(0, 1 - opts.quote.spread / 0.1),
  });
}

export type HistoricalQuote = {
  market: SettledMarket;
  quote: MarketQuote;
  category: string;
  features: SignalFeatures;
  seriesTicker: string | null;
};

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export async function buildHistoricalQuotes(opts: {
  markets: SettledMarket[];
  startTs: number;
  endTs: number;
  limit?: number;
}): Promise<HistoricalQuote[]> {
  const limit = opts.limit ?? 180;
  const ranked = [...opts.markets]
    .filter((m) => parseDollars(m.volume_fp) >= 5)
    .sort((a, b) => parseDollars(b.volume_fp) - parseDollars(a.volume_fp))
    .slice(0, limit);

  const eventCache = new Map<string, EventMeta>();

  const quotes = await mapPool(ranked, 3, async (market) => {
    let meta = eventCache.get(market.event_ticker);
    if (!meta) {
      meta = await fetchEventMeta(market.event_ticker);
      eventCache.set(market.event_ticker, meta);
    }

    const category = normalizeCategory(
      market.category || meta.category || "unknown",
    );

    if (meta.seriesTicker) {
      const candles = await fetchCandles(
        meta.seriesTicker,
        market.ticker,
        opts.startTs,
        opts.endTs,
      );
      const entryIdx = pickEntryCandleIndex(candles);
      if (entryIdx >= 0) {
        const quote = quoteFromCandle(
          market,
          candles[entryIdx],
          candles[entryIdx - 1],
        );
        if (quote) {
          return {
            market,
            quote,
            category,
            seriesTicker: meta.seriesTicker,
            features: buildFeatures({
              market,
              quote,
              candles,
              entryIdx,
              category,
            }),
          };
        }
      }
    }

    const fallback = quoteFromSettledSnapshot(market);
    if (!fallback) return null;
    return {
      market,
      quote: fallback,
      category,
      seriesTicker: meta.seriesTicker,
      features: buildFeatures({
        market,
        quote: fallback,
        candles: [],
        entryIdx: -1,
        category,
      }),
    };
  });

  return quotes.filter((q): q is HistoricalQuote => q != null);
}
