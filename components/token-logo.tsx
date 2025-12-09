"use client"

import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface TokenLogoProps {
  src: string
  symbol: string
  size?: number
  className?: string
}

export function TokenLogo({ src, symbol, size = 48, className }: TokenLogoProps) {
  const [hasError, setHasError] = React.useState(false)

  // Reset error state when src changes
  React.useEffect(() => {
    setHasError(false)
  }, [src])

  if (hasError) {
    // Fallback: display token code in a styled container
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold",
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
        className="object-contain p-0.5"
        onError={() => setHasError(true)}
      />
    </div>
  )
}
