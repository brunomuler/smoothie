/**
 * Check USDC history data for account GBQD7ZCKHYS3QMBDSQ37KT4GL2H37KJSPGRL3LWZMIWBQDFQXIXGBB63
 */

import { config } from 'dotenv'
import { Pool } from 'pg'

config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const ACCOUNT = 'GBQD7ZCKHYS3QMBDSQ37KT4GL2H37KJSPGRL3LWZMIWBQDFQXIXGBB63'
const USDC_ADDRESS = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'

async function checkUSDCHistory() {
  console.log('\n=== CHECKING USDC HISTORY FOR ACCOUNT ===\n')
  console.log(`Account: ${ACCOUNT}`)
  console.log(`USDC Address: ${USDC_ADDRESS}`)
  console.log()

  try {
    // Check if ANY USDC data exists for this account
    const usdcData = await pool.query(`
      SELECT
        snapshot_date::text,
        pool_id,
        supply_btokens,
        collateral_btokens,
        liabilities_dtokens,
        b_rate
      FROM user_positions
      WHERE user_address = $1
        AND asset_address = $2
      ORDER BY snapshot_date DESC
      LIMIT 10
    `, [ACCOUNT, USDC_ADDRESS])

    console.log(`1. USDC records found: ${usdcData.rows.length}`)

    if (usdcData.rows.length > 0) {
      console.log('\n   Recent USDC records:')
      usdcData.rows.forEach((row, idx) => {
        console.log(`   ${idx + 1}. ${row.snapshot_date}`)
        console.log(`      Pool: ${row.pool_id.substring(0, 12)}...`)
        console.log(`      Supply: ${row.supply_btokens}, Collateral: ${row.collateral_btokens}`)
        console.log(`      b_rate: ${row.b_rate}`)
      })
    } else {
      console.log('   ❌ NO USDC RECORDS FOUND')
    }
    console.log()

    // Check total date range for USDC
    const dateRange = await pool.query(`
      SELECT
        COUNT(*) as count,
        MIN(snapshot_date)::text as earliest,
        MAX(snapshot_date)::text as latest
      FROM user_positions
      WHERE user_address = $1
        AND asset_address = $2
    `, [ACCOUNT, USDC_ADDRESS])

    console.log('2. USDC date range:')
    console.log(`   Total records: ${dateRange.rows[0].count}`)
    console.log(`   Date range: ${dateRange.rows[0].earliest || 'N/A'} to ${dateRange.rows[0].latest || 'N/A'}`)
    console.log()

    // Check what other data exists for this account
    const allAssets = await pool.query(`
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

    console.log('3. ALL assets for this account:')
    allAssets.rows.forEach((row, idx) => {
      let label = row.asset_address.substring(0, 12) + '...'
      if (row.asset_address === USDC_ADDRESS) label += ' (USDC)'
      else if (row.asset_address.startsWith('CAS3J7')) label += ' (XLM)'

      console.log(`   ${idx + 1}. ${label}`)
      console.log(`      Pool: ${row.pool_id.substring(0, 12)}...`)
      console.log(`      Records: ${row.count}`)
      console.log(`      Date range: ${row.earliest} to ${row.latest}`)
    })
    console.log()

    // Diagnosis
    console.log('=== DIAGNOSIS ===')
    if (usdcData.rows.length > 0) {
      console.log('✅ USDC data exists in database')
      console.log('   The issue must be in the API or frontend')
      console.log('   Next: Check the API endpoint response')
    } else {
      console.log('❌ NO USDC data in database for this account')
      console.log('   This account needs to be backfilled')
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

checkUSDCHistory()
