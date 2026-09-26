import { runDayBacktest } from "@/lib/backtest/simulate";
import type { StrategyId } from "@/lib/strategies/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date") ?? undefined;
  const bankroll = Number(searchParams.get("bankroll") ?? "1000");
  const maxTrade = Number(searchParams.get("maxTrade") ?? "25");
  const minEdgeScore = Number(searchParams.get("minEdge") ?? "55");
  const strategyParam = searchParams.get("strategy") ?? "all";
  const marketLimit = Number(searchParams.get("marketLimit") ?? "180");

  try {
    const summary = await runDayBacktest({
      date,
      bankroll: Number.isFinite(bankroll) ? bankroll : 1000,
      maxTrade: Number.isFinite(maxTrade) ? maxTrade : 25,
      minEdgeScore: Number.isFinite(minEdgeScore) ? minEdgeScore : 55,
      strategy:
        strategyParam === "all" ? "all" : (strategyParam as StrategyId),
      marketLimit: Number.isFinite(marketLimit) ? marketLimit : 180,
    });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Backtest failed",
      },
      { status: 500 },
    );
  }
}
