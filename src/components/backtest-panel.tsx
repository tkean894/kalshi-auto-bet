"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BacktestSummary } from "@/lib/backtest/types";
import { formatCents, formatPct, formatUsd } from "@/lib/format";
import { FlaskConical, LoaderCircle } from "lucide-react";
import { useState } from "react";

type Props = {
  bankroll: number;
  maxTrade: number;
  minEdgeScore: number;
  strategyId: string;
  useTrainedPolicy: boolean;
  trainedPolicyAvailable: boolean;
};

export function BacktestPanel({
  bankroll,
  maxTrade,
  minEdgeScore,
  strategyId,
  useTrainedPolicy,
  trainedPolicyAvailable,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        bankroll: String(bankroll),
        maxTrade: String(maxTrade),
        minEdge: String(minEdgeScore),
        strategy: strategyId,
        marketLimit: "180",
        useTrained: useTrainedPolicy && trainedPolicyAvailable ? "1" : "0",
      });
      const res = await fetch(`/api/backtest?${params}`);
      const data = (await res.json()) as BacktestSummary & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `Backtest failed (${res.status})`);
      }
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/80 bg-card/95 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h3 className="font-heading text-xl font-semibold">
              Previous-day simulation
            </h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Replays your current risk settings against markets that settled
              yesterday (ET): rebuilds pre-settlement quotes, runs scanners,
              paper-fills within bankroll / max trade, then settles wins and losses.
              Uses the same Apply trained / Baseline policy setting as live.
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Using bankroll {formatUsd(bankroll)} · max trade {formatUsd(maxTrade)} ·
              min edge {minEdgeScore} · strategy {strategyId} · policy{" "}
              {useTrainedPolicy && trainedPolicyAvailable ? "trained" : "baseline"}
              {!trainedPolicyAvailable && useTrainedPolicy
                ? " (trained unavailable)"
                : ""}
            </p>
          </div>
          <Button onClick={() => void run()} disabled={loading}>
            {loading ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <FlaskConical data-icon="inline-start" />
            )}
            {loading ? "Simulating…" : "Run yesterday’s sim"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Day"
              value={summary.date}
              hint={`${summary.timezone} · policy ${summary.policyMode}`}
            />
            <Stat
              label="Trades"
              value={String(summary.trades.length)}
              hint={`${summary.wins} wins / ${summary.losses} losses`}
            />
            <Stat
              label="Hit rate"
              value={formatPct(summary.hitRate, 1)}
              hint={`${summary.signalsGenerated} signals scanned`}
            />
            <Stat
              label="P&L"
              value={`${summary.pnl >= 0 ? "+" : ""}${formatUsd(summary.pnl)}`}
              hint={`ROI ${formatPct(summary.roi, 1)} · end ${formatUsd(summary.endingCash)}`}
              tone={summary.pnl >= 0 ? "gain" : "loss"}
            />
          </div>

          {summary.byStrategy.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card/95">
              <div className="border-b border-border/70 px-4 py-2 font-heading text-sm font-semibold">
                By strategy
              </div>
              <ul className="divide-y divide-border/60">
                {summary.byStrategy.map((row) => (
                  <li
                    key={row.strategyId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <span className="font-medium">{row.strategyName}</span>
                    <span className="font-mono text-muted-foreground">
                      {row.wins}/{row.trades} hits ·{" "}
                      <span className={row.pnl >= 0 ? "text-gain" : "text-loss"}>
                        {row.pnl >= 0 ? "+" : ""}
                        {formatUsd(row.pnl)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border/80 bg-card/95">
            <div className="border-b border-border/70 px-4 py-2 font-heading text-sm font-semibold">
              Fills (settled)
            </div>
            {summary.trades.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No fills under these risk settings.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {summary.trades.map((trade) => (
                  <li
                    key={`${trade.ticker}-${trade.strategyId}-${trade.side}`}
                    className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.4fr_0.7fr_0.5fr_0.5fr] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap gap-1.5">
                        <Badge
                          className={
                            trade.hit
                              ? "bg-edge text-edge-foreground hover:bg-edge"
                              : "bg-destructive/15 text-destructive hover:bg-destructive/20"
                          }
                        >
                          {trade.hit ? "HIT" : "MISS"}
                        </Badge>
                        <Badge variant="outline">{trade.strategyName}</Badge>
                        <Badge variant="secondary">{trade.side.toUpperCase()}</Badge>
                      </div>
                      <p className="truncate font-medium">{trade.title}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {trade.ticker}
                      </p>
                    </div>
                    <p className="font-mono text-xs sm:text-sm">
                      {trade.contracts} @ {formatCents(trade.entryPrice)} →{" "}
                      {trade.result.toUpperCase()}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      Edge {trade.edgeScore}
                    </p>
                    <p
                      className={`font-mono text-sm font-semibold ${trade.pnl >= 0 ? "text-gain" : "text-loss"}`}
                    >
                      {trade.pnl >= 0 ? "+" : ""}
                      {formatUsd(trade.pnl)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="space-y-1 text-xs text-muted-foreground">
            {summary.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card/95 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={`mt-1 font-heading text-xl font-semibold ${
          tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
