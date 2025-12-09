"use client"

import * as React from "react"
import Image from "next/image"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getWalletInitials } from "@/lib/wallet-utils"
import { cn } from "@/lib/utils"

interface WalletAvatarProps {
  address: string
  name?: string
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
}

const imageSizes = {
  sm: 24,
  md: 32,
  lg: 40,
}

/**
 * Get the LOBSTR identicon URL for a Stellar address
 * https://id.lobstr.co/{PUBLIC_KEY}.png
 */
function getIdenticonUrl(address: string): string {
  return `https://id.lobstr.co/${address}.png`
}

export function WalletAvatar({
  address,
  name,
  size = "md",
  className,
}: WalletAvatarProps) {
  const initials = getWalletInitials(name, address)
  const identiconUrl = getIdenticonUrl(address)

  return (
    <Avatar className={cn(sizeClasses[size], "bg-black rounded-lg", className)}>
      <AvatarImage asChild src={identiconUrl}>
        <Image
          src={identiconUrl}
          alt={`Wallet ${address.slice(0, 4)}...${address.slice(-4)}`}
          width={imageSizes[size]}
          height={imageSizes[size]}
          className="object-cover p-0.5 rounded-lg"
          unoptimized
        />
      </AvatarImage>
      <AvatarFallback className="text-[10px] font-medium bg-black rounded-lg">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
