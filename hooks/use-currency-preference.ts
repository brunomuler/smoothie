'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CurrencyCode, SUPPORTED_CURRENCIES } from '@/lib/currency/types'
import { getExchangeRate, convertFromUsd } from '@/lib/currency/exchange-rates'
import { formatCurrency, FormatCurrencyOptions } from '@/lib/currency/format'
import { useAnalytics } from '@/hooks/use-analytics'

const STORAGE_KEY = 'smoothie-currency-preference'

export interface CurrencyPreference {
  currency: CurrencyCode
  setCurrency: (code: CurrencyCode) => void
  exchangeRate: number
  isLoading: boolean
  error: string | null
  convert: (amountUsd: number) => number
  format: (amountUsd: number, options?: FormatCurrencyOptions) => string
}

export function useCurrencyPreference(): CurrencyPreference {
  const [currency, setCurrencyState] = useState<CurrencyCode>('USD')
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const { capture } = useAnalytics()

  // Load preference from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && SUPPORTED_CURRENCIES.some(c => c.code === saved)) {
      setCurrencyState(saved as CurrencyCode)
    }
    setIsInitialized(true)
  }, [])

  // Fetch exchange rate when currency changes
  useEffect(() => {
    if (!isInitialized) return

    // USD is always 1, no need to fetch
    if (currency === 'USD') {
      setExchangeRate(1)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    getExchangeRate(currency)
      .then(rate => {
        if (!cancelled) {
          setExchangeRate(rate)
          setIsLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to fetch exchange rate')
          setIsLoading(false)
          // Keep previous rate or default to 1
        }
      })

    return () => {
      cancelled = true
    }
  }, [currency, isInitialized])

  const setCurrency = useCallback((code: CurrencyCode) => {
    setCurrencyState(code)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, code)
    }
    // Track currency change event and set user property
    capture('currency_changed', {
      currency_code: code,
      // $set updates user properties in PostHog
      $set: { preferred_currency: code },
    })
  }, [capture])

  const convert = useCallback(
    (amountUsd: number) => convertFromUsd(amountUsd, exchangeRate),
    [exchangeRate]
  )

  const format = useCallback(
    (amountUsd: number, options?: FormatCurrencyOptions) => {
      const converted = convertFromUsd(amountUsd, exchangeRate)
      return formatCurrency(converted, currency, options)
    },
    [exchangeRate, currency]
  )

  return useMemo(
    () => ({
      currency,
      setCurrency,
      exchangeRate,
      isLoading,
      error,
      convert,
      format,
    }),
    [currency, setCurrency, exchangeRate, isLoading, error, convert, format]
  )
}
