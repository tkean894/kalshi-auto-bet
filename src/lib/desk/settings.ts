export type DeskSettings = {
  /** Paper bankroll / reset cash. */
  bankroll: number;
  /** Max dollars spent on a single ticket. */
  maxTrade: number;
  /** When true, Edgebook paper-fills ranked signals automatically. */
  autoTrade: boolean;
  /** Skip signals below this edge score. */
  minEdgeScore: number;
  /** How often to rescan while auto-trade is on (seconds). */
  refreshSeconds: number;
};

export const DESK_SETTINGS_KEY = "edgebook-desk-settings-v1";

/** Smallest allowed max-trade in dollars ($0.05 = 5¢). */
export const MIN_MAX_TRADE = 0.05;

export const DEFAULT_DESK_SETTINGS: DeskSettings = {
  bankroll: 1000,
  maxTrade: 25,
  autoTrade: false,
  minEdgeScore: 55,
  refreshSeconds: 45,
};

export function normalizeDeskSettings(
  partial: Partial<DeskSettings> | null | undefined,
): DeskSettings {
  const bankroll = Number(partial?.bankroll);
  const maxTrade = Number(partial?.maxTrade);
  const minEdgeScore = Number(partial?.minEdgeScore);
  const refreshSeconds = Number(partial?.refreshSeconds);

  return {
    bankroll:
      Number.isFinite(bankroll) && bankroll > 0
        ? Math.min(1_000_000, bankroll)
        : DEFAULT_DESK_SETTINGS.bankroll,
    maxTrade:
      Number.isFinite(maxTrade) && maxTrade >= MIN_MAX_TRADE
        ? Math.min(1_000_000, Math.round(maxTrade * 100) / 100)
        : DEFAULT_DESK_SETTINGS.maxTrade,
    autoTrade: Boolean(partial?.autoTrade),
    minEdgeScore:
      Number.isFinite(minEdgeScore) && minEdgeScore >= 0
        ? Math.min(99, Math.round(minEdgeScore))
        : DEFAULT_DESK_SETTINGS.minEdgeScore,
    refreshSeconds:
      Number.isFinite(refreshSeconds) && refreshSeconds >= 15
        ? Math.min(600, Math.round(refreshSeconds))
        : DEFAULT_DESK_SETTINGS.refreshSeconds,
  };
}

export function loadDeskSettings(): DeskSettings {
  if (typeof window === "undefined") return DEFAULT_DESK_SETTINGS;
  try {
    const raw = window.localStorage.getItem(DESK_SETTINGS_KEY);
    if (!raw) return DEFAULT_DESK_SETTINGS;
    return normalizeDeskSettings(JSON.parse(raw) as Partial<DeskSettings>);
  } catch {
    return DEFAULT_DESK_SETTINGS;
  }
}

export function saveDeskSettings(settings: DeskSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    DESK_SETTINGS_KEY,
    JSON.stringify(normalizeDeskSettings(settings)),
  );
}

/**
 * Contracts affordable under max trade and available cash.
 * Optional edgeScore scales budget (higher edge → larger size, floor 35%).
 */
export function sizeContracts(
  entryPrice: number,
  maxTrade: number,
  cash: number,
  opts?: { sizeMult?: number; edgeScore?: number; edgeSized?: boolean },
): number {
  if (!(entryPrice > 0) || !(maxTrade > 0) || !(cash > 0)) return 0;
  const mult = opts?.sizeMult && opts.sizeMult > 0 ? opts.sizeMult : 1;
  let budget = Math.min(maxTrade * mult, cash);
  if (opts?.edgeSized && opts.edgeScore != null) {
    const scale = Math.max(0.35, Math.min(1, opts.edgeScore / 100));
    budget *= scale;
  }
  return Math.max(0, Math.floor(budget / entryPrice + 1e-9));
}
