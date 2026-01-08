/**
 * Debug script to analyze multi-wallet yield calculation issue
 * Focus on the problematic USDC asset in YieldBlox pool
 *
 * Run with: npx tsx scripts/debug-multi-wallet.ts
 */

import { config } from 'dotenv'
import { Pool } from 'pg'

// Load environment variables
config({ path: '.env.local' })
config({ path: '.env' })

// Create pool directly
function createPool() {
  const connString = process.env.SMOOTHIE_DATABASE_URL || process.env.DATABASE_URL
  return new Pool({ connectionString: connString })
}

const WALLET_A = 'GCA5FO3FLUVS2MOPVECPVQ6V3J5YSSQBL2ANPDYHIHRBSPPX5TLIMSX6'
const WALLET_B = 'GDD7N6ACZHGW2ELKV267HLGYBPWOLW3R3RDP4CWOTVZQHOVNVBOKPT4J'

// The problematic pool-asset from the logs:
// Pool: starts with CCCCIQSD (YieldBlox)
// Asset: ends with O7SJMI75 (USDC)
const YIELDBLOX_POOL = 'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS'

async function main() {
  const pool = createPool()

  console.log('\n=== USDC in YieldBlox Pool Analysis ===\n')

  // Query for both wallets, focusing on the problematic pool
  for (const [name, wallet] of [['Wallet A (Freighter)', WALLET_A], ['Wallet B (Watch)', WALLET_B]] as const) {
    const result = await pool.query(`
      SELECT
        asset_address,
        action_type,
        SUM(amount_underlying / 1e7) as total_tokens,
        COUNT(*) as event_count
      FROM parsed_events
      WHERE user_address = $1
        AND pool_id = $2
        AND action_type IN ('supply', 'supply_collateral', 'withdraw', 'withdraw_collateral')
      GROUP BY asset_address, action_type
      ORDER BY asset_address, action_type
    `, [wallet, YIELDBLOX_POOL])

    console.log(`${name} (${wallet.slice(0, 12)}...):`)

    // Group by asset
    const byAsset = new Map<string, { deposits: number; withdrawals: number }>()
    for (const row of result.rows) {
      const key = row.asset_address.slice(-12)
      if (!byAsset.has(key)) {
        byAsset.set(key, { deposits: 0, withdrawals: 0 })
      }
      const entry = byAsset.get(key)!
      const tokens = parseFloat(row.total_tokens)
      if (row.action_type === 'supply' || row.action_type === 'supply_collateral') {
        entry.deposits += tokens
      } else {
        entry.withdrawals += tokens
      }
    }

    for (const [asset, data] of byAsset) {
      console.log(`  ...${asset}: Deposits=${data.deposits.toFixed(2)}, Withdrawals=${data.withdrawals.toFixed(2)}, Net=${(data.deposits - data.withdrawals).toFixed(2)}`)
    }
    console.log('')
  }

  // Combined totals
  console.log('=== COMBINED TOTALS ===\n')

  const combined = await pool.query(`
    SELECT
      asset_address,
      action_type,
      SUM(amount_underlying / 1e7) as total_tokens,
      COUNT(*) as event_count
    FROM parsed_events
    WHERE user_address = ANY($1)
      AND pool_id = $2
      AND action_type IN ('supply', 'supply_collateral', 'withdraw', 'withdraw_collateral')
    GROUP BY asset_address, action_type
    ORDER BY asset_address, action_type
  `, [[WALLET_A, WALLET_B], YIELDBLOX_POOL])

  const byAsset = new Map<string, { deposits: number; withdrawals: number }>()
  for (const row of combined.rows) {
    const key = row.asset_address.slice(-12)
    if (!byAsset.has(key)) {
      byAsset.set(key, { deposits: 0, withdrawals: 0 })
    }
    const entry = byAsset.get(key)!
    const tokens = parseFloat(row.total_tokens)
    if (row.action_type === 'supply' || row.action_type === 'supply_collateral') {
      entry.deposits += tokens
    } else {
      entry.withdrawals += tokens
    }
  }

  for (const [asset, data] of byAsset) {
    const netDeposited = data.deposits - data.withdrawals
    console.log(`...${asset}:`)
    console.log(`  Total Deposits:    ${data.deposits.toFixed(2)}`)
    console.log(`  Total Withdrawals: ${data.withdrawals.toFixed(2)}`)
    console.log(`  Net Deposited:     ${netDeposited.toFixed(2)}`)

    // Compare with the API's reported value if this is the USDC asset
    if (asset.endsWith('O7SJMI75')) {
      console.log('\n  >>> USDC COMPARISON <<<')
      console.log(`  API reports netDepositedTokens: 198704.50`)
      console.log(`  DB shows netDepositedTokens:    ${netDeposited.toFixed(2)}`)
      console.log(`  SDK shows currentTokens:        168707.12`)
      if (Math.abs(netDeposited - 198704.5) > 1) {
        console.log(`  \n  ⚠️  MISMATCH! DB net deposited != API net deposited`)
      }
    }
    console.log('')
  }

  // Detail check: List all Wallet A USDC events to see when the last event was
  console.log('\n=== WALLET A USDC EVENTS DETAIL ===\n')

  const walletAEvents = await pool.query(`
    SELECT
      action_type,
      ledger_closed_at::timestamp as event_time,
      amount_underlying / 1e7 as tokens
    FROM parsed_events
    WHERE user_address = $1
      AND pool_id = $2
      AND asset_address LIKE '%O7SJMI75'
    ORDER BY ledger_closed_at DESC
    LIMIT 20
  `, [WALLET_A, YIELDBLOX_POOL])

  console.log('Most recent Wallet A USDC events:')
  for (const row of walletAEvents.rows) {
    console.log(`${row.event_time}: ${row.action_type} ${parseFloat(row.tokens).toFixed(4)} tokens`)
  }
  console.log(`\nTotal Wallet A USDC events: ${walletAEvents.rows.length}`)

  // Detail check: List all Wallet B events for the USDC asset
  console.log('\n=== WALLET B USDC EVENTS DETAIL ===\n')

  const walletBEvents = await pool.query(`
    SELECT
      action_type,
      ledger_closed_at::timestamp as event_time,
      amount_underlying / 1e7 as tokens
    FROM parsed_events
    WHERE user_address = $1
      AND pool_id = $2
      AND asset_address LIKE '%O7SJMI75'
    ORDER BY ledger_closed_at
  `, [WALLET_B, YIELDBLOX_POOL])

  for (const row of walletBEvents.rows) {
    console.log(`${row.event_time}: ${row.action_type} ${parseFloat(row.tokens).toFixed(4)} tokens`)
  }
  console.log(`\nTotal events: ${walletBEvents.rows.length}`)

  // Check for ANY events for Wallet B in YieldBlox (including liquidations, etc.)
  console.log('\n=== ALL WALLET B EVENTS IN YIELDBLOX (any action type) ===\n')

  const allWalletBEvents = await pool.query(`
    SELECT
      action_type,
      asset_address,
      ledger_closed_at::timestamp as event_time,
      COALESCE(amount_underlying / 1e7, 0) as underlying_tokens,
      COALESCE(amount_tokens / 1e7, 0) as btokens
    FROM parsed_events
    WHERE user_address = $1
      AND pool_id = $2
    ORDER BY ledger_closed_at
  `, [WALLET_B, YIELDBLOX_POOL])

  const actionCounts = new Map<string, number>()
  for (const row of allWalletBEvents.rows) {
    const key = row.action_type
    actionCounts.set(key, (actionCounts.get(key) || 0) + 1)
    // Show if it's something other than supply/withdraw
    if (!['supply', 'supply_collateral', 'withdraw', 'withdraw_collateral'].includes(row.action_type)) {
      console.log(`${row.event_time}: ${row.action_type} asset=${row.asset_address?.slice(-8)} underlying=${parseFloat(row.underlying_tokens).toFixed(2)} btokens=${parseFloat(row.btokens).toFixed(2)}`)
    }
  }
  console.log('\nAction type counts:')
  for (const [action, count] of actionCounts) {
    console.log(`  ${action}: ${count}`)
  }

  await pool.end()
}

main().catch(console.error)
