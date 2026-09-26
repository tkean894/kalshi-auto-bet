"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPct, formatUsd } from "@/lib/format";
import type { MaxTradeSweepReport } from "@/lib/training/max-trade-sweep";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ApiPayload = {
  bankroll: number;
  suggestedMaxTrade: number | null;
  scaledFromFraction?: boolean;
  sweepBankroll?: number;
  report: MaxTradeSweepReport | null;
  error?: string;
};

export function MaxTradeSuggestion({
  bankroll,
  currentMaxTrade,
  onApply,
}: {
  bankroll: number;
  currentMaxTrade: number;
  onApply: (maxTrade: number) => void;
}) {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/training/max-trade?bankroll=${encodeURIComponent(String(bankroll))}`,
    );
    const data = (await res.json()) as ApiPayload;
    setPayload(data);
    if (!res.ok && res.status !== 404) {
      setError(data.error ?? `Sweep API ${res.status}`);
    } else {
      setError(data.error ?? null);
    }
    return data;
  }, [bankroll]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load sweep");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const runSweep = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/training/max-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankroll }),
      });
      const data = (await res.json()) as ApiPayload & { ok?: boolean };
      if (!res.ok) {
        setError(data.error ?? `Sweep failed (${res.status})`);
      } else {
        setPayload(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sweep failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground">
        Loading proven max-trade suggestion…
      </p>
    );
  }

  const report = payload?.report ?? null;
  const suggested = payload?.suggestedMaxTrade;
  const alreadyApplied =
    suggested != null && Math.abs(suggested - currentMaxTrade) < 0.005;

  return (
    <div className="rounded-xl border border-border/80 bg-secondary/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-heading text-base font-semibold">
            Suggested max trade
          </h4>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Proven on settled Kalshi days: among max-trade sizes whose train
            max drawdown stays ≤ 25% of bankroll, pick the best fee-aware train
            score, then show holdout proof vs alternatives.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={running}
          onClick={() => void runSweep()}
        >
          {running ? (
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
          ) : null}
          {running ? "Sweeping…" : "Re-sweep for bankroll"}
        </Button>
      </div>

      {error && !report ? (
        <p className="mt-3 text-xs text-amber-900">{error}</p>
      ) : null}

      {suggested != null && report ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge className="bg-edge text-edge-foreground hover:bg-edge">
              {formatUsd(suggested)}
            </Badge>
            <Badge variant="outline">
              {(report.suggested.fractionOfBankroll * 100).toFixed(2)}% of $
              {report.bankroll.toFixed(0)} sweep
            </Badge>
            {payload?.scaledFromFraction ? (
              <Badge variant="secondary">
                Scaled from ${(payload.sweepBankroll ?? report.bankroll).toFixed(0)}{" "}
                sweep → current bankroll
              </Badge>
            ) : null}
            {alreadyApplied ? (
              <Badge variant="outline">Applied</Badge>
            ) : (
              <Button size="sm" onClick={() => onApply(suggested)}>
                Apply {formatUsd(suggested)}
              </Button>
            )}
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Train P&L</dt>
              <dd className="font-mono font-medium">
                {report.suggested.trainPnl >= 0 ? "+" : ""}
                {formatUsd(report.suggested.trainPnl)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Holdout P&L</dt>
              <dd className="font-mono font-medium">
                {report.suggested.holdoutPnl >= 0 ? "+" : ""}
                {formatUsd(report.suggested.holdoutPnl)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Holdout max DD</dt>
              <dd className="font-mono font-medium">
                {formatUsd(report.suggested.holdoutMaxDrawdown)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">vs next eligible</dt>
              <dd className="font-mono font-medium">
                {report.suggested.vsNextBestEligible
                  ? `${formatUsd(report.suggested.vsNextBestEligible.maxTrade)} · holdout Δ ${
                      report.suggested.vsNextBestEligible.holdoutPnlDelta >= 0
                        ? "+"
                        : ""
                    }${formatUsd(report.suggested.vsNextBestEligible.holdoutPnlDelta)}`
                  : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>
              Eligible if train max DD ≤{" "}
              {((report.maxTrainDrawdownFrac ?? 0.25) * 100).toFixed(0)}% of
              bankroll. Holdout verifies; it does not pick the winner.
            </p>
            {report.suggested.vsCurrentDefault ? (
              <p>
                vs default ${report.suggested.vsCurrentDefault.maxTrade}: train Δ{" "}
                {report.suggested.vsCurrentDefault.trainPnlDelta >= 0 ? "+" : ""}
                {formatUsd(report.suggested.vsCurrentDefault.trainPnlDelta)} ·
                holdout Δ{" "}
                {report.suggested.vsCurrentDefault.holdoutPnlDelta >= 0
                  ? "+"
                  : ""}
                {formatUsd(report.suggested.vsCurrentDefault.holdoutPnlDelta)}
              </p>
            ) : null}
            {report.suggested.vsUnconstrainedTrainChamp?.note ? (
              <p>{report.suggested.vsUnconstrainedTrainChamp.note}</p>
            ) : null}
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left font-mono text-[11px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="py-1.5 pr-2 font-medium">Max trade</th>
                  <th className="py-1.5 pr-2 font-medium">% BR</th>
                  <th className="py-1.5 pr-2 font-medium">Train P&L</th>
                  <th className="py-1.5 pr-2 font-medium">Holdout P&L</th>
                  <th className="py-1.5 pr-2 font-medium">Holdout DD</th>
                  <th className="py-1.5 font-medium">Trades (HO)</th>
                </tr>
              </thead>
              <tbody>
                {report.candidates.slice(0, 12).map((c) => {
                  const isSuggested = c.maxTrade === report.suggested.maxTrade;
                  const ddCap =
                    report.bankroll * (report.maxTrainDrawdownFrac ?? 0.25);
                  const ineligible = c.train.maxDrawdown > ddCap;
                  return (
                    <tr
                      key={c.maxTrade}
                      className={
                        isSuggested
                          ? "bg-edge/10 font-medium text-foreground"
                          : ineligible
                            ? "text-muted-foreground/60 line-through"
                            : "text-muted-foreground"
                      }
                    >
                      <td className="py-1 pr-2">
                        {formatUsd(c.maxTrade)}
                        {isSuggested ? " ←" : ineligible ? " (DD)" : ""}
                      </td>
                      <td className="py-1 pr-2">
                        {formatPct(c.fractionOfBankroll, 2)}
                      </td>
                      <td className="py-1 pr-2">
                        {c.train.pnl >= 0 ? "+" : ""}
                        {formatUsd(c.train.pnl)}
                      </td>
                      <td className="py-1 pr-2">
                        {c.holdout.pnl >= 0 ? "+" : ""}
                        {formatUsd(c.holdout.pnl)}
                      </td>
                      <td className="py-1 pr-2">
                        {formatUsd(c.holdout.maxDrawdown)}
                      </td>
                      <td className="py-1">{c.holdout.trades}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">
            Sweep {report.ranAt} · {report.policySource} policy · train{" "}
            {report.trainDates[0]}…{report.trainDates.at(-1)} · holdout{" "}
            {report.holdoutDates.join(", ")}
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          No sweep on disk yet. Click Re-sweep for bankroll (uses cached settled
          days + trained policy).
        </p>
      )}
    </div>
  );
}
