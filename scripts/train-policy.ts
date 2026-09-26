import { trainPolicy } from "../src/lib/training/train";

async function main() {
  console.log(
    "Full desk training: 14 ET days, 4-day holdout, 200 markets/day, expanded grid...",
  );
  const policy = await trainPolicy({
    days: 14,
    holdoutDays: 4,
    bankroll: 1000,
    maxTrade: 25,
    marketLimit: 200,
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
        disabledRules: policy.rules
          .filter((r) => !r.enabled)
          .map((r) => r.strategyId),
        train: {
          trades: policy.trainMetrics.trades,
          wins: policy.trainMetrics.wins,
          hitRate: policy.trainMetrics.hitRate,
          pnl: policy.trainMetrics.pnl,
          byStrategy: policy.trainMetrics.byStrategy,
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
        deltaHoldoutPnl: t.pnl - b.pnl,
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
