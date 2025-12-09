"use client"

import { useState, useRef, useCallback, type ReactNode } from "react"
import { RefreshCw } from "lucide-react"

interface PullToRefreshProps {
  children: ReactNode
  onRefresh: () => Promise<void>
  pullThreshold?: number
  maxPullDistance?: number
}

export function PullToRefresh({
  children,
  onRefresh,
  pullThreshold = 80,
  maxPullDistance = 120,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef<number | null>(null)
  const isPullingRef = useRef(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only start pull if we're at the top of the page
    if (window.scrollY === 0 && !isRefreshing) {
      startYRef.current = e.touches[0].clientY
    }
  }, [isRefreshing])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startYRef.current === null || isRefreshing) return

    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current

    // Only handle downward pull when at top of page
    if (diff > 0 && window.scrollY === 0) {
      isPullingRef.current = true
      // Apply resistance to make pull feel natural
      const resistance = 0.5
      const distance = Math.min(diff * resistance, maxPullDistance)
      setPullDistance(distance)

      // Prevent default scroll behavior while pulling
      if (distance > 10) {
        e.preventDefault()
      }
    }
  }, [isRefreshing, maxPullDistance])

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) {
      startYRef.current = null
      return
    }

    if (pullDistance >= pullThreshold && !isRefreshing) {
      setIsRefreshing(true)
      setPullDistance(pullThreshold) // Keep indicator visible during refresh

      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }

    startYRef.current = null
    isPullingRef.current = false
  }, [pullDistance, pullThreshold, isRefreshing, onRefresh])

  const progress = Math.min(pullDistance / pullThreshold, 1)
  const showIndicator = pullDistance > 10 || isRefreshing

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* Pull indicator - z-40 to stay below sticky header (z-50) */}
      <div
        className="absolute left-0 right-0 flex justify-center pointer-events-none z-40 transition-opacity duration-200"
        style={{
          top: Math.max(pullDistance - 40, 8),
          opacity: showIndicator ? 1 : 0,
        }}
      >
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full bg-black border border-white/10 shadow-lg"
          style={{
            transform: `rotate(${progress * 360}deg)`,
          }}
        >
          <RefreshCw
            className={`h-5 w-5 text-white/70 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </div>
      </div>

      {/* Content with pull transform */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPullingRef.current ? "none" : "transform 0.2s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  )
}
