import type { MarketQuote } from "@/lib/kalshi/types";
import type {
  StrategyDefinition,
  StrategyId,
  StrategySignal,
} from "./types";

/** Cheap YES band used by Longshot Value (not exclusive — other scanners may also signal here). */
export const LONGSHOT_ENTRY_MIN = 0.05;
export const LONGSHOT_ENTRY_MAX = 0.28;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function confidenceFromScore(score: number): StrategySignal["confidence"] {
  if (score >= 72) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function tradeable(m: MarketQuote): boolean {
  return m.yesAsk > 0.01 && m.yesAsk < 0.99 && m.yesBid > 0;
}

function contractsForBudget(entry: number, budget = 25): number {
  if (entry <= 0) return 1;
  return Math.max(1, Math.floor(budget / entry));
}

function yesEntry(m: MarketQuote): number {
  return m.yesAsk;
}

function noEntry(m: MarketQuote): number {
  return m.noAsk || (m.yesBid > 0 ? 1 - m.yesBid : 0);
}

/**
 * For non-directional scanners, prefer the cheaper side so small max-trade
 * bankrolls can still fill (previously mid&lt;50¢ always bought expensive NO).
 */
function cheaperSide(m: MarketQuote): {
  side: StrategySignal["side"];
  entry: number;
} {
  const yes = yesEntry(m);
  const no = noEntry(m);
  if (no > 0 && no < yes) return { side: "no", entry: no };
  return { side: "yes", entry: yes };
}

const tightSpread: StrategyDefinition = {
  id: "tight-spread",
  name: "Tight Spread Scout",
  tagline: "Hunt liquid books with cheap round-trip cost",
  description:
    "Ranks markets by narrow YES bid–ask spreads and meaningful volume. Buys the cheaper side so low max-trade sizes can still fill.",
  run(markets) {
    return markets
      .filter((m) => tradeable(m) && m.volume >= 5 && m.spread <= 0.06)
      .map((m) => {
        const mid = m.mid || m.lastPrice;
        const { side, entry } = cheaperSide(m);
        const tightness = 1 - m.spread / 0.06;
        const volumeBoost = clamp(Math.log10(m.volume + 1) / 4, 0, 1);
        const edgeScore = Math.round(
          clamp(
            tightness * 55 +
              volumeBoost * 35 +
              (1 - Math.abs(mid - 0.5)) * 10,
            0,
            99,
          ),
        );
        return {
          id: `${tightSpread.id}:${m.ticker}`,
          strategyId: tightSpread.id,
          strategyName: tightSpread.name,
          market: m,
          side,
          entryPrice: entry,
          edgeScore,
          confidence: confidenceFromScore(edgeScore),
          rationale: `Spread is ${Math.round(m.spread * 100)}¢ with ${Math.round(m.volume)} contracts traded — buying the cheaper ${side.toUpperCase()} side at ${Math.round(entry * 100)}¢.`,
          suggestedContracts: contractsForBudget(entry),
          potentialPayoutPerContract: 1 - entry,
        };
      })
      .sort((a, b) => b.edgeScore - a.edgeScore)
      .slice(0, 24);
  },
};

const momentum: StrategyDefinition = {
  id: "momentum",
  name: "Price Momentum",
  tagline: "Ride contracts that already moved",
  description:
    "Flags markets where the last trade moved meaningfully versus the previous print. Directional — but will signal cheap YES when momentum is up on a low-priced book.",
  run(markets) {
    return markets
      .filter(
        (m) =>
          tradeable(m) &&
          m.lastPrice > 0 &&
          m.previousPrice > 0 &&
          Math.abs(m.lastPrice - m.previousPrice) >= 0.03,
      )
      .map((m) => {
        const delta = m.lastPrice - m.previousPrice;
        const side: StrategySignal["side"] = delta > 0 ? "yes" : "no";
        const entry = side === "yes" ? yesEntry(m) : noEntry(m);
        const move = Math.abs(delta);
        const edgeScore = Math.round(
          clamp(move * 400 + Math.log10(m.volume + 1) * 8, 35, 96),
        );
        return {
          id: `${momentum.id}:${m.ticker}`,
          strategyId: momentum.id,
          strategyName: momentum.name,
          market: m,
          side,
          entryPrice: entry,
          edgeScore,
          confidence: confidenceFromScore(edgeScore),
          rationale: `Last ${Math.round(m.lastPrice * 100)}¢ vs previous ${Math.round(m.previousPrice * 100)}¢ (${delta > 0 ? "+" : ""}${Math.round(delta * 100)}¢). Momentum leans ${side.toUpperCase()} at ${Math.round(entry * 100)}¢.`,
          suggestedContracts: contractsForBudget(entry),
          potentialPayoutPerContract: 1 - entry,
        };
      })
      .sort((a, b) => b.edgeScore - a.edgeScore)
      .slice(0, 24);
  },
};

const meanReversion: StrategyDefinition = {
  id: "mean-reversion",
  name: "Mean Reversion",
  tagline: "Fade stretched prints back toward mid",
  description:
    "When last trade sits far from the current mid, fade toward the book. Can produce cheap YES when price is stretched below mid.",
  run(markets) {
    return markets
      .filter(
        (m) => tradeable(m) && m.lastPrice > 0 && m.mid > 0 && m.volume >= 3,
      )
      .map((m) => {
        const gap = m.lastPrice - m.mid;
        if (Math.abs(gap) < 0.025) return null;
        const side: StrategySignal["side"] = gap > 0 ? "no" : "yes";
        const entry = side === "yes" ? yesEntry(m) : noEntry(m);
        const edgeScore = Math.round(
          clamp(Math.abs(gap) * 500 + (1 - m.spread) * 20, 40, 94),
        );
        return {
          id: `${meanReversion.id}:${m.ticker}`,
          strategyId: meanReversion.id,
          strategyName: meanReversion.name,
          market: m,
          side,
          entryPrice: entry,
          edgeScore,
          confidence: confidenceFromScore(edgeScore),
          rationale: `Last print ${Math.round(m.lastPrice * 100)}¢ is ${Math.round(Math.abs(gap) * 100)}¢ from mid ${Math.round(m.mid * 100)}¢ — fading with ${side.toUpperCase()} at ${Math.round(entry * 100)}¢.`,
          suggestedContracts: contractsForBudget(entry),
          potentialPayoutPerContract: 1 - entry,
        } satisfies StrategySignal;
      })
      .filter((s): s is StrategySignal => s != null)
      .sort((a, b) => b.edgeScore - a.edgeScore)
      .slice(0, 24);
  },
};

const favoriteEdge: StrategyDefinition = {
  id: "favorite-edge",
  name: "Favorite Edge",
  tagline: "High-probability YES with still-useful payout",
  description:
    "Scans heavy favorites (roughly 70–92¢). These are higher-priced tickets — they need a max trade of at least the entry (often $0.70+).",
  run(markets) {
    return markets
      .filter(
        (m) =>
          tradeable(m) &&
          m.yesAsk >= 0.7 &&
          m.yesAsk <= 0.92 &&
          m.spread <= 0.08 &&
          m.volume >= 2,
      )
      .map((m) => {
        const entry = m.yesAsk;
        const payout = 1 - entry;
        const edgeScore = Math.round(
          clamp(
            (1 - m.spread) * 30 +
              payout * 120 +
              Math.log10(m.volume + 1) * 10 +
              (0.85 - Math.abs(entry - 0.82)) * 40,
            40,
            95,
          ),
        );
        return {
          id: `${favoriteEdge.id}:${m.ticker}`,
          strategyId: favoriteEdge.id,
          strategyName: favoriteEdge.name,
          market: m,
          side: "yes" as const,
          entryPrice: entry,
          edgeScore,
          confidence: confidenceFromScore(edgeScore),
          rationale: `Favorite trading at ${Math.round(entry * 100)}¢ YES. Pays ${Math.round(payout * 100)}¢ if correct — sized for high hit-rate books.`,
          suggestedContracts: contractsForBudget(entry, 40),
          potentialPayoutPerContract: payout,
        };
      })
      .sort((a, b) => b.edgeScore - a.edgeScore)
      .slice(0, 24);
  },
};

const longshotValue: StrategyDefinition = {
  id: "longshot-value",
  name: "Longshot Value",
  tagline: "Cheap YES tickets with real liquidity",
  description: `Surfaces low-priced YES (about ${Math.round(LONGSHOT_ENTRY_MIN * 100)}–${Math.round(LONGSHOT_ENTRY_MAX * 100)}¢). Other strategies can also signal cheap tickets when their rules pick that side.`,
  run(markets) {
    return markets
      .filter(
        (m) =>
          tradeable(m) &&
          m.yesAsk >= LONGSHOT_ENTRY_MIN &&
          m.yesAsk <= LONGSHOT_ENTRY_MAX &&
          m.volume >= 2,
      )
      .map((m) => {
        const entry = m.yesAsk;
        const edgeScore = Math.round(
          clamp(
            (LONGSHOT_ENTRY_MAX - entry) * 120 +
              Math.log10(m.volume + 1) * 14 +
              (1 - m.spread) * 25,
            35,
            93,
          ),
        );
        return {
          id: `${longshotValue.id}:${m.ticker}`,
          strategyId: longshotValue.id,
          strategyName: longshotValue.name,
          market: m,
          side: "yes" as const,
          entryPrice: entry,
          edgeScore,
          confidence: confidenceFromScore(edgeScore),
          rationale: `YES ask ${Math.round(entry * 100)}¢ with ${Math.round(m.volume)} volume. High payout (${Math.round((1 - entry) * 100)}¢) if the underdog hits.`,
          suggestedContracts: contractsForBudget(entry, 20),
          potentialPayoutPerContract: 1 - entry,
        };
      })
      .sort((a, b) => b.edgeScore - a.edgeScore)
      .slice(0, 24);
  },
};

const liquidity: StrategyDefinition = {
  id: "liquidity",
  name: "Liquidity Sweep",
  tagline: "Trade where the book is deepest",
  description:
    "Prioritizes markets with the strongest volume, open interest, and liquidity. Buys the cheaper side so small max-trade sizes can still fill.",
  run(markets) {
    return markets
      .filter((m) => tradeable(m) && (m.volume > 0 || m.openInterest > 0))
      .map((m) => {
        const depth =
          Math.log10(m.volume + 1) * 18 +
          Math.log10(m.openInterest + 1) * 14 +
          Math.log10(m.liquidity + 1) * 10;
        const { side, entry } = cheaperSide(m);
        const edgeScore = Math.round(
          clamp(depth + (1 - m.spread) * 15, 30, 97),
        );
        return {
          id: `${liquidity.id}:${m.ticker}`,
          strategyId: liquidity.id,
          strategyName: liquidity.name,
          market: m,
          side,
          entryPrice: entry,
          edgeScore,
          confidence: confidenceFromScore(edgeScore),
          rationale: `Depth score from volume ${Math.round(m.volume)}, OI ${Math.round(m.openInterest)}, liquidity $${Math.round(m.liquidity)}. Buying cheaper ${side.toUpperCase()} at ${Math.round(entry * 100)}¢.`,
          suggestedContracts: contractsForBudget(entry, 50),
          potentialPayoutPerContract: 1 - entry,
        };
      })
      .sort((a, b) => b.edgeScore - a.edgeScore)
      .slice(0, 24);
  },
};

export const STRATEGIES: StrategyDefinition[] = [
  tightSpread,
  momentum,
  meanReversion,
  favoriteEdge,
  longshotValue,
  liquidity,
];

export function getStrategy(id: StrategyId): StrategyDefinition {
  return STRATEGIES.find((s) => s.id === id) ?? tightSpread;
}

export function runStrategy(
  id: StrategyId,
  markets: MarketQuote[],
): StrategySignal[] {
  return getStrategy(id).run(markets);
}

export function runAllStrategies(markets: MarketQuote[]): StrategySignal[] {
  const seen = new Set<string>();
  const merged: StrategySignal[] = [];
  for (const strategy of STRATEGIES) {
    for (const signal of strategy.run(markets)) {
      const key = `${signal.market.ticker}:${signal.side}:${signal.strategyId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(signal);
    }
  }
  return merged.sort((a, b) => b.edgeScore - a.edgeScore);
}
