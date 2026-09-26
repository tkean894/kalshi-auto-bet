# Edgebook

A Kalshi strategy desk: browse live markets, rank opportunities with pluggable scanners, and paper-trade tickets in the browser before risking real capital.

## What it does

- Pulls open Kalshi markets from the public Trade API (`mve_filter=exclude`)
- Falls back to demo markets if Kalshi is unreachable
- Runs six heuristic strategies (tight spread, momentum, mean reversion, favorite edge, longshot value, liquidity)
- Paper portfolio with $1,000 starting cash, localStorage persistence, mark-to-market P&L

This first slice does **not** place live Kalshi orders. Live trading needs your API key + RSA private key and is intentionally left for a later step.

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
