"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPct, formatUsd } from "@/lib/format";
import type { DeskAlert } from "@/lib/training/alerts";
import type { PeriodMetrics, TrainedPolicy } from "@/lib/training/types";
import type { TrainStatus } from "@/lib/training/train-status";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Payload = {
  policy: TrainedPolicy | null;
  alerts?: DeskAlert[];
  trainStatus?: TrainStatus;
};

function MetricsCard({
  title,
  metrics,
  emphasize,
}: {
  title: string;
  metrics: PeriodMetrics;
  emphasize?: "gain" | "loss";
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card/95 p-4">
      <h4 className="font-heading text-lg font-semibold">{title}</h4>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {metrics.dates.join(", ")}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Trades</dt>
          <dd className="font-mono font-medium">{metrics.trades}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hit rate</dt>
          <dd className="font-mono font-medium">
            {metrics.wins}/{metrics.trades} ({formatPct(metrics.hitRate, 1)})
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Net P&L</dt>
          <dd
            className={`font-mono font-semibold ${
              emphasize === "gain" || metrics.pnl >= 0 ? "text-gain" : "text-loss"
            }`}
          >
            {metrics.pnl >= 0 ? "+" : ""}
            {formatUsd(metrics.pnl)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Max drawdown</dt>
          <dd className="font-mono font-medium">
            {formatUsd(metrics.maxDrawdown ?? 0)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fees+slip</dt>
          <dd className="font-mono font-medium">
            {formatUsd(metrics.totalFees ?? 0)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ending equity</dt>
          <dd className="font-mono font-medium">
            {formatUsd(metrics.endingEquity ?? 0)}
          </dd>
        </div>
      </dl>
      {metrics.byStrategy.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
          {metrics.byStrategy.map((s) => (
            <li key={s.strategyId} className="flex justify-between gap-2 font-mono">
              <span>{s.strategyId}</span>
              <span>
                {s.wins}/{s.trades} ·{" "}
                <span className={s.pnl >= 0 ? "text-gain" : "text-loss"}>
                  {s.pnl >= 0 ? "+" : ""}
                  {formatUsd(s.pnl)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No fills in this period.</p>
      )}
    </div>
  );
}

export function TrainingPanel({
  onPolicyChange,
}: {
  onPolicyChange?: (policy: TrainedPolicy | null) => void;
}) {
  const [policy, setPolicy] = useState<TrainedPolicy | null>(null);
  const [alerts, setAlerts] = useState<DeskAlert[]>([]);
  const [trainStatus, setTrainStatus] = useState<TrainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/training");
    const data = (await res.json()) as Payload;
    setPolicy(data.policy);
    setAlerts(data.alerts ?? []);
    setTrainStatus(data.trainStatus ?? null);
    onPolicyChange?.(data.policy);
    return data;
  }, [onPolicyChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load training report");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Poll while retrain is running.
  useEffect(() => {
    if (trainStatus?.status !== "running") return;
    const id = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(id);
  }, [trainStatus?.status, refresh]);

  const startRetrain = async () => {
    setRetraining(true);
    setError(null);
    try {
      const res = await fetch("/api/training/retrain", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        trainStatus?: TrainStatus;
      };
      if (!res.ok) {
        setError(data.error ?? `Retrain failed (${res.status})`);
      }
      if (data.trainStatus) setTrainStatus(data.trainStatus);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start retrain");
    } finally {
      setRetraining(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading training report…</p>
    );
  }

  if (error && !policy) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-red-50 px-4 py-3 text-sm text-red-900">
        {error}
      </div>
    );
  }

  const deltaPnl = policy
    ? policy.holdoutTrained.pnl - policy.holdoutBaseline.pnl
    : 0;
  const deltaHit = policy
    ? policy.holdoutTrained.hitRate - policy.holdoutBaseline.hitRate
    : 0;
  const running = trainStatus?.status === "running" || retraining;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/80 bg-card/95 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-heading text-xl font-semibold">
              Trained policy — before vs after
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Fee-aware walk-forward search with intraday features, sizing,
              correlation caps, time-to-close filters, and a logistic ranker.
              Numbers are from the last completed run only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={running}
            >
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => void startRetrain()} disabled={running}>
              {running ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : null}
              {running ? "Retraining…" : "Retrain now"}
            </Button>
          </div>
        </div>

        {trainStatus ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Status: {trainStatus.status}
            {trainStatus.message ? ` — ${trainStatus.message}` : ""}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-xs text-red-800">{error}</p>
        ) : null}

        {policy ? (
          <>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Trained at {policy.trainedAt} · bankroll {formatUsd(policy.bankroll)} ·
              max trade {formatUsd(policy.maxTrade)} · feeAware=
              {String(policy.feeAware ?? false)} · v{policy.version}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">
                Holdout Δ P&L {deltaPnl >= 0 ? "+" : ""}
                {formatUsd(deltaPnl)}
              </Badge>
              <Badge variant="outline">
                Holdout Δ hit rate {deltaHit >= 0 ? "+" : ""}
                {formatPct(deltaHit, 1)}
              </Badge>
              <Badge variant="outline">
                Holdout max DD {formatUsd(policy.holdoutTrained.maxDrawdown ?? 0)}
              </Badge>
              {policy.walkForward ? (
                <Badge variant="outline">
                  WF OOS {policy.walkForward.oosPnl >= 0 ? "+" : ""}
                  {formatUsd(policy.walkForward.oosPnl)} (
                  {policy.walkForward.oosTrades} trades)
                </Badge>
              ) : null}
              {policy.logistic ? (
                <Badge variant="outline">
                  Logistic {(policy.logistic.trainAccuracy * 100).toFixed(1)}% acc
                </Badge>
              ) : null}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No trained policy yet. Click Retrain now (or run{" "}
            <code className="font-mono">npm run train</code>).
          </p>
        )}
      </div>

      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border px-4 py-3 text-sm ${
                a.severity === "critical"
                  ? "border-red-300 bg-red-50 text-red-950"
                  : a.severity === "warn"
                    ? "border-amber-300 bg-amber-50 text-amber-950"
                    : "border-border/80 bg-card/95 text-foreground"
              }`}
            >
              <p className="font-medium">{a.title}</p>
              <p className="mt-1 text-xs opacity-90">{a.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {policy ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <MetricsCard
              title="BEFORE — baseline on holdout"
              metrics={policy.holdoutBaseline}
              emphasize={policy.holdoutBaseline.pnl >= 0 ? "gain" : "loss"}
            />
            <MetricsCard
              title="AFTER — trained on holdout"
              metrics={policy.holdoutTrained}
              emphasize={policy.holdoutTrained.pnl >= 0 ? "gain" : "loss"}
            />
          </div>

          <div className="rounded-xl border border-border/80 bg-card/95 p-4">
            <h4 className="font-heading text-lg font-semibold">Train-period fit</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              In-sample metrics used while searching parameters (not the verification set).
            </p>
            <p className="mt-2 font-mono text-sm">
              {policy.trainMetrics.wins}/{policy.trainMetrics.trades} hits (
              {formatPct(policy.trainMetrics.hitRate, 1)}) · net P&L{" "}
              <span
                className={
                  policy.trainMetrics.pnl >= 0 ? "text-gain" : "text-loss"
                }
              >
                {policy.trainMetrics.pnl >= 0 ? "+" : ""}
                {formatUsd(policy.trainMetrics.pnl)}
              </span>
              {" · "}max DD {formatUsd(policy.trainMetrics.maxDrawdown ?? 0)}
            </p>
          </div>

          {policy.walkForward && policy.walkForward.folds.length > 0 ? (
            <div className="rounded-xl border border-border/80 bg-card/95 p-4">
              <h4 className="font-heading text-lg font-semibold">Walk-forward folds</h4>
              <ul className="mt-3 divide-y divide-border/60 font-mono text-xs">
                {policy.walkForward.folds.map((f) => (
                  <li
                    key={f.testDates.join("-")}
                    className="flex flex-wrap justify-between gap-2 py-2"
                  >
                    <span>test {f.testDates.join(", ")}</span>
                    <span>
                      pnl{" "}
                      <span className={f.testPnl >= 0 ? "text-gain" : "text-loss"}>
                        {f.testPnl >= 0 ? "+" : ""}
                        {formatUsd(f.testPnl)}
                      </span>{" "}
                      · n={f.testTrades} · dd {formatUsd(f.testMaxDrawdown)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-xl border border-border/80 bg-card/95 p-4">
            <h4 className="font-heading text-lg font-semibold">Learned rules</h4>
            <ul className="mt-3 divide-y divide-border/60">
              {policy.rules.map((rule) => (
                <li
                  key={rule.strategyId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        rule.enabled
                          ? "bg-edge text-edge-foreground hover:bg-edge"
                          : undefined
                      }
                      variant={rule.enabled ? "default" : "outline"}
                    >
                      {rule.enabled ? "ON" : "OFF"}
                    </Badge>
                    <span className="font-medium">{rule.strategyId}</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    minEdge {rule.minEdgeScore} · maxEntry{" "}
                    {rule.maxEntryPrice == null ? "none" : `$${rule.maxEntryPrice}`}{" "}
                    · boost {rule.rankBoost} · size×{rule.sizeMult ?? 1} · ttc{" "}
                    {rule.minHoursToClose ?? 0}–{rule.maxHoursToClose ?? "∞"}h
                  </span>
                </li>
              ))}
            </ul>
            {policy.portfolioRisk ? (
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                Caps: {policy.portfolioRisk.maxPerEvent}/event ·{" "}
                {policy.portfolioRisk.maxPerCategory}/category
              </p>
            ) : null}
          </div>

          <ul className="space-y-1 text-xs text-muted-foreground">
            {policy.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
