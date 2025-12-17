export type CurrencyCode =
  // Primary currencies (keep at top)
  | 'USD' | 'EUR' | 'GBP' | 'BRL' | 'ARS' | 'CAD' | 'AUD'
  // Additional currencies (alphabetical)
  | 'CHF' | 'CLP' | 'CNY' | 'COP' | 'CZK' | 'DKK' | 'HKD' | 'IDR' | 'ILS' | 'INR'
  | 'JPY' | 'KRW' | 'MXN' | 'MYR' | 'NOK' | 'NZD' | 'PEN' | 'PHP' | 'PLN' | 'SEK'
  | 'SGD' | 'THB' | 'TRY' | 'TWD' | 'ZAR'

export interface Currency {
  code: CurrencyCode
  name: string
  symbol: string
  locale: string
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  // Primary currencies (keep at top)
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', locale: 'pt-BR' },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', locale: 'es-AR' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', locale: 'en-CA' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', locale: 'en-AU' },
  // Additional currencies (alphabetical)
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', locale: 'de-CH' },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$', locale: 'es-CL' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', locale: 'zh-CN' },
  { code: 'COP', name: 'Colombian Peso', symbol: '$', locale: 'es-CO' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', locale: 'cs-CZ' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', locale: 'da-DK' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', locale: 'zh-HK' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', locale: 'id-ID' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', locale: 'he-IL' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', locale: 'en-IN' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', locale: 'ja-JP' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', locale: 'ko-KR' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', locale: 'es-MX' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', locale: 'ms-MY' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', locale: 'nb-NO' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', locale: 'en-NZ' },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', locale: 'es-PE' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', locale: 'en-PH' },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł', locale: 'pl-PL' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', locale: 'sv-SE' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', locale: 'en-SG' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', locale: 'th-TH' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', locale: 'tr-TR' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$', locale: 'zh-TW' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', locale: 'en-ZA' },
]

export interface ExchangeRates {
  timestamp: number
  rates: Record<CurrencyCode, number>
}

export function getCurrencyByCode(code: CurrencyCode): Currency {
  return SUPPORTED_CURRENCIES.find(c => c.code === code) || SUPPORTED_CURRENCIES[0]
}
