import type { SignalSide, StrategyId } from "@/lib/strategies/types";

export type PaperPosition = {
  id: string;
  ticker: string;
  title: string;
  side: SignalSide;
  contracts: number;
  entryPrice: number;
  strategyId: StrategyId | "manual";
  openedAt: string;
  markPrice: number;
};

export type PaperTrade = {
  id: string;
  ticker: string;
  title: string;
  side: SignalSide;
  contracts: number;
  price: number;
  cost: number;
  strategyId: StrategyId | "manual";
  at: string;
  action: "open" | "close";
  pnl?: number;
};

export type PaperPortfolio = {
  cash: number;
  startingCash: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  updatedAt: string;
};

export const DEFAULT_STARTING_CASH = 1000;
export const PAPER_STORAGE_KEY = "edgebook-paper-v1";
