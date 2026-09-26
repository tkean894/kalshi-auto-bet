import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildOrLoadDayCache, listRecentEtDates, sleep } from "./day-cache";
import { evaluatePolicyOnDates } from "./evaluate";
import { trainLogistic, type LogisticModel } from "./logistic";
import { DATA_ROOT, TRAINED_POLICY_PATH, TRAIN_REPORT_PATH } from "./paths";
import { baselinePolicy, defaultPortfolioRisk } from "./policy";
import type {
  DayCache,
  PeriodMetrics,
  PortfolioRiskLimits,
  TrainedPolicy,
  TrainedStrategyRule,
  WalkForwardFold,
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

const EDGE_GRID = [45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const ENTRY_CAPS: Array<number | null> = [
  null,
  0.25,
  0.35,
  0.45,
  0.55,
  0.65,
  0.75,
  0.85,
];
const SIZE_MULTS = [0.5, 1, 1.5, 2];
const MIN_HOURS = [null, 1, 3, 6] as const;
const MAX_HOURS = [null, 24, 48, 72] as const;

function cloneRules(rules: TrainedStrategyRule[]): TrainedStrategyRule[] {
  return rules.map((r) => ({ ...r }));
}

function scoreMetrics(m: PeriodMetrics): number {
  // Fee-aware net PnL, penalize drawdown, reward hit rate + sample size.
  return (
    m.pnl * 1000 -
    m.maxDrawdown * 250 +
    m.hitRate * 10 +
    Math.min(m.trades, 50) * 0.01
  );
}

async function evalRules(
  dates: string[],
  rules: TrainedStrategyRule[],
  opts: {
    bankroll: number;
    maxTrade: number;
    caches: Map<string, DayCache>;
    portfolioRisk: PortfolioRiskLimits;
    logistic?: LogisticModel | null;
  },
) {
  return evaluatePolicyOnDates({
    dates,
    rules,
    bankroll: opts.bankroll,
    maxTrade: opts.maxTrade,
    caches: opts.caches,
    feeAware: true,
    portfolioRisk: opts.portfolioRisk,
    logistic: opts.logistic ?? null,
    edgeSized: true,
  });
}

function fitLogisticFromTrades(
  trades: {
    edgeScore: number;
    side: "yes" | "no";
    features: import("@/lib/trading/features").SignalFeatures;
    hit: boolean;
  }[],
): LogisticModel | null {
  return trainLogistic(trades);
}

/**
 * Fee-aware walk-forward + holdout training:
 * Stage 0: walk-forward OOS folds on train dates
 * Stage 1: per-strategy univariate search
 * Stage 2: joint min-edge / entry caps
 * Stage 3: size / time-to-close polish
 * Stage 4: rank boost + logistic
 * Stage 5: leave-one-strategy-out
 */
export async function trainPolicy(opts?: {
  days?: number;
  holdoutDays?: number;
  bankroll?: number;
  maxTrade?: number;
  marketLimit?: number;
  forceRebuildCache?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<TrainedPolicy> {
  const log = opts?.onProgress ?? ((msg: string) => console.log(msg));
  const days = opts?.days ?? 14;
  const holdoutDays = opts?.holdoutDays ?? 4;
  const bankroll = opts?.bankroll ?? 1000;
  const maxTrade = opts?.maxTrade ?? 25;
  const marketLimit = opts?.marketLimit ?? 200;
  const portfolioRisk = defaultPortfolioRisk();

  const allDates = listRecentEtDates(days);
  if (allDates.length < holdoutDays + 2) {
    throw new Error(`Need more history; only found ${allDates.length} dates`);
  }
  const holdoutDates = allDates.slice(-holdoutDays);
  const trainDates = allDates.slice(0, -holdoutDays);

  const caches = new Map<string, DayCache>();
  for (const date of allDates) {
    log(`Caching day ${date} (v3 intraday features)...`);
    const cache = await buildOrLoadDayCache(date, marketLimit, {
      force: opts?.forceRebuildCache ?? false,
    });
    caches.set(date, cache);
    log(
      `  quotes=${cache.quotes.length} scanned=${cache.marketsScanned} ver=${cache.cacheVersion}`,
    );
    await sleep(1200);
  }

  const ctx = { bankroll, maxTrade, caches, portfolioRisk };

  // Stage 0 — walk-forward on train dates (rolling 2-day tests).
  const folds: WalkForwardFold[] = [];
  if (trainDates.length >= 6) {
    const testLen = 2;
    for (
      let end = 4;
      end + testLen <= trainDates.length;
      end += testLen
    ) {
      const foldTrain = trainDates.slice(0, end);
      const foldTest = trainDates.slice(end, end + testLen);
      // Lightweight fold: baseline vs a mid-edge solo favorite-edge proxy is
      // too weak — instead evaluate current baseline and a tightened grid best
      // from a quick favorite across strategies using fixed mid params.
      const foldRules = baselinePolicy().map((r) => ({
        ...r,
        minEdgeScore: 60,
        maxEntryPrice: 0.55,
      }));
      const trainEval = await evalRules(foldTrain, foldRules, ctx);
      const testEval = await evalRules(foldTest, foldRules, ctx);
      folds.push({
        trainDates: foldTrain,
        testDates: foldTest,
        trainPnl: trainEval.metrics.pnl,
        testPnl: testEval.metrics.pnl,
        testTrades: testEval.metrics.trades,
        testHitRate: testEval.metrics.hitRate,
        testMaxDrawdown: testEval.metrics.maxDrawdown,
      });
      log(
        `Walk-forward fold test=${foldTest.join(",")} pnl=${testEval.metrics.pnl.toFixed(2)}`,
      );
    }
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
      sizeMult: 1,
      minHoursToClose: 1,
      maxHoursToClose: 72,
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
          sizeMult: 1,
          minHoursToClose: 1,
          maxHoursToClose: 72,
        }));
        const { metrics } = await evalRules(trainDates, rules, ctx);
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
            sizeMult: 1,
            minHoursToClose: 1,
            maxHoursToClose: 72,
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
    log(
      `Solo ${strategyId}: pnl=${(bestMetrics?.pnl ?? 0).toFixed(2)} n=${bestMetrics?.trades ?? 0}`,
    );
  }

  let working = baselinePolicy().map((r) => {
    const solo = soloResults.find((s) => s.strategyId === r.strategyId)!;
    const enable = solo.trainPnl > 0 && solo.trainTrades >= 3;
    return {
      ...solo.best,
      enabled: enable,
      rankBoost: 0,
    };
  });

  if (!working.some((r) => r.enabled)) {
    const bestSolo = [...soloResults].sort((a, b) => b.trainPnl - a.trainPnl)[0];
    working = working.map((r) =>
      r.strategyId === bestSolo.strategyId
        ? { ...bestSolo.best, enabled: true }
        : { ...r, enabled: false },
    );
  }

  // Stage 2: refine joint min-edge / entry caps.
  let bestJoint = cloneRules(working);
  let bestJointScore = Number.NEGATIVE_INFINITY;
  {
    const { metrics } = await evalRules(trainDates, bestJoint, ctx);
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
        const { metrics } = await evalRules(trainDates, trial, ctx);
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

  // Stage 3: size multipliers + time-to-close windows.
  let bestSized = cloneRules(bestJoint);
  let bestSizedScore = bestJointScore;
  for (const strategyId of enabledIds) {
    for (const sizeMult of SIZE_MULTS) {
      for (const minH of MIN_HOURS) {
        for (const maxH of MAX_HOURS) {
          if (minH != null && maxH != null && minH >= maxH) continue;
          const trial = cloneRules(bestSized).map((r) =>
            r.strategyId === strategyId
              ? {
                  ...r,
                  sizeMult,
                  minHoursToClose: minH,
                  maxHoursToClose: maxH,
                }
              : r,
          );
          const { metrics } = await evalRules(trainDates, trial, ctx);
          const score = scoreMetrics(metrics);
          if (score > bestSizedScore) {
            bestSizedScore = score;
            bestSized = trial;
          }
        }
      }
    }
  }

  // Fit logistic on fee-aware filled train trades under current rules.
  const labeled = await evalRules(trainDates, bestSized, ctx);
  let logistic = fitLogisticFromTrades(labeled.trades);
  log(
    logistic
      ? `Logistic fitted: n=${logistic.trainedOn} acc=${(logistic.trainAccuracy * 100).toFixed(1)}%`
      : "Logistic skipped (insufficient labeled rows)",
  );

  // Stage 4: rank boosts with logistic in the ranking context.
  let bestBoosted = cloneRules(bestSized);
  let bestBoostScore = bestSizedScore;
  {
    const { metrics } = await evalRules(trainDates, bestBoosted, {
      ...ctx,
      logistic,
    });
    bestBoostScore = scoreMetrics(metrics);
  }
  for (const strategyId of enabledIds) {
    for (const boost of [0, 5, 10, 15]) {
      const trial = cloneRules(bestBoosted).map((r) =>
        r.strategyId === strategyId ? { ...r, rankBoost: boost } : r,
      );
      const { metrics } = await evalRules(trainDates, trial, {
        ...ctx,
        logistic,
      });
      const score = scoreMetrics(metrics);
      if (score > bestBoostScore) {
        bestBoostScore = score;
        bestBoosted = trial;
      }
    }
  }

  // Stage 5: leave-one-strategy-out.
  {
    let current = cloneRules(bestBoosted);
    let { metrics: curMetrics } = await evalRules(trainDates, current, {
      ...ctx,
      logistic,
    });
    let improved = true;
    while (improved) {
      improved = false;
      const enabled = current.filter((r) => r.enabled);
      if (enabled.length <= 1) break;
      for (const rule of enabled) {
        const trial = cloneRules(current).map((r) =>
          r.strategyId === rule.strategyId ? { ...r, enabled: false } : r,
        );
        const { metrics } = await evalRules(trainDates, trial, {
          ...ctx,
          logistic,
        });
        if (scoreMetrics(metrics) > scoreMetrics(curMetrics)) {
          current = trial;
          curMetrics = metrics;
          improved = true;
          break;
        }
      }
    }
    bestBoosted = current;
  }

  // Refit logistic on final enabled rule set.
  const finalLabeled = await evalRules(trainDates, bestBoosted, ctx);
  logistic = fitLogisticFromTrades(finalLabeled.trades) ?? logistic;

  const trainedRules = bestBoosted;
  const evalCtx = { ...ctx, logistic };

  const trainEval = await evalRules(trainDates, trainedRules, evalCtx);
  const holdoutBaseline = await evalRules(
    holdoutDates,
    baselinePolicy(),
    { ...ctx, logistic: null },
  );
  const holdoutTrained = await evalRules(
    holdoutDates,
    trainedRules,
    evalCtx,
  );

  const oosPnl = folds.reduce((s, f) => s + f.testPnl, 0);
  const oosTrades = folds.reduce((s, f) => s + f.testTrades, 0);
  const oosWinsProxy = folds.reduce(
    (s, f) => s + f.testHitRate * f.testTrades,
    0,
  );
  const oosMaxDrawdown = folds.reduce(
    (m, f) => Math.max(m, f.testMaxDrawdown),
    0,
  );

  const notes = [
    `Train dates (${trainDates.length}): ${trainDates.join(", ")}`,
    `Holdout dates (${holdoutDates.length}): ${holdoutDates.join(", ")}`,
    `Bankroll $${bankroll}, max trade $${maxTrade}, marketLimit ${marketLimit}`,
    `Fee model: Kalshi-style taker ≈ ceil(0.07·C·p·(1-p)) + 50bps slippage`,
    `Portfolio risk: max ${portfolioRisk.maxPerEvent}/event, ${portfolioRisk.maxPerCategory}/category; edge-sized tickets`,
    `Walk-forward folds: ${folds.length}; OOS pnl=${oosPnl.toFixed(2)} trades=${oosTrades}`,
    `Solo train PnL by strategy: ${soloResults
      .map(
        (s) =>
          `${s.strategyId}=${s.trainPnl.toFixed(2)} (n=${s.trainTrades}, hit=${(s.trainHitRate * 100).toFixed(1)}%)`,
      )
      .join("; ")}`,
    `Enabled after training: ${
      trainedRules
        .filter((r) => r.enabled)
        .map(
          (r) =>
            `${r.strategyId}[minEdge=${r.minEdgeScore}, maxEntry=${r.maxEntryPrice ?? "none"}, boost=${r.rankBoost}, size×${r.sizeMult}, ttc=${r.minHoursToClose ?? 0}-${r.maxHoursToClose ?? "∞"}h]`,
        )
        .join(", ") || "(none)"
    }`,
    logistic
      ? `Logistic ranker: acc=${(logistic.trainAccuracy * 100).toFixed(1)}% on ${logistic.trainedOn} fills`
      : "Logistic ranker: not fitted",
    "All metrics from settled Kalshi markets via v3 day-cache (intraday entry ~55% session, category, path/volume features).",
  ];

  const policy: TrainedPolicy = {
    version: 2,
    trainedAt: new Date().toISOString(),
    trainDates,
    holdoutDates,
    bankroll,
    maxTrade,
    rules: trainedRules,
    objective: "net_pnl_drawdown",
    feeAware: true,
    portfolioRisk,
    logistic,
    walkForward:
      folds.length > 0
        ? {
            folds,
            oosPnl,
            oosTrades,
            oosHitRate: oosTrades ? oosWinsProxy / oosTrades : 0,
            oosMaxDrawdown,
          }
        : null,
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
          cacheVersion: caches.get(d)?.cacheVersion ?? 0,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

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
          walkForward: policy.walkForward,
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
