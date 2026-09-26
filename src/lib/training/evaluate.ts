import { runAutoTrade } from "@/lib/paper/auto-trade";
import { createEmptyPortfolio } from "@/lib/paper/portfolio";
import { runAllStrategies } from "@/lib/strategies/engine";
import type { StrategyId } from "@/lib/strategies/types";
import type { SignalFeatures } from "@/lib/trading/features";
import { defaultFeatures } from "@/lib/trading/features";
import { netPnlAfterCosts } from "@/lib/trading/costs";
import type { LogisticModel } from "./logistic";
import { loadDayCache } from "./day-cache";
import {
  defaultPortfolioRisk,
  filterAndRankSignals,
  ruleMap,
  summarizeTrades,
} from "./policy";
import type {
  DayCache,
  PeriodMetrics,
  PortfolioRiskLimits,
  TrainedStrategyRule,
} from "./types";

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
  grossPnl: number;
  fees: number;
  features: SignalFeatures;
};

export async function evaluatePolicyOnDates(opts: {
  dates: string[];
  rules: TrainedStrategyRule[];
  bankroll: number;
  maxTrade: number;
  caches?: Map<string, DayCache>;
  feeAware?: boolean;
  portfolioRisk?: PortfolioRiskLimits;
  logistic?: LogisticModel | null;
  edgeSized?: boolean;
}): Promise<{ metrics: PeriodMetrics; trades: EvaluatedTrade[] }> {
  const trades: EvaluatedTrade[] = [];
  const feeAware = opts.feeAware ?? true;
  const risk = defaultPortfolioRisk(opts.portfolioRisk);
  const rules = ruleMap(opts.rules);
  const sizeMultByStrategy = new Map(
    [...rules.entries()].map(([id, r]) => [id, r.sizeMult] as const),
  );

  for (const date of opts.dates) {
    const cache = opts.caches?.get(date) ?? (await loadDayCache(date));
    if (!cache || cache.quotes.length === 0) continue;

    const quotes = cache.quotes.map((q) => ({
      ...q.quote,
      category: q.category,
    }));
    const resultByTicker = new Map(
      cache.quotes.map((q) => [q.ticker, q.result] as const),
    );
    const featuresByTicker = new Map(
      cache.quotes.map(
        (q) =>
          [
            q.ticker,
            q.features ?? defaultFeatures({ category: q.category }),
          ] as const,
      ),
    );
    const categoryByTicker = new Map(
      cache.quotes.map((q) => [q.ticker, q.category || "unknown"] as const),
    );

    const rawSignals = runAllStrategies(quotes);
    const signals = filterAndRankSignals(rawSignals, {
      rules: opts.rules,
      logistic: opts.logistic,
      featuresByTicker,
    });

    const fill = runAutoTrade(createEmptyPortfolio(opts.bankroll), signals, {
      maxTrade: opts.maxTrade,
      minEdgeScore: 0,
      alreadyTraded: new Set(),
      maxFills: 200,
      sizeMultByStrategy,
      edgeSized: opts.edgeSized ?? true,
      maxPerEvent: risk.maxPerEvent,
      maxPerCategory: risk.maxPerCategory,
      categoryByTicker,
    });

    for (const position of fill.portfolio.positions) {
      const result = resultByTicker.get(position.ticker);
      if (result !== "yes" && result !== "no") continue;
      const hit = position.side === result;
      const settled = feeAware
        ? netPnlAfterCosts(
            position.contracts,
            position.entryPrice,
            hit,
          )
        : {
            grossPnl:
              (hit ? position.contracts : 0) -
              position.contracts * position.entryPrice,
            fee: 0,
            slippage: 0,
            netPnl:
              (hit ? position.contracts : 0) -
              position.contracts * position.entryPrice,
            cost: position.contracts * position.entryPrice,
            payout: hit ? position.contracts : 0,
          };

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
        hit,
        payout: settled.payout,
        pnl: settled.netPnl,
        grossPnl: settled.grossPnl,
        fees: settled.fee + settled.slippage,
        features:
          featuresByTicker.get(position.ticker) ??
          defaultFeatures({ category: categoryByTicker.get(position.ticker) }),
      });
    }
  }

  return {
    metrics: summarizeTrades(opts.dates, opts.bankroll, trades),
    trades,
  };
}
