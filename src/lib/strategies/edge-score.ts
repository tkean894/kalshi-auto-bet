/**
 * Human-readable docs for how Edgebook's edge score works.
 * Scores are heuristic ranks (0–99), not a guaranteed expected value.
 */
export const EDGE_SCORE_SUMMARY = {
  title: "What is an edge score?",
  body: "Edge score is a 0–99 rank each scanner assigns to a market. Higher means the strategy likes that ticket more relative to others right now — it is not a predicted win rate or guaranteed profit.",
  confidence:
    "Confidence bands: low under 55, medium 55–71, high 72+. Auto-trade’s “Min edge score” filters out weaker ranks.",
};

export const EDGE_SCORE_BY_STRATEGY: {
  id: string;
  name: string;
  formula: string;
}[] = [
  {
    id: "tight-spread",
    name: "Tight Spread Scout",
    formula:
      "Rewards narrow bid–ask spreads and higher volume, plus a small boost when price sits near 50¢ (tighter books are easier to enter/exit).",
  },
  {
    id: "momentum",
    name: "Price Momentum",
    formula:
      "Scores how far the last trade moved vs the previous print (×400), plus a log volume boost. Larger recent moves rank higher.",
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion",
    formula:
      "Scores the gap between last trade and mid (×500), plus tighter spreads. Bigger dislocations that look fade-able rank higher.",
  },
  {
    id: "favorite-edge",
    name: "Favorite Edge",
    formula:
      "For 70–92¢ YES favorites: blends remaining payout, spread tightness, volume, and closeness to ~82¢.",
  },
  {
    id: "longshot-value",
    name: "Longshot Value",
    formula:
      "For cheap YES (about 5–28¢): higher when the ask is cheaper, volume is present, and the spread is tighter.",
  },
  {
    id: "liquidity",
    name: "Liquidity Sweep",
    formula:
      "Log-scales volume, open interest, and liquidity dollars, then adds a tighter-spread bonus — deepest books rank first.",
  },
];
