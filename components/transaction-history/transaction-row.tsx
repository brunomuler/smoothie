"use client"

import { ExternalLink } from "lucide-react"
import { TableCell, TableRow } from "@/components/ui/table"
import type { TransactionRowProps } from "./types"
import { ActionBadge } from "./action-badge"
import { AmountWithCurrency } from "./amount-display"
import { formatDate, formatTime } from "./helpers"

export function TransactionRow({
  actions,
  currentUserAddress,
  historicalPrices,
  currency,
  formatCurrency,
  tokensMap,
  blndTokenAddress,
  isDemoWallet,
}: TransactionRowProps) {
  const firstAction = actions[0]
  const explorerUrl = `https://stellar.expert/explorer/public/tx/${firstAction.transaction_hash}`

  return (
    <TableRow className="hover:bg-transparent border-b border-border/50 last:border-b-0">
      <TableCell className="pl-4">
        <div className="flex flex-col">
          <span className="font-medium">
            {firstAction.pool_name || firstAction.pool_short_name || firstAction.pool_id?.slice(0, 8)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {actions.map((action) => (
            <ActionBadge key={action.id} action={action} currentUserAddress={currentUserAddress} />
          ))}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {actions.map((action) => (
            <AmountWithCurrency
              key={action.id}
              action={action}
              currentUserAddress={currentUserAddress}
              historicalPrices={historicalPrices}
              currency={currency}
              formatCurrency={formatCurrency}
              tokensMap={tokensMap}
              blndTokenAddress={blndTokenAddress}
            />
          ))}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col text-sm">
          <span>{formatDate(firstAction.ledger_closed_at)}</span>
          <span className="text-muted-foreground text-xs">
            {formatTime(firstAction.ledger_closed_at)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {isDemoWallet ? (
          <span className="font-mono text-xs text-muted-foreground">
            {firstAction.transaction_hash.slice(0, 8)}...
          </span>
        ) : (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="font-mono text-xs">{firstAction.transaction_hash.slice(0, 8)}...</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </TableCell>
    </TableRow>
  )
}

export function MobileTransactionCard({
  actions,
  currentUserAddress,
  historicalPrices,
  currency,
  formatCurrency,
  tokensMap,
  blndTokenAddress,
  isDemoWallet,
}: TransactionRowProps) {
  const firstAction = actions[0]
  const explorerUrl = `https://stellar.expert/explorer/public/tx/${firstAction.transaction_hash}`

  return (
    <div className="py-3 px-4 space-y-3 border-b border-border/50 last:border-b-0">
      <div className="flex justify-between items-center">
        <div className="text-sm font-medium">
          {firstAction.pool_name || firstAction.pool_short_name || firstAction.pool_id?.slice(0, 8)}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right text-xs text-muted-foreground">
            {formatDate(firstAction.ledger_closed_at)} {formatTime(firstAction.ledger_closed_at)}
          </div>
          {!isDemoWallet && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {actions.map((action) => (
        <div key={action.id} className="flex justify-between items-center">
          <ActionBadge action={action} currentUserAddress={currentUserAddress} />
          <div className="w-36">
            <AmountWithCurrency
              action={action}
              currentUserAddress={currentUserAddress}
              historicalPrices={historicalPrices}
              currency={currency}
              formatCurrency={formatCurrency}
              tokensMap={tokensMap}
              blndTokenAddress={blndTokenAddress}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
