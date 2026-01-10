"use client"

import * as React from "react"
import Image from "next/image"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getWalletInitials } from "@/lib/wallet-utils"
import { cn } from "@/lib/utils"
import { AVATAR_GRADIENTS, type AvatarCustomization } from "@/hooks/use-wallet-avatar-customization"

interface WalletAvatarProps {
  address: string
  name?: string
  size?: "sm" | "md" | "lg"
  className?: string
  customization?: AvatarCustomization | null
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

const emojiSizes = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl",
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
  customization,
}: WalletAvatarProps) {
  const initials = getWalletInitials(name, address)
  const identiconUrl = getIdenticonUrl(address)

  // If there's a customization, show emoji with gradient
  if (customization) {
    const gradient = AVATAR_GRADIENTS.find((g) => g.id === customization.gradientId) || AVATAR_GRADIENTS[0]

    return (
      <div
        className={cn(
          sizeClasses[size],
          "rounded-lg flex items-center justify-center",
          emojiSizes[size],
          className
        )}
        style={{
          background: `linear-gradient(135deg, ${gradient.colors[0]}, ${gradient.colors[1]})`,
        }}
      >
        {customization.emoji}
      </div>
    )
  }

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
