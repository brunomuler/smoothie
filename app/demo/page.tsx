"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useWalletContext } from "@/contexts/wallet-context"
import { fetchDemoWallets, getRandomDemoWalletAliasSync } from "@/lib/config/demo-wallet"

export default function DemoPage() {
  const router = useRouter()
  const { handleConnectDemoWallet } = useWalletContext()

  useEffect(() => {
    async function loadDemoWallet() {
      await fetchDemoWallets()
      const demoAlias = getRandomDemoWalletAliasSync()

      if (demoAlias) {
        handleConnectDemoWallet(demoAlias)
      }

      router.replace("/")
    }

    loadDemoWallet()
  }, [handleConnectDemoWallet, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-white/60 text-sm">Loading demo wallet...</div>
    </div>
  )
}
