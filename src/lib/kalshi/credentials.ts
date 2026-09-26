/**
 * Live-order credential gate. Paper desk + public market feed work without keys.
 * Keys are required only when (future) live order placement is enabled.
 */
export type KalshiCredentialStatus = {
  apiKeyPresent: boolean;
  privateKeyPresent: boolean;
  /** Always false in this build — Edgebook is paper-only. */
  liveOrdersEnabled: boolean;
  /** True when both key materials exist (still blocked from live orders). */
  keysConfigured: boolean;
  message: string;
};

export function getKalshiCredentialStatus(): KalshiCredentialStatus {
  const apiKeyPresent = Boolean(
    process.env.KALSHI_API_KEY?.trim() ||
      process.env.KALSHI_ACCESS_KEY?.trim(),
  );
  const privateKeyPresent = Boolean(
    process.env.KALSHI_PRIVATE_KEY?.trim() ||
      process.env.KALSHI_PRIVATE_KEY_PATH?.trim() ||
      process.env.KALSHI_KEY_PATH?.trim(),
  );
  const keysConfigured = apiKeyPresent && privateKeyPresent;
  const liveOrdersEnabled = false;

  let message: string;
  if (!apiKeyPresent && !privateKeyPresent) {
    message =
      "No Kalshi API key or private key in env. Public market scan + paper trading work; live orders stay locked.";
  } else if (!keysConfigured) {
    message =
      "Partial Kalshi credentials detected. Set both KALSHI_API_KEY and KALSHI_PRIVATE_KEY (or KALSHI_PRIVATE_KEY_PATH) before any live-order work.";
  } else {
    message =
      "Kalshi keys are present, but this build never places live orders — paper desk only.";
  }

  return {
    apiKeyPresent,
    privateKeyPresent,
    liveOrdersEnabled,
    keysConfigured,
    message,
  };
}
