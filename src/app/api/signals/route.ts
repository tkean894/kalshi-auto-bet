import { getMarkets } from "@/lib/kalshi/client";
import {
  getStrategy,
  runAllStrategies,
  runStrategy,
  STRATEGIES,
} from "@/lib/strategies/engine";
import type { StrategyId } from "@/lib/strategies/types";
import { NextRequest, NextResponse } from "next/server";

const VALID = new Set(STRATEGIES.map((s) => s.id));

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const strategyParam = searchParams.get("strategy") ?? "all";
  const limit = Number(searchParams.get("limit") ?? "80");

  const marketsPayload = await getMarkets({
    limit: Number.isFinite(limit) ? limit : 80,
  });

  const signals =
    strategyParam === "all"
      ? runAllStrategies(marketsPayload.markets)
      : VALID.has(strategyParam as StrategyId)
        ? runStrategy(strategyParam as StrategyId, marketsPayload.markets)
        : runStrategy("tight-spread", marketsPayload.markets);

  const strategyMeta =
    strategyParam === "all"
      ? {
          id: "all" as const,
          name: "All strategies",
          tagline: "Top ranked edges across every scanner",
          description:
            "Merges signals from every built-in strategy and sorts by edge score.",
        }
      : (() => {
          const s = getStrategy(strategyParam as StrategyId);
          return {
            id: s.id,
            name: s.name,
            tagline: s.tagline,
            description: s.description,
          };
        })();

  return NextResponse.json({
    strategy: strategyMeta,
    strategies: STRATEGIES.map((s) => ({
      id: s.id,
      name: s.name,
      tagline: s.tagline,
      description: s.description,
    })),
    signals,
    source: marketsPayload.source,
    fetchedAt: marketsPayload.fetchedAt,
    error: marketsPayload.error,
  });
}
