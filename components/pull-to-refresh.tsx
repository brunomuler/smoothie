"use client"

import { useRef, useCallback, useEffect, type ReactNode } from "react"
import { RefreshCw } from "lucide-react"

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
  disabled?: boolean
}

const PULL_THRESHOLD = 70
const MAX_PULL = 100
const RESISTANCE = 2.5

export function PullToRefresh({ onRefresh, children, disabled = false }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<SVGSVGElement>(null)

  const startYRef = useRef(0)
  const pullDistanceRef = useRef(0)
  const isRefreshingRef = useRef(false)
  const isPullingRef = useRef(false)

  // Direct DOM manipulation for smooth 60fps animations
  const updateUI = useCallback((distance: number, transitioning = false) => {
    if (!contentRef.current || !indicatorRef.current || !iconRef.current) return

    const content = contentRef.current
    const indicator = indicatorRef.current
    const icon = iconRef.current

    if (transitioning) {
      content.style.transition = "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
      indicator.style.transition = "opacity 0.25s, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
    } else {
      content.style.transition = "none"
      indicator.style.transition = "none"
    }

    content.style.transform = `translateY(${distance}px)`

    const progress = Math.min(distance / PULL_THRESHOLD, 1)
    const showIndicator = distance > 0 || isRefreshingRef.current

    indicator.style.opacity = showIndicator ? "1" : "0"
    indicator.style.transform = `translateX(-50%) translateY(${Math.max(distance - 20, 0)}px) scale(${0.7 + progress * 0.3})`

    if (!isRefreshingRef.current) {
      icon.style.transform = `rotate(${progress * 360}deg)`
    }
  }, [])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return
    if (window.scrollY > 0) return

    startYRef.current = e.touches[0].clientY
    isPullingRef.current = false
  }, [disabled])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return
    if (window.scrollY > 0) {
      if (isPullingRef.current) {
        isPullingRef.current = false
        pullDistanceRef.current = 0
        updateUI(0, true)
      }
      return
    }

    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current

    if (diff > 0) {
      isPullingRef.current = true
      const resistedPull = Math.min(diff / RESISTANCE, MAX_PULL)
      pullDistanceRef.current = resistedPull
      updateUI(resistedPull, false)

      if (resistedPull > 5) {
        e.preventDefault()
      }
    } else if (isPullingRef.current) {
      isPullingRef.current = false
      pullDistanceRef.current = 0
      updateUI(0, true)
    }
  }, [disabled, updateUI])

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return

    isPullingRef.current = false
    const currentPull = pullDistanceRef.current

    if (currentPull >= PULL_THRESHOLD && !isRefreshingRef.current) {
      isRefreshingRef.current = true
      pullDistanceRef.current = 40
      updateUI(40, true)

      // Add spinning class
      if (iconRef.current) {
        iconRef.current.style.transform = ""
        iconRef.current.classList.add("animate-spin")
      }

      try {
        await onRefresh()
      } finally {
        isRefreshingRef.current = false
        pullDistanceRef.current = 0

        if (iconRef.current) {
          iconRef.current.classList.remove("animate-spin")
        }

        updateUI(0, true)
      }
    } else {
      pullDistanceRef.current = 0
      updateUI(0, true)
    }
  }, [onRefresh, updateUI])

  const handleTouchCancel = useCallback(() => {
    isPullingRef.current = false
    if (!isRefreshingRef.current) {
      pullDistanceRef.current = 0
      updateUI(0, true)
    }
  }, [updateUI])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener("touchstart", handleTouchStart, { passive: true })
    container.addEventListener("touchmove", handleTouchMove, { passive: false })
    container.addEventListener("touchend", handleTouchEnd, { passive: true })
    container.addEventListener("touchcancel", handleTouchCancel, { passive: true })

    return () => {
      container.removeEventListener("touchstart", handleTouchStart)
      container.removeEventListener("touchmove", handleTouchMove)
      container.removeEventListener("touchend", handleTouchEnd)
      container.removeEventListener("touchcancel", handleTouchCancel)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel])

  return (
    <div ref={containerRef} className="relative touch-pan-y">
      {/* Pull indicator */}
      <div
        ref={indicatorRef}
        className="fixed left-1/2 z-40 opacity-0 will-change-transform"
        style={{ top: 56 }}
      >
        <RefreshCw
          ref={iconRef}
          className="h-7 w-7 text-gray-300 dark:text-gray-600 will-change-transform"
        />
      </div>

      {/* Content */}
      <div ref={contentRef} className="will-change-transform">
        {children}
      </div>
    </div>
  )
}
