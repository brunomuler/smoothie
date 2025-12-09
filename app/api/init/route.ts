/**
 * Init API Route
 * Returns metadata and prices in a single request to reduce initial load roundtrips
 */

import { NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'

// Price data type
interface TokenPrice {
  assetAddress: string
  symbol: string
  usd: number
  source: 'coingecko' | 'mock'
  timestamp: number
}

// Mock prices (same as pricing service)
const MOCK_PRICES: Record<string, number> = {
  USDC: 1,
  XLM: 0.12,
  AQUA: 0.004,
  BLND: 0.25,
}

export async function GET() {
  try {
    // Fetch pools, tokens, and build prices in parallel
    const [pools, tokens] = await Promise.all([
      eventsRepository.getPools(),
      eventsRepository.getTokens(),
    ])

    // Build prices from tokens
    const prices: Record<string, TokenPrice> = {}
    const timestamp = Date.now()

    for (const token of tokens) {
      const price = MOCK_PRICES[token.symbol.toUpperCase()] || 0
      prices[token.asset_address] = {
        assetAddress: token.asset_address,
        symbol: token.symbol,
        usd: price,
        source: 'mock',
        timestamp,
      }
    }

    return NextResponse.json(
      {
        pools,
        tokens,
        prices,
      },
      {
        headers: {
          // Cache for 5 minutes (prices update more frequently than metadata)
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    )
  } catch (error) {
    console.error('[Init API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
