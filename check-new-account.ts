/**
 * Check account GBQD7ZCKHYS3QMBDSQ37KT4GL2H37KJSPGRL3LWZMIWBQDFQXIXGBB63
 */

import { fetchWalletBlendSnapshot } from './lib/blend/positions'
import { config } from 'dotenv'
import { Pool } from 'pg'

config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const ACCOUNT = 'GBQD7ZCKHYS3QMBDSQ37KT4GL2H37KJSPGRL3LWZMIWBQDFQXIXGBB63'
const XLM_ADDRESS = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'

async function checkAccount() {
  console.log('\n=== CHECKING ACCOUNT ===')
  console.log(`Account: ${ACCOUNT}\n`)

  try {
    // Check current positions
    console.log('1. Current Blend Positions:')
    const snapshot = await fetchWalletBlendSnapshot(ACCOUNT)
    console.log(`   Total positions: ${snapshot.positions.length}`)

    snapshot.positions.forEach((pos, idx) => {
      console.log(`   ${idx + 1}. ${pos.symbol} (${pos.poolName})`)
      console.log(`      Asset ID: ${pos.assetId}`)
      console.log(`      Supply: ${pos.supplyAmount}`)
      console.log(`      Collateral: ${pos.collateralAmount || 0}`)
    })
    console.log()

    // Check database records
    console.log('2. Database Records:')
    const dbRecords = await pool.query(`
      SELECT
        asset_address,
        pool_id,
        COUNT(*) as count,
        MIN(snapshot_date)::text as earliest,
        MAX(snapshot_date)::text as latest
      FROM user_positions
      WHERE user_address = $1
      GROUP BY asset_address, pool_id
      ORDER BY latest DESC
    `, [ACCOUNT])

    console.log(`   Total groups: ${dbRecords.rows.length}`)
    dbRecords.rows.forEach((row, idx) => {
      let label = row.asset_address.substring(0, 12) + '...'
      if (row.asset_address === XLM_ADDRESS) label += ' (✅ XLM CORRECT)'
      else if (row.asset_address.startsWith('CCW67')) label += ' (USDC)'

      console.log(`   ${idx + 1}. ${label}`)
      console.log(`      Pool: ${row.pool_id.substring(0, 12)}...`)
      console.log(`      Records: ${row.count}`)
      console.log(`      Date range: ${row.earliest} to ${row.latest}`)
    })
    console.log()

    // Check if XLM data exists with correct address
    const xlmData = await pool.query(`
      SELECT COUNT(*) as count
      FROM user_positions
      WHERE user_address = $1
        AND asset_address = $2
    `, [ACCOUNT, XLM_ADDRESS])

    console.log('3. XLM Data Check:')
    console.log(`   Records with correct XLM address: ${xlmData.rows[0].count}`)

    if (xlmData.rows[0].count > 0) {
      console.log('   ✅ XLM data exists!')
    } else {
      console.log('   ❌ No XLM data with correct address')
      if (dbRecords.rows.length > 0) {
        console.log('   This account has data, but needs re-backfill for date range:')
        console.log(`   ${dbRecords.rows[0].earliest} to ${dbRecords.rows[0].latest}`)
      } else {
        console.log('   This account has no data in database at all')
        console.log('   Need to backfill for this account')
      }
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

checkAccount()
