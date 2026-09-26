import { dayWindowEt, previousDayWindowEt } from "@/lib/backtest/day-window";
import {
  HISTORY_CACHE_VERSION,
  buildHistoricalQuotes,
  fetchSettledMarketsForDay,
} from "@/lib/backtest/kalshi-history";
import { defaultFeatures } from "@/lib/trading/features";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DAY_CACHE_DIR } from "./paths";
import type { DayCache } from "./types";

export function listRecentEtDates(count: number, now = new Date()): string[] {
  const dates: string[] = [];
  let cursor = previousDayWindowEt(now).date;
  for (let i = 0; i < count; i += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, -1);
  }
  return dates.reverse(); // oldest → newest
}

export async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function isUsableCache(
  cache: DayCache | null,
  marketLimit: number,
): cache is DayCache {
  if (!cache || cache.quotes.length === 0) return false;
  if ((cache.cacheVersion ?? 0) < HISTORY_CACHE_VERSION) return false;
  const existingLimit = cache.marketLimit ?? cache.quotes.length;
  return existingLimit >= marketLimit;
}

export async function loadDayCache(date: string): Promise<DayCache | null> {
  try {
    const raw = await readFile(path.join(DAY_CACHE_DIR, `${date}.json`), "utf8");
    const parsed = JSON.parse(raw) as DayCache;
    // Backfill missing v3 fields for partial reads (still rejected by isUsableCache).
    parsed.quotes = (parsed.quotes ?? []).map((q) => ({
      ...q,
      category: q.category ?? "unknown",
      features: q.features ?? defaultFeatures({ category: q.category }),
      seriesTicker: q.seriesTicker ?? null,
    }));
    return parsed;
  } catch {
    return null;
  }
}

export async function buildOrLoadDayCache(
  date: string,
  marketLimit = 160,
  opts?: { force?: boolean },
): Promise<DayCache> {
  const existing = await loadDayCache(date);
  if (!opts?.force && isUsableCache(existing, marketLimit)) {
    return existing;
  }

  const window = dayWindowEt(date);
  const settled = await fetchSettledMarketsForDay({
    startTs: window.startTs,
    endTs: window.endTs,
  });
  const historical = await buildHistoricalQuotes({
    markets: settled,
    startTs: window.startTs,
    endTs: window.endTs,
    limit: marketLimit,
  });

  const cache: DayCache = {
    date,
    timezone: window.timezone,
    builtAt: new Date().toISOString(),
    cacheVersion: HISTORY_CACHE_VERSION,
    marketsScanned: settled.length,
    marketLimit,
    quotes: historical.map((h) => ({
      ticker: h.market.ticker,
      title: h.market.title || h.quote.title,
      eventTicker: h.market.event_ticker,
      result: h.market.result,
      category: h.category,
      features: h.features,
      seriesTicker: h.seriesTicker,
      quote: { ...h.quote, category: h.category },
    })),
  };

  await mkdir(DAY_CACHE_DIR, { recursive: true });
  await writeFile(
    path.join(DAY_CACHE_DIR, `${date}.json`),
    JSON.stringify(cache),
    "utf8",
  );
  return cache;
}
