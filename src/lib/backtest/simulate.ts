import { runAutoTrade } from "@/lib/paper/auto-trade";
import { createEmptyPortfolio } from "@/lib/paper/portfolio";
import {
  getStrategy,
  runAllStrategies,
  runStrategy,
} from "@/lib/strategies/engine";
import type { StrategyId } from "@/lib/strategies/types";
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
};

function settleTrade(
  side: "yes" | "no",
  result: "yes" | "no",
  contracts: number,
  entryPrice: number,
): { hit: boolean; payout: number; pnl: number } {
  const hit = side === result;
  const payout = hit ? contracts * 1 : 0;
  const cost = contracts * entryPrice;
  return { hit, payout, pnl: payout - cost };
}

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
    `Rebuilt ${historical.length} as-of quotes from hourly candlesticks (top volume markets).`,
  );

  const quotes = historical.map((h) => h.quote);
  const resultByTicker = new Map<string, SettledMarket>(
    historical.map((h) => [h.market.ticker, h.market]),
  );

  const signals =
    strategy === "all"
      ? runAllStrategies(quotes)
      : runStrategy(strategy, quotes);

  notes.push(
    `Generated ${signals.length} signals (strategy=${strategy}, min edge applied at fill time=${minEdgeScore}).`,
  );

  const portfolio = createEmptyPortfolio(bankroll);
  const fill = runAutoTrade(portfolio, signals, {
    maxTrade,
    minEdgeScore,
    alreadyTraded: new Set(),
    maxFills: 200,
  });

  const trades: BacktestTrade[] = [];
  for (const position of fill.portfolio.positions) {
    const settledMarket = resultByTicker.get(position.ticker);
    if (!settledMarket) continue;
    const result = settledMarket.result;
    const { hit, payout, pnl } = settleTrade(
      position.side,
      result,
      position.contracts,
      position.entryPrice,
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
      cost: position.contracts * position.entryPrice,
      edgeScore: signal?.edgeScore ?? 0,
      result,
      hit,
      payout,
      pnl,
    });
  }

  const wins = trades.filter((t) => t.hit).length;
  const losses = trades.length - wins;
  const totalCost = trades.reduce((s, t) => s + t.cost, 0);
  const totalPayout = trades.reduce((s, t) => s + t.payout, 0);
  const pnl = trades.reduce((s, t) => s + t.pnl, 0);
  const endingCash = bankroll - totalCost + totalPayout;

  const byStrategyMap = new Map<
    string,
    { strategyId: string; strategyName: string; trades: number; wins: number; pnl: number }
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
      `Assumes fills at candle YES/NO ask, held to settlement. Fees ignored. One snapshot per market (last tradeable hour).`,
    );
  }

  return {
    date: window.date,
    timezone: window.timezone,
    bankroll,
    maxTrade,
    minEdgeScore,
    strategy,
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
