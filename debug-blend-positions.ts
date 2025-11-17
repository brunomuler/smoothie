/**
 * Debug what Blend SDK returns for account GBQD7ZCKHYS3QMBDSQ37KT4GL2H37KJSPGRL3LWZMIWBQDFQXIXGBB63
 */

import { fetchWalletBlendSnapshot } from './lib/blend/positions'

const ACCOUNT = 'GBQD7ZCKHYS3QMBDSQ37KT4GL2H37KJSPGRL3LWZMIWBQDFQXIXGBB63'

async function debugPositions() {
  console.log('\n=== DEBUGGING BLEND SDK POSITIONS ===\n')
  console.log(`Account: ${ACCOUNT}\n`)

  try {
    const snapshot = await fetchWalletBlendSnapshot(ACCOUNT)

    console.log(`Total positions: ${snapshot.positions.length}`)
    console.log()

    snapshot.positions.forEach((pos, idx) => {
      console.log(`Position ${idx + 1}:`)
      console.log(`  Symbol: ${pos.symbol}`)
      console.log(`  Asset ID: ${pos.assetId}`)
      console.log(`  Pool: ${pos.poolName}`)
      console.log(`  Supply Amount: ${pos.supplyAmount}`)
      console.log(`  Collateral (bTokens): ${pos.bTokens}`)
      console.log(`  b_rate: ${pos.bRate}`)
      console.log()
    })

  } catch (error) {
    console.error('Error:', error)
  }
}

debugPositions()
