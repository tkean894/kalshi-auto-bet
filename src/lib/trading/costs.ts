/**
 * Approximate Kalshi-style taker fee:
 * fee ≈ round_up_cents(0.07 * contracts * p * (1-p))
 * Documented as a research approximation — not a brokerage invoice.
 */
export function kalshiTakerFeeDollars(contracts: number, price: number): number {
  if (contracts <= 0 || price <= 0 || price >= 1) return 0;
  const raw = 0.07 * contracts * price * (1 - price);
  return Math.ceil(raw * 100 - 1e-9) / 100;
}

/** Adverse selection / spread walk buffer as fraction of notional. Default 50 bps. */
export function slippageDollars(
  contracts: number,
  price: number,
  bps = 50,
): number {
  if (contracts <= 0 || price <= 0) return 0;
  return contracts * price * (bps / 10_000);
}

export function roundTripCostDollars(
  contracts: number,
  entryPrice: number,
  opts?: { feeRate?: number; slippageBps?: number },
): { fee: number; slippage: number; total: number } {
  const fee = kalshiTakerFeeDollars(contracts, entryPrice);
  const slippage = slippageDollars(
    contracts,
    entryPrice,
    opts?.slippageBps ?? 50,
  );
  return { fee, slippage, total: fee + slippage };
}

export function netPnlAfterCosts(
  contracts: number,
  entryPrice: number,
  hit: boolean,
  opts?: { slippageBps?: number },
): {
  grossPnl: number;
  fee: number;
  slippage: number;
  netPnl: number;
  cost: number;
  payout: number;
} {
  const cost = contracts * entryPrice;
  const payout = hit ? contracts * 1 : 0;
  const grossPnl = payout - cost;
  const { fee, slippage, total } = roundTripCostDollars(
    contracts,
    entryPrice,
    opts,
  );
  return {
    grossPnl,
    fee,
    slippage,
    netPnl: grossPnl - total,
    cost,
    payout,
  };
}
