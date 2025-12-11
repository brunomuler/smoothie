import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userAddress = searchParams.get('user')

  if (!userAddress) {
    return NextResponse.json(
      { error: 'Missing user address parameter' },
      { status: 400 }
    )
  }

  try {
    // Fetch both pool claims (from parsed_events) and backstop claims (from backstop_events)
    const [poolClaims, backstopClaims] = await Promise.all([
      eventsRepository.getClaimedBlndFromPools(userAddress),
      eventsRepository.getClaimedEmissionsPerPool(userAddress),
    ])

    return NextResponse.json({
      // BLND claimed from supply/borrow positions (actual BLND tokens)
      pool_claims: poolClaims,
      // LP tokens received from claiming backstop emissions
      // These auto-compound to LP, so we return the LP amount
      // To convert to BLND, multiply by blndPerLpToken from the SDK
      backstop_claims: backstopClaims,
    })
  } catch (error) {
    console.error('[API claimed-blnd] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch claimed BLND data' },
      { status: 500 }
    )
  }
}
