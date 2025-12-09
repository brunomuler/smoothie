export interface PriceLookupInput {
  assetId: string;
  symbol?: string;
}

export interface PriceQuote {
  assetId: string;
  symbol?: string;
  usdPrice: number;
  timestamp: number;
  source: string;
}

export interface PriceService {
  getUsdPrice(input: PriceLookupInput): Promise<PriceQuote | null>;
}

