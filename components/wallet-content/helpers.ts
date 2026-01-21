import type { TokenBalance } from "@/hooks/use-horizon-balances"
import { LOCAL_TOKEN_ICONS } from "./constants"

// Format balance - only show extra decimals if value is non-zero but small
export function formatBalance(value: number): string {
  if (value === 0) {
    return "0.00"
  }
  // For small non-zero values, show more decimals
  if (value > 0 && value < 0.01) {
    // Find how many decimals we need to show the value
    const str = value.toFixed(8)
    // Trim trailing zeros but keep at least 2 decimals worth of significant digits
    return parseFloat(str).toString()
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Generate token icon URL
export function getTokenIconUrl(assetCode: string, assetIssuer: string | null, assetType?: string): string | null {
  // LP shares don't have icons via this method - handled separately
  if (assetType === "liquidity_pool_shares") {
    return null
  }

  // Check for local icon first (case-insensitive)
  const codeLower = assetCode.toLowerCase()
  if (LOCAL_TOKEN_ICONS.has(codeLower)) {
    return `/tokens/${codeLower}.png`
  }

  // Native XLM without issuer - already handled above, but keep as fallback
  if (!assetIssuer) {
    return "/tokens/xlm.png"
  }

  // Fall back to API endpoint that fetches from stellar.toml
  return `/api/token-icon?code=${encodeURIComponent(assetCode)}&issuer=${encodeURIComponent(assetIssuer)}`
}

// Generate stellar.expert URL for a token
export function getStellarExpertUrl(token: TokenBalance): string {
  if (token.assetType === "native") {
    return "https://stellar.expert/explorer/public/asset/XLM"
  }
  if (token.assetType === "liquidity_pool_shares" && token.liquidityPoolId) {
    return `https://stellar.expert/explorer/public/liquidity-pool/${token.liquidityPoolId}`
  }
  if (token.assetIssuer) {
    return `https://stellar.expert/explorer/public/asset/${token.assetCode}-${token.assetIssuer}`
  }
  return "https://stellar.expert/explorer/public"
}
