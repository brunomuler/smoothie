/**
 * Check if database has XLM data for this account
 */

import { config } from 'dotenv'
import { Pool } from 'pg'

config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const ACCOUNT = 'GDZZR6UBK5TWJ5AXFX74N442RLEAEERYUSP7JHMXAHUAMGEGZSC3ZAVT'
const XLM_ADDRESS = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'
const POOL_ID = 'CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD'

async function checkAccountXLMData() {
  console.log('\n=== CHECKING XLM DATA FOR ACCOUNT ===\n')
  console.log(`Account: ${ACCOUNT}`)
  console.log(`Pool: ${POOL_ID}`)
  console.log(`XLM Address: ${XLM_ADDRESS}`)
  console.log()

  try {
    // Check if ANY XLM data exists for this account with correct address
    const xlmData = await pool.query(`
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
    `, [ACCOUNT, XLM_ADDRESS])

    console.log(`1. XLM records with CORRECT address (${XLM_ADDRESS}):`)
    console.log(`   Total found: ${xlmData.rows.length}`)

    if (xlmData.rows.length > 0) {
      console.log('\n   Recent records:')
      xlmData.rows.forEach((row, idx) => {
        console.log(`   ${idx + 1}. ${row.snapshot_date}`)
        console.log(`      Pool: ${row.pool_id.substring(0, 12)}...`)
        console.log(`      Supply: ${row.supply_btokens}, Collateral: ${row.collateral_btokens}`)
        console.log(`      b_rate: ${row.b_rate}`)
      })
    } else {
      console.log('   ❌ NO XLM RECORDS FOUND WITH CORRECT ADDRESS')
    }
    console.log()

    // Check what data exists for this account (any asset)
    const anyData = await pool.query(`
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

    console.log('2. ALL data for this account:')
    anyData.rows.forEach((row, idx) => {
      let label = row.asset_address.substring(0, 12) + '...'
      if (row.asset_address === XLM_ADDRESS) label += ' (✅ XLM CORRECT)'
      else if (row.asset_address.startsWith('CCW67')) label += ' (❌ USDC or OLD BUG)'

      console.log(`   ${idx + 1}. ${label}`)
      console.log(`      Pool: ${row.pool_id.substring(0, 12)}...`)
      console.log(`      Records: ${row.count}`)
      console.log(`      Date range: ${row.earliest} to ${row.latest}`)
    })
    console.log()

    // Check if backfill ran for this pool/asset combination
    console.log('3. Checking if this pool/asset was backfilled recently:')
    const poolAssetData = await pool.query(`
      SELECT
        COUNT(*) as count,
        MIN(snapshot_date)::text as earliest,
        MAX(snapshot_date)::text as latest
      FROM user_positions
      WHERE pool_id = $1
        AND asset_address = $2
    `, [POOL_ID, XLM_ADDRESS])

    console.log(`   Pool ${POOL_ID.substring(0, 12)}...`)
    console.log(`   Asset ${XLM_ADDRESS.substring(0, 12)}...`)
    console.log(`   Total records: ${poolAssetData.rows[0].count}`)
    console.log(`   Date range: ${poolAssetData.rows[0].earliest || 'N/A'} to ${poolAssetData.rows[0].latest || 'N/A'}`)
    console.log()

    // Diagnosis
    console.log('=== DIAGNOSIS ===')
    if (xlmData.rows.length > 0) {
      console.log('✅ XLM data exists with correct address for this account')
      console.log('   The issue may be in how Smoothie is querying the data')
    } else if (poolAssetData.rows[0].count > 0) {
      console.log('⚠️  XLM data exists for this pool/asset, but NOT for this specific account')
      console.log('   This account may not have had XLM positions during the backfilled date range')
      console.log(`   Backfilled range: ${poolAssetData.rows[0].earliest} to ${poolAssetData.rows[0].latest}`)
      console.log('   Account only has positions from: 2025-08-30 to 2025-09-16')
      console.log()
      console.log('   SOLUTION: Re-backfill Aug-Sep 2025 with the fixed code:')
      console.log('   cd backfill_backend')
      console.log('   npm run backfill -- --startDate=2025-08-20 --endDate=2025-10-01 --yes')
    } else {
      console.log('❌ No XLM data exists in database for this pool/asset combination')
      console.log('   The backfill may not have processed XLM correctly')
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

checkAccountXLMData()
