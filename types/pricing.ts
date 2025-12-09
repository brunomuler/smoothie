// Price data types
export interface TokenPrice {
  assetAddress: string
  symbol: string
  usd: number
  source: 'coingecko' | 'mock'
  timestamp: number
}

export interface PricesResponse {
  prices: Record<string, TokenPrice>
}
