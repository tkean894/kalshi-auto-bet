"use client";

import { runAutoTrade } from "@/lib/paper/auto-trade";
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
import type { StrategySignal, SignalSide, StrategyId } from "@/lib/strategies/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function loadPortfolio(fallbackBankroll = 1000): PaperPortfolio {
  if (typeof window === "undefined") return createEmptyPortfolio(fallbackBankroll);
  try {
    const raw = window.localStorage.getItem(PAPER_STORAGE_KEY);
    if (!raw) return createEmptyPortfolio(fallbackBankroll);
    const parsed = JSON.parse(raw) as PaperPortfolio;
    if (
      typeof parsed.cash !== "number" ||
      !Array.isArray(parsed.positions) ||
      !Array.isArray(parsed.trades)
    ) {
      return createEmptyPortfolio(fallbackBankroll);
    }
    return parsed;
  } catch {
    return createEmptyPortfolio(fallbackBankroll);
  }
}

export function usePaperPortfolio(markets: MarketQuote[]) {
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(() =>
    createEmptyPortfolio(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const autoTradedRef = useRef<Set<string>>(new Set());
  const lastSizeToastAtRef = useRef(0);

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
    const t = window.setTimeout(() => setToast(null), 3600);
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
    }): boolean => {
      let ok = false;
      setPortfolio((prev) => {
        const result = openPosition(prev, input);
        if (result.error) {
          setToast(result.error);
          return prev;
        }
        ok = true;
        setToast(
          `Paper bought ${input.contracts} ${input.side.toUpperCase()} on ${input.ticker}`,
        );
        return result.portfolio;
      });
      return ok;
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

  const reset = useCallback((bankroll = 1000) => {
    autoTradedRef.current = new Set();
    setPortfolio(createEmptyPortfolio(bankroll));
    setToast(`Paper desk reset to $${bankroll.toLocaleString("en-US")}`);
  }, []);

  const clearAutoTradeMemory = useCallback(() => {
    autoTradedRef.current = new Set();
  }, []);

  const autoTradeSignals = useCallback(
    (
      signals: StrategySignal[],
      opts: {
        maxTrade: number;
        minEdgeScore: number;
        sizeMultByStrategy?: Map<StrategyId, number>;
        edgeSized?: boolean;
        maxPerEvent?: number;
        maxPerCategory?: number;
        categoryByTicker?: Map<string, string>;
      },
    ): number => {
      let fills = 0;
      setPortfolio((prev) => {
        const result = runAutoTrade(prev, signals, {
          maxTrade: opts.maxTrade,
          minEdgeScore: opts.minEdgeScore,
          alreadyTraded: autoTradedRef.current,
          sizeMultByStrategy: opts.sizeMultByStrategy,
          edgeSized: opts.edgeSized ?? true,
          maxPerEvent: opts.maxPerEvent,
          maxPerCategory: opts.maxPerCategory,
          categoryByTicker: opts.categoryByTicker,
        });
        fills = result.fillCount;
        for (const key of result.tradedKeys) {
          autoTradedRef.current.add(key);
        }
        if (result.fillCount > 0) {
          setToast(
            `Auto-traded ${result.fillCount} ticket${result.fillCount === 1 ? "" : "s"} · $${result.spent.toFixed(2)}`,
          );
        } else if (prev.cash < 0.01) {
          setToast("Auto-trade paused — bankroll cash is spent");
        } else if (result.skippedForSize > 0) {
          const now = Date.now();
          if (now - lastSizeToastAtRef.current > 12_000) {
            lastSizeToastAtRef.current = now;
            const need =
              result.cheapestBlockedEntry != null
                ? ` Cheapest signal needs $${result.cheapestBlockedEntry.toFixed(2)} for 1 contract.`
                : "";
            setToast(
              `Nothing filled — max trade $${opts.maxTrade.toFixed(2)} is below contract prices.${need} Raise max trade.`,
            );
          }
        } else if (result.skippedForCorrelation > 0) {
          const now = Date.now();
          if (now - lastSizeToastAtRef.current > 12_000) {
            lastSizeToastAtRef.current = now;
            setToast(
              `Skipped ${result.skippedForCorrelation} signal(s) for event/category correlation caps.`,
            );
          }
        }
        return result.portfolio;
      });
      return fills;
    },
    [],
  );

  return {
    portfolio,
    equity,
    pnl,
    hydrated,
    toast,
    placeTrade,
    exitPosition,
    reset,
    autoTradeSignals,
    clearAutoTradeMemory,
  };
}
