export type SignalFeatures = {
  category: string;
  hoursToClose: number | null;
  spread: number;
  volume: number;
  logVolume: number;
  mid: number;
  /** Close vs earlier candle mid, if available. */
  pathDelta: number;
  /** Volume of entry candle vs day average candle volume. */
  volumeSpike: number;
  /** YES bid depth proxy from bid/ask tightness. */
  bookTightness: number;
};

export function defaultFeatures(
  partial?: Partial<SignalFeatures>,
): SignalFeatures {
  return {
    category: partial?.category ?? "unknown",
    hoursToClose: partial?.hoursToClose ?? null,
    spread: partial?.spread ?? 0,
    volume: partial?.volume ?? 0,
    logVolume: partial?.logVolume ?? 0,
    mid: partial?.mid ?? 0.5,
    pathDelta: partial?.pathDelta ?? 0,
    volumeSpike: partial?.volumeSpike ?? 1,
    bookTightness: partial?.bookTightness ?? 0,
  };
}

export function normalizeCategory(raw: string | null | undefined): string {
  const c = (raw || "unknown").trim().toLowerCase();
  if (!c) return "unknown";
  if (c.includes("sport")) return "sports";
  if (c.includes("weather") || c.includes("climate") || c.includes("temp"))
    return "weather";
  if (c.includes("crypto") || c.includes("bitcoin") || c.includes("ethereum"))
    return "crypto";
  if (
    c.includes("econom") ||
    c.includes("fed") ||
    c.includes("inflat") ||
    c.includes("gdp")
  )
    return "economics";
  if (c.includes("polit") || c.includes("elect")) return "politics";
  if (
    c.includes("enterain") ||
    c.includes("entertainment") ||
    c.includes("award")
  )
    return "entertainment";
  return c.replace(/\s+/g, "_").slice(0, 32);
}

/** Build features from a live (or snapshot) quote without candle path. */
export function featuresFromQuote(opts: {
  spread: number;
  volume: number;
  mid: number;
  closeTime?: string | null;
  category?: string | null;
  nowMs?: number;
}): SignalFeatures {
  const now = opts.nowMs ?? Date.now();
  let hoursToClose: number | null = null;
  if (opts.closeTime) {
    const closeMs = Date.parse(opts.closeTime);
    if (Number.isFinite(closeMs)) {
      hoursToClose = Math.max(0, (closeMs - now) / 3600_000);
    }
  }
  return defaultFeatures({
    category: normalizeCategory(opts.category),
    hoursToClose,
    spread: opts.spread,
    volume: opts.volume,
    logVolume: Math.log10(opts.volume + 1),
    mid: opts.mid,
    pathDelta: 0,
    volumeSpike: 1,
    bookTightness: Math.max(0, 1 - opts.spread / 0.1),
  });
}

/** Feature vector for logistic ranker (includes bias term at index 0). */
export function featureVector(
  edgeScore: number,
  side: "yes" | "no",
  f: SignalFeatures,
): number[] {
  return [
    1,
    edgeScore / 100,
    side === "yes" ? 1 : 0,
    f.spread,
    Math.min(f.logVolume / 5, 1),
    f.mid,
    Math.max(-1, Math.min(1, f.pathDelta * 5)),
    Math.min(f.volumeSpike / 3, 2) / 2,
    f.bookTightness,
    f.hoursToClose == null ? 0.5 : Math.min(f.hoursToClose / 48, 1),
  ];
}
