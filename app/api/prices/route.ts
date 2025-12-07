/**
 * Prices API Route
 * Returns current USD prices for tokens
 */

import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import { TokenPrice, PricesResponse } from '@/types/explore'

// Mock prices (same as pricing service)
const MOCK_PRICES: Record<string, number> = {
  USDC: 1,
  XLM: 0.12,
  AQUA: 0.004,
  BLND: 0.25,
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const assetsParam = searchParams.get('assets')

    // Get all tokens from database
    const allTokens = await eventsRepository.getTokens()

    // Filter tokens if specific assets requested
    let tokens = allTokens
    if (assetsParam) {
      const requestedAssets = assetsParam.split(',')
      tokens = allTokens.filter(
        (t) => requestedAssets.includes(t.asset_address) || requestedAssets.includes(t.symbol)
      )
    }

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

    const response: PricesResponse = { prices }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // 5 min cache
      },
    })
  } catch (error) {
    console.error('[Prices API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
