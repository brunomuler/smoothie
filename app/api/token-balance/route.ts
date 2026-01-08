/**
 * Token Balance API Route
 *
 * Returns token balance for a given contract and user address.
 * This endpoint wraps Soroban RPC calls so demo wallet addresses stay server-side.
 */

import { NextRequest } from 'next/server'
import {
  Contract,
  Address,
  scValToNative,
  TransactionBuilder,
  BASE_FEE,
  Networks,
} from '@stellar/stellar-sdk'
import {
  createApiHandler,
  requireString,
  resolveWalletAddress,
  CACHE_CONFIGS,
} from '@/lib/api'
import { getSorobanRpc } from '@/lib/stellar/rpc'

interface TokenBalanceResponse {
  balance: string
}

export const GET = createApiHandler<TokenBalanceResponse>({
  logPrefix: '[Token Balance API]',
  cache: CACHE_CONFIGS.SHORT, // 1 minute cache

  async handler(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams

    // Get contract ID and resolve user parameter (handles demo wallet aliases)
    const contractId = requireString(searchParams, 'contractId')
    const userParam = requireString(searchParams, 'user')
    const userAddress = resolveWalletAddress(userParam)

    try {
      const rpc = getSorobanRpc()
      const contract = new Contract(contractId)

      // Get source account (we just need a valid account for simulation)
      const sourceAccount = await rpc.getAccount(userAddress)

      // Determine network
      const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet') as
        | 'testnet'
        | 'mainnet'
      const networkPassphrase =
        network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET

      // Build transaction from operation
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(
          contract.call('balance', Address.fromString(userAddress).toScVal())
        )
        .setTimeout(30)
        .build()

      // Simulate the balance query
      const simulation = await rpc.simulateTransaction(transaction)

      // Check if simulation was successful
      if (!simulation || 'error' in simulation) {
        return { balance: '0' }
      }

      // Access the result value - SDK v14 uses 'result' with retval
      const simResult = simulation as {
        result?: { retval?: unknown }
      }
      if (!simResult.result || !simResult.result.retval) {
        return { balance: '0' }
      }

      const balance = scValToNative(simResult.result.retval as Parameters<typeof scValToNative>[0])
      return { balance: balance.toString() }
    } catch (error) {
      console.error('[Token Balance API] Error fetching token balance:', error)
      return { balance: '0' }
    }
  },
})
