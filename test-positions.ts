/**
 * Test script to check current Blend positions for the account
 */

import { fetchWalletBlendSnapshot } from './lib/blend/positions'

const ACCOUNT = 'GDZZR6UBK5TWJ5AXFX74N442RLEAEERYUSP7JHMXAHUAMGEGZSC3ZAVT'

async function testPositions() {
  console.log('\n=== CHECKING CURRENT BLEND POSITIONS ===')
  console.log('Account:', ACCOUNT)
  console.log('========================================\n')

  try {
    const snapshot = await fetchWalletBlendSnapshot(ACCOUNT)

    console.log('Total Positions:', snapshot.positions.length)
    console.log('\nAll Positions:')
    snapshot.positions.forEach((pos, idx) => {
      console.log(`\n${idx + 1}. ${pos.symbol} (${pos.poolName})`)
      console.log(`   Position ID: ${pos.id}`)
      console.log(`   Supply Amount: ${pos.supplyAmount}`)
      console.log(`   Supply USD Value: ${pos.supplyUsdValue}`)
      console.log(`   Collateral Amount: ${pos.collateralAmount}`)
      console.log(`   Collateral USD Value: ${pos.collateralUsdValue}`)
      console.log(`   Borrow Amount: ${pos.borrowAmount}`)
      console.log(`   Borrow USD Value: ${pos.borrowUsdValue}`)
      console.log(`   Supply APY: ${pos.supplyApy}%`)
    })

    console.log('\n\n=== FILTERED POSITIONS (supplyAmount > 0) ===')
    const filtered = snapshot.positions.filter(p => p.supplyAmount > 0)
    console.log('Filtered Count:', filtered.length)
    filtered.forEach((pos, idx) => {
      console.log(`${idx + 1}. ${pos.symbol}: supply=${pos.supplyAmount}, id=${pos.id}`)
    })

    console.log('\n\n=== ASSET ADDRESSES THAT WILL BE QUERIED ===')
    const assetAddresses = new Set<string>()
    filtered.forEach((pos) => {
      const assetAddress = pos.id.includes('-') ? pos.id.split('-')[1] : pos.id
      assetAddresses.add(assetAddress)
    })
    console.log('Assets that will fetch history:')
    Array.from(assetAddresses).forEach((addr, idx) => {
      console.log(`${idx + 1}. ${addr}`)
    })

  } catch (error) {
    console.error('Error:', error)
  }
}

testPositions()
