import { sizeContracts } from "@/lib/desk/settings";
import type { StrategySignal } from "@/lib/strategies/types";
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
};

/**
 * Paper-fill top signals within maxTrade / available cash.
 * Skips tickers already held or already auto-traded this session.
 *
 * Note: Kalshi contracts are whole units. A $0.10 max trade can only buy
 * markets whose entry price is ≤ $0.10 (one contract costs the full entry).
 */
export function runAutoTrade(
  portfolio: PaperPortfolio,
  signals: StrategySignal[],
  opts: {
    maxTrade: number;
    minEdgeScore: number;
    alreadyTraded: Set<string>;
    maxFills?: number;
  },
): AutoTradeResult {
  let next = portfolio;
  const tradedKeys: string[] = [];
  let spent = 0;
  let skipped = 0;
  let skippedForSize = 0;
  let cheapestBlockedEntry: number | null = null;
  const maxFills = opts.maxFills ?? 12;

  const held = new Set(
    next.positions.map((p) => positionKey(p.ticker, p.side)),
  );

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

    const contracts = sizeContracts(
      signal.entryPrice,
      opts.maxTrade,
      next.cash,
    );

    if (contracts < 1) {
      // Keep scanning — a later (cheaper) signal may fit under max trade.
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
  }

  return {
    portfolio: next,
    tradedKeys,
    fillCount: tradedKeys.length,
    spent,
    skipped,
    skippedForSize,
    cheapestBlockedEntry,
  };
}
