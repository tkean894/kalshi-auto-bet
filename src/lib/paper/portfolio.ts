import type { MarketQuote } from "@/lib/kalshi/types";
import type { SignalSide, StrategyId } from "@/lib/strategies/types";
import {
  DEFAULT_STARTING_CASH,
  type PaperPortfolio,
  type PaperPosition,
  type PaperTrade,
} from "./types";

export function createEmptyPortfolio(
  startingCash = DEFAULT_STARTING_CASH,
): PaperPortfolio {
  return {
    cash: startingCash,
    startingCash,
    positions: [],
    trades: [],
    updatedAt: new Date().toISOString(),
  };
}

function markForSide(market: MarketQuote | undefined, side: SignalSide, fallback: number) {
  if (!market) return fallback;
  if (side === "yes") {
    return market.mid || market.lastPrice || market.yesBid || fallback;
  }
  const noMid =
    market.noBid && market.noAsk
      ? (market.noBid + market.noAsk) / 2
      : 1 - (market.mid || market.lastPrice || 0.5);
  return noMid || fallback;
}

export function markPositions(
  portfolio: PaperPortfolio,
  markets: MarketQuote[],
): PaperPortfolio {
  const byTicker = new Map(markets.map((m) => [m.ticker, m]));
  return {
    ...portfolio,
    positions: portfolio.positions.map((p) => ({
      ...p,
      markPrice: markForSide(byTicker.get(p.ticker), p.side, p.entryPrice),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function positionValue(position: PaperPosition): number {
  return position.contracts * position.markPrice;
}

export function positionCost(position: PaperPosition): number {
  return position.contracts * position.entryPrice;
}

export function unrealizedPnl(position: PaperPosition): number {
  return positionValue(position) - positionCost(position);
}

export function portfolioEquity(portfolio: PaperPortfolio): number {
  const holdings = portfolio.positions.reduce(
    (sum, p) => sum + positionValue(p),
    0,
  );
  return portfolio.cash + holdings;
}

export function openPosition(
  portfolio: PaperPortfolio,
  input: {
    ticker: string;
    title: string;
    side: SignalSide;
    contracts: number;
    entryPrice: number;
    strategyId: StrategyId | "manual";
  },
): { portfolio: PaperPortfolio; error?: string } {
  const contracts = Math.floor(input.contracts);
  if (contracts < 1) {
    return { portfolio, error: "Enter at least 1 contract." };
  }
  if (input.entryPrice <= 0 || input.entryPrice >= 1) {
    return { portfolio, error: "Entry price must be between 0 and $1." };
  }
  const cost = contracts * input.entryPrice;
  if (cost > portfolio.cash + 1e-9) {
    return {
      portfolio,
      error: `Need ${cost.toFixed(2)} cash; you have ${portfolio.cash.toFixed(2)}.`,
    };
  }

  const existing = portfolio.positions.find(
    (p) => p.ticker === input.ticker && p.side === input.side,
  );

  let positions: PaperPosition[];
  if (existing) {
    const totalContracts = existing.contracts + contracts;
    const avg =
      (existing.entryPrice * existing.contracts + input.entryPrice * contracts) /
      totalContracts;
    positions = portfolio.positions.map((p) =>
      p.id === existing.id
        ? {
            ...p,
            contracts: totalContracts,
            entryPrice: avg,
            markPrice: input.entryPrice,
          }
        : p,
    );
  } else {
    const position: PaperPosition = {
      id: crypto.randomUUID(),
      ticker: input.ticker,
      title: input.title,
      side: input.side,
      contracts,
      entryPrice: input.entryPrice,
      strategyId: input.strategyId,
      openedAt: new Date().toISOString(),
      markPrice: input.entryPrice,
    };
    positions = [position, ...portfolio.positions];
  }

  const trade: PaperTrade = {
    id: crypto.randomUUID(),
    ticker: input.ticker,
    title: input.title,
    side: input.side,
    contracts,
    price: input.entryPrice,
    cost,
    strategyId: input.strategyId,
    at: new Date().toISOString(),
    action: "open",
  };

  return {
    portfolio: {
      ...portfolio,
      cash: portfolio.cash - cost,
      positions,
      trades: [trade, ...portfolio.trades].slice(0, 100),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function closePosition(
  portfolio: PaperPortfolio,
  positionId: string,
  exitPrice?: number,
): { portfolio: PaperPortfolio; error?: string } {
  const position = portfolio.positions.find((p) => p.id === positionId);
  if (!position) return { portfolio, error: "Position not found." };

  const price = exitPrice ?? position.markPrice;
  const proceeds = position.contracts * price;
  const pnl = proceeds - position.contracts * position.entryPrice;

  const trade: PaperTrade = {
    id: crypto.randomUUID(),
    ticker: position.ticker,
    title: position.title,
    side: position.side,
    contracts: position.contracts,
    price,
    cost: proceeds,
    strategyId: position.strategyId,
    at: new Date().toISOString(),
    action: "close",
    pnl,
  };

  return {
    portfolio: {
      ...portfolio,
      cash: portfolio.cash + proceeds,
      positions: portfolio.positions.filter((p) => p.id !== positionId),
      trades: [trade, ...portfolio.trades].slice(0, 100),
      updatedAt: new Date().toISOString(),
    },
  };
}
