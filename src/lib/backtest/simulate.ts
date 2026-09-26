import { runAutoTrade } from "@/lib/paper/auto-trade";
import { createEmptyPortfolio } from "@/lib/paper/portfolio";
import {
  getStrategy,
  runAllStrategies,
  runStrategy,
} from "@/lib/strategies/engine";
import type { StrategyId, StrategySignal } from "@/lib/strategies/types";
import { netPnlAfterCosts } from "@/lib/trading/costs";
import { loadTrainedPolicy } from "@/lib/training/load-policy";
import { filterAndRankSignals, ruleMap } from "@/lib/training/policy";
import { dayWindowEt, previousDayWindowEt } from "./day-window";
import {
  buildHistoricalQuotes,
  fetchSettledMarketsForDay,
  type SettledMarket,
} from "./kalshi-history";
import type { BacktestSummary, BacktestTrade } from "./types";

export type BacktestOptions = {
  date?: string;
  bankroll?: number;
  maxTrade?: number;
  minEdgeScore?: number;
  strategy?: StrategyId | "all";
  marketLimit?: number;
  /** When true, apply persisted trained policy filters (same as live Apply). */
  useTrainedPolicy?: boolean;
};

export async function runDayBacktest(
  options: BacktestOptions = {},
): Promise<BacktestSummary> {
  const window = options.date
    ? dayWindowEt(options.date)
    : previousDayWindowEt();
  const bankroll = options.bankroll ?? 1000;
  const maxTrade = options.maxTrade ?? 25;
  const minEdgeScore = options.minEdgeScore ?? 55;
  const strategy = options.strategy ?? "all";
  const notes: string[] = [];

  const settled = await fetchSettledMarketsForDay({
    startTs: window.startTs,
    endTs: window.endTs,
  });
  notes.push(
    `Loaded ${settled.length} settled binary markets for ${window.date} (${window.timezone}).`,
  );

  const historical = await buildHistoricalQuotes({
    markets: settled,
    startTs: window.startTs,
    endTs: window.endTs,
    limit: options.marketLimit ?? 180,
  });
  notes.push(
    `Rebuilt ${historical.length} as-of quotes from hourly candlesticks (intraday entry ~55% of session).`,
  );

  const quotes = historical.map((h) => ({
    ...h.quote,
    category: h.category,
  }));
  const resultByTicker = new Map<string, SettledMarket>(
    historical.map((h) => [h.market.ticker, h.market]),
  );
  const featuresByTicker = new Map(
    historical.map((h) => [h.market.ticker, h.features] as const),
  );
  const categoryByTicker = new Map(
    historical.map((h) => [h.market.ticker, h.category] as const),
  );

  let signals: StrategySignal[] =
    strategy === "all"
      ? runAllStrategies(quotes)
      : runStrategy(strategy, quotes);

  let policyMode: "trained" | "baseline" = "baseline";
  let fillMinEdge = minEdgeScore;
  let sizeMultByStrategy: Map<StrategyId, number> | undefined;
  let maxPerEvent = 1;
  let maxPerCategory = 3;
  let logistic = null as import("@/lib/training/logistic").LogisticModel | null;

  if (options.useTrainedPolicy) {
    const policy = await loadTrainedPolicy();
    if (policy) {
      const before = signals.length;
      logistic = policy.logistic;
      signals = filterAndRankSignals(signals, {
        rules: policy.rules,
        logistic,
        featuresByTicker,
      });
      fillMinEdge = 0;
      policyMode = "trained";
      sizeMultByStrategy = new Map(
        [...ruleMap(policy.rules).entries()].map(
          ([id, r]) => [id, r.sizeMult] as const,
        ),
      );
      maxPerEvent = policy.portfolioRisk.maxPerEvent;
      maxPerCategory = policy.portfolioRisk.maxPerCategory;
      notes.push(
        `Applied trained policy (${before} → ${signals.length} signals). Fee-aware settlement + correlation caps.`,
      );
    } else {
      notes.push(
        "Trained policy requested but trained-policy.json was missing — ran baseline instead.",
      );
    }
  } else {
    notes.push("Policy mode: baseline (trained filters not applied).");
  }

  notes.push(
    `Generated ${signals.length} fillable signals (strategy=${strategy}, fill min edge=${fillMinEdge}).`,
  );

  const portfolio = createEmptyPortfolio(bankroll);
  const fill = runAutoTrade(portfolio, signals, {
    maxTrade,
    minEdgeScore: fillMinEdge,
    alreadyTraded: new Set(),
    maxFills: 200,
    sizeMultByStrategy,
    edgeSized: true,
    maxPerEvent,
    maxPerCategory,
    categoryByTicker,
  });

  const trades: BacktestTrade[] = [];
  for (const position of fill.portfolio.positions) {
    const settledMarket = resultByTicker.get(position.ticker);
    if (!settledMarket) continue;
    const result = settledMarket.result;
    const hit = position.side === result;
    const settledPnl = netPnlAfterCosts(
      position.contracts,
      position.entryPrice,
      hit,
    );
    const signal = signals.find(
      (s) =>
        s.market.ticker === position.ticker && s.side === position.side,
    );
    trades.push({
      ticker: position.ticker,
      title: position.title,
      strategyId: (position.strategyId === "manual"
        ? "liquidity"
        : position.strategyId) as StrategyId,
      strategyName:
        signal?.strategyName ??
        getStrategy(
          (position.strategyId === "manual"
            ? "liquidity"
            : position.strategyId) as StrategyId,
        ).name,
      side: position.side,
      entryPrice: position.entryPrice,
      contracts: position.contracts,
      cost: settledPnl.cost,
      edgeScore: signal?.edgeScore ?? 0,
      result,
      hit,
      payout: settledPnl.payout,
      pnl: settledPnl.netPnl,
    });
  }

  const wins = trades.filter((t) => t.hit).length;
  const losses = trades.length - wins;
  const totalCost = trades.reduce((s, t) => s + t.cost, 0);
  const totalPayout = trades.reduce((s, t) => s + t.payout, 0);
  const pnl = trades.reduce((s, t) => s + t.pnl, 0);
  const endingCash = bankroll + pnl;

  const byStrategyMap = new Map<
    string,
    {
      strategyId: string;
      strategyName: string;
      trades: number;
      wins: number;
      pnl: number;
    }
  >();
  for (const t of trades) {
    const cur = byStrategyMap.get(t.strategyId) ?? {
      strategyId: t.strategyId,
      strategyName: t.strategyName,
      trades: 0,
      wins: 0,
      pnl: 0,
    };
    cur.trades += 1;
    cur.wins += t.hit ? 1 : 0;
    cur.pnl += t.pnl;
    byStrategyMap.set(t.strategyId, cur);
  }

  if (trades.length === 0) {
    notes.push(
      "No fills — raise max trade, lower min edge, or widen strategy filter.",
    );
  } else {
    notes.push(
      "Assumes fills at candle YES/NO ask, held to settlement. Net P&L subtracts approx taker fee + 50bps slippage. One intraday snapshot per market.",
    );
  }

  return {
    date: window.date,
    timezone: window.timezone,
    bankroll,
    maxTrade,
    minEdgeScore: fillMinEdge,
    strategy,
    policyMode,
    marketsScanned: settled.length,
    marketsWithQuotes: historical.length,
    signalsGenerated: signals.length,
    trades: trades.sort((a, b) => b.pnl - a.pnl),
    wins,
    losses,
    hitRate: trades.length ? wins / trades.length : 0,
    totalCost,
    totalPayout,
    pnl,
    endingCash,
    roi: bankroll > 0 ? pnl / bankroll : 0,
    byStrategy: [...byStrategyMap.values()].sort((a, b) => b.pnl - a.pnl),
    notes,
    ranAt: new Date().toISOString(),
  };
}
