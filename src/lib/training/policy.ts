import type { StrategySignal } from "@/lib/strategies/types";
import type { StrategyId } from "@/lib/strategies/types";
import {
  BASELINE_POLICY_RULES,
  type PeriodMetrics,
  type TrainedPolicy,
  type TrainedStrategyRule,
} from "./types";

export function baselinePolicy(): TrainedStrategyRule[] {
  return BASELINE_POLICY_RULES.map((r) => ({ ...r }));
}

export function ruleMap(
  rules: TrainedStrategyRule[],
): Map<StrategyId, TrainedStrategyRule> {
  return new Map(rules.map((r) => [r.strategyId, r]));
}

export function filterAndRankSignals(
  signals: StrategySignal[],
  rules: TrainedStrategyRule[],
): StrategySignal[] {
  const map = ruleMap(rules);
  const filtered = signals.filter((s) => {
    const rule = map.get(s.strategyId);
    if (!rule || !rule.enabled) return false;
    if (s.edgeScore < rule.minEdgeScore) return false;
    if (rule.maxEntryPrice != null && s.entryPrice > rule.maxEntryPrice) {
      return false;
    }
    return true;
  });

  return filtered
    .map((s) => {
      const boost = map.get(s.strategyId)?.rankBoost ?? 0;
      return { signal: s, rank: s.edgeScore + boost };
    })
    .sort((a, b) => b.rank - a.rank)
    .map((x) => x.signal);
}

export function emptyPeriodMetrics(dates: string[]): PeriodMetrics {
  return {
    dates,
    trades: 0,
    wins: 0,
    losses: 0,
    hitRate: 0,
    totalCost: 0,
    totalPayout: 0,
    pnl: 0,
    roi: 0,
    byStrategy: [],
    byDate: dates.map((date) => ({ date, trades: 0, wins: 0, pnl: 0 })),
  };
}

export function summarizeTrades(
  dates: string[],
  bankroll: number,
  trades: {
    date: string;
    strategyId: StrategyId;
    hit: boolean;
    cost: number;
    payout: number;
    pnl: number;
  }[],
): PeriodMetrics {
  const wins = trades.filter((t) => t.hit).length;
  const totalCost = trades.reduce((s, t) => s + t.cost, 0);
  const totalPayout = trades.reduce((s, t) => s + t.payout, 0);
  const pnl = trades.reduce((s, t) => s + t.pnl, 0);

  const byStrategyMap = new Map<
    StrategyId,
    { strategyId: StrategyId; trades: number; wins: number; pnl: number }
  >();
  const byDateMap = new Map(
    dates.map((d) => [d, { date: d, trades: 0, wins: 0, pnl: 0 }]),
  );

  for (const t of trades) {
    const s = byStrategyMap.get(t.strategyId) ?? {
      strategyId: t.strategyId,
      trades: 0,
      wins: 0,
      pnl: 0,
    };
    s.trades += 1;
    s.wins += t.hit ? 1 : 0;
    s.pnl += t.pnl;
    byStrategyMap.set(t.strategyId, s);

    const d = byDateMap.get(t.date) ?? {
      date: t.date,
      trades: 0,
      wins: 0,
      pnl: 0,
    };
    d.trades += 1;
    d.wins += t.hit ? 1 : 0;
    d.pnl += t.pnl;
    byDateMap.set(t.date, d);
  }

  return {
    dates,
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    hitRate: trades.length ? wins / trades.length : 0,
    totalCost,
    totalPayout,
    pnl,
    roi: bankroll > 0 ? pnl / (bankroll * Math.max(dates.length, 1)) : 0,
    byStrategy: [...byStrategyMap.values()].sort((a, b) => b.pnl - a.pnl),
    byDate: dates.map(
      (d) => byDateMap.get(d) ?? { date: d, trades: 0, wins: 0, pnl: 0 },
    ),
  };
}

export function isTrainedPolicy(value: unknown): value is TrainedPolicy {
  if (!value || typeof value !== "object") return false;
  const v = value as TrainedPolicy;
  return (
    Array.isArray(v.rules) &&
    Array.isArray(v.trainDates) &&
    Array.isArray(v.holdoutDates) &&
    v.holdoutBaseline != null &&
    v.holdoutTrained != null
  );
}
