"use client";

import {
  closePosition,
  createEmptyPortfolio,
  markPositions,
  openPosition,
  portfolioEquity,
} from "@/lib/paper/portfolio";
import {
  PAPER_STORAGE_KEY,
  type PaperPortfolio,
} from "@/lib/paper/types";
import type { MarketQuote } from "@/lib/kalshi/types";
import type { SignalSide, StrategyId } from "@/lib/strategies/types";
import { useCallback, useEffect, useMemo, useState } from "react";

function loadPortfolio(): PaperPortfolio {
  if (typeof window === "undefined") return createEmptyPortfolio();
  try {
    const raw = window.localStorage.getItem(PAPER_STORAGE_KEY);
    if (!raw) return createEmptyPortfolio();
    const parsed = JSON.parse(raw) as PaperPortfolio;
    if (
      typeof parsed.cash !== "number" ||
      !Array.isArray(parsed.positions) ||
      !Array.isArray(parsed.trades)
    ) {
      return createEmptyPortfolio();
    }
    return parsed;
  } catch {
    return createEmptyPortfolio();
  }
}

export function usePaperPortfolio(markets: MarketQuote[]) {
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(createEmptyPortfolio);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setPortfolio(loadPortfolio());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(portfolio));
  }, [portfolio, hydrated]);

  useEffect(() => {
    if (!hydrated || markets.length === 0) return;
    setPortfolio((prev) => markPositions(prev, markets));
  }, [markets, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const equity = useMemo(() => portfolioEquity(portfolio), [portfolio]);
  const pnl = equity - portfolio.startingCash;

  const placeTrade = useCallback(
    (input: {
      ticker: string;
      title: string;
      side: SignalSide;
      contracts: number;
      entryPrice: number;
      strategyId: StrategyId | "manual";
    }) => {
      setPortfolio((prev) => {
        const result = openPosition(prev, input);
        if (result.error) {
          setToast(result.error);
          return prev;
        }
        setToast(
          `Paper bought ${input.contracts} ${input.side.toUpperCase()} on ${input.ticker}`,
        );
        return result.portfolio;
      });
    },
    [],
  );

  const exitPosition = useCallback((positionId: string) => {
    setPortfolio((prev) => {
      const result = closePosition(prev, positionId);
      if (result.error) {
        setToast(result.error);
        return prev;
      }
      setToast("Closed paper position");
      return result.portfolio;
    });
  }, []);

  const reset = useCallback(() => {
    setPortfolio(createEmptyPortfolio());
    setToast("Paper desk reset to $1,000");
  }, []);

  return {
    portfolio,
    equity,
    pnl,
    hydrated,
    toast,
    placeTrade,
    exitPosition,
    reset,
  };
}
