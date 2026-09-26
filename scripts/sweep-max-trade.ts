import {
  saveMaxTradeSweep,
  sweepMaxTrade,
} from "../src/lib/training/max-trade-sweep";

async function main() {
  const bankroll = Number(process.env.BANKROLL ?? 1000);
  console.log(`Max-trade sweep for bankroll $${bankroll}…`);
  const report = await sweepMaxTrade({
    bankroll,
    onProgress: (msg) => console.log(msg),
  });
  await saveMaxTradeSweep(report);

  const top = report.candidates.slice(0, 8).map((c) => ({
    maxTrade: c.maxTrade,
    pct: `${(c.fractionOfBankroll * 100).toFixed(2)}%`,
    trainPnl: Number(c.train.pnl.toFixed(2)),
    holdoutPnl: Number(c.holdout.pnl.toFixed(2)),
    holdoutDd: Number(c.holdout.maxDrawdown.toFixed(2)),
    trainScore: Number(c.trainScore.toFixed(1)),
    holdoutScore: Number(c.holdoutScore.toFixed(1)),
  }));

  console.log(
    JSON.stringify(
      {
        suggested: report.suggested,
        topByTrainScore: top,
        notes: report.notes,
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
