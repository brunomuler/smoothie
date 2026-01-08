import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import { calculateHistoricalYieldBreakdown, HistoricalYieldBreakdown } from '@/lib/balance-history-utils'
import { resolveWalletAddress } from '@/lib/api'

export interface AssetYieldBreakdown extends HistoricalYieldBreakdown {
  assetAddress: string
  poolId: string
  assetSymbol?: string
}

export interface CostBasisHistoricalResponse {
  byAsset: Record<string, AssetYieldBreakdown>  // compositeKey (poolId-assetAddress) -> breakdown
  totalCostBasisHistorical: number
  totalProtocolYieldUsd: number
  totalPriceChangeUsd: number
  totalEarnedUsd: number
}

/**
 * GET /api/cost-basis-historical
 *
 * Returns yield breakdown with historical prices for all user positions.
 * Supports multi-wallet aggregation.
 *
 * Query params:
 * - userAddress: Single user's wallet address (for backward compatibility)
 * - userAddresses: Comma-separated list of wallet addresses (for multi-wallet aggregation)
 * - sdkPrices: JSON object mapping asset addresses to current SDK prices (for current value calculation)
 *
 * Returns cost basis calculated using deposit-time prices from daily_token_prices.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userAddress = searchParams.get('userAddress')
  const userAddressesParam = searchParams.get('userAddresses')
  const sdkPricesParam = searchParams.get('sdkPrices')
  const activeWalletsParam = searchParams.get('activeWalletsPerPoolAsset')

  // Support both single address and multiple addresses
  let userAddresses: string[] = []
  if (userAddressesParam) {
    userAddresses = userAddressesParam.split(',').map(a => a.trim()).filter(a => a.length > 0)
  } else if (userAddress) {
    userAddresses = [userAddress]
  }

  if (userAddresses.length === 0) {
    return NextResponse.json(
      { error: 'Missing required parameter: userAddress or userAddresses' },
      { status: 400 }
    )
  }

  // Resolve demo wallet aliases to real addresses
  userAddresses = userAddresses.map(addr => resolveWalletAddress(addr))

  // Parse SDK prices (current prices from SDK for calculating current value)
  let sdkPrices: Record<string, number> = {}
  if (sdkPricesParam) {
    try {
      sdkPrices = JSON.parse(sdkPricesParam)
    } catch {
      console.warn('[Cost Basis Historical API] Failed to parse sdkPrices')
    }
  }

  // Parse active wallets filter (for multi-wallet: only include cost basis from wallets with active positions)
  // Format: { "poolId-assetId": ["walletAddr1", "walletAddr2"], ... }
  let activeWalletsPerPoolAsset: Record<string, string[]> | null = null
  if (activeWalletsParam) {
    try {
      activeWalletsPerPoolAsset = JSON.parse(activeWalletsParam)
    } catch {
      console.warn('[Cost Basis Historical API] Failed to parse activeWalletsPerPoolAsset')
    }
  }

  try {
    // Get all unique assets for ALL addresses
    const allUserActionsPromises = userAddresses.map(addr =>
      eventsRepository.getUserActions(addr, {
        actionTypes: ['supply', 'supply_collateral', 'withdraw', 'withdraw_collateral'],
        limit: 1000,
      })
    )
    const allUserActionsArrays = await Promise.all(allUserActionsPromises)
    const allUserActions = allUserActionsArrays.flat()

    // Group actions by pool-asset (across all wallets)
    const poolAssetPairs: Array<{ poolId: string; assetAddress: string }> = []
    const seenKeys = new Set<string>()
    for (const action of allUserActions) {
      if (!action.pool_id || !action.asset_address) continue
      const compositeKey = `${action.pool_id}-${action.asset_address}`
      if (!seenKeys.has(compositeKey)) {
        seenKeys.add(compositeKey)
        poolAssetPairs.push({
          poolId: action.pool_id,
          assetAddress: action.asset_address,
        })
      }
    }

    const byAsset: Record<string, AssetYieldBreakdown> = {}
    let totalCostBasisHistorical = 0
    let totalProtocolYieldUsd = 0
    let totalPriceChangeUsd = 0
    let totalEarnedUsd = 0

    // Fetch all deposit/withdrawal events for ALL addresses and combine
    const allEventsMaps = await Promise.all(
      userAddresses.map(addr =>
        eventsRepository.getDepositEventsWithPricesBatch(addr, poolAssetPairs, sdkPrices)
      )
    )

    // Combine events from all wallets into a single map
    const eventsMap = new Map<string, {
      deposits: Array<{ date: string; tokens: number; priceAtDeposit: number; usdValue: number }>
      withdrawals: Array<{ date: string; tokens: number; priceAtWithdrawal: number; usdValue: number }>
    }>()

    for (let walletIdx = 0; walletIdx < allEventsMaps.length; walletIdx++) {
      const walletEventsMap = allEventsMaps[walletIdx]
      const walletAddress = userAddresses[walletIdx]

      for (const [compositeKey, events] of walletEventsMap) {
        // MULTI-WALLET FIX: Skip events from wallets that don't have active positions
        // This prevents including cost basis from closed positions (where wallet withdrew everything)
        if (activeWalletsPerPoolAsset) {
          const activeWallets = activeWalletsPerPoolAsset[compositeKey]
          if (activeWallets && !activeWallets.includes(walletAddress)) {
            // This wallet doesn't have an active position for this pool-asset, skip its events
            continue
          }
        }

        const existing = eventsMap.get(compositeKey)
        if (existing) {
          existing.deposits.push(...events.deposits)
          existing.withdrawals.push(...events.withdrawals)
        } else {
          eventsMap.set(compositeKey, {
            deposits: [...events.deposits],
            withdrawals: [...events.withdrawals],
          })
        }
      }
    }

    // Get today's date in YYYY-MM-DD format to filter same-day deposits
    const today = new Date().toISOString().split('T')[0]

    // Calculate breakdown for each pool-asset pair
    for (const { poolId, assetAddress } of poolAssetPairs) {
      const compositeKey = `${poolId}-${assetAddress}`
      const sdkPrice = sdkPrices[assetAddress] || 0

      // Get events from the batch result
      const events = eventsMap.get(compositeKey)
      if (!events) continue

      const { deposits, withdrawals } = events

      // Skip if no events
      if (deposits.length === 0 && withdrawals.length === 0) continue

      // Adjust same-day deposits to use SDK price for cost basis
      // This avoids misleading P&L from intraday price fluctuations
      // (we only have daily price data, so same-day P&L would be noise)
      const adjustedDeposits = deposits.map(d => {
        if (d.date === today) {
          // Same-day deposit: use current SDK price for cost basis
          return {
            ...d,
            priceAtDeposit: sdkPrice,
            usdValue: d.tokens * sdkPrice,
          }
        }
        return d
      })

      // Calculate using AVERAGE COST METHOD
      // This ensures the weighted average price reflects actual prices paid
      const totalDepositedUsd = adjustedDeposits.reduce((sum, d) => sum + d.usdValue, 0)
      const totalDepositedTokens = adjustedDeposits.reduce((sum, d) => sum + d.tokens, 0)
      const totalWithdrawnTokens = withdrawals.reduce((sum, w) => sum + w.tokens, 0)
      const netDepositedTokens = totalDepositedTokens - totalWithdrawnTokens

      // Weighted average deposit price = total USD deposited / total tokens deposited
      const weightedAvgPrice = totalDepositedTokens > 0
        ? totalDepositedUsd / totalDepositedTokens
        : sdkPrice

      // Cost basis = remaining tokens × avg deposit price (withdrawals reduce at avg cost)
      const costRemovedByWithdrawals = totalWithdrawnTokens * weightedAvgPrice
      const costBasisHistorical = totalDepositedUsd - costRemovedByWithdrawals

      // We don't have current balance here (it comes from SDK on client side)
      // So we'll just return the cost basis data and let client calculate the full breakdown
      byAsset[compositeKey] = {
        assetAddress,
        poolId,
        costBasisHistorical,
        weightedAvgDepositPrice: weightedAvgPrice,
        netDepositedTokens,
        // These will be calculated client-side with current balance from SDK
        protocolYieldTokens: 0,
        protocolYieldUsd: 0,
        priceChangeUsd: 0,
        priceChangePercent: 0,
        currentValueUsd: 0,
        totalEarnedUsd: 0,
        totalEarnedPercent: 0,
      }

      totalCostBasisHistorical += costBasisHistorical
    }

    return NextResponse.json({
      byAsset,
      totalCostBasisHistorical,
      totalProtocolYieldUsd,
      totalPriceChangeUsd,
      totalEarnedUsd,
    } as CostBasisHistoricalResponse, {
      headers: {
        // 5 minute cache - cost basis only changes when user performs actions
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('[Cost Basis Historical API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch historical cost basis' },
      { status: 500 }
    )
  }
}
