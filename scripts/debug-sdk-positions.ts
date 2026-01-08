/**
 * Debug script to directly query SDK positions for a wallet
 * This bypasses all caching and hooks to see raw on-chain data
 *
 * Run with: npx tsx scripts/debug-sdk-positions.ts
 */

import { config } from 'dotenv'
import {
  Pool,
  PoolMetadata,
  PoolV2,
  Version
} from '@blend-capital/blend-sdk'

import { Networks } from '@stellar/stellar-sdk'

// Load environment variables
config({ path: '.env.local' })
config({ path: '.env' })

// The problematic wallets
const WALLET_A = 'GCA5FO3FLUVS2MOPVECPVQ6V3J5YSSQBL2ANPDYHIHRBSPPX5TLIMSX6'
const WALLET_B = 'GDD7N6ACZHGW2ELKV267HLGYBPWOLW3R3RDP4CWOTVZQHOVNVBOKPT4J'

// YieldBlox pool
const YIELDBLOX_POOL = 'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS'

// USDC contract address (from parsed_events)
const USDC_ASSET = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'

async function main() {
  console.log('\n=== SDK Direct Position Query ===\n')

  // Get network config - same as lib/blend/network.ts
  const networkType = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet') as 'testnet' | 'public'
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ||
    (networkType === 'public' ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org')
  const passphrase = networkType === 'public' ? Networks.PUBLIC : Networks.TESTNET

  const network = {
    rpc: rpcUrl,
    passphrase,
  }

  console.log('RPC URL:', rpcUrl)
  console.log('Pool ID:', YIELDBLOX_POOL)
  console.log('USDC Asset:', USDC_ASSET)
  console.log('')

  try {
    // Load pool metadata and pool instance
    console.log('Loading pool metadata...')
    const metadata = await PoolMetadata.load(network, YIELDBLOX_POOL)
    console.log('Pool name:', metadata.name)

    console.log('\nLoading pool instance...')
    const pool = await PoolV2.loadWithMetadata(network, YIELDBLOX_POOL, metadata)
    console.log('Pool reserves count:', pool.reserves.size)

    // List all reserves
    console.log('\n=== Pool Reserves ===')
    for (const [assetId, reserve] of pool.reserves) {
      const symbol = assetId.endsWith('O7SJMI75') ? 'USDC' :
                     assetId.endsWith('H34XOWMA') ? 'XLM' :
                     assetId.slice(-8)
      console.log(`- ${symbol}: ${assetId.slice(0, 8)}...${assetId.slice(-8)}`)
    }

    // Check if USDC reserve exists
    const usdcReserve = pool.reserves.get(USDC_ASSET)
    if (!usdcReserve) {
      console.log('\n⚠️ USDC reserve NOT FOUND in pool!')
      console.log('Available reserves:', Array.from(pool.reserves.keys()).map(k => k.slice(-8)))
    } else {
      console.log('\n✓ USDC reserve found in pool')
    }

    // Query positions for both wallets
    for (const [name, wallet] of [['Wallet A', WALLET_A], ['Wallet B', WALLET_B]] as const) {
      console.log(`\n=== ${name} (${wallet.slice(0, 12)}...) ===`)

      try {
        const user = await pool.loadUser(wallet)

        if (!user) {
          console.log('No user data returned (null)')
          continue
        }

        console.log('User positions loaded')
        console.log('User position count:', user.positions?.supply?.size ?? 0, 'supply,',
                    user.positions?.collateral?.size ?? 0, 'collateral,',
                    user.positions?.liabilities?.size ?? 0, 'liabilities')

        // Check USDC reserve specifically
        if (usdcReserve) {
          const supplyBTokens = user.getSupplyBTokens(usdcReserve)
          const collateralBTokens = user.getCollateralBTokens(usdcReserve)
          const liabilityDTokens = user.getLiabilityDTokens(usdcReserve)

          const supplyFloat = user.getSupplyFloat(usdcReserve)
          const collateralFloat = user.getCollateralFloat(usdcReserve)
          const liabilitiesFloat = user.getLiabilitiesFloat(usdcReserve)

          console.log('\nUSDC Position:')
          console.log(`  Supply bTokens: ${supplyBTokens.toString()}`)
          console.log(`  Collateral bTokens: ${collateralBTokens.toString()}`)
          console.log(`  Liability dTokens: ${liabilityDTokens.toString()}`)
          console.log(`  Supply (float): ${supplyFloat.toFixed(2)} USDC`)
          console.log(`  Collateral (float): ${collateralFloat.toFixed(2)} USDC`)
          console.log(`  Liabilities (float): ${liabilitiesFloat.toFixed(2)} USDC`)
          console.log(`  Total supply: ${(supplyFloat + collateralFloat).toFixed(2)} USDC`)

          if (supplyFloat === 0 && collateralFloat === 0) {
            console.log('\n  ⚠️ NO USDC SUPPLY POSITION ON-CHAIN!')
          }
        }

        // List all non-zero positions
        console.log('\nAll positions with balances:')
        for (const [assetId, reserve] of pool.reserves) {
          const supply = user.getSupplyFloat(reserve)
          const collateral = user.getCollateralFloat(reserve)
          const total = supply + collateral
          if (total > 0) {
            const symbol = assetId.endsWith('O7SJMI75') ? 'USDC' :
                           assetId.endsWith('H34XOWMA') ? 'XLM' :
                           assetId.slice(-8)
            console.log(`  ${symbol}: ${total.toFixed(2)} (supply=${supply.toFixed(2)}, collateral=${collateral.toFixed(2)})`)
          }
        }

      } catch (err) {
        console.log('Error loading user:', (err as Error).message)
      }
    }

  } catch (err) {
    console.error('Error:', err)
  }
}

main().catch(console.error)
