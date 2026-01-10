"use client"

import { useQuery } from "@tanstack/react-query"
import { getHorizonServer } from "@/lib/stellar/horizon"
import type { Horizon } from "@stellar/stellar-sdk"

export interface TokenBalance {
  assetType: string
  assetCode: string
  assetIssuer: string | null
  balance: string
  // For liquidity pool shares
  liquidityPoolId?: string
  // Home domain from issuer account (if available)
  homeDomain?: string
  // USD value (if price is known)
  usdValue?: number
  // Soroban token address (for sparkline fetch)
  tokenAddress?: string
}

export interface TokenPriceInfo {
  price: number
  address: string
}

// Helper to check if a wallet is a demo wallet (by alias format)
function isDemoWallet(userAddress: string | undefined): boolean {
  return !!userAddress && userAddress.startsWith("demo-")
}

// Fetch balances from backend API (for demo wallets - keeps addresses server-side)
async function fetchBalancesFromApi(walletAlias: string): Promise<TokenBalance[]> {
  const response = await fetch(
    `/api/horizon-balances?user=${encodeURIComponent(walletAlias)}`
  )
  if (!response.ok) {
    throw new Error("Failed to fetch balances")
  }
  const data = await response.json()
  return data.balances || []
}

// Fetch current token prices from database (by symbol)
async function fetchCurrentPrices(): Promise<Map<string, TokenPriceInfo>> {
  try {
    const response = await fetch("/api/token-prices-current")
    if (!response.ok) {
      return new Map()
    }
    const data = await response.json()
    return new Map(Object.entries(data.prices || {})) as Map<string, TokenPriceInfo>
  } catch {
    return new Map()
  }
}

// Fetch home_domain for a list of issuer addresses
async function fetchHomeDomainsFromHorizon(
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

interface HorizonBalancesResult {
  balances: TokenBalance[]
  priceMap: Map<string, TokenPriceInfo>
}

export function useHorizonBalances(userAddress: string | undefined) {
  const isDemo = isDemoWallet(userAddress)

  return useQuery({
    queryKey: ["horizonBalances", userAddress],
    queryFn: async (): Promise<HorizonBalancesResult> => {
      if (!userAddress) return { balances: [], priceMap: new Map() }

      // Demo wallet: fetch from backend API (address resolution happens server-side)
      if (isDemo) {
        const [balances, priceMap] = await Promise.all([
          fetchBalancesFromApi(userAddress),
          fetchCurrentPrices(),
        ])

        // Add USD values and token addresses to balances
        const enrichedBalances = balances.map((balance) => {
          const priceInfo = priceMap.get(balance.assetCode)
          if (priceInfo && priceInfo.price > 0) {
            const balanceNum = parseFloat(balance.balance)
            return {
              ...balance,
              usdValue: balanceNum * priceInfo.price,
              tokenAddress: priceInfo.address,
            }
          }
          return balance
        })
        return { balances: enrichedBalances, priceMap }
      }

      // Regular wallet: fetch directly from Horizon
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
        const homeDomainMap = await fetchHomeDomainsFromHorizon(uniqueIssuers)

        // Fetch current prices by symbol
        const priceMap = await fetchCurrentPrices()

        // Attach home_domain, USD value, and token address to each balance
        const balancesWithMetadata = balances.map((balance) => {
          const result: TokenBalance = { ...balance }

          // Add home_domain if available
          if (balance.assetIssuer) {
            const homeDomain = homeDomainMap.get(balance.assetIssuer)
            if (homeDomain) {
              result.homeDomain = homeDomain
            }
          }

          // Add USD value and token address if price info is known
          const priceInfo = priceMap.get(balance.assetCode)
          if (priceInfo && priceInfo.price > 0) {
            const balanceNum = parseFloat(balance.balance)
            result.usdValue = balanceNum * priceInfo.price
            result.tokenAddress = priceInfo.address
          }

          return result
        })

        return { balances: balancesWithMetadata, priceMap }
      } catch (error) {
        console.error("Error fetching Horizon balances:", error)
        return { balances: [], priceMap: new Map() }
      }
    },
    enabled: !!userAddress,
    staleTime: 30 * 1000, // 30 seconds
  })
}
