/**
 * Utility functions for wallet display and styling
 */

/**
 * Generate a deterministic HSL color based on a wallet address
 * Creates visually pleasing, unique colors for each address
 */
export function getAddressColor(address: string): {
  hue: number
  gradient: string
  background: string
  foreground: string
} {
  // Use first 8 chars after any prefix for primary hue
  const cleanAddress = address.replace(/^[GC]/, '') // Remove Stellar G or C prefix
  const hash1 = parseInt(cleanAddress.slice(0, 6), 36) || 0
  const hash2 = parseInt(cleanAddress.slice(6, 12), 36) || 0

  const hue1 = hash1 % 360
  const hue2 = (hue1 + 40 + (hash2 % 60)) % 360 // Complementary offset

  return {
    hue: hue1,
    gradient: `linear-gradient(135deg, hsl(${hue1}, 70%, 55%) 0%, hsl(${hue2}, 65%, 45%) 100%)`,
    background: `hsl(${hue1}, 70%, 55%)`,
    foreground: 'white',
  }
}

/**
 * Generate initials from a wallet name or address
 */
export function getWalletInitials(name?: string, address?: string): string {
  if (name) {
    // Get first letter of first two words
    const words = name.split(/\s+/)
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  if (address) {
    // Use first and last non-prefix character for Stellar addresses and contracts
    const clean = address.replace(/^[GC]/, '')
    return (clean[0] + clean[clean.length - 1]).toUpperCase()
  }

  return 'W'
}

/**
 * Shorten a Stellar address for display
 */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

/**
 * Get wallet type label and styling
 */
export function getWalletTypeInfo(type?: 'connected' | 'watched' | 'hardware'): {
  label: string
  variant: 'default' | 'secondary' | 'outline'
  icon?: string
} {
  switch (type) {
    case 'watched':
      return { label: 'Watching', variant: 'secondary' }
    case 'hardware':
      return { label: 'Hardware', variant: 'outline' }
    case 'connected':
    default:
      return { label: 'Connected', variant: 'default' }
  }
}
