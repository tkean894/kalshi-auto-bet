export function parseDollars(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatCents(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

export function formatUsd(amount: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function midPrice(yesBid: number, yesAsk: number): number {
  if (yesBid <= 0 && yesAsk <= 0) return 0;
  if (yesBid <= 0) return yesAsk;
  if (yesAsk <= 0 || yesAsk >= 1) return yesBid;
  return (yesBid + yesAsk) / 2;
}

export function spreadWidth(yesBid: number, yesAsk: number): number {
  if (yesBid <= 0 || yesAsk <= 0) return 1;
  return Math.max(0, yesAsk - yesBid);
}
