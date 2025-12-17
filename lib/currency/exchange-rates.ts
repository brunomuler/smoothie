import { CurrencyCode, ExchangeRates } from './types'

const CACHE_KEY = 'smoothie-exchange-rates'
const CACHE_DURATION_MS = 10 * 60 * 1000 // 10 minutes

// CoinGecko exchange rates endpoint returns rates relative to BTC
// We'll use the simple/price endpoint to get USD equivalent rates
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/exchange_rates'

interface CoinGeckoExchangeRates {
  rates: {
    [key: string]: {
      name: string
      unit: string
      value: number
      type: string
    }
  }
}

function getCachedRates(): ExchangeRates | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    return JSON.parse(cached) as ExchangeRates
  } catch {
    return null
  }
}

function saveToCache(rates: ExchangeRates): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rates))
  } catch {
    // Ignore storage errors
  }
}

function isCacheExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_DURATION_MS
}

async function fetchFromCoinGecko(): Promise<Record<CurrencyCode, number>> {
  const response = await fetch(COINGECKO_API_URL)

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`)
  }

  const data: CoinGeckoExchangeRates = await response.json()

  // CoinGecko returns rates relative to BTC
  // To get USD-relative rates, we divide each currency's rate by USD's rate
  const usdRate = data.rates.usd?.value
  if (!usdRate) {
    throw new Error('USD rate not found in CoinGecko response')
  }

  // Map CoinGecko currency codes to our currency codes
  // CoinGecko uses lowercase currency codes
  const currencyMap: Record<CurrencyCode, string> = {
    // Primary currencies
    USD: 'usd',
    EUR: 'eur',
    GBP: 'gbp',
    BRL: 'brl',
    ARS: 'ars',
    CAD: 'cad',
    AUD: 'aud',
    // Additional currencies
    CHF: 'chf',
    CLP: 'clp',
    CNY: 'cny',
    COP: 'cop', // Note: CoinGecko may not have this, will fallback to 1
    CZK: 'czk',
    DKK: 'dkk',
    HKD: 'hkd',
    IDR: 'idr',
    ILS: 'ils',
    INR: 'inr',
    JPY: 'jpy',
    KRW: 'krw',
    MXN: 'mxn',
    MYR: 'myr',
    NOK: 'nok',
    NZD: 'nzd',
    PEN: 'pen', // Note: CoinGecko may not have this, will fallback to 1
    PHP: 'php',
    PLN: 'pln',
    SEK: 'sek',
    SGD: 'sgd',
    THB: 'thb',
    TRY: 'try',
    TWD: 'twd',
    ZAR: 'zar',
  }

  const rates: Record<CurrencyCode, number> = {} as Record<CurrencyCode, number>

  for (const [ourCode, geckoCode] of Object.entries(currencyMap)) {
    const geckoRate = data.rates[geckoCode]?.value
    if (geckoRate) {
      // Convert to USD-relative: how many units of this currency per 1 USD
      rates[ourCode as CurrencyCode] = geckoRate / usdRate
    } else {
      // Fallback to 1 if currency not found
      rates[ourCode as CurrencyCode] = 1
    }
  }

  // USD is always 1
  rates.USD = 1

  return rates
}

export async function getExchangeRate(currency: CurrencyCode): Promise<number> {
  // USD always returns 1, no API call needed
  if (currency === 'USD') return 1

  // Check cache first
  const cached = getCachedRates()
  if (cached && !isCacheExpired(cached.timestamp)) {
    return cached.rates[currency] ?? 1
  }

  try {
    // Fetch fresh rates
    const rates = await fetchFromCoinGecko()
    const exchangeRates: ExchangeRates = {
      timestamp: Date.now(),
      rates,
    }
    saveToCache(exchangeRates)
    return rates[currency] ?? 1
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error)
    // If we have cached rates (even if expired), use them as fallback
    if (cached) {
      return cached.rates[currency] ?? 1
    }
    // Ultimate fallback: return 1 (treat as USD)
    return 1
  }
}

export async function getAllExchangeRates(): Promise<ExchangeRates> {
  // Check cache first
  const cached = getCachedRates()
  if (cached && !isCacheExpired(cached.timestamp)) {
    return cached
  }

  try {
    const rates = await fetchFromCoinGecko()
    const exchangeRates: ExchangeRates = {
      timestamp: Date.now(),
      rates,
    }
    saveToCache(exchangeRates)
    return exchangeRates
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error)
    if (cached) {
      return cached
    }
    // Ultimate fallback: all rates are 1
    return {
      timestamp: Date.now(),
      rates: {
        USD: 1, EUR: 1, GBP: 1, BRL: 1, ARS: 1, CAD: 1, AUD: 1,
        CHF: 1, CLP: 1, CNY: 1, COP: 1, CZK: 1, DKK: 1, HKD: 1,
        IDR: 1, ILS: 1, INR: 1, JPY: 1, KRW: 1, MXN: 1, MYR: 1,
        NOK: 1, NZD: 1, PEN: 1, PHP: 1, PLN: 1, SEK: 1, SGD: 1,
        THB: 1, TRY: 1, TWD: 1, ZAR: 1,
      },
    }
  }
}

export function convertFromUsd(amountUsd: number, rate: number): number {
  return amountUsd * rate
}
