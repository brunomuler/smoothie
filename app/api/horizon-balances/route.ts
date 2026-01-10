/**
 * Horizon Balances API Route
 *
 * Returns all token balances for a given user address from Horizon.
 * This endpoint wraps Horizon API calls so demo wallet addresses stay server-side.
 * Also fetches home_domain for each issuer account.
 */

import { NextRequest } from "next/server"
import {
  createApiHandler,
  requireString,
  resolveWalletAddress,
  CACHE_CONFIGS,
} from "@/lib/api"
import { getHorizonServer } from "@/lib/stellar/horizon"
import type { Horizon } from "@stellar/stellar-sdk"

interface TokenBalance {
  assetType: string
  assetCode: string
  assetIssuer: string | null
  balance: string
  liquidityPoolId?: string
  homeDomain?: string
}

interface HorizonBalancesResponse {
  balances: TokenBalance[]
}

// Fetch home_domain for a list of issuer addresses
async function fetchHomeDomains(
  issuers: string[]
): Promise<Map<string, string>> {
  const server = getHorizonServer()
  const homeDomainMap = new Map<string, string>()

  // Fetch in parallel with a limit
  const BATCH_SIZE = 5
  for (let i = 0; i < issuers.length; i += BATCH_SIZE) {
    const batch = issuers.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (issuer) => {
        try {
          const account = await server.loadAccount(issuer)
          return { issuer, homeDomain: account.home_domain }
        } catch {
          return { issuer, homeDomain: undefined }
        }
      })
    )

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.homeDomain) {
        homeDomainMap.set(result.value.issuer, result.value.homeDomain)
      }
    }
  }

  return homeDomainMap
}

export const GET = createApiHandler<HorizonBalancesResponse>({
  logPrefix: "[Horizon Balances API]",
  cache: CACHE_CONFIGS.SHORT, // 1 minute cache

  async handler(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams

    // Get user parameter and resolve (handles demo wallet aliases)
    const userParam = requireString(searchParams, "user")
    const userAddress = resolveWalletAddress(userParam)

    try {
      const server = getHorizonServer()
      const account = await server.loadAccount(userAddress)

      const balances: TokenBalance[] = account.balances.map((balance) => {
        // Horizon returns different types of balances
        const b = balance as Horizon.HorizonApi.BalanceLine

        if (b.asset_type === "native") {
          return {
            assetType: "native",
            assetCode: "XLM",
            assetIssuer: null,
            balance: b.balance,
          }
        }

        if (b.asset_type === "liquidity_pool_shares") {
          const lpBalance = b as Horizon.HorizonApi.BalanceLineLiquidityPool
          return {
            assetType: "liquidity_pool_shares",
            assetCode: "LP",
            assetIssuer: null,
            balance: lpBalance.balance,
            liquidityPoolId: lpBalance.liquidity_pool_id,
          }
        }

        // Credit tokens (credit_alphanum4 or credit_alphanum12)
        const creditBalance = b as Horizon.HorizonApi.BalanceLineAsset
        return {
          assetType: creditBalance.asset_type,
          assetCode: creditBalance.asset_code,
          assetIssuer: creditBalance.asset_issuer,
          balance: creditBalance.balance,
        }
      })

      // Collect unique issuer addresses to fetch home_domain
      const uniqueIssuers = [
        ...new Set(
          balances
            .filter((b) => b.assetIssuer)
            .map((b) => b.assetIssuer as string)
        ),
      ]

      // Fetch home_domain for all issuers
      const homeDomainMap = await fetchHomeDomains(uniqueIssuers)

      // Attach home_domain to each balance
      const balancesWithHomeDomain = balances.map((balance) => {
        if (balance.assetIssuer) {
          const homeDomain = homeDomainMap.get(balance.assetIssuer)
          if (homeDomain) {
            return { ...balance, homeDomain }
          }
        }
        return balance
      })

      return { balances: balancesWithHomeDomain }
    } catch (error) {
      console.error("[Horizon Balances API] Error fetching balances:", error)
      return { balances: [] }
    }
  },
})
