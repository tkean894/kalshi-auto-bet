import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildOrLoadDayCache, listRecentEtDates, sleep } from "./day-cache";
import { evaluatePolicyOnDates } from "./evaluate";
import { DATA_ROOT, TRAINED_POLICY_PATH, TRAIN_REPORT_PATH } from "./paths";
import { baselinePolicy } from "./policy";
import type {
  DayCache,
  PeriodMetrics,
  TrainedPolicy,
  TrainedStrategyRule,
} from "./types";
import type { StrategyId } from "@/lib/strategies/types";

const ALL_STRATEGIES: StrategyId[] = [
  "tight-spread",
  "momentum",
  "mean-reversion",
  "favorite-edge",
  "longshot-value",
  "liquidity",
];

const EDGE_GRID = [50, 55, 60, 65, 70, 75, 80, 85];
const ENTRY_CAPS: Array<number | null> = [null, 0.35, 0.55, 0.75];

function cloneRules(rules: TrainedStrategyRule[]): TrainedStrategyRule[] {
  return rules.map((r) => ({ ...r }));
}

function scoreMetrics(m: PeriodMetrics): number {
  // Primary: total PnL. Tie-break: higher hit rate, then more trades (stability).
  return m.pnl * 1000 + m.hitRate * 10 + Math.min(m.trades, 50) * 0.01;
}

/**
 * Stage 1: per-strategy univariate search on train days (solo policy).
 * Stage 2: combine best enabled strategies; grid min-edge / entry caps.
 * Stage 3: small rank-boost polish.
 */
export async function trainPolicy(opts?: {
  days?: number;
  holdoutDays?: number;
  bankroll?: number;
  maxTrade?: number;
  marketLimit?: number;
}): Promise<TrainedPolicy> {
  const days = opts?.days ?? 10;
  const holdoutDays = opts?.holdoutDays ?? 3;
  const bankroll = opts?.bankroll ?? 1000;
  const maxTrade = opts?.maxTrade ?? 25;
  const marketLimit = opts?.marketLimit ?? 160;

  const allDates = listRecentEtDates(days);
  if (allDates.length < holdoutDays + 2) {
    throw new Error(`Need more history; only found ${allDates.length} dates`);
  }
  const holdoutDates = allDates.slice(-holdoutDays);
  const trainDates = allDates.slice(0, -holdoutDays);

  const caches = new Map<string, DayCache>();
  for (const date of allDates) {
    console.log(`Caching day ${date}...`);
    const cache = await buildOrLoadDayCache(date, marketLimit);
    caches.set(date, cache);
    console.log(`  quotes=${cache.quotes.length} scanned=${cache.marketsScanned}`);
    await sleep(1500);
  }

  // Stage 1: which strategies are +EV alone on train?
  const soloResults: {
    strategyId: StrategyId;
    best: TrainedStrategyRule;
    trainPnl: number;
    trainTrades: number;
    trainHitRate: number;
  }[] = [];

  for (const strategyId of ALL_STRATEGIES) {
    let bestRule: TrainedStrategyRule = {
      strategyId,
      enabled: true,
      minEdgeScore: 55,
      maxEntryPrice: null,
      rankBoost: 0,
    };
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestMetrics: PeriodMetrics | null = null;

    for (const minEdge of EDGE_GRID) {
      for (const maxEntry of ENTRY_CAPS) {
        const rules = ALL_STRATEGIES.map((id) => ({
          strategyId: id,
          enabled: id === strategyId,
          minEdgeScore: id === strategyId ? minEdge : 99,
          maxEntryPrice: id === strategyId ? maxEntry : null,
          rankBoost: 0,
        }));
        const { metrics } = await evaluatePolicyOnDates({
          dates: trainDates,
          rules,
          bankroll,
          maxTrade,
          caches,
        });
        const score = scoreMetrics(metrics);
        if (score > bestScore) {
          bestScore = score;
          bestMetrics = metrics;
          bestRule = {
            strategyId,
            enabled: true,
            minEdgeScore: minEdge,
            maxEntryPrice: maxEntry,
            rankBoost: 0,
          };
        }
      }
    }

    soloResults.push({
      strategyId,
      best: bestRule,
      trainPnl: bestMetrics?.pnl ?? 0,
      trainTrades: bestMetrics?.trades ?? 0,
      trainHitRate: bestMetrics?.hitRate ?? 0,
    });
  }

  // Enable strategies with positive train PnL and at least a few trades.
  let working = baselinePolicy().map((r) => {
    const solo = soloResults.find((s) => s.strategyId === r.strategyId)!;
    const enable = solo.trainPnl > 0 && solo.trainTrades >= 3;
    return {
      ...solo.best,
      enabled: enable,
      rankBoost: 0,
    };
  });

  // If nothing enabled, keep the single best solo strategy even if negative.
  if (!working.some((r) => r.enabled)) {
    const bestSolo = [...soloResults].sort((a, b) => b.trainPnl - a.trainPnl)[0];
    working = working.map((r) =>
      r.strategyId === bestSolo.strategyId
        ? { ...bestSolo.best, enabled: true }
        : { ...r, enabled: false },
    );
  }

  // Stage 2: refine joint min-edge / entry caps for enabled strategies.
  let bestJoint = cloneRules(working);
  let bestJointScore = Number.NEGATIVE_INFINITY;
  {
    const { metrics } = await evaluatePolicyOnDates({
      dates: trainDates,
      rules: bestJoint,
      bankroll,
      maxTrade,
      caches,
    });
    bestJointScore = scoreMetrics(metrics);
  }

  const enabledIds = working.filter((r) => r.enabled).map((r) => r.strategyId);
  for (const strategyId of enabledIds) {
    let localBest = cloneRules(bestJoint);
    let localScore = bestJointScore;
    for (const minEdge of EDGE_GRID) {
      for (const maxEntry of ENTRY_CAPS) {
        const trial = cloneRules(bestJoint).map((r) =>
          r.strategyId === strategyId
            ? { ...r, minEdgeScore: minEdge, maxEntryPrice: maxEntry }
            : r,
        );
        const { metrics } = await evaluatePolicyOnDates({
          dates: trainDates,
          rules: trial,
          bankroll,
          maxTrade,
          caches,
        });
        const score = scoreMetrics(metrics);
        if (score > localScore) {
          localScore = score;
          localBest = trial;
        }
      }
    }
    bestJoint = localBest;
    bestJointScore = localScore;
  }

  // Stage 3: rank boosts for enabled strategies (0 / +5 / +10).
  let bestBoosted = cloneRules(bestJoint);
  let bestBoostScore = bestJointScore;
  for (const strategyId of enabledIds) {
    for (const boost of [0, 5, 10]) {
      const trial = cloneRules(bestBoosted).map((r) =>
        r.strategyId === strategyId ? { ...r, rankBoost: boost } : r,
      );
      const { metrics } = await evaluatePolicyOnDates({
        dates: trainDates,
        rules: trial,
        bankroll,
        maxTrade,
        caches,
      });
      const score = scoreMetrics(metrics);
      if (score > bestBoostScore) {
        bestBoostScore = score;
        bestBoosted = trial;
      }
    }
  }

  const trainedRules = bestBoosted;

  const trainEval = await evaluatePolicyOnDates({
    dates: trainDates,
    rules: trainedRules,
    bankroll,
    maxTrade,
    caches,
  });
  const holdoutBaseline = await evaluatePolicyOnDates({
    dates: holdoutDates,
    rules: baselinePolicy(),
    bankroll,
    maxTrade,
    caches,
  });
  const holdoutTrained = await evaluatePolicyOnDates({
    dates: holdoutDates,
    rules: trainedRules,
    bankroll,
    maxTrade,
    caches,
  });

  const notes = [
    `Train dates (${trainDates.length}): ${trainDates.join(", ")}`,
    `Holdout dates (${holdoutDates.length}): ${holdoutDates.join(", ")}`,
    `Bankroll $${bankroll}, max trade $${maxTrade}, marketLimit ${marketLimit}`,
    `Solo train PnL by strategy: ${soloResults
      .map(
        (s) =>
          `${s.strategyId}=${s.trainPnl.toFixed(2)} (n=${s.trainTrades}, hit=${(s.trainHitRate * 100).toFixed(1)}%)`,
      )
      .join("; ")}`,
    `Enabled after training: ${trainedRules
      .filter((r) => r.enabled)
      .map(
        (r) =>
          `${r.strategyId}[minEdge=${r.minEdgeScore}, maxEntry=${r.maxEntryPrice ?? "none"}, boost=${r.rankBoost}]`,
      )
      .join(", ") || "(none)"}`,
    "All metrics computed from settled Kalshi markets via cached day quotes. Fees ignored.",
  ];

  const policy: TrainedPolicy = {
    version: 1,
    trainedAt: new Date().toISOString(),
    trainDates,
    holdoutDates,
    bankroll,
    maxTrade,
    rules: trainedRules,
    objective: "total_pnl",
    trainMetrics: trainEval.metrics,
    holdoutBaseline: holdoutBaseline.metrics,
    holdoutTrained: holdoutTrained.metrics,
    notes,
  };

  await mkdir(DATA_ROOT, { recursive: true });
  await writeFile(TRAINED_POLICY_PATH, JSON.stringify(policy, null, 2), "utf8");
  await writeFile(
    TRAIN_REPORT_PATH,
    JSON.stringify(
      {
        policy,
        soloResults,
        holdoutBaselineTrades: holdoutBaseline.trades,
        holdoutTrainedTrades: holdoutTrained.trades,
        cacheStats: allDates.map((d) => ({
          date: d,
          quotes: caches.get(d)?.quotes.length ?? 0,
          marketsScanned: caches.get(d)?.marketsScanned ?? 0,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  // Also copy a compact report into artifacts for the walkthrough.
  try {
    const artDir = "/opt/cursor/artifacts";
    await mkdir(artDir, { recursive: true });
    await writeFile(
      path.join(artDir, "train-before-after.json"),
      JSON.stringify(
        {
          generatedAt: policy.trainedAt,
          trainDates,
          holdoutDates,
          baselineHoldout: holdoutBaseline.metrics,
          trainedHoldout: holdoutTrained.metrics,
          trainMetrics: trainEval.metrics,
          rules: trainedRules,
          notes,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    // non-fatal
  }

  return policy;
}
