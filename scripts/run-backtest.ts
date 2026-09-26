import { runDayBacktest } from "../src/lib/backtest/simulate";

async function main() {
  const summary = await runDayBacktest({
    bankroll: 1000,
    maxTrade: 25,
    minEdgeScore: 55,
    strategy: "all",
    marketLimit: 150,
  });
  console.log(
    JSON.stringify(
      {
        date: summary.date,
        marketsScanned: summary.marketsScanned,
        marketsWithQuotes: summary.marketsWithQuotes,
        signalsGenerated: summary.signalsGenerated,
        trades: summary.trades.length,
        wins: summary.wins,
        losses: summary.losses,
        hitRate: summary.hitRate,
        totalCost: summary.totalCost,
        totalPayout: summary.totalPayout,
        pnl: summary.pnl,
        endingCash: summary.endingCash,
        roi: summary.roi,
        byStrategy: summary.byStrategy,
        notes: summary.notes,
        sample: summary.trades.slice(0, 10).map((t) => ({
          title: t.title.slice(0, 60),
          side: t.side,
          entry: t.entryPrice,
          contracts: t.contracts,
          result: t.result,
          hit: t.hit,
          pnl: Number(t.pnl.toFixed(2)),
          strategy: t.strategyName,
          edge: t.edgeScore,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
