"use client"

import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface TokenLogoProps {
  src?: string | null
  symbol: string
  size?: number
  className?: string
  noPadding?: boolean
}

export function TokenLogo({ src, symbol, size = 48, className, noPadding }: TokenLogoProps) {
  const [hasError, setHasError] = React.useState(false)

  // Reset error state when src changes
  React.useEffect(() => {
    setHasError(false)
  }, [src])

  // If no src or error, show fallback circle
  if (!src || hasError) {
    // Fallback: display token code in a styled container - match the image version styling
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-white text-muted-foreground font-semibold shrink-0 overflow-hidden",
          className
        )}
        style={{ width: size, height: size, fontSize: size * 0.3 }}
      >
        {symbol.slice(0, 4).toUpperCase()}
      </div>
    )
  }

  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-full bg-white", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={`${symbol} logo`}
        fill
        sizes={`${size}px`}
        className={cn("object-contain", noPadding ? "" : "p-0.5")}
        onError={() => setHasError(true)}
      />
    </div>
  )
}
