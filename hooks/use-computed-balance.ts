"use client"

import { useMemo } from "react"
import { detectPositionChanges, calculateEarningsStats } from "@/lib/balance-history-utils"
import type { AssetCardData } from "@/types/asset-card"
import type { BalanceData } from "@/types/wallet-balance"
import type { ChartDataPoint, EarningsStats, PositionChange } from "@/types/balance-history"

interface BlendPosition {
  id: string
  supplyAmount: number
  price?: { usdPrice?: number } | null
  assetId?: string
}

interface BackstopPosition {
  poolId: string
  costBasisLp?: number
  lpTokensUsd: number
}

interface BalanceChartDataPoint {
  date: string
  total?: number
  deposit?: number
  yield?: number
  borrow?: number
  pools?: Array<{
    balance: number
    deposit: number
    yield: number
    borrow?: number
  }>
}

interface BalanceHistoryDataEntry {
  chartData: BalanceChartDataPoint[]
  positionChanges: unknown[]
  earningsStats: unknown
  rawData: unknown[]
  isLoading: boolean
  error: Error | null
}

interface BalanceHistoryQueryResult {
  isLoading: boolean
  error: Error | null
}

interface BackstopBalanceHistoryQuery {
  data: { history: Array<{ date: string; lp_tokens: number }> } | undefined
  isLoading: boolean
  error: Error | null
}

export interface AggregatedHistoryData {
  chartData: ChartDataPoint[]
  positionChanges: PositionChange[]
  earningsStats: EarningsStats
  rawData: unknown[]
  isLoading: boolean
  error: Error | null
}

export interface UseComputedBalanceReturn {
  assetPriceMap: Map<string, number>
  enrichedAssetCards: AssetCardData[]
  totalCostBasis: number | undefined
  balanceData: BalanceData
  aggregatedHistoryData: AggregatedHistoryData | null
}

export interface HistoricalPriceGetter {
  getPrice: (tokenAddress: string, date: string) => number
  hasHistoricalData: boolean
}

export function useComputedBalance(
  initialBalanceData: BalanceData,
  assetCards: AssetCardData[],
  blendSnapshot: { positions: BlendPosition[] } | null | undefined,
  backstopPositions: BackstopPosition[],
  lpTokenPrice: number | null | undefined,
  poolAssetCostBasisMap: Map<string, number>,
  balanceHistoryDataMap: Map<string, BalanceHistoryDataEntry>,
  balanceHistoryQueries: BalanceHistoryQueryResult[],
  backstopBalanceHistoryQuery: BackstopBalanceHistoryQuery,
  uniqueAssetAddresses: string[],
  historicalPrices?: HistoricalPriceGetter,  // Optional: historical prices for chart
  showPriceChanges: boolean = true,  // When false, use current prices for chart instead of historical
  historicalBackstopCostBasis?: Map<string, number>  // Optional: date -> cumulative cost basis in LP tokens
): UseComputedBalanceReturn {
  // Build a map of asset address -> USD price from SDK positions
  const assetPriceMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!blendSnapshot?.positions) return map

    blendSnapshot.positions.forEach(pos => {
      if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
        map.set(pos.assetId, pos.price.usdPrice)
      }
    })

    return map
  }, [blendSnapshot?.positions])

  // Enrich asset cards with yield calculated as: SDK Balance (USD) - Database Cost Basis (token amount × USD price)
  const enrichedAssetCards = useMemo(() => {
    return assetCards.map((asset) => {
      // asset.id is already in the format: poolId-assetAddress
      const compositeKey = asset.id

      // Get cost basis in token amount from database
      const costBasisTokens = poolAssetCostBasisMap.get(compositeKey)

      if (costBasisTokens === undefined) {
        return {
          ...asset,
          earnedYield: 0,
          yieldPercentage: 0,
        } as AssetCardData
      }

      // Get USD price for this asset from SDK
      const assetAddress = asset.id.includes('-') ? asset.id.split('-')[1] : asset.id
      const usdPrice = assetPriceMap.get(assetAddress) || 1

      // Convert cost basis from tokens to USD
      const costBasisUsd = costBasisTokens * usdPrice

      // Calculate yield: SDK Balance (USD) - Database Cost Basis (USD)
      const earnedYield = asset.rawBalance - costBasisUsd

      // Calculate yield percentage: (Yield / Cost Basis) * 100
      const yieldPercentage = costBasisUsd > 0
        ? (earnedYield / costBasisUsd) * 100
        : 0

      return {
        ...asset,
        earnedYield,
        yieldPercentage,
      } as AssetCardData
    })
  }, [assetCards, poolAssetCostBasisMap, assetPriceMap])

  // Calculate total cost basis from all assets in USD (including backstop)
  const totalCostBasis = useMemo(() => {
    let totalCostBasisUsd = 0

    // 1. Supply positions cost basis
    if (blendSnapshot?.positions) {
      blendSnapshot.positions.forEach((position) => {
        if (position.supplyAmount <= 0) return // Skip positions with no supply

        const compositeKey = position.id // Already in format: poolId-assetAddress
        const costBasisTokens = poolAssetCostBasisMap.get(compositeKey)

        if (costBasisTokens !== undefined && costBasisTokens > 0) {
          // Convert cost basis from tokens to USD using SDK price
          const usdPrice = position.price?.usdPrice || 1
          const costBasisUsd = costBasisTokens * usdPrice
          totalCostBasisUsd += costBasisUsd
        }
      })
    }

    // 2. Backstop positions cost basis
    // Without this, the entire backstop value would be counted as yield
    if (backstopPositions && lpTokenPrice) {
      backstopPositions.forEach((bp) => {
        // If we have cost basis data from events, use it
        if (bp.costBasisLp && bp.costBasisLp > 0) {
          const costBasisUsd = bp.costBasisLp * lpTokenPrice
          totalCostBasisUsd += costBasisUsd
        } else if (bp.lpTokensUsd > 0) {
          // FALLBACK: If no cost basis data available but user has backstop position,
          // use current LP value as cost basis (conservative - assumes 0 yield)
          // This prevents new deposits from appearing as yield before events are indexed
          console.warn('[totalCostBasis] No cost basis for backstop pool', bp.poolId, '- using current LP value as fallback')
          totalCostBasisUsd += bp.lpTokensUsd
        }
      })
    }

    return totalCostBasisUsd > 0 ? totalCostBasisUsd : undefined
  }, [blendSnapshot?.positions, poolAssetCostBasisMap, backstopPositions, lpTokenPrice])

  // Recalculate balanceData with correct total cost basis and yield
  const balanceData = useMemo(() => {
    if (!totalCostBasis || totalCostBasis <= 0) {
      return initialBalanceData
    }

    const realYield = initialBalanceData.rawBalance - totalCostBasis
    const yieldPercentage = totalCostBasis > 0 ? (realYield / totalCostBasis) * 100 : 0

    const usdFormatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

    return {
      ...initialBalanceData,
      interestEarned: `$${usdFormatter.format(realYield)}`,
      rawInterestEarned: realYield,
      growthPercentage: yieldPercentage,
    }
  }, [initialBalanceData, totalCostBasis])

  // Aggregate historical data from ALL assets + backstop, converting each to USD
  // This provides the combined total history for the top chart
  const aggregatedHistoryData = useMemo(() => {
    // Check if data is still loading
    const isLoading = balanceHistoryQueries.some(q => q.isLoading) || backstopBalanceHistoryQuery.isLoading

    // Return loading state if asset history hasn't loaded yet
    // IMPORTANT: Don't proceed with aggregation if we only have backstop data but no asset data
    // This prevents showing incorrect totals (backstop only) while asset history is loading
    if (isLoading || (balanceHistoryDataMap.size === 0 && uniqueAssetAddresses.length > 0)) {
      return {
        chartData: [],
        positionChanges: [],
        earningsStats: {
          totalInterest: 0,
          currentAPY: 0,
          avgDailyInterest: 0,
          projectedAnnual: 0,
          dayCount: 0,
          avgPosition: 0,
          perPool: {},
        },
        rawData: [],
        isLoading: true, // Keep showing loading until ALL data is ready
        error: null,
      } as AggregatedHistoryData
    }

    // Return empty result for accounts with no positions (not loading, just empty)
    if (balanceHistoryDataMap.size === 0 && !backstopBalanceHistoryQuery.data?.history?.length) {
      return {
        chartData: [],
        positionChanges: [],
        earningsStats: {
          totalInterest: 0,
          currentAPY: 0,
          avgDailyInterest: 0,
          projectedAnnual: 0,
          dayCount: 0,
          avgPosition: 0,
          perPool: {},
        },
        rawData: [],
        isLoading: false,
        error: null,
      } as AggregatedHistoryData
    }

    // Collect all dates across all assets
    const allDatesSet = new Set<string>()
    balanceHistoryDataMap.forEach((historyData) => {
      historyData.chartData.forEach((point) => {
        allDatesSet.add(point.date)
      })
    })

    // Also add backstop dates
    backstopBalanceHistoryQuery.data?.history?.forEach((point) => {
      allDatesSet.add(point.date)
    })

    const allDates = Array.from(allDatesSet).sort()

    // Build a map of backstop history by date for quick lookup
    const backstopByDate = new Map<string, number>()
    backstopBalanceHistoryQuery.data?.history?.forEach((point) => {
      backstopByDate.set(point.date, point.lp_tokens || 0)
    })

    // For each date, sum up all assets' values (converted to USD)
    const aggregatedChartData = allDates.map(date => {
      let totalBalance = 0
      let totalDeposit = 0
      let totalYield = 0
      let totalBorrow = 0
      const pools: unknown[] = []

      // Sum across all assets
      uniqueAssetAddresses.forEach(assetAddress => {
        const historyData = balanceHistoryDataMap.get(assetAddress)
        if (!historyData) return

        const point = historyData.chartData.find((p) => p.date === date)
        if (!point) return

        // Get USD price for this asset
        // When showPriceChanges is OFF, always use current SDK price (no historical price impact)
        // When showPriceChanges is ON, use historical price if available
        const usdPrice = showPriceChanges && historicalPrices?.hasHistoricalData
          ? historicalPrices.getPrice(assetAddress, date)
          : (assetPriceMap.get(assetAddress) || 1)

        // Convert token amounts to USD and add to totals
        totalBalance += (point.total || 0) * usdPrice
        totalDeposit += (point.deposit || 0) * usdPrice
        totalYield += (point.yield || 0) * usdPrice
        totalBorrow += (point.borrow || 0) * usdPrice

        // Also aggregate pool data
        point.pools?.forEach((pool) => {
          pools.push({
            ...pool,
            balance: pool.balance * usdPrice,
            deposit: pool.deposit * usdPrice,
            yield: pool.yield * usdPrice,
            borrow: (pool.borrow || 0) * usdPrice,
          })
        })
      })

      // Add backstop balance (LP tokens * LP price)
      // When showPriceChanges is OFF, always use current LP price (no historical price impact)
      // When showPriceChanges is ON, use historical LP price if available
      const backstopLpTokens = backstopByDate.get(date) || 0
      const LP_TOKEN_ADDRESS = 'CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM'
      const lpPrice = showPriceChanges && historicalPrices?.hasHistoricalData
        ? historicalPrices.getPrice(LP_TOKEN_ADDRESS, date)
        : (lpTokenPrice || 0)
      const backstopUsdValue = backstopLpTokens * lpPrice
      totalBalance += backstopUsdValue

      // For deposit (cost basis), use historical cost basis if available, otherwise fall back to current
      // Historical cost basis tracks the actual cumulative deposits/withdrawals over time
      let effectiveBackstopCostBasisLp: number

      if (historicalBackstopCostBasis && historicalBackstopCostBasis.size > 0) {
        // Use historical cost basis - find the cost basis as of this date
        // The map contains cumulative cost basis at each date
        effectiveBackstopCostBasisLp = historicalBackstopCostBasis.get(date) ?? 0

        // If no exact date match, find the most recent date before this one
        if (effectiveBackstopCostBasisLp === 0 && backstopLpTokens > 0) {
          const sortedDates = Array.from(historicalBackstopCostBasis.keys()).sort()
          for (const histDate of sortedDates) {
            if (histDate <= date) {
              effectiveBackstopCostBasisLp = historicalBackstopCostBasis.get(histDate) ?? 0
            } else {
              break
            }
          }
        }
      } else {
        // Fall back to current cost basis from SDK positions
        const backstopCostBasisLp = backstopPositions.reduce((sum, bp) => sum + (bp.costBasisLp || 0), 0)

        // Clamp cost basis to not exceed the LP tokens at this date
        // This prevents showing negative yield when current cost basis includes recent deposits
        effectiveBackstopCostBasisLp = backstopCostBasisLp > 0
          ? Math.min(backstopCostBasisLp, backstopLpTokens)
          : backstopLpTokens  // If no cost basis data, use LP tokens as deposit (conservative - 0 yield)
      }

      // Use same LP price for cost basis (historical or current)
      const backstopCostBasisUsd = effectiveBackstopCostBasisLp * lpPrice
      totalDeposit += backstopCostBasisUsd

      // Add backstop yield to total yield
      const backstopYieldUsd = backstopUsdValue - backstopCostBasisUsd
      totalYield += backstopYieldUsd

      const dateObj = new Date(date)
      return {
        date,
        formattedDate: dateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        timestamp: dateObj.getTime(),
        total: totalBalance,
        deposit: totalDeposit,
        yield: totalYield,
        borrow: totalBorrow,
        backstop: backstopUsdValue, // Include backstop value separately for reference
        pools,
      }
    })

    // Calculate combined position changes and earnings stats
    const positionChanges = detectPositionChanges([]) as PositionChange[]
    const earningsStats = calculateEarningsStats(aggregatedChartData as any, positionChanges) as EarningsStats

    return {
      chartData: aggregatedChartData as unknown as ChartDataPoint[],
      positionChanges,
      earningsStats,
      rawData: [],
      isLoading: balanceHistoryQueries.some(q => q.isLoading) || backstopBalanceHistoryQuery.isLoading,
      error: balanceHistoryQueries.find(q => q.error)?.error || backstopBalanceHistoryQuery.error || null,
    } as AggregatedHistoryData
  }, [balanceHistoryDataMap, assetPriceMap, uniqueAssetAddresses, balanceHistoryQueries, backstopBalanceHistoryQuery, lpTokenPrice, backstopPositions, historicalPrices, showPriceChanges])

  return {
    assetPriceMap,
    enrichedAssetCards,
    totalCostBasis,
    balanceData,
    aggregatedHistoryData,
  }
}
