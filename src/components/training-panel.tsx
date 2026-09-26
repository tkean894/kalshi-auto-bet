"use client";

import { Badge } from "@/components/ui/badge";
import { formatPct, formatUsd } from "@/lib/format";
import type { PeriodMetrics, TrainedPolicy } from "@/lib/training/types";
import { useEffect, useState } from "react";

type Payload = {
  policy: TrainedPolicy | null;
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
          <dt className="text-muted-foreground">P&L</dt>
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
          <dt className="text-muted-foreground">Period ROI</dt>
          <dd className="font-mono font-medium">{formatPct(metrics.roi, 1)}</dd>
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

export function TrainingPanel() {
  const [policy, setPolicy] = useState<TrainedPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/training");
        const data = (await res.json()) as Payload;
        if (!cancelled) setPolicy(data.policy);
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
  }, []);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading training report…</p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-red-50 px-4 py-3 text-sm text-red-900">
        {error}
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="rounded-xl border border-border/80 bg-card/95 p-4 text-sm text-muted-foreground">
        No trained policy found yet. Run <code className="font-mono">npm run train</code>{" "}
        to fit rules on settled Kalshi days and write proven before/after metrics.
      </div>
    );
  }

  const deltaPnl = policy.holdoutTrained.pnl - policy.holdoutBaseline.pnl;
  const deltaHit = policy.holdoutTrained.hitRate - policy.holdoutBaseline.hitRate;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/80 bg-card/95 p-4 sm:p-5">
        <h3 className="font-heading text-xl font-semibold">
          Trained policy — before vs after
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Numbers below are from the last training run only: baseline heuristics vs
          learned enable/min-edge/entry-cap rules, evaluated on held-out settled days
          that were not used to pick parameters.
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Trained at {policy.trainedAt} · bankroll {formatUsd(policy.bankroll)} · max
          trade {formatUsd(policy.maxTrade)}
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
        </div>
      </div>

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
          {formatPct(policy.trainMetrics.hitRate, 1)}) · P&L{" "}
          <span
            className={
              policy.trainMetrics.pnl >= 0 ? "text-gain" : "text-loss"
            }
          >
            {policy.trainMetrics.pnl >= 0 ? "+" : ""}
            {formatUsd(policy.trainMetrics.pnl)}
          </span>
        </p>
      </div>

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
                {rule.maxEntryPrice == null ? "none" : `$${rule.maxEntryPrice}`} ·
                boost {rule.rankBoost}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="space-y-1 text-xs text-muted-foreground">
        {policy.notes.map((note) => (
          <li key={note}>• {note}</li>
        ))}
      </ul>
    </div>
  );
}
