"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { navItems } from "./nav-config"
import { WalletSelector } from "@/components/wallet-selector"
import { useWalletState } from "@/hooks/use-wallet-state"

export function Sidebar() {
  const pathname = usePathname()
  const {
    wallets,
    activeWallet,
    handleSelectWallet,
    handleConnectWallet,
    handleDisconnect,
    isHydrated,
  } = useWalletState()

  return (
    <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-56 flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo/logo.png"
            alt="Smoothie"
            width={0}
            height={0}
            sizes="100vw"
            className="h-12 w-auto"
            priority
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.title}
            </Link>
          )
        })}
      </nav>

      {/* Wallet Selector */}
      <div className="p-4">
        <WalletSelector
          wallets={wallets}
          activeWallet={activeWallet}
          onSelectWallet={handleSelectWallet}
          onConnectWallet={handleConnectWallet}
          onDisconnect={handleDisconnect}
          fullWidth
          isHydrated={isHydrated}
        />
      </div>
    </aside>
  )
}
