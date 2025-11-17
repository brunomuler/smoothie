/**
 * Compare asset addresses: Blend SDK vs Database
 * This script checks which assets the Blend SDK returns for each pool
 * and compares them to what's actually stored in the database
 */

import { config } from 'dotenv'
import { Pool as PgPool } from 'pg'
import { getBlendNetwork } from './lib/blend/network'
import { TRACKED_POOLS } from './lib/blend/pools'
import { PoolMetadata, PoolV1, PoolV2, Version, TokenMetadata } from '@blend-capital/blend-sdk'

config()

const pool = new PgPool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
})

async function compareAssets() {
  console.log('\n=== COMPARING BLEND SDK vs DATABASE ASSET ADDRESSES ===\n')

  const network = getBlendNetwork()

  for (const trackedPool of TRACKED_POOLS) {
    console.log(`\nPool: ${trackedPool.name} (${trackedPool.id})`)
    console.log('='.repeat(80))

    try {
      // Load pool from Blend SDK
      const metadata = await PoolMetadata.load(network, trackedPool.id)
      const poolInstance = trackedPool.version === Version.V2
        ? await PoolV2.loadWithMetadata(network, trackedPool.id, metadata)
        : await PoolV1.loadWithMetadata(network, trackedPool.id, metadata)

      const reserves = Array.from(poolInstance.reserves.values())

      console.log(`\nBlend SDK reports ${reserves.length} reserves:`)

      for (const reserve of reserves) {
        try {
          const tokenMetadata = await TokenMetadata.load(network, reserve.assetId)
          console.log(`\n  ${tokenMetadata.symbol} (${tokenMetadata.name})`)
          console.log(`    Asset ID: ${reserve.assetId}`)

          // Check if this asset exists in database for this pool
          const dbResult = await pool.query(
            `SELECT COUNT(*) as count FROM user_positions WHERE pool_id = $1 AND asset_address = $2`,
            [trackedPool.id, reserve.assetId]
          )
          console.log(`    Database records with this address: ${dbResult.rows[0].count}`)

          // Check if there are any records for this pool with different asset addresses
          const otherAssets = await pool.query(
            `SELECT DISTINCT asset_address, COUNT(*) as count
             FROM user_positions
             WHERE pool_id = $1 AND asset_address != $2
             GROUP BY asset_address`,
            [trackedPool.id, reserve.assetId]
          )

          if (otherAssets.rows.length > 0) {
            console.log(`    ⚠️  WARNING: Database has OTHER asset addresses for this pool:`)
            for (const row of otherAssets.rows) {
              console.log(`       - ${row.asset_address} (${row.count} records)`)
            }
          }
        } catch (error) {
          console.log(`    Error loading token metadata: ${(error as Error).message}`)
        }
      }

      // Check for orphaned assets in database (assets in DB but not in SDK)
      const allDbAssets = await pool.query(
        `SELECT DISTINCT asset_address, COUNT(*) as count
         FROM user_positions
         WHERE pool_id = $1
         GROUP BY asset_address`,
        [trackedPool.id]
      )

      const sdkAssetIds = new Set(reserves.map(r => r.assetId))
      const orphanedAssets = allDbAssets.rows.filter(row => !sdkAssetIds.has(row.asset_address))

      if (orphanedAssets.length > 0) {
        console.log(`\n  ⚠️  ORPHANED ASSETS (in DB but not in current SDK):`)
        for (const row of orphanedAssets) {
          console.log(`    - ${row.asset_address} (${row.count} records)`)
        }
      }

    } catch (error) {
      console.log(`  Error loading pool: ${(error as Error).message}`)
    }
  }

  await pool.end()
}

compareAssets().catch(console.error)
