import type { TrainedPolicy } from "./types";

export type DeskAlert = {
  id: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
};

/**
 * Divergence / risk alerts derived only from proven train/holdout metrics.
 * No live P&L invention — flags structural mismatches in the last report.
 */
export function buildPolicyAlerts(policy: TrainedPolicy | null): DeskAlert[] {
  if (!policy) {
    return [
      {
        id: "no-policy",
        severity: "warn",
        title: "No trained policy",
        detail:
          "Run Retrain or npm run train so the desk has holdout-proven rules.",
      },
    ];
  }

  const alerts: DeskAlert[] = [];
  const hold = policy.holdoutTrained;
  const base = policy.holdoutBaseline;
  const train = policy.trainMetrics;

  if (hold.pnl < base.pnl) {
    alerts.push({
      id: "holdout-worse",
      severity: "critical",
      title: "Trained holdout underperforms baseline",
      detail: `Holdout trained P&L ${hold.pnl.toFixed(2)} vs baseline ${base.pnl.toFixed(2)}. Prefer Baseline until the next retrain improves OOS.`,
    });
  }

  if (train.pnl > 0 && hold.pnl < 0) {
    alerts.push({
      id: "overfit",
      severity: "critical",
      title: "Train/holdout divergence",
      detail: `In-sample P&L +${train.pnl.toFixed(2)} but holdout ${hold.pnl.toFixed(2)} — rules may be overfit.`,
    });
  }

  if (hold.maxDrawdown > policy.bankroll * 0.25) {
    alerts.push({
      id: "drawdown",
      severity: "warn",
      title: "Large holdout drawdown",
      detail: `Max drawdown ${hold.maxDrawdown.toFixed(2)} exceeds 25% of bankroll (${policy.bankroll}).`,
    });
  }

  if (hold.trades > 0 && hold.hitRate < 0.4) {
    alerts.push({
      id: "low-hit",
      severity: "warn",
      title: "Low holdout hit rate",
      detail: `Holdout hit rate ${(hold.hitRate * 100).toFixed(1)}% on ${hold.trades} trades.`,
    });
  }

  const wf = policy.walkForward;
  if (wf && wf.oosTrades > 0 && wf.oosPnl < 0 && hold.pnl > 0) {
    alerts.push({
      id: "walkforward-neg",
      severity: "warn",
      title: "Walk-forward OOS negative",
      detail: `Rolling walk-forward OOS P&L ${wf.oosPnl.toFixed(2)} while final holdout is positive — treat holdout with caution.`,
    });
  }

  if (policy.logistic && policy.logistic.trainAccuracy < 0.52) {
    alerts.push({
      id: "weak-logistic",
      severity: "info",
      title: "Weak logistic ranker fit",
      detail: `Train accuracy ${(policy.logistic.trainAccuracy * 100).toFixed(1)}% on ${policy.logistic.trainedOn} rows — boosts may be noisy.`,
    });
  }

  const ageMs = Date.now() - Date.parse(policy.trainedAt);
  if (Number.isFinite(ageMs) && ageMs > 7 * 24 * 3600_000) {
    alerts.push({
      id: "stale",
      severity: "info",
      title: "Policy older than 7 days",
      detail: `Last trained ${policy.trainedAt}. Retrain on fresh settled days.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "healthy",
      severity: "info",
      title: "No divergence flags",
      detail: `Holdout trained P&L ${hold.pnl >= 0 ? "+" : ""}${hold.pnl.toFixed(2)} vs baseline ${base.pnl >= 0 ? "+" : ""}${base.pnl.toFixed(2)}; max DD ${hold.maxDrawdown.toFixed(2)}.`,
    });
  }

  return alerts;
}
