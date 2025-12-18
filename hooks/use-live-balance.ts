"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type FetchActualBalance = () => Promise<number | null | undefined>

const SECONDS_PER_YEAR = 31_557_600 // 365.25 days
const PAUSE_STORAGE_KEY = 'smoothie-live-balance-paused'

function sanitizeNumeric(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 0
  }
  return Number(value)
}

function clampNonNegative(value: number): number {
  return value > 0 ? value : 0
}

export interface LiveBalanceResult {
  displayBalance: number
  actualBalance: number
  isWarning: boolean
  warningMessage: string
  lastSync: number
  syncNow: () => Promise<void>
  isPaused: boolean
  togglePause: () => void
}

/**
 * Provides a smoothly updating balance based on APY while periodically
 * syncing with a provided data source to avoid drift.
 */
export function useLiveBalance(
  initialBalanceInput: number,
  apyDecimalInput: number,
  fetchActualBalance?: FetchActualBalance | null,
  refreshInterval = 60_000
): LiveBalanceResult {
  const initialBalance = useMemo(
    () => clampNonNegative(sanitizeNumeric(initialBalanceInput)),
    [initialBalanceInput]
  )
  const apyDecimal = useMemo(
    () => clampNonNegative(sanitizeNumeric(apyDecimalInput)),
    [apyDecimalInput]
  )

  const [displayBalance, setDisplayBalance] = useState<number>(initialBalance)
  const [actualBalance, setActualBalance] = useState<number>(initialBalance)
  const [isWarning, setIsWarning] = useState<boolean>(false)
  const [warningMessage, setWarningMessage] = useState<string>("")
  const [lastSync, setLastSync] = useState<number>(() => Date.now())
  const [isPaused, setIsPaused] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem(PAUSE_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const animationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const calculatePerSecondIncrease = useCallback((balance: number, annualYield: number) => {
    if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(annualYield) || annualYield <= 0) {
      return 0
    }
    return (balance * annualYield) / SECONDS_PER_YEAR
  }, [])

  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const newValue = !prev
      try {
        localStorage.setItem(PAUSE_STORAGE_KEY, String(newValue))
      } catch {
        // Ignore localStorage errors
      }
      return newValue
    })
  }, [])

  // Reset and animate when balance or APY changes
  // Uses throttled interval (66ms = 15 updates/sec) instead of RAF (60/sec) for performance
  const ANIMATION_INTERVAL_MS = 66

  useEffect(() => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current)
      animationIntervalRef.current = null
    }

    setDisplayBalance(initialBalance)
    setActualBalance(initialBalance)
    setLastSync(Date.now())
    setIsWarning(false)
    setWarningMessage("")

    if (!apyDecimal || isPaused) {
      return
    }

    // Use setInterval at 66ms (15 updates/sec) instead of RAF (60/sec)
    // This reduces CPU usage by 4x while appearing smooth
    animationIntervalRef.current = setInterval(() => {
      // Skip updates when tab is hidden
      if (document.visibilityState === 'hidden') {
        return
      }

      setDisplayBalance((prev) => {
        const perSecond = calculatePerSecondIncrease(prev, apyDecimal)
        return prev + perSecond * (ANIMATION_INTERVAL_MS / 1000)
      })
    }, ANIMATION_INTERVAL_MS)

    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current)
        animationIntervalRef.current = null
      }
    }
  }, [initialBalance, apyDecimal, isPaused, calculatePerSecondIncrease])

  // Periodic sync with actual balance source
  useEffect(() => {
    if (!fetchActualBalance || refreshInterval <= 0) {
      return
    }

    let cancelled = false

    const fetchAndCompare = async () => {
      try {
        const fetched = sanitizeNumeric(await fetchActualBalance())
        if (cancelled || !Number.isFinite(fetched)) {
          return
        }

        setActualBalance(fetched)
        setLastSync(Date.now())

        setDisplayBalance((currentDisplay) => {
          const tolerance = currentDisplay * 0.0001 // 0.01% tolerance

          if (fetched + tolerance < currentDisplay) {
            setIsWarning(true)
            const diff = currentDisplay - fetched
            setWarningMessage(
              `Warning: Actual balance (${fetched.toFixed(7)}) is lower than displayed (${currentDisplay.toFixed(
                7
              )}) by ${diff.toFixed(7)}`
            )
            return fetched
          }

          setIsWarning(false)
          setWarningMessage("")
          return fetched > currentDisplay ? fetched : currentDisplay
        })
      } catch (error) {
        console.error("Error fetching actual balance:", error)
      }
    }

    fetchAndCompare()
    fetchIntervalRef.current = setInterval(fetchAndCompare, refreshInterval)

    return () => {
      cancelled = true
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current)
        fetchIntervalRef.current = null
      }
    }
  }, [fetchActualBalance, refreshInterval])

  const syncNow = useCallback(async () => {
    if (!fetchActualBalance) {
      return
    }

    try {
      const fetched = sanitizeNumeric(await fetchActualBalance())
      if (!Number.isFinite(fetched)) {
        return
      }

      setActualBalance(fetched)
      setDisplayBalance(fetched)
      setLastSync(Date.now())
      setIsWarning(false)
      setWarningMessage("")
    } catch (error) {
      console.error("Error syncing balance:", error)
    }
  }, [fetchActualBalance])

  return {
    displayBalance,
    actualBalance,
    isWarning,
    warningMessage,
    lastSync,
    syncNow,
    isPaused,
    togglePause,
  }
}
