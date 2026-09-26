import { runAutoTrade } from "@/lib/paper/auto-trade";
import { createEmptyPortfolio } from "@/lib/paper/portfolio";
import { runAllStrategies } from "@/lib/strategies/engine";
import type { StrategyId } from "@/lib/strategies/types";
import { loadDayCache } from "./day-cache";
import { filterAndRankSignals, summarizeTrades } from "./policy";
import type { DayCache, PeriodMetrics, TrainedStrategyRule } from "./types";

export type EvaluatedTrade = {
  date: string;
  ticker: string;
  title: string;
  strategyId: StrategyId;
  side: "yes" | "no";
  entryPrice: number;
  contracts: number;
  cost: number;
  edgeScore: number;
  result: "yes" | "no";
  hit: boolean;
  payout: number;
  pnl: number;
};

function settle(
  side: "yes" | "no",
  result: "yes" | "no",
  contracts: number,
  entryPrice: number,
) {
  const hit = side === result;
  const payout = hit ? contracts * 1 : 0;
  const cost = contracts * entryPrice;
  return { hit, payout, pnl: payout - cost, cost };
}

export async function evaluatePolicyOnDates(opts: {
  dates: string[];
  rules: TrainedStrategyRule[];
  bankroll: number;
  maxTrade: number;
  caches?: Map<string, DayCache>;
}): Promise<{ metrics: PeriodMetrics; trades: EvaluatedTrade[] }> {
  const trades: EvaluatedTrade[] = [];

  for (const date of opts.dates) {
    const cache =
      opts.caches?.get(date) ?? (await loadDayCache(date));
    if (!cache || cache.quotes.length === 0) continue;

    const quotes = cache.quotes.map((q) => q.quote);
    const resultByTicker = new Map(
      cache.quotes.map((q) => [q.ticker, q.result] as const),
    );
    const signals = filterAndRankSignals(runAllStrategies(quotes), opts.rules);
    const fill = runAutoTrade(createEmptyPortfolio(opts.bankroll), signals, {
      maxTrade: opts.maxTrade,
      minEdgeScore: 0, // already filtered by policy rules
      alreadyTraded: new Set(),
      maxFills: 200,
    });

    for (const position of fill.portfolio.positions) {
      const result = resultByTicker.get(position.ticker);
      if (result !== "yes" && result !== "no") continue;
      const settled = settle(
        position.side,
        result,
        position.contracts,
        position.entryPrice,
      );
      const strategyId = (
        position.strategyId === "manual" ? "liquidity" : position.strategyId
      ) as StrategyId;
      const signal = signals.find(
        (s) =>
          s.market.ticker === position.ticker && s.side === position.side,
      );
      trades.push({
        date,
        ticker: position.ticker,
        title: position.title,
        strategyId,
        side: position.side,
        entryPrice: position.entryPrice,
        contracts: position.contracts,
        cost: settled.cost,
        edgeScore: signal?.edgeScore ?? 0,
        result,
        hit: settled.hit,
        payout: settled.payout,
        pnl: settled.pnl,
      });
    }
  }

  return {
    metrics: summarizeTrades(opts.dates, opts.bankroll, trades),
    trades,
  };
}
