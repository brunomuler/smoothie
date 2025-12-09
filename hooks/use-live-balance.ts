"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type FetchActualBalance = () => Promise<number | null | undefined>

const SECONDS_PER_YEAR = 31_557_600 // 365.25 days

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

  const animationFrameRef = useRef<number | null>(null)
  const lastUpdateTimeRef = useRef<number>(Date.now())
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const calculatePerSecondIncrease = useCallback((balance: number, annualYield: number) => {
    if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(annualYield) || annualYield <= 0) {
      return 0
    }
    return (balance * annualYield) / SECONDS_PER_YEAR
  }, [])

  // Reset and animate when balance or APY changes
  useEffect(() => {
    let cancelled = false

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    Promise.resolve().then(() => {
      if (cancelled) {
        return
      }

      setDisplayBalance(initialBalance)
      setActualBalance(initialBalance)
      setLastSync(Date.now())
      setIsWarning(false)
      setWarningMessage("")
      lastUpdateTimeRef.current = Date.now()

      if (!apyDecimal) {
        return
      }

      // Use requestAnimationFrame for smoother, more efficient animations
      const animate = () => {
        // Only animate when tab is visible
        if (document.visibilityState === 'hidden') {
          animationFrameRef.current = requestAnimationFrame(animate)
          return
        }

        const now = Date.now()
        const deltaTime = (now - lastUpdateTimeRef.current) / 1000 // Convert to seconds
        lastUpdateTimeRef.current = now

        setDisplayBalance((prev) => {
          const perSecond = calculatePerSecondIncrease(prev, apyDecimal)
          return prev + perSecond * deltaTime
        })

        if (!cancelled) {
          animationFrameRef.current = requestAnimationFrame(animate)
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    })

    return () => {
      cancelled = true
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [initialBalance, apyDecimal, calculatePerSecondIncrease])

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
  }
}
