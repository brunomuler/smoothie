// Demo mode mock data for supply positions
export const DEMO_SUPPLY_POSITIONS = [
  {
    id: "demo-pool-1",
    poolName: "YieldBlox",
    assets: [
      {
        id: "demo-pool-1-usdc",
        assetName: "USDC",
        logoUrl: "/tokens/usdc.png",
        rawBalance: 8500.42,
        apyPercentage: 7.85,
        growthPercentage: 2.15,
        earnedYield: 425.42,
        yieldPercentage: 5.27,
        tokenAmount: 8500.42,
        symbol: "USDC",
      },
      {
        id: "demo-pool-1-xlm",
        assetName: "XLM",
        logoUrl: "/tokens/xlm.png",
        rawBalance: 2150.80,
        apyPercentage: 4.25,
        growthPercentage: 1.80,
        earnedYield: 89.50,
        yieldPercentage: 4.35,
        tokenAmount: 21508.0,
        symbol: "XLM",
      },
    ],
    backstop: {
      lpTokensUsd: 1250.00,
      lpTokens: 125.5,
      interestApr: 8.5,
      emissionApy: 12.3,
      yieldLp: 45.50,
      yieldPercent: 3.78,
      q4wShares: BigInt(0),
      q4wLpTokens: 0,
      q4wExpiration: null,
      claimableBlnd: 25.5,
    },
  },
  {
    id: "demo-pool-2",
    poolName: "Blend",
    assets: [
      {
        id: "demo-pool-2-usdc",
        assetName: "USDC",
        logoUrl: "/tokens/usdc.png",
        rawBalance: 3200.15,
        apyPercentage: 6.45,
        growthPercentage: 1.95,
        earnedYield: 156.75,
        yieldPercentage: 5.15,
        tokenAmount: 3200.15,
        symbol: "USDC",
      },
    ],
    backstop: null,
  },
]

// Demo mode mock data for borrow positions
export const DEMO_BORROW_POSITIONS = [
  {
    poolId: "demo-pool-1",
    poolName: "YieldBlox",
    positions: [
      {
        id: "demo-pool-1-xlm-borrow",
        symbol: "XLM",
        borrowAmount: 5000,
        borrowUsdValue: 500.00,
        borrowApy: 8.75,
        borrowBlndApy: 1.25,
        logoUrl: "/tokens/xlm.png",
        interestAccrued: 12.50,
        interestPercentage: 2.56,
      },
    ],
  },
]
