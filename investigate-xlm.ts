/**
 * Investigate why there are two different XLM asset addresses
 */

import { config } from 'dotenv'
import { Pool } from 'pg'

config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const ACCOUNT = 'GDZZR6UBK5TWJ5AXFX74N442RLEAEERYUSP7JHMXAHUAMGEGZSC3ZAVT'
const DB_XLM_ADDRESS = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
const CURRENT_XLM_ADDRESS = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'

async function investigate() {
  console.log('\n=== INVESTIGATING XLM ASSET ADDRESS MISMATCH ===\n')

  console.log('Database XLM Address:', DB_XLM_ADDRESS)
  console.log('Current Position XLM Address:', CURRENT_XLM_ADDRESS)
  console.log()

  // Check if the current address exists in DB at all
  console.log('1. Checking if current XLM address exists in database...')
  const currentInDb = await pool.query(
    'SELECT COUNT(*) as count FROM user_positions WHERE asset_address = $1',
    [CURRENT_XLM_ADDRESS]
  )
  console.log(`   Records with ${CURRENT_XLM_ADDRESS}: ${currentInDb.rows[0].count}`)

  const dbInDb = await pool.query(
    'SELECT COUNT(*) as count FROM user_positions WHERE asset_address = $1',
    [DB_XLM_ADDRESS]
  )
  console.log(`   Records with ${DB_XLM_ADDRESS}: ${dbInDb.rows[0].count}`)
  console.log()

  // Check pool snapshots
  console.log('2. Checking pool_snapshots for both addresses...')
  const currentSnapshots = await pool.query(
    'SELECT COUNT(*) as count FROM pool_snapshots WHERE asset_address = $1',
    [CURRENT_XLM_ADDRESS]
  )
  console.log(`   Snapshots with ${CURRENT_XLM_ADDRESS}: ${currentSnapshots.rows[0].count}`)

  const dbSnapshots = await pool.query(
    'SELECT COUNT(*) as count FROM pool_snapshots WHERE asset_address = $1',
    [DB_XLM_ADDRESS]
  )
  console.log(`   Snapshots with ${DB_XLM_ADDRESS}: ${dbSnapshots.rows[0].count}`)
  console.log()

  // Check which pools use which address
  console.log('3. Checking which pools use which XLM address...')
  console.log('\n   Pools using DB address:')
  const dbPools = await pool.query(
    'SELECT DISTINCT pool_id FROM user_positions WHERE asset_address = $1',
    [DB_XLM_ADDRESS]
  )
  dbPools.rows.forEach(row => console.log(`   - ${row.pool_id}`))

  console.log('\n   Pools using current address:')
  const currentPools = await pool.query(
    'SELECT DISTINCT pool_id FROM user_positions WHERE asset_address = $1',
    [CURRENT_XLM_ADDRESS]
  )
  if (currentPools.rows.length === 0) {
    console.log('   - (none)')
  } else {
    currentPools.rows.forEach(row => console.log(`   - ${row.pool_id}`))
  }
  console.log()

  // Check the position from the Blend snapshot
  console.log('4. Current position details:')
  console.log('   Pool ID: CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD')
  console.log('   Full Position ID: CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD-CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA')
  console.log()

  // Check if this pool exists in database
  console.log('5. Checking if current pool exists in database...')
  const poolInDb = await pool.query(
    `SELECT DISTINCT asset_address, COUNT(*) as count
     FROM user_positions
     WHERE pool_id = $1
     GROUP BY asset_address`,
    ['CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD']
  )
  console.log(`   Pool CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD has ${poolInDb.rows.length} asset(s):`)
  poolInDb.rows.forEach(row => {
    console.log(`   - ${row.asset_address} (${row.count} records)`)
  })

  await pool.end()
}

investigate().catch(console.error)
