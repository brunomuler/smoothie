import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'

export interface RealizedYieldTransaction {
  date: string
  type: 'deposit' | 'withdraw' | 'claim'
  source: 'pool' | 'backstop'
  asset: string
  assetAddress: string | null
  amount: number
  priceUsd: number
  valueUsd: number
  txHash: string
  poolId: string
  poolName: string | null
}

export interface RealizedYieldResponse {
  // Summary
  totalDepositedUsd: number
  totalWithdrawnUsd: number
  realizedPnl: number

  // Breakdown by source
  pools: {
    deposited: number
    withdrawn: number
    realized: number
  }
  backstop: {
    deposited: number
    withdrawn: number
    realized: number
  }
  emissions: {
    blndClaimed: number
    lpClaimed: number
    usdValue: number
  }

  // Performance metrics
  roiPercent: number | null
  annualizedRoiPercent: number | null
  daysActive: number

  // Metadata
  firstActivityDate: string | null
  lastActivityDate: string | null

  // Time series for charting
  cumulativeRealized: Array<{
    date: string
    cumulativeDeposited: number
    cumulativeWithdrawn: number
    cumulativeRealized: number
    cumulativeRealizedPnl: number
  }>

  // Per-source time series for charting
  cumulativeBySource: {
    pools: Array<{
      date: string
      cumulativeDeposited: number
      cumulativeWithdrawn: number
      cumulativeRealizedPnl: number
    }>
    backstop: Array<{
      date: string
      cumulativeDeposited: number
      cumulativeWithdrawn: number
      cumulativeRealizedPnl: number
    }>
  }

  // Per-pool time series for charting (stacked bar chart)
  cumulativeByPool: Array<{
    poolId: string
    poolName: string | null
    timeSeries: Array<{
      date: string
      lendingRealizedPnl: number
      backstopRealizedPnl: number
    }>
  }>

  // Transaction list
  transactions: RealizedYieldTransaction[]
}

/**
 * GET /api/realized-yield
 *
 * Returns realized yield data for a user.
 * Realized yield = Total withdrawn (at historical prices) - Total deposited (at historical prices)
 *
 * Query params:
 * - userAddress: The user's wallet address (required)
 * - sdkBlndPrice: Current BLND price from SDK (optional fallback)
 * - sdkLpPrice: Current LP token price from SDK (optional fallback)
 * - sdkPrices: JSON object of token address -> price (optional fallback)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userAddress = searchParams.get('userAddress')
  const sdkBlndPrice = parseFloat(searchParams.get('sdkBlndPrice') || '0') || 0
  const sdkLpPrice = parseFloat(searchParams.get('sdkLpPrice') || '0') || 0
  const sdkPricesJson = searchParams.get('sdkPrices')

  if (!userAddress) {
    return NextResponse.json(
      { error: 'Missing required parameter: userAddress' },
      { status: 400 }
    )
  }

  try {
    // Build SDK prices map
    const sdkPrices = new Map<string, number>()

    // Add BLND and LP prices if provided
    const LP_TOKEN_ADDRESS = 'CDMHROXQ75GEMEJ4LJCT4TUFKY7PH5Z7V5RCVS4KKGU2CQLQRN35DKFT'
    const BLND_TOKEN_ADDRESS = 'CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBEGU5FCPGMYTVG5JY'

    if (sdkBlndPrice > 0) {
      sdkPrices.set(BLND_TOKEN_ADDRESS, sdkBlndPrice)
    }
    if (sdkLpPrice > 0) {
      sdkPrices.set(LP_TOKEN_ADDRESS, sdkLpPrice)
    }

    // Parse additional SDK prices if provided
    if (sdkPricesJson) {
      try {
        const parsed = JSON.parse(sdkPricesJson)
        for (const [address, price] of Object.entries(parsed)) {
          if (typeof price === 'number' && price > 0) {
            sdkPrices.set(address, price)
          }
        }
      } catch {
        // Ignore invalid JSON
      }
    }

    const data = await eventsRepository.getRealizedYieldData(userAddress, sdkPrices)

    // Helper to generate all dates between start and end (inclusive)
    const getAllDatesBetween = (startDate: string, endDate: string): string[] => {
      const dates: string[] = []
      const current = new Date(startDate)
      const end = new Date(endDate)
      while (current <= end) {
        dates.push(current.toISOString().split('T')[0])
        current.setDate(current.getDate() + 1)
      }
      return dates
    }

    // Group transactions by date and calculate running totals
    const dateMap = new Map<string, { deposited: number; withdrawn: number; realizedPnl: number }>()

    for (const tx of data.transactions) {
      const existing = dateMap.get(tx.date) || { deposited: 0, withdrawn: 0, realizedPnl: 0 }

      if (tx.type === 'deposit') {
        existing.deposited += tx.valueUsd
      } else if (tx.type === 'claim') {
        // Claims are pure realized profit
        existing.withdrawn += tx.valueUsd
        existing.realizedPnl += tx.valueUsd
      } else {
        // Regular withdrawals count as withdrawn but not as realized P&L
        existing.withdrawn += tx.valueUsd
      }

      dateMap.set(tx.date, existing)
    }

    // Calculate cumulative time series for charting (with all days filled in)
    const cumulativeRealized: Array<{
      date: string
      cumulativeDeposited: number
      cumulativeWithdrawn: number
      cumulativeRealized: number
      cumulativeRealizedPnl: number
    }> = []

    // Use today's date as the end date for charts
    const today = new Date().toISOString().split('T')[0]

    if (data.firstActivityDate) {
      const allDates = getAllDatesBetween(data.firstActivityDate, today)
      let cumDeposited = 0
      let cumWithdrawn = 0
      let cumRealizedPnl = 0

      for (const date of allDates) {
        const dayData = dateMap.get(date)
        if (dayData) {
          cumDeposited += dayData.deposited
          cumWithdrawn += dayData.withdrawn
          cumRealizedPnl += dayData.realizedPnl
        }

        cumulativeRealized.push({
          date,
          cumulativeDeposited: cumDeposited,
          cumulativeWithdrawn: cumWithdrawn,
          cumulativeRealized: cumWithdrawn - cumDeposited,
          cumulativeRealizedPnl: cumRealizedPnl,
        })
      }
    }

    // Calculate per-source cumulative time series
    const poolsDateMap = new Map<string, { deposited: number; withdrawn: number; realizedPnl: number }>()
    const backstopDateMap = new Map<string, { deposited: number; withdrawn: number; realizedPnl: number }>()

    for (const tx of data.transactions) {
      const targetMap = tx.source === 'pool' ? poolsDateMap : backstopDateMap
      const existing = targetMap.get(tx.date) || { deposited: 0, withdrawn: 0, realizedPnl: 0 }

      if (tx.type === 'deposit') {
        existing.deposited += tx.valueUsd
      } else if (tx.type === 'claim') {
        existing.withdrawn += tx.valueUsd
        existing.realizedPnl += tx.valueUsd
      } else {
        existing.withdrawn += tx.valueUsd
      }

      targetMap.set(tx.date, existing)
    }

    // Build pools cumulative series (with all days filled in)
    const poolsCumulative: Array<{ date: string; cumulativeDeposited: number; cumulativeWithdrawn: number; cumulativeRealizedPnl: number }> = []
    if (poolsDateMap.size > 0) {
      const poolsFirstDate = Array.from(poolsDateMap.keys()).sort()[0]
      const allDates = getAllDatesBetween(poolsFirstDate, today)
      let poolsCumDeposited = 0, poolsCumWithdrawn = 0, poolsCumRealizedPnl = 0

      for (const date of allDates) {
        const dayData = poolsDateMap.get(date)
        if (dayData) {
          poolsCumDeposited += dayData.deposited
          poolsCumWithdrawn += dayData.withdrawn
          poolsCumRealizedPnl += dayData.realizedPnl
        }
        poolsCumulative.push({
          date,
          cumulativeDeposited: poolsCumDeposited,
          cumulativeWithdrawn: poolsCumWithdrawn,
          cumulativeRealizedPnl: poolsCumRealizedPnl,
        })
      }
    }

    // Build backstop cumulative series (with all days filled in)
    const backstopCumulative: Array<{ date: string; cumulativeDeposited: number; cumulativeWithdrawn: number; cumulativeRealizedPnl: number }> = []
    if (backstopDateMap.size > 0) {
      const backstopFirstDate = Array.from(backstopDateMap.keys()).sort()[0]
      const allDates = getAllDatesBetween(backstopFirstDate, today)
      let backstopCumDeposited = 0, backstopCumWithdrawn = 0, backstopCumRealizedPnl = 0

      for (const date of allDates) {
        const dayData = backstopDateMap.get(date)
        if (dayData) {
          backstopCumDeposited += dayData.deposited
          backstopCumWithdrawn += dayData.withdrawn
          backstopCumRealizedPnl += dayData.realizedPnl
        }
        backstopCumulative.push({
          date,
          cumulativeDeposited: backstopCumDeposited,
          cumulativeWithdrawn: backstopCumWithdrawn,
          cumulativeRealizedPnl: backstopCumRealizedPnl,
        })
      }
    }

    // Build per-pool cumulative time series (for stacked bar chart)
    const poolDateMaps = new Map<string, {
      poolName: string | null
      lending: Map<string, number>
      backstop: Map<string, number>
    }>()

    for (const tx of data.transactions) {
      if (tx.type !== 'claim') continue // Only track claims/emissions for realized P&L

      let poolData = poolDateMaps.get(tx.poolId)
      if (!poolData) {
        poolData = {
          poolName: tx.poolName,
          lending: new Map(),
          backstop: new Map(),
        }
        poolDateMaps.set(tx.poolId, poolData)
      }

      const targetMap = tx.source === 'pool' ? poolData.lending : poolData.backstop
      const existing = targetMap.get(tx.date) || 0
      targetMap.set(tx.date, existing + tx.valueUsd)
    }

    // Build cumulative time series for each pool
    const cumulativeByPool: Array<{
      poolId: string
      poolName: string | null
      timeSeries: Array<{
        date: string
        lendingRealizedPnl: number
        backstopRealizedPnl: number
      }>
    }> = []

    for (const [poolId, poolData] of poolDateMaps) {
      // Find first activity date for this pool
      const allDatesSet = new Set([...poolData.lending.keys(), ...poolData.backstop.keys()])
      if (allDatesSet.size === 0) continue

      const firstDate = Array.from(allDatesSet).sort()[0]
      const allDates = getAllDatesBetween(firstDate, today)

      let cumLending = 0
      let cumBackstop = 0
      const timeSeries: Array<{ date: string; lendingRealizedPnl: number; backstopRealizedPnl: number }> = []

      for (const date of allDates) {
        const lendingValue = poolData.lending.get(date) || 0
        const backstopValue = poolData.backstop.get(date) || 0
        cumLending += lendingValue
        cumBackstop += backstopValue

        timeSeries.push({
          date,
          lendingRealizedPnl: cumLending,
          backstopRealizedPnl: cumBackstop,
        })
      }

      cumulativeByPool.push({
        poolId,
        poolName: poolData.poolName,
        timeSeries,
      })
    }

    // Calculate ROI
    let roiPercent: number | null = null
    if (data.totalDepositedUsd > 0) {
      roiPercent = (data.realizedPnl / data.totalDepositedUsd) * 100
    }

    // Calculate annualized ROI
    let annualizedRoiPercent: number | null = null
    let daysActive = 0

    if (data.firstActivityDate && data.lastActivityDate) {
      const firstDate = new Date(data.firstActivityDate)
      const lastDate = new Date(data.lastActivityDate)
      daysActive = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)))

      if (roiPercent !== null && daysActive > 0) {
        // Annualize: (1 + ROI)^(365/days) - 1
        const roiDecimal = roiPercent / 100
        if (roiDecimal > -1) {
          annualizedRoiPercent = (Math.pow(1 + roiDecimal, 365 / daysActive) - 1) * 100
        }
      }
    }

    const response: RealizedYieldResponse = {
      totalDepositedUsd: data.totalDepositedUsd,
      totalWithdrawnUsd: data.totalWithdrawnUsd,
      realizedPnl: data.realizedPnl,
      pools: data.pools,
      backstop: data.backstop,
      emissions: data.emissions,
      roiPercent,
      annualizedRoiPercent,
      daysActive,
      firstActivityDate: data.firstActivityDate,
      lastActivityDate: data.lastActivityDate,
      cumulativeRealized,
      cumulativeBySource: {
        pools: poolsCumulative,
        backstop: backstopCumulative,
      },
      cumulativeByPool,
      transactions: data.transactions,
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch realized yield data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
