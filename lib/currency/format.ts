import { CurrencyCode, getCurrencyByCode } from './types'

export interface FormatCurrencyOptions {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  compact?: boolean
  showSign?: boolean
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'negative' | 'never'
}

export function formatCurrency(
  amount: number,
  currencyCode: CurrencyCode,
  options: FormatCurrencyOptions = {}
): string {
  const currency = getCurrencyByCode(currencyCode)
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    compact = false,
    showSign = false,
    signDisplay,
  } = options

  const formatOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits,
    maximumFractionDigits,
  }

  if (compact) {
    formatOptions.notation = 'compact'
    formatOptions.compactDisplay = 'short'
  }

  // signDisplay takes precedence over showSign
  if (signDisplay) {
    formatOptions.signDisplay = signDisplay
  } else if (showSign && amount > 0) {
    formatOptions.signDisplay = 'always'
  }

  try {
    return new Intl.NumberFormat(currency.locale, formatOptions).format(amount)
  } catch {
    // Fallback for unsupported currencies
    return `${currency.symbol}${amount.toFixed(maximumFractionDigits)}`
  }
}

export function formatCurrencyCompact(
  amount: number,
  currencyCode: CurrencyCode
): string {
  return formatCurrency(amount, currencyCode, {
    compact: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
}

export function formatCurrencyPrecise(
  amount: number,
  currencyCode: CurrencyCode,
  maxDecimals: number = 7
): string {
  return formatCurrency(amount, currencyCode, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  })
}

export function formatCurrencyWithSign(
  amount: number,
  currencyCode: CurrencyCode
): string {
  return formatCurrency(amount, currencyCode, {
    showSign: true,
  })
}
