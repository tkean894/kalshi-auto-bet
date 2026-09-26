import type { StrategyId } from "@/lib/strategies/types";

export type TrainedStrategyRule = {
  strategyId: StrategyId;
  enabled: boolean;
  minEdgeScore: number;
  /** Optional cap on entry price (dollars). null = no cap. */
  maxEntryPrice: number | null;
  /** Ranking boost added to edgeScore when sorting fills. */
  rankBoost: number;
};

export type TrainedPolicy = {
  version: number;
  trainedAt: string;
  trainDates: string[];
  holdoutDates: string[];
  bankroll: number;
  maxTrade: number;
  rules: TrainedStrategyRule[];
  /** Objective used during search. */
  objective: "total_pnl";
  trainMetrics: PeriodMetrics;
  holdoutBaseline: PeriodMetrics;
  holdoutTrained: PeriodMetrics;
  notes: string[];
};

export type PeriodMetrics = {
  dates: string[];
  trades: number;
  wins: number;
  losses: number;
  hitRate: number;
  totalCost: number;
  totalPayout: number;
  pnl: number;
  roi: number;
  byStrategy: {
    strategyId: StrategyId;
    trades: number;
    wins: number;
    pnl: number;
  }[];
  byDate: {
    date: string;
    trades: number;
    wins: number;
    pnl: number;
  }[];
};

export type LabeledSignal = {
  date: string;
  ticker: string;
  title: string;
  strategyId: StrategyId;
  strategyName: string;
  side: "yes" | "no";
  entryPrice: number;
  edgeScore: number;
  result: "yes" | "no";
  hit: boolean;
  /** P&L for 1 contract held to settlement. */
  pnlPerContract: number;
};

export type DayCache = {
  date: string;
  timezone: string;
  builtAt: string;
  marketsScanned: number;
  /** How many top-volume markets we attempted when building quotes. */
  marketLimit?: number;
  quotes: {
    ticker: string;
    title: string;
    eventTicker: string;
    result: "yes" | "no";
    quote: {
      ticker: string;
      eventTicker: string;
      title: string;
      subtitle: string;
      status: string;
      yesBid: number;
      yesAsk: number;
      noBid: number;
      noAsk: number;
      lastPrice: number;
      previousPrice: number;
      volume: number;
      openInterest: number;
      liquidity: number;
      closeTime: string | null;
      mid: number;
      spread: number;
    };
  }[];
};

export const BASELINE_POLICY_RULES: TrainedStrategyRule[] = [
  { strategyId: "tight-spread", enabled: true, minEdgeScore: 55, maxEntryPrice: null, rankBoost: 0 },
  { strategyId: "momentum", enabled: true, minEdgeScore: 55, maxEntryPrice: null, rankBoost: 0 },
  { strategyId: "mean-reversion", enabled: true, minEdgeScore: 55, maxEntryPrice: null, rankBoost: 0 },
  { strategyId: "favorite-edge", enabled: true, minEdgeScore: 55, maxEntryPrice: null, rankBoost: 0 },
  { strategyId: "longshot-value", enabled: true, minEdgeScore: 55, maxEntryPrice: null, rankBoost: 0 },
  { strategyId: "liquidity", enabled: true, minEdgeScore: 55, maxEntryPrice: null, rankBoost: 0 },
];
