# Edgebook

A Kalshi strategy desk: browse live markets, rank opportunities with pluggable scanners, and paper-trade tickets in the browser before risking real capital.

## What it does

- Pulls open Kalshi markets from the public Trade API (`mve_filter=exclude`)
- Falls back to demo markets if Kalshi is unreachable
- Runs six heuristic strategies (tight spread, momentum, mean reversion, favorite edge, longshot value, liquidity)
- Configurable paper **bankroll** and **max trade** size
- **Auto-trade** that paper-fills ranked signals within those limits (rescan loop, min edge score, edge-sized tickets, event/category caps)
- **Previous-day backtest** against settled Kalshi markets (fee-aware net P&L + hit rate by strategy)
- **Fee-aware walk-forward trainer** with intraday entry, category/path/volume features, logistic ranker, sizing, time-to-close filters, equity/drawdown metrics
- **Retrain** from the Training tab (or `npm run train`) with divergence alerts
- **Suggested max trade** from a bankroll-relative sweep on settled days (train-selected under a 25% drawdown budget, holdout-verified)
- **Kalshi key gate** on Risk & auto — live orders stay locked; paper works without keys
- Paper portfolio with localStorage persistence and mark-to-market P&L

Auto-trade is **paper-only**. This app does **not** place live Kalshi orders.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

Optional env:

```bash
# Override API host (defaults to production public API)
KALSHI_API_BASE=https://external-api.kalshi.com/trade-api/v2

# Optional — required only for a future live-order path (gate shows status)
KALSHI_API_KEY=
KALSHI_PRIVATE_KEY=
# or KALSHI_PRIVATE_KEY_PATH=/path/to/key.pem
```

## Scripts

| Command           | Description                                      |
| ----------------- | ------------------------------------------------ |
| `npm run dev`     | Dev server on port 43127                         |
| `npm run build`   | Production build                                 |
| `npm run start`   | Start production server                          |
| `npm run lint`    | ESLint                                           |
| `npm run train`   | Fee-aware walk-forward policy fit → `data/`      |
| `npm run sweep:max-trade` | Prove best max-trade vs bankroll on cached days |
| `npm run backtest:day` | Previous-day settled backtest               |

## Training notes

- Day caches are versioned (`cacheVersion: 3`). Older caches rebuild automatically.
- Settlement P&L subtracts an approximate Kalshi taker fee `ceil(0.07·C·p·(1-p))` plus 50 bps slippage.
- Holdout metrics in the Training tab are from the last completed run only — never invented.

## Disclaimer

Prediction markets involve risk of loss. Scanner scores are research heuristics, not guarantees or financial advice.
