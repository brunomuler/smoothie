/**
 * Debug script to investigate why account can't display history data
 * Account: GDZZR6UBK5TWJ5AXFX74N442RLEAEERYUSP7JHMXAHUAMGEGZSC3ZAVT
 */

import { config } from 'dotenv'
import { Pool } from 'pg'

// Load .env file
config()

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

const ACCOUNT = 'GDZZR6UBK5TWJ5AXFX74N442RLEAEERYUSP7JHMXAHUAMGEGZSC3ZAVT'

async function debugAccount() {
  console.log('\n=== DEBUGGING ACCOUNT ===')
  console.log('Account:', ACCOUNT)
  console.log('========================\n')

  try {
    // 1. Check if account exists in user_positions table
    console.log('1. Checking if account has ANY records in user_positions...')
    const allRecordsResult = await pool.query(
      `SELECT COUNT(*) as count FROM user_positions WHERE user_address = $1`,
      [ACCOUNT]
    )
    console.log(`   Found ${allRecordsResult.rows[0].count} total records\n`)

    // 2. Check unique asset addresses for this account
    console.log('2. Checking unique asset addresses for this account...')
    const assetsResult = await pool.query(
      `SELECT DISTINCT asset_address, COUNT(*) as count
       FROM user_positions
       WHERE user_address = $1
       GROUP BY asset_address`,
      [ACCOUNT]
    )
    console.log(`   Found ${assetsResult.rows.length} unique assets:`)
    assetsResult.rows.forEach(row => {
      console.log(`   - ${row.asset_address} (${row.count} records)`)
    })
    console.log()

    // 3. Check unique pools for this account
    console.log('3. Checking unique pools for this account...')
    const poolsResult = await pool.query(
      `SELECT DISTINCT pool_id, asset_address, COUNT(*) as count
       FROM user_positions
       WHERE user_address = $1
       GROUP BY pool_id, asset_address`,
      [ACCOUNT]
    )
    console.log(`   Found ${poolsResult.rows.length} unique pool/asset combinations:`)
    poolsResult.rows.forEach(row => {
      console.log(`   - Pool: ${row.pool_id}, Asset: ${row.asset_address} (${row.count} records)`)
    })
    console.log()

    // 4. Check date range of records
    console.log('4. Checking date range of records...')
    const dateRangeResult = await pool.query(
      `SELECT
        MIN(snapshot_date)::text as earliest_date,
        MAX(snapshot_date)::text as latest_date,
        COUNT(DISTINCT snapshot_date) as unique_dates
       FROM user_positions
       WHERE user_address = $1`,
      [ACCOUNT]
    )
    if (dateRangeResult.rows[0].earliest_date) {
      console.log(`   Earliest: ${dateRangeResult.rows[0].earliest_date}`)
      console.log(`   Latest: ${dateRangeResult.rows[0].latest_date}`)
      console.log(`   Unique dates: ${dateRangeResult.rows[0].unique_dates}`)
    } else {
      console.log('   No date records found')
    }
    console.log()

    // 5. Sample records for each asset
    console.log('5. Sample records for each asset (most recent)...')
    for (const asset of assetsResult.rows) {
      console.log(`\n   Asset: ${asset.asset_address}`)
      const sampleResult = await pool.query(
        `SELECT
          snapshot_date::text,
          pool_id,
          supply_btokens,
          collateral_btokens,
          liabilities_dtokens,
          b_rate,
          d_rate
         FROM user_positions
         WHERE user_address = $1 AND asset_address = $2
         ORDER BY snapshot_date DESC, ledger_sequence DESC
         LIMIT 3`,
        [ACCOUNT, asset.asset_address]
      )
      sampleResult.rows.forEach((row, idx) => {
        console.log(`   ${idx + 1}. Date: ${row.snapshot_date}, Pool: ${row.pool_id}`)
        console.log(`      Supply: ${row.supply_btokens}, Collateral: ${row.collateral_btokens}, Debt: ${row.liabilities_dtokens}`)
        console.log(`      Rates - b_rate: ${row.b_rate}, d_rate: ${row.d_rate}`)
      })
    }
    console.log()

    // 6. Check pool_snapshots for each asset
    console.log('6. Checking pool_snapshots availability...')
    for (const asset of assetsResult.rows) {
      const poolSnapshotsResult = await pool.query(
        `SELECT COUNT(*) as count, MIN(snapshot_date)::text as earliest, MAX(snapshot_date)::text as latest
         FROM pool_snapshots
         WHERE asset_address = $1`,
        [asset.asset_address]
      )
      console.log(`   Asset ${asset.asset_address}:`)
      console.log(`      Pool snapshots: ${poolSnapshotsResult.rows[0].count}`)
      if (poolSnapshotsResult.rows[0].count > 0) {
        console.log(`      Date range: ${poolSnapshotsResult.rows[0].earliest} to ${poolSnapshotsResult.rows[0].latest}`)
      }
    }
    console.log()

    // 7. Test the actual query for one asset
    if (assetsResult.rows.length > 0) {
      const testAsset = assetsResult.rows[0].asset_address
      console.log('7. Testing actual getUserBalanceHistory query...')
      console.log(`   Using asset: ${testAsset}`)
      console.log(`   Days: 30\n`)

      // First event date query
      const firstEventResult = await pool.query(
        `SELECT MIN(snapshot_date)::text AS first_event_date
         FROM user_positions
         WHERE user_address = $1 AND asset_address = $2`,
        [ACCOUNT, testAsset]
      )
      console.log(`   First event date: ${firstEventResult.rows[0]?.first_event_date || 'null'}`)

      // Main query (simplified to check user_pools CTE)
      const userPoolsResult = await pool.query(
        `SELECT DISTINCT pool_id
         FROM user_positions
         WHERE user_address = $1 AND asset_address = $2`,
        [ACCOUNT, testAsset]
      )
      console.log(`   User pools found: ${userPoolsResult.rows.length}`)
      userPoolsResult.rows.forEach(row => {
        console.log(`      - ${row.pool_id}`)
      })
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

debugAccount()
