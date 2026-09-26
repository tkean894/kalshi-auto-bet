/**
 * Human-readable docs for how Edgebook's edge score works.
 * Scores are heuristic ranks (0–99), not a guaranteed expected value.
 */
export const EDGE_SCORE_SUMMARY = {
  title: "What is an edge score?",
  body: "Edge score is a 0–99 rank each scanner assigns to a market. Higher means the strategy likes that ticket more relative to others right now — it is not a predicted win rate or guaranteed profit.",
  confidence:
    "Confidence bands: low under 55, medium 55–71, high 72+. Auto-trade’s “Min edge score” filters out weaker ranks. Tight Spread and Liquidity buy the cheaper side so small max trades can fill; Favorite Edge needs higher max trade (often $0.70+).",
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
      "Rewards narrow bid–ask spreads and higher volume. Buys whichever side is cheaper so low max-trade sizes can fill.",
  },
  {
    id: "momentum",
    name: "Price Momentum",
    formula:
      "Scores how far the last trade moved vs the previous print (×400), plus a log volume boost. Side follows the move (YES if up, NO if down).",
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion",
    formula:
      "Scores the gap between last trade and mid (×500), plus tighter spreads. Buys YES when stretched below mid, NO when stretched above.",
  },
  {
    id: "favorite-edge",
    name: "Favorite Edge",
    formula:
      "For 70–92¢ YES favorites: blends remaining payout, spread tightness, volume, and closeness to ~82¢. Needs a larger max trade.",
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
      "Log-scales volume, open interest, and liquidity dollars, then adds a tighter-spread bonus. Buys the cheaper side for fillability.",
  },
];
