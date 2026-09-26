import { mkdir, readFile, writeFile } from "node:fs/promises";
import { evaluatePolicyOnDates } from "./evaluate";
import { loadTrainedPolicy } from "./load-policy";
import { DATA_ROOT, TRAINED_POLICY_PATH } from "./paths";
import { baselinePolicy } from "./policy";
import { buildOrLoadDayCache, listRecentEtDates } from "./day-cache";
import type { DayCache, PeriodMetrics, TrainedStrategyRule } from "./types";

export const MAX_TRADE_SWEEP_PATH = `${DATA_ROOT}/max-trade-sweep.json`;

/** Bankroll fractions tested for max-trade sizing. */
export const MAX_TRADE_FRACTIONS = [
  0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.075, 0.1, 0.15, 0.25,
] as const;

/** Absolute dollar candidates (capped at bankroll). */
export const MAX_TRADE_ABSOLUTES = [
  1, 5, 10, 15, 20, 25, 40, 50, 75, 100, 150, 250,
] as const;

export type MaxTradeCandidateResult = {
  maxTrade: number;
  fractionOfBankroll: number;
  source: "fraction" | "absolute" | "both";
  train: Pick<
    PeriodMetrics,
    "pnl" | "trades" | "hitRate" | "maxDrawdown" | "totalFees" | "endingEquity"
  >;
  holdout: Pick<
    PeriodMetrics,
    "pnl" | "trades" | "hitRate" | "maxDrawdown" | "totalFees" | "endingEquity"
  >;
  trainScore: number;
  holdoutScore: number;
};

/** Reject sizes whose train max drawdown exceeds this fraction of bankroll. */
export const MAX_TRAIN_DRAWDOWN_FRAC = 0.25;

export type MaxTradeSweepReport = {
  version: number;
  ranAt: string;
  bankroll: number;
  trainDates: string[];
  holdoutDates: string[];
  policySource: "trained" | "baseline";
  selectionRule: string;
  maxTrainDrawdownFrac: number;
  /** Train-selected winner under the drawdown budget (used for the suggestion). */
  suggested: {
    maxTrade: number;
    fractionOfBankroll: number;
    trainPnl: number;
    holdoutPnl: number;
    trainMaxDrawdown: number;
    holdoutMaxDrawdown: number;
    eligible: boolean;
    vsNextBestEligible: {
      maxTrade: number;
      trainPnlDelta: number;
      holdoutPnlDelta: number;
    } | null;
    vsCurrentDefault: {
      maxTrade: number;
      trainPnlDelta: number;
      holdoutPnlDelta: number;
    } | null;
    vsUnconstrainedTrainChamp: {
      maxTrade: number;
      trainPnlDelta: number;
      holdoutPnlDelta: number;
      note: string;
    } | null;
  };
  /** Full ranking by train score (includes DD-ineligible sizes). */
  candidates: MaxTradeCandidateResult[];
  notes: string[];
};

function scoreMetrics(m: PeriodMetrics): number {
  return (
    m.pnl * 1000 -
    m.maxDrawdown * 250 +
    m.hitRate * 10 +
    Math.min(m.trades, 50) * 0.01
  );
}

function slim(m: PeriodMetrics): MaxTradeCandidateResult["train"] {
  return {
    pnl: m.pnl,
    trades: m.trades,
    hitRate: m.hitRate,
    maxDrawdown: m.maxDrawdown,
    totalFees: m.totalFees,
    endingEquity: m.endingEquity,
  };
}

export function candidateMaxTrades(bankroll: number): {
  maxTrade: number;
  fractionOfBankroll: number;
  source: "fraction" | "absolute" | "both";
}[] {
  const byTrade = new Map<
    number,
    { maxTrade: number; fractionOfBankroll: number; source: "fraction" | "absolute" | "both" }
  >();

  for (const f of MAX_TRADE_FRACTIONS) {
    const maxTrade = Math.max(0.05, Math.round(bankroll * f * 100) / 100);
    if (maxTrade > bankroll) continue;
    byTrade.set(maxTrade, {
      maxTrade,
      fractionOfBankroll: maxTrade / bankroll,
      source: "fraction",
    });
  }

  for (const abs of MAX_TRADE_ABSOLUTES) {
    if (abs > bankroll) continue;
    const maxTrade = Math.max(0.05, abs);
    const existing = byTrade.get(maxTrade);
    if (existing) {
      existing.source = "both";
    } else {
      byTrade.set(maxTrade, {
        maxTrade,
        fractionOfBankroll: maxTrade / bankroll,
        source: "absolute",
      });
    }
  }

  return [...byTrade.values()].sort((a, b) => a.maxTrade - b.maxTrade);
}

/**
 * Sweep max-trade sizes for a bankroll against cached settled days.
 * Selects on train dates; reports holdout for every candidate as proof.
 */
export async function sweepMaxTrade(opts?: {
  bankroll?: number;
  days?: number;
  holdoutDays?: number;
  caches?: Map<string, DayCache>;
  rules?: TrainedStrategyRule[];
  onProgress?: (msg: string) => void;
}): Promise<MaxTradeSweepReport> {
  const log = opts?.onProgress ?? (() => undefined);
  const bankroll = opts?.bankroll ?? 1000;
  const days = opts?.days ?? 14;
  const holdoutDays = opts?.holdoutDays ?? 4;

  const policy = await loadTrainedPolicy();
  const rules = opts?.rules ?? policy?.rules ?? baselinePolicy();
  const policySource: "trained" | "baseline" = opts?.rules
    ? "trained"
    : policy
      ? "trained"
      : "baseline";

  const allDates =
    policy && policy.trainDates.length && policy.holdoutDates.length
      ? [...policy.trainDates, ...policy.holdoutDates]
      : listRecentEtDates(days);
  const holdoutDates =
    policy?.holdoutDates ?? allDates.slice(-holdoutDays);
  const trainDates =
    policy?.trainDates ?? allDates.slice(0, -holdoutDays);

  const caches = opts?.caches ?? new Map<string, DayCache>();
  for (const date of [...trainDates, ...holdoutDates]) {
    if (caches.has(date)) continue;
    log(`Loading day cache ${date}…`);
    caches.set(date, await buildOrLoadDayCache(date, 200));
  }

  const grid = candidateMaxTrades(bankroll);
  log(`Sweeping ${grid.length} max-trade candidates for bankroll $${bankroll}…`);

  const candidates: MaxTradeCandidateResult[] = [];
  for (const c of grid) {
    const trainEval = await evaluatePolicyOnDates({
      dates: trainDates,
      rules,
      bankroll,
      maxTrade: c.maxTrade,
      caches,
      feeAware: true,
      portfolioRisk: policy?.portfolioRisk,
      logistic: policy?.logistic ?? null,
      edgeSized: true,
    });
    const holdoutEval = await evaluatePolicyOnDates({
      dates: holdoutDates,
      rules,
      bankroll,
      maxTrade: c.maxTrade,
      caches,
      feeAware: true,
      portfolioRisk: policy?.portfolioRisk,
      logistic: policy?.logistic ?? null,
      edgeSized: true,
    });
    candidates.push({
      maxTrade: c.maxTrade,
      fractionOfBankroll: c.fractionOfBankroll,
      source: c.source,
      train: slim(trainEval.metrics),
      holdout: slim(holdoutEval.metrics),
      trainScore: scoreMetrics(trainEval.metrics),
      holdoutScore: scoreMetrics(holdoutEval.metrics),
    });
    log(
      `  maxTrade=$${c.maxTrade} trainPnl=${trainEval.metrics.pnl.toFixed(2)} holdoutPnl=${holdoutEval.metrics.pnl.toFixed(2)} dd=${holdoutEval.metrics.maxDrawdown.toFixed(2)}`,
    );
  }

  const byTrain = [...candidates].sort((a, b) => b.trainScore - a.trainScore);
  const ddCap = bankroll * MAX_TRAIN_DRAWDOWN_FRAC;
  const eligible = byTrain.filter((c) => c.train.maxDrawdown <= ddCap);
  const winner = eligible[0] ?? byTrain[0];
  const runnerUp = eligible[1] ?? null;
  const unconstrainedChamp = byTrain[0];
  const defaultCandidate =
    candidates.find((c) => c.maxTrade === 25) ??
    candidates.find(
      (c) => Math.abs(c.fractionOfBankroll - 0.025) < 1e-9,
    ) ??
    null;

  const suggested: MaxTradeSweepReport["suggested"] = {
    maxTrade: winner.maxTrade,
    fractionOfBankroll: winner.fractionOfBankroll,
    trainPnl: winner.train.pnl,
    holdoutPnl: winner.holdout.pnl,
    trainMaxDrawdown: winner.train.maxDrawdown,
    holdoutMaxDrawdown: winner.holdout.maxDrawdown,
    eligible: winner.train.maxDrawdown <= ddCap,
    vsNextBestEligible: runnerUp
      ? {
          maxTrade: runnerUp.maxTrade,
          trainPnlDelta: winner.train.pnl - runnerUp.train.pnl,
          holdoutPnlDelta: winner.holdout.pnl - runnerUp.holdout.pnl,
        }
      : null,
    vsCurrentDefault: defaultCandidate
      ? {
          maxTrade: defaultCandidate.maxTrade,
          trainPnlDelta: winner.train.pnl - defaultCandidate.train.pnl,
          holdoutPnlDelta: winner.holdout.pnl - defaultCandidate.holdout.pnl,
        }
      : null,
    vsUnconstrainedTrainChamp:
      unconstrainedChamp.maxTrade !== winner.maxTrade
        ? {
            maxTrade: unconstrainedChamp.maxTrade,
            trainPnlDelta: winner.train.pnl - unconstrainedChamp.train.pnl,
            holdoutPnlDelta:
              winner.holdout.pnl - unconstrainedChamp.holdout.pnl,
            note: `Unconstrained train champ $${unconstrainedChamp.maxTrade} has train max DD ${unconstrainedChamp.train.maxDrawdown.toFixed(2)} (>${(MAX_TRAIN_DRAWDOWN_FRAC * 100).toFixed(0)}% of bankroll); excluded.`,
          }
        : {
            maxTrade: unconstrainedChamp.maxTrade,
            trainPnlDelta: 0,
            holdoutPnlDelta: 0,
            note: "Suggested size also led the unconstrained train ranking.",
          },
  };

  const notes = [
    `Selection: among sizes with train max DD ≤ ${(MAX_TRAIN_DRAWDOWN_FRAC * 100).toFixed(0)}% of bankroll ($${ddCap.toFixed(2)}), maximize train fee-aware score (1000×netPnl − 250×maxDD); holdout is verification only.`,
    `Policy: ${policySource} rules from ${policy ? TRAINED_POLICY_PATH : "baseline"}.`,
    `Bankroll $${bankroll}; tested ${candidates.length} distinct max-trade sizes; ${eligible.length} passed the DD budget.`,
    `Suggested max trade $${suggested.maxTrade} (${(suggested.fractionOfBankroll * 100).toFixed(2)}% of bankroll).`,
    `Train P&L ${suggested.trainPnl.toFixed(2)} (DD ${suggested.trainMaxDrawdown.toFixed(2)}) · holdout P&L ${suggested.holdoutPnl.toFixed(2)} (DD ${suggested.holdoutMaxDrawdown.toFixed(2)}).`,
    suggested.vsNextBestEligible
      ? `vs next-best eligible $${suggested.vsNextBestEligible.maxTrade}: train Δ P&L ${suggested.vsNextBestEligible.trainPnlDelta.toFixed(2)}, holdout Δ P&L ${suggested.vsNextBestEligible.holdoutPnlDelta.toFixed(2)}.`
      : "No other DD-eligible candidate.",
    suggested.vsCurrentDefault
      ? `vs desk default $${suggested.vsCurrentDefault.maxTrade}: train Δ P&L ${suggested.vsCurrentDefault.trainPnlDelta.toFixed(2)}, holdout Δ P&L ${suggested.vsCurrentDefault.holdoutPnlDelta.toFixed(2)}.`
      : "",
    suggested.vsUnconstrainedTrainChamp?.note ?? "",
  ].filter(Boolean);

  return {
    version: 2,
    ranAt: new Date().toISOString(),
    bankroll,
    trainDates,
    holdoutDates,
    policySource,
    selectionRule:
      `eligible if train maxDrawdown <= ${MAX_TRAIN_DRAWDOWN_FRAC}*bankroll; among eligible, train score = 1000*netPnl - 250*maxDrawdown + 10*hitRate + 0.01*min(trades,50); pick argmax on train; report holdout for all`,
    maxTrainDrawdownFrac: MAX_TRAIN_DRAWDOWN_FRAC,
    suggested,
    candidates: byTrain,
    notes,
  };
}

/** Scale a stored sweep's suggested fraction to a new bankroll (display helper). */
export function scaleSuggestedMaxTrade(
  report: MaxTradeSweepReport,
  bankroll: number,
): number {
  const frac = report.suggested.fractionOfBankroll;
  return Math.max(0.05, Math.min(bankroll, Math.round(bankroll * frac * 100) / 100));
}

export async function saveMaxTradeSweep(
  report: MaxTradeSweepReport,
): Promise<void> {
  await mkdir(DATA_ROOT, { recursive: true });
  await writeFile(MAX_TRADE_SWEEP_PATH, JSON.stringify(report, null, 2), "utf8");
}

export async function loadMaxTradeSweep(): Promise<MaxTradeSweepReport | null> {
  try {
    const raw = await readFile(MAX_TRADE_SWEEP_PATH, "utf8");
    return JSON.parse(raw) as MaxTradeSweepReport;
  } catch {
    return null;
  }
}
