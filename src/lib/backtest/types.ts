import type { StrategyId } from "@/lib/strategies/types";

export type BacktestTrade = {
  ticker: string;
  title: string;
  strategyId: StrategyId;
  strategyName: string;
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

export type BacktestSummary = {
  date: string;
  timezone: string;
  bankroll: number;
  maxTrade: number;
  minEdgeScore: number;
  strategy: StrategyId | "all";
  /** Which live policy mode was used for this run. */
  policyMode: "trained" | "baseline";
  marketsScanned: number;
  marketsWithQuotes: number;
  signalsGenerated: number;
  trades: BacktestTrade[];
  wins: number;
  losses: number;
  hitRate: number;
  totalCost: number;
  totalPayout: number;
  pnl: number;
  endingCash: number;
  roi: number;
  byStrategy: {
    strategyId: string;
    strategyName: string;
    trades: number;
    wins: number;
    pnl: number;
  }[];
  notes: string[];
  ranAt: string;
};
