"use client"

import { AuthenticatedPage } from "@/components/authenticated-page"
import { PageTitle } from "@/components/page-title"
import { WalletContent } from "@/components/wallet-content"

export default function WalletPage() {
  return (
    <AuthenticatedPage>
      <PageTitle>Wallet</PageTitle>
      <WalletContent />
    </AuthenticatedPage>
  )
}
