import { sizeContracts } from "@/lib/desk/settings";
import type { StrategyId, StrategySignal } from "@/lib/strategies/types";
import { openPosition } from "./portfolio";
import type { PaperPortfolio } from "./types";

export function positionKey(ticker: string, side: string): string {
  return `${ticker}:${side}`;
}

export type AutoTradeResult = {
  portfolio: PaperPortfolio;
  tradedKeys: string[];
  fillCount: number;
  spent: number;
  skipped: number;
  /** Eligible signals skipped because 1 contract costs more than max trade. */
  skippedForSize: number;
  /** Cheapest entry among size-blocked signals (dollars), if any. */
  cheapestBlockedEntry: number | null;
  skippedForCorrelation: number;
};

export type AutoTradeOptions = {
  maxTrade: number;
  minEdgeScore: number;
  alreadyTraded: Set<string>;
  maxFills?: number;
  /** Per-strategy max-trade multipliers. */
  sizeMultByStrategy?: Map<StrategyId, number>;
  /** Scale ticket size by edge score. */
  edgeSized?: boolean;
  maxPerEvent?: number;
  maxPerCategory?: number;
  categoryByTicker?: Map<string, string>;
};

/**
 * Paper-fill top signals within maxTrade / available cash.
 * Skips tickers already held or already auto-traded this session.
 * Enforces optional per-event / per-category correlation caps.
 */
export function runAutoTrade(
  portfolio: PaperPortfolio,
  signals: StrategySignal[],
  opts: AutoTradeOptions,
): AutoTradeResult {
  let next = portfolio;
  const tradedKeys: string[] = [];
  let spent = 0;
  let skipped = 0;
  let skippedForSize = 0;
  let skippedForCorrelation = 0;
  let cheapestBlockedEntry: number | null = null;
  const maxFills = opts.maxFills ?? 12;
  const maxPerEvent = opts.maxPerEvent ?? Infinity;
  const maxPerCategory = opts.maxPerCategory ?? Infinity;

  const held = new Set(
    next.positions.map((p) => positionKey(p.ticker, p.side)),
  );

  const eventCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const p of next.positions) {
    const event = p.ticker.split("-").slice(0, -1).join("-") || p.ticker;
    eventCounts.set(event, (eventCounts.get(event) ?? 0) + 1);
    const cat = opts.categoryByTicker?.get(p.ticker) ?? "unknown";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  const ranked = [...signals].sort((a, b) => b.edgeScore - a.edgeScore);

  for (const signal of ranked) {
    if (tradedKeys.length >= maxFills) break;
    if (next.cash < 0.01) break;

    if (signal.edgeScore < opts.minEdgeScore) {
      skipped += 1;
      continue;
    }

    const key = positionKey(signal.market.ticker, signal.side);
    if (opts.alreadyTraded.has(key) || held.has(key) || tradedKeys.includes(key)) {
      skipped += 1;
      continue;
    }

    const eventTicker = signal.market.eventTicker || signal.market.ticker;
    const category =
      opts.categoryByTicker?.get(signal.market.ticker) ||
      (signal.market as { category?: string }).category ||
      "unknown";

    if ((eventCounts.get(eventTicker) ?? 0) >= maxPerEvent) {
      skipped += 1;
      skippedForCorrelation += 1;
      continue;
    }
    if ((categoryCounts.get(category) ?? 0) >= maxPerCategory) {
      skipped += 1;
      skippedForCorrelation += 1;
      continue;
    }

    const sizeMult =
      opts.sizeMultByStrategy?.get(signal.strategyId) ?? 1;
    const contracts = sizeContracts(
      signal.entryPrice,
      opts.maxTrade,
      next.cash,
      {
        sizeMult,
        edgeScore: signal.edgeScore,
        edgeSized: opts.edgeSized ?? true,
      },
    );

    if (contracts < 1) {
      skipped += 1;
      skippedForSize += 1;
      if (
        cheapestBlockedEntry == null ||
        signal.entryPrice < cheapestBlockedEntry
      ) {
        cheapestBlockedEntry = signal.entryPrice;
      }
      continue;
    }

    const cost = contracts * signal.entryPrice;
    const result = openPosition(next, {
      ticker: signal.market.ticker,
      title: signal.market.title,
      side: signal.side,
      contracts,
      entryPrice: signal.entryPrice,
      strategyId: signal.strategyId,
    });

    if (result.error) {
      skipped += 1;
      continue;
    }

    next = result.portfolio;
    tradedKeys.push(key);
    held.add(key);
    spent += cost;
    eventCounts.set(eventTicker, (eventCounts.get(eventTicker) ?? 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  return {
    portfolio: next,
    tradedKeys,
    fillCount: tradedKeys.length,
    spent,
    skipped,
    skippedForSize,
    cheapestBlockedEntry,
    skippedForCorrelation,
  };
}
