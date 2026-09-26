import type { MarketQuote } from "@/lib/kalshi/types";

export type StrategyId =
  | "tight-spread"
  | "momentum"
  | "mean-reversion"
  | "favorite-edge"
  | "longshot-value"
  | "liquidity";

export type SignalSide = "yes" | "no";

export type StrategySignal = {
  id: string;
  strategyId: StrategyId;
  strategyName: string;
  market: MarketQuote;
  side: SignalSide;
  entryPrice: number;
  edgeScore: number;
  confidence: "low" | "medium" | "high";
  rationale: string;
  suggestedContracts: number;
  potentialPayoutPerContract: number;
};

export type StrategyDefinition = {
  id: StrategyId;
  name: string;
  tagline: string;
  description: string;
  run: (markets: MarketQuote[]) => StrategySignal[];
};
