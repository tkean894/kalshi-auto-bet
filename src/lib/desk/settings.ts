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
      Number.isFinite(maxTrade) && maxTrade > 0
        ? Math.min(1_000_000, maxTrade)
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

/** Contracts affordable under max trade and available cash. */
export function sizeContracts(
  entryPrice: number,
  maxTrade: number,
  cash: number,
): number {
  if (!(entryPrice > 0) || !(maxTrade > 0) || !(cash > 0)) return 0;
  const budget = Math.min(maxTrade, cash);
  return Math.max(0, Math.floor(budget / entryPrice + 1e-9));
}
