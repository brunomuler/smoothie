/**
 * Account API Route
 *
 * Returns Horizon account data for a given address.
 * This endpoint wraps Horizon SDK calls so demo wallet addresses stay server-side.
 */

import { NextRequest } from 'next/server'
import {
  createApiHandler,
  requireString,
  resolveWalletAddress,
  CACHE_CONFIGS,
} from '@/lib/api'
import { getHorizonServer } from '@/lib/stellar/horizon'

// Simplified account response - only what the frontend needs
interface AccountResponse {
  exists: boolean
  id?: string
  sequence?: string
  balances?: Array<{
    asset_type: string
    asset_code?: string
    asset_issuer?: string
    balance: string
  }>
  subentry_count?: number
  num_sponsoring?: number
  num_sponsored?: number
}

export const GET = createApiHandler<AccountResponse>({
  logPrefix: '[Account API]',
  cache: CACHE_CONFIGS.SHORT, // 1 minute cache

  async handler(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams

    // Get and resolve the user parameter (handles demo wallet aliases)
    const userParam = requireString(searchParams, 'user')
    const userAddress = resolveWalletAddress(userParam)

    try {
      const server = getHorizonServer()
      const account = await server.loadAccount(userAddress)

      return {
        exists: true,
        id: account.id,
        sequence: account.sequence,
        balances: account.balances.map((b) => ({
          asset_type: b.asset_type,
          asset_code: 'asset_code' in b ? b.asset_code : undefined,
          asset_issuer: 'asset_issuer' in b ? b.asset_issuer : undefined,
          balance: b.balance,
        })),
        subentry_count: account.subentry_count,
        num_sponsoring: account.num_sponsoring,
        num_sponsored: account.num_sponsored,
      }
    } catch (error: unknown) {
      // Account doesn't exist yet (not funded)
      if (
        error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        return {
          exists: false,
        }
      }
      // Re-throw other errors
      throw error
    }
  },
})
