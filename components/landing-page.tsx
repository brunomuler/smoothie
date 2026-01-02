"use client"

import dynamic from "next/dynamic"
import Image from "next/image"
import { WalletSelector } from "@/components/wallet-selector"
import { Footer } from "@/components/footer"
import type { Wallet } from "@/types/wallet"

// Dynamically import Dither to avoid SSR issues with three.js
const Dither = dynamic(() => import("@/components/Dither"), { ssr: false })

interface LandingPageProps {
  wallets: Wallet[]
  activeWallet: Wallet | null
  onSelectWallet: (walletId: string) => void
  onConnectWallet: (address: string, walletName?: string) => void
  onDisconnect: (walletId: string) => void
  isHydrated?: boolean
}

export function LandingPage({
  wallets,
  activeWallet,
  onSelectWallet,
  onConnectWallet,
  onDisconnect,
  isHydrated = true,
}: LandingPageProps) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      {/* Dither Background */}
      <div className="absolute inset-4 sm:inset-6 md:inset-8 z-0 rounded-3xl sm:rounded-[2rem] md:rounded-[3rem] overflow-hidden">
        <Dither
          waveColor={[0.97, 0.3, 1]}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={0.3}
          colorNum={3}
          waveAmplitude={0.15}
          waveFrequency={1.8}
          waveSpeed={0.05}
        />
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col p-4 sm:p-6 md:p-8">
        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          {/* Circular blur backdrop */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[600px] h-[600px] sm:w-[700px] sm:h-[700px] md:w-[800px] md:h-[800px] rounded-full bg-black/30 blur-[100px]" />
          </div>
          <div className="max-w-2xl mx-auto space-y-6 relative z-10">
            {/* Logo */}
            <div className="flex justify-center mb-12">
              <Image
                src="/logo/logo.png"
                alt="Smoothie"
                width={0}
                height={0}
                sizes="100vw"
                className="h-20 sm:h-24 md:h-28 w-auto drop-shadow-2xl"
                priority
              />
            </div>

            {/* Tagline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight">
              Your Blend positions,
              <br />
              <span className="text-pink-300">smoothly tracked</span>
            </h1>

            <p className="text-lg sm:text-xl text-white/80 max-w-lg mx-auto">
              Track your Stellar Blend DeFi positions, monitor your yields, and stay on top of your portfolio.
            </p>

            {/* CTA */}
            <div className="pt-8">
              <WalletSelector
                wallets={wallets}
                activeWallet={activeWallet}
                onSelectWallet={onSelectWallet}
                onConnectWallet={onConnectWallet}
                onDisconnect={onDisconnect}
                variant="landing"
                isHydrated={isHydrated}
              />
            </div>
          </div>
        </main>

        {/* Footer */}
        <Footer variant="landing" />
      </div>
    </div>
  )
}
