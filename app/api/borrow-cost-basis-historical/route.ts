import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import { HistoricalBorrowBreakdown } from '@/lib/balance-history-utils'
import { resolveWalletAddress } from '@/lib/api'

export interface AssetBorrowBreakdown extends HistoricalBorrowBreakdown {
  assetAddress: string
  poolId: string
  assetSymbol?: string
}

export interface BorrowCostBasisHistoricalResponse {
  byAsset: Record<string, AssetBorrowBreakdown>  // compositeKey (poolId-assetAddress) -> breakdown
  totalBorrowCostBasisUsd: number
  totalInterestAccruedUsd: number
  totalPriceChangeOnDebtUsd: number
  totalCostUsd: number
}

/**
 * GET /api/borrow-cost-basis-historical
 *
 * Returns borrow cost breakdown with historical prices for all user borrow positions.
 * Supports multi-wallet aggregation.
 *
 * Query params:
 * - userAddress: Single user's wallet address (for backward compatibility)
 * - userAddresses: Comma-separated list of wallet addresses (for multi-wallet aggregation)
 * - sdkPrices: JSON object mapping asset addresses to current SDK prices (for current value calculation)
 *
 * Returns:
 * - borrowCostBasisUsd: USD value of net borrowed amount at borrow-time prices
 * - weightedAvgBorrowPrice: Average price when tokens were borrowed
 * - netBorrowedTokens: Tokens borrowed - repaid (principal outstanding)
 *
 * Note: Interest accrued and price change calculations need current debt from SDK,
 * so those will be calculated client-side. This endpoint provides the historical cost basis data.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userAddress = searchParams.get('userAddress')
  const userAddressesParam = searchParams.get('userAddresses')
  const sdkPricesParam = searchParams.get('sdkPrices')

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
      console.warn('[Borrow Cost Basis Historical API] Failed to parse sdkPrices')
    }
  }

  // Parse active wallets filter (for multi-wallet: only include cost basis from wallets with active borrow positions)
  // Format: { "poolId-assetId": ["walletAddr1", "walletAddr2"], ... }
  const activeWalletsParam = searchParams.get('activeWalletsPerPoolAsset')
  let activeWalletsPerPoolAsset: Record<string, string[]> | null = null
  if (activeWalletsParam) {
    try {
      activeWalletsPerPoolAsset = JSON.parse(activeWalletsParam)
    } catch {
      console.warn('[Borrow Cost Basis Historical API] Failed to parse activeWalletsPerPoolAsset')
    }
  }

  try {
    // Get all unique assets for ALL addresses
    const allUserActionsPromises = userAddresses.map(addr =>
      eventsRepository.getUserActions(addr, {
        actionTypes: ['borrow', 'repay'],
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

    const byAsset: Record<string, AssetBorrowBreakdown> = {}
    let totalBorrowCostBasisUsd = 0
    let totalInterestAccruedUsd = 0
    let totalPriceChangeOnDebtUsd = 0
    let totalCostUsd = 0

    // Fetch all borrow/repay events for ALL addresses and combine
    const allEventsMaps = await Promise.all(
      userAddresses.map(addr =>
        eventsRepository.getBorrowEventsWithPricesBatch(addr, poolAssetPairs, sdkPrices)
      )
    )

    // Combine events from all wallets into a single map
    const eventsMap = new Map<string, {
      borrows: Array<{ date: string; tokens: number; priceAtBorrow: number; usdValue: number }>
      repays: Array<{ date: string; tokens: number; priceAtRepay: number; usdValue: number }>
    }>()

    for (let walletIdx = 0; walletIdx < allEventsMaps.length; walletIdx++) {
      const walletEventsMap = allEventsMaps[walletIdx]
      const walletAddress = userAddresses[walletIdx]

      for (const [compositeKey, events] of walletEventsMap) {
        // MULTI-WALLET FIX: Skip events from wallets that don't have active borrow positions
        // This prevents including cost basis from closed borrow positions (where wallet repaid everything)
        if (activeWalletsPerPoolAsset) {
          const activeWallets = activeWalletsPerPoolAsset[compositeKey]
          if (activeWallets && !activeWallets.includes(walletAddress)) {
            // This wallet doesn't have an active borrow position for this pool-asset, skip its events
            continue
          }
        }

        const existing = eventsMap.get(compositeKey)
        if (existing) {
          existing.borrows.push(...events.borrows)
          existing.repays.push(...events.repays)
        } else {
          eventsMap.set(compositeKey, {
            borrows: [...events.borrows],
            repays: [...events.repays],
          })
        }
      }
    }

    // Get today's date in YYYY-MM-DD format to filter same-day borrows
    const today = new Date().toISOString().split('T')[0]

    // Calculate breakdown for each pool-asset pair
    for (const { poolId, assetAddress } of poolAssetPairs) {
      const compositeKey = `${poolId}-${assetAddress}`
      const sdkPrice = sdkPrices[assetAddress] || 0

      // Get events from the batch result
      const events = eventsMap.get(compositeKey)
      if (!events) continue

      const { borrows, repays } = events

      // Skip if no events
      if (borrows.length === 0 && repays.length === 0) continue

      // Adjust same-day borrows to use SDK price for cost basis
      // This avoids misleading P&L from intraday price fluctuations
      // (we only have daily price data, so same-day P&L would be noise)
      const adjustedBorrows = borrows.map(b => {
        if (b.date === today) {
          // Same-day borrow: use current SDK price for cost basis
          return {
            ...b,
            priceAtBorrow: sdkPrice,
            usdValue: b.tokens * sdkPrice,
          }
        }
        return b
      })

      // Calculate using AVERAGE COST METHOD
      // This ensures the weighted average price reflects actual prices when borrowed
      const totalBorrowedUsd = adjustedBorrows.reduce((sum, b) => sum + b.usdValue, 0)
      const totalBorrowedTokens = adjustedBorrows.reduce((sum, b) => sum + b.tokens, 0)
      const totalRepaidTokens = repays.reduce((sum, r) => sum + r.tokens, 0)
      const netBorrowedTokens = totalBorrowedTokens - totalRepaidTokens

      // Weighted average borrow price = total USD borrowed / total tokens borrowed
      const weightedAvgPrice = totalBorrowedTokens > 0
        ? totalBorrowedUsd / totalBorrowedTokens
        : sdkPrice

      // Cost basis = remaining borrowed tokens × avg borrow price (repays reduce at avg cost)
      const costRemovedByRepays = totalRepaidTokens * weightedAvgPrice
      const borrowCostBasisUsd = totalBorrowedUsd - costRemovedByRepays

      // We don't have current debt here (it comes from SDK on client side)
      // So we'll just return the cost basis data and let client calculate the full breakdown
      byAsset[compositeKey] = {
        assetAddress,
        poolId,
        borrowCostBasisUsd,
        weightedAvgBorrowPrice: weightedAvgPrice,
        netBorrowedTokens,
        // These will be calculated client-side with current debt from SDK
        interestAccruedTokens: 0,
        interestAccruedUsd: 0,
        priceChangeOnDebtUsd: 0,
        priceChangePercent: 0,
        currentDebtTokens: 0,
        currentDebtUsd: 0,
        totalCostUsd: 0,
        totalCostPercent: 0,
      }

      totalBorrowCostBasisUsd += borrowCostBasisUsd
    }

    return NextResponse.json({
      byAsset,
      totalBorrowCostBasisUsd,
      totalInterestAccruedUsd,
      totalPriceChangeOnDebtUsd,
      totalCostUsd,
    } as BorrowCostBasisHistoricalResponse, {
      headers: {
        // 5 minute cache - cost basis only changes when user performs actions
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('[Borrow Cost Basis Historical API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch historical borrow cost basis' },
      { status: 500 }
    )
  }
}
