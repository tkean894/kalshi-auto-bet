import { dayWindowEt, previousDayWindowEt } from "@/lib/backtest/day-window";
import {
  buildHistoricalQuotes,
  fetchSettledMarketsForDay,
} from "@/lib/backtest/kalshi-history";
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

export async function loadDayCache(date: string): Promise<DayCache | null> {
  try {
    const raw = await readFile(path.join(DAY_CACHE_DIR, `${date}.json`), "utf8");
    return JSON.parse(raw) as DayCache;
  } catch {
    return null;
  }
}

export async function buildOrLoadDayCache(
  date: string,
  marketLimit = 160,
): Promise<DayCache> {
  const existing = await loadDayCache(date);
  if (existing && existing.quotes.length > 0) return existing;

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
    marketsScanned: settled.length,
    quotes: historical.map((h) => ({
      ticker: h.market.ticker,
      title: h.market.title || h.quote.title,
      eventTicker: h.market.event_ticker,
      result: h.market.result,
      quote: h.quote,
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
