import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import { HistoricalBorrowBreakdown } from '@/lib/balance-history-utils'

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
 *
 * Query params:
 * - userAddress: The user's wallet address
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
  const sdkPricesParam = searchParams.get('sdkPrices')

  if (!userAddress) {
    return NextResponse.json(
      { error: 'Missing required parameter: userAddress' },
      { status: 400 }
    )
  }

  // Parse SDK prices (current prices from SDK for calculating current value)
  let sdkPrices: Record<string, number> = {}
  if (sdkPricesParam) {
    try {
      sdkPrices = JSON.parse(sdkPricesParam)
    } catch {
      console.warn('[Borrow Cost Basis Historical API] Failed to parse sdkPrices')
    }
  }

  try {
    // Get all unique assets the user has borrowed
    const userActions = await eventsRepository.getUserActions(userAddress, {
      actionTypes: ['borrow', 'repay'],
      limit: 1000,
    })

    // Group actions by pool-asset
    const poolAssetPairs: Array<{ poolId: string; assetAddress: string }> = []
    const seenKeys = new Set<string>()
    for (const action of userActions) {
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

    // Fetch all borrow/repay events in a single batch query (optimization: eliminates N+1)
    const eventsMap = await eventsRepository.getBorrowEventsWithPricesBatch(
      userAddress,
      poolAssetPairs,
      sdkPrices
    )

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
