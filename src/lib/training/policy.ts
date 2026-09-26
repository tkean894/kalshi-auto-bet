import type { StrategySignal } from "@/lib/strategies/types";
import type { StrategyId } from "@/lib/strategies/types";
import type { SignalFeatures } from "@/lib/trading/features";
import { logisticRankBoost, type LogisticModel } from "./logistic";
import {
  BASELINE_POLICY_RULES,
  DEFAULT_PORTFOLIO_RISK,
  type PeriodMetrics,
  type PortfolioRiskLimits,
  type TrainedPolicy,
  type TrainedStrategyRule,
} from "./types";

export function baselinePolicy(): TrainedStrategyRule[] {
  return BASELINE_POLICY_RULES.map((r) => ({ ...r }));
}

export function normalizeRule(
  rule: Partial<TrainedStrategyRule> & { strategyId: StrategyId },
): TrainedStrategyRule {
  const base = BASELINE_POLICY_RULES.find((r) => r.strategyId === rule.strategyId);
  return {
    strategyId: rule.strategyId,
    enabled: rule.enabled ?? base?.enabled ?? true,
    minEdgeScore: rule.minEdgeScore ?? base?.minEdgeScore ?? 55,
    maxEntryPrice: rule.maxEntryPrice ?? base?.maxEntryPrice ?? null,
    rankBoost: rule.rankBoost ?? base?.rankBoost ?? 0,
    sizeMult: rule.sizeMult ?? base?.sizeMult ?? 1,
    minHoursToClose: rule.minHoursToClose ?? base?.minHoursToClose ?? 1,
    maxHoursToClose: rule.maxHoursToClose ?? base?.maxHoursToClose ?? 72,
  };
}

export function ruleMap(
  rules: TrainedStrategyRule[],
): Map<StrategyId, TrainedStrategyRule> {
  return new Map(rules.map((r) => [r.strategyId, normalizeRule(r)]));
}

export type RankContext = {
  rules: TrainedStrategyRule[];
  logistic?: LogisticModel | null;
  featuresByTicker?: Map<string, SignalFeatures>;
};

function hoursOk(
  rule: TrainedStrategyRule,
  features: SignalFeatures | undefined,
): boolean {
  const h = features?.hoursToClose;
  if (h == null) return true;
  if (rule.minHoursToClose != null && h < rule.minHoursToClose) return false;
  if (rule.maxHoursToClose != null && h > rule.maxHoursToClose) return false;
  return true;
}

export function filterAndRankSignals(
  signals: StrategySignal[],
  rulesOrCtx: TrainedStrategyRule[] | RankContext,
): StrategySignal[] {
  const ctx: RankContext = Array.isArray(rulesOrCtx)
    ? { rules: rulesOrCtx }
    : rulesOrCtx;
  const map = ruleMap(ctx.rules);

  const filtered = signals.filter((s) => {
    const rule = map.get(s.strategyId);
    if (!rule || !rule.enabled) return false;
    if (s.edgeScore < rule.minEdgeScore) return false;
    if (rule.maxEntryPrice != null && s.entryPrice > rule.maxEntryPrice) {
      return false;
    }
    const features =
      ctx.featuresByTicker?.get(s.market.ticker) ??
      (s.market as { features?: SignalFeatures }).features;
    if (!hoursOk(rule, features)) return false;
    return true;
  });

  return filtered
    .map((s) => {
      const rule = map.get(s.strategyId)!;
      const features =
        ctx.featuresByTicker?.get(s.market.ticker) ??
        (s.market as { features?: SignalFeatures }).features;
      const logisticBoost = features
        ? logisticRankBoost(ctx.logistic, s.edgeScore, s.side, features)
        : 0;
      return {
        signal: s,
        rank: s.edgeScore + rule.rankBoost + logisticBoost,
      };
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
    grossPnl: 0,
    totalFees: 0,
    roi: 0,
    maxDrawdown: 0,
    endingEquity: 0,
    equityCurve: dates.map((date) => ({ date, equity: 0, pnl: 0 })),
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
    grossPnl?: number;
    fees?: number;
  }[],
): PeriodMetrics {
  const wins = trades.filter((t) => t.hit).length;
  const totalCost = trades.reduce((s, t) => s + t.cost, 0);
  const totalPayout = trades.reduce((s, t) => s + t.payout, 0);
  const pnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossPnl = trades.reduce(
    (s, t) => s + (t.grossPnl ?? t.pnl),
    0,
  );
  const totalFees = trades.reduce((s, t) => s + (t.fees ?? 0), 0);

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

  // Equity curve + max drawdown in date order (settlement-day P&L).
  let equity = bankroll;
  let peak = bankroll;
  let maxDrawdown = 0;
  const equityCurve: PeriodMetrics["equityCurve"] = [];
  for (const date of dates) {
    const day = byDateMap.get(date);
    const dayPnl = day?.pnl ?? 0;
    equity += dayPnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    equityCurve.push({ date, equity, pnl: dayPnl });
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
    grossPnl,
    totalFees,
    roi: bankroll > 0 ? pnl / (bankroll * Math.max(dates.length, 1)) : 0,
    maxDrawdown,
    endingEquity: equity,
    equityCurve,
    byStrategy: [...byStrategyMap.values()].sort((a, b) => b.pnl - a.pnl),
    byDate: dates.map(
      (d) => byDateMap.get(d) ?? { date: d, trades: 0, wins: 0, pnl: 0 },
    ),
  };
}

export function defaultPortfolioRisk(
  partial?: Partial<PortfolioRiskLimits> | null,
): PortfolioRiskLimits {
  return {
    maxPerEvent: partial?.maxPerEvent ?? DEFAULT_PORTFOLIO_RISK.maxPerEvent,
    maxPerCategory:
      partial?.maxPerCategory ?? DEFAULT_PORTFOLIO_RISK.maxPerCategory,
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

/** Upgrade older persisted policies so new fields always exist. */
export function hydratePolicy(policy: TrainedPolicy): TrainedPolicy {
  return {
    ...policy,
    version: policy.version ?? 1,
    objective: policy.objective ?? "net_pnl_drawdown",
    feeAware: policy.feeAware ?? false,
    portfolioRisk: defaultPortfolioRisk(policy.portfolioRisk),
    logistic: policy.logistic ?? null,
    walkForward: policy.walkForward ?? null,
    rules: policy.rules.map((r) => normalizeRule(r)),
    trainMetrics: hydrateMetrics(policy.trainMetrics, policy.bankroll),
    holdoutBaseline: hydrateMetrics(policy.holdoutBaseline, policy.bankroll),
    holdoutTrained: hydrateMetrics(policy.holdoutTrained, policy.bankroll),
  };
}

function hydrateMetrics(
  m: PeriodMetrics,
  bankroll: number,
): PeriodMetrics {
  return {
    ...emptyPeriodMetrics(m.dates ?? []),
    ...m,
    grossPnl: m.grossPnl ?? m.pnl,
    totalFees: m.totalFees ?? 0,
    maxDrawdown: m.maxDrawdown ?? 0,
    endingEquity: m.endingEquity ?? bankroll + (m.pnl ?? 0),
    equityCurve: m.equityCurve ?? [],
  };
}
