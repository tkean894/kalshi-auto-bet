import type { StrategyId } from "@/lib/strategies/types";
import type { SignalFeatures } from "@/lib/trading/features";
import type { LogisticModel } from "./logistic";

export type TrainedStrategyRule = {
  strategyId: StrategyId;
  enabled: boolean;
  minEdgeScore: number;
  /** Optional cap on entry price (dollars). null = no cap. */
  maxEntryPrice: number | null;
  /** Ranking boost added to edgeScore when sorting fills. */
  rankBoost: number;
  /** Multiplier on max-trade budget for this strategy (0.5–2). */
  sizeMult: number;
  /** Skip fills with fewer hours to close than this (null = no floor). */
  minHoursToClose: number | null;
  /** Skip fills with more hours to close than this (null = no ceiling). */
  maxHoursToClose: number | null;
};

export type PortfolioRiskLimits = {
  /** Max open/new fills sharing an event ticker per day. */
  maxPerEvent: number;
  /** Max open/new fills sharing a category per day. */
  maxPerCategory: number;
};

export type WalkForwardFold = {
  trainDates: string[];
  testDates: string[];
  trainPnl: number;
  testPnl: number;
  testTrades: number;
  testHitRate: number;
  testMaxDrawdown: number;
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
  objective: "net_pnl_drawdown";
  feeAware: boolean;
  portfolioRisk: PortfolioRiskLimits;
  logistic: LogisticModel | null;
  walkForward: {
    folds: WalkForwardFold[];
    oosPnl: number;
    oosTrades: number;
    oosHitRate: number;
    oosMaxDrawdown: number;
  } | null;
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
  /** Net P&L after approximate fees + slippage when feeAware. */
  pnl: number;
  grossPnl: number;
  totalFees: number;
  roi: number;
  maxDrawdown: number;
  endingEquity: number;
  equityCurve: { date: string; equity: number; pnl: number }[];
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
  /** P&L for 1 contract held to settlement (gross, pre-fee). */
  pnlPerContract: number;
  features: SignalFeatures;
};

export type DayCacheQuote = {
  ticker: string;
  title: string;
  eventTicker: string;
  result: "yes" | "no";
  category: string;
  features: SignalFeatures;
  seriesTicker: string | null;
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
    category?: string;
  };
};

export type DayCache = {
  date: string;
  timezone: string;
  builtAt: string;
  cacheVersion: number;
  marketsScanned: number;
  /** How many top-volume markets we attempted when building quotes. */
  marketLimit?: number;
  quotes: DayCacheQuote[];
};

export const DEFAULT_PORTFOLIO_RISK: PortfolioRiskLimits = {
  maxPerEvent: 1,
  maxPerCategory: 3,
};

export const BASELINE_POLICY_RULES: TrainedStrategyRule[] = [
  {
    strategyId: "tight-spread",
    enabled: true,
    minEdgeScore: 55,
    maxEntryPrice: null,
    rankBoost: 0,
    sizeMult: 1,
    minHoursToClose: 1,
    maxHoursToClose: 72,
  },
  {
    strategyId: "momentum",
    enabled: true,
    minEdgeScore: 55,
    maxEntryPrice: null,
    rankBoost: 0,
    sizeMult: 1,
    minHoursToClose: 1,
    maxHoursToClose: 72,
  },
  {
    strategyId: "mean-reversion",
    enabled: true,
    minEdgeScore: 55,
    maxEntryPrice: null,
    rankBoost: 0,
    sizeMult: 1,
    minHoursToClose: 1,
    maxHoursToClose: 72,
  },
  {
    strategyId: "favorite-edge",
    enabled: true,
    minEdgeScore: 55,
    maxEntryPrice: null,
    rankBoost: 0,
    sizeMult: 1,
    minHoursToClose: 1,
    maxHoursToClose: 72,
  },
  {
    strategyId: "longshot-value",
    enabled: true,
    minEdgeScore: 55,
    maxEntryPrice: null,
    rankBoost: 0,
    sizeMult: 1,
    minHoursToClose: 1,
    maxHoursToClose: 72,
  },
  {
    strategyId: "liquidity",
    enabled: true,
    minEdgeScore: 55,
    maxEntryPrice: null,
    rankBoost: 0,
    sizeMult: 1,
    minHoursToClose: 1,
    maxHoursToClose: 72,
  },
];
