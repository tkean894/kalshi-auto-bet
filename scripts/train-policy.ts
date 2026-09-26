import { writeTrainStatus } from "../src/lib/training/train-status";
import { trainPolicy } from "../src/lib/training/train";

async function main() {
  await writeTrainStatus({
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: "Full desk training started…",
    pid: process.pid,
    lastError: null,
  });

  console.log(
    "Full desk training: 14 ET days, 4-day holdout, fee-aware walk-forward, v3 features...",
  );
  try {
    const policy = await trainPolicy({
      days: 14,
      holdoutDays: 4,
      bankroll: 1000,
      maxTrade: 25,
      marketLimit: 200,
      forceRebuildCache: false, // rebuilds automatically when cacheVersion < 3
    });

    const b = policy.holdoutBaseline;
    const t = policy.holdoutTrained;
    console.log(
      JSON.stringify(
        {
          trainedAt: policy.trainedAt,
          version: policy.version,
          feeAware: policy.feeAware,
          trainDates: policy.trainDates,
          holdoutDates: policy.holdoutDates,
          enabledRules: policy.rules.filter((r) => r.enabled),
          disabledRules: policy.rules
            .filter((r) => !r.enabled)
            .map((r) => r.strategyId),
          logistic: policy.logistic
            ? {
                trainedOn: policy.logistic.trainedOn,
                trainAccuracy: policy.logistic.trainAccuracy,
              }
            : null,
          walkForward: policy.walkForward
            ? {
                folds: policy.walkForward.folds.length,
                oosPnl: policy.walkForward.oosPnl,
                oosTrades: policy.walkForward.oosTrades,
                oosMaxDrawdown: policy.walkForward.oosMaxDrawdown,
              }
            : null,
          train: {
            trades: policy.trainMetrics.trades,
            wins: policy.trainMetrics.wins,
            hitRate: policy.trainMetrics.hitRate,
            pnl: policy.trainMetrics.pnl,
            maxDrawdown: policy.trainMetrics.maxDrawdown,
            totalFees: policy.trainMetrics.totalFees,
            byStrategy: policy.trainMetrics.byStrategy,
          },
          holdoutBefore: {
            trades: b.trades,
            wins: b.wins,
            losses: b.losses,
            hitRate: b.hitRate,
            pnl: b.pnl,
            maxDrawdown: b.maxDrawdown,
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
            maxDrawdown: t.maxDrawdown,
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

    await writeTrainStatus({
      status: "done",
      finishedAt: new Date().toISOString(),
      message: `Retrain done. Holdout Δ P&L ${(t.pnl - b.pnl).toFixed(2)}`,
      pid: null,
      lastError: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeTrainStatus({
      status: "error",
      finishedAt: new Date().toISOString(),
      message: `Retrain failed: ${msg}`,
      pid: null,
      lastError: msg,
    });
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
