# Edgebook

A Kalshi strategy desk: browse live markets, rank opportunities with pluggable scanners, and paper-trade tickets in the browser before risking real capital.

## What it does

- Pulls open Kalshi markets from the public Trade API (`mve_filter=exclude`)
- Falls back to demo markets if Kalshi is unreachable
- Runs six heuristic strategies (tight spread, momentum, mean reversion, favorite edge, longshot value, liquidity)
- Configurable paper **bankroll** and **max trade** size
- **Auto-trade** that paper-fills ranked signals within those limits (rescan loop, min edge score)
- **Previous-day backtest** against settled Kalshi markets (hit rate + P&L by strategy)
- **Multi-day trainer** that fits strategy enable/min-edge/entry rules on settled data and reports holdout before vs after
- Paper portfolio with localStorage persistence and mark-to-market P&L

Auto-trade is **paper-only**. This app does **not** place live Kalshi orders. Live trading needs your API key + RSA private key and is intentionally left for a later step.

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
```

## Scripts

| Command        | Description              |
| -------------- | ------------------------ |
| `npm run dev`  | Dev server on port 43127 |
| `npm run build`| Production build         |
| `npm run start`| Start production server  |
| `npm run lint` | ESLint                   |

## Disclaimer

Prediction markets involve risk of loss. Scanner scores are research heuristics, not guarantees or financial advice.
