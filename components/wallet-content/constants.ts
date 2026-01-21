// LP Token contract ID to check
export const LP_TOKEN_CONTRACT_ID = "CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM"

// Period type for sparkline display
export type SparklinePeriod = "24h" | "7d" | "1mo"

// localStorage keys for persisting wallet state
export const STORAGE_KEY_PERIOD = "wallet-selected-period"
export const STORAGE_KEY_SHOW_PRICE = "wallet-show-price"

// Local token icons available in /public/tokens/
export const LOCAL_TOKEN_ICONS = new Set([
  "xlm", "blnd", "usdc", "aqua", "gbpx", "ustry", "ousd",
  "usdglo", "eurc", "eurx", "pyusd", "tesouro", "cetes", "usdx"
])
