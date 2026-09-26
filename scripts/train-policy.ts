import { trainPolicy } from "../src/lib/training/train";

async function main() {
  console.log("Building day caches + training policy (this can take a while)...");
  const policy = await trainPolicy({
    days: 10,
    holdoutDays: 3,
    bankroll: 1000,
    maxTrade: 25,
    marketLimit: 160,
  });

  const b = policy.holdoutBaseline;
  const t = policy.holdoutTrained;
  console.log(
    JSON.stringify(
      {
        trainedAt: policy.trainedAt,
        trainDates: policy.trainDates,
        holdoutDates: policy.holdoutDates,
        enabledRules: policy.rules.filter((r) => r.enabled),
        train: {
          trades: policy.trainMetrics.trades,
          wins: policy.trainMetrics.wins,
          hitRate: policy.trainMetrics.hitRate,
          pnl: policy.trainMetrics.pnl,
        },
        holdoutBefore: {
          trades: b.trades,
          wins: b.wins,
          losses: b.losses,
          hitRate: b.hitRate,
          pnl: b.pnl,
          roi: b.roi,
          byStrategy: b.byStrategy,
          byDate: b.byDate,
        },
        holdoutAfter: {
          trades: t.trades,
          wins: t.wins,
          losses: t.losses,
          hitRate: t.hitRate,
          pnl: t.pnl,
          roi: t.roi,
          byStrategy: t.byStrategy,
          byDate: t.byDate,
        },
        notes: policy.notes,
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
