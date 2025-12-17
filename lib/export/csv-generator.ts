import type { UserAction, ActionType } from '@/lib/db/types'

// Action type labels for human-readable export
const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  supply: 'Supply',
  supply_collateral: 'Add Collateral',
  withdraw: 'Withdraw',
  withdraw_collateral: 'Withdraw Collateral',
  borrow: 'Borrow',
  repay: 'Repay',
  claim: 'Claim BLND',
  liquidate: 'Liquidate',
  new_auction: 'Liquidation Started',
  fill_auction: 'Liquidation',
  delete_auction: 'Liquidation Cancelled',
  backstop_deposit: 'Backstop Deposit',
  backstop_withdraw: 'Backstop Withdraw',
  backstop_queue_withdrawal: 'Queue Withdrawal',
  backstop_dequeue_withdrawal: 'Cancel Queue',
  backstop_claim: 'Backstop Claim',
}

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatDateUTC(dateString: string): string {
  const date = new Date(dateString)
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}

function formatTimeUTC(dateString: string): string {
  const date = new Date(dateString)
  return date.toISOString().split('T')[1].replace('Z', '') // HH:MM:SS.sss
}

function formatAmount(amount: number | null, decimals: number = 7): string {
  if (amount === null) return ''
  return (amount / Math.pow(10, decimals)).toFixed(decimals)
}

function getActionAmount(action: UserAction): { amount: string; asset: string } {
  // Handle different action types
  if (action.action_type === 'claim') {
    return {
      amount: formatAmount(action.claim_amount, 7),
      asset: 'BLND',
    }
  }

  if (action.action_type === 'fill_auction' || action.action_type === 'new_auction') {
    // For auctions, show lot amount (what was liquidated)
    if (action.lot_amount !== null) {
      return {
        amount: formatAmount(action.lot_amount, 7),
        asset: action.lot_asset_symbol || action.lot_asset || '',
      }
    }
  }

  if (action.action_type.startsWith('backstop_')) {
    return {
      amount: formatAmount(action.lp_tokens, 7),
      asset: 'BLND-USDC LP',
    }
  }

  return {
    amount: formatAmount(action.amount_underlying, action.asset_decimals || 7),
    asset: action.asset_symbol || action.asset_address || '',
  }
}

export function generateTransactionCSV(actions: UserAction[]): string {
  const headers = [
    'Date (UTC)',
    'Time (UTC)',
    'Transaction Hash',
    'Pool',
    'Action Type',
    'Asset',
    'Amount',
  ]

  const rows = actions.map((action) => {
    const { amount, asset } = getActionAmount(action)

    return [
      formatDateUTC(action.ledger_closed_at),
      formatTimeUTC(action.ledger_closed_at),
      action.transaction_hash,
      action.pool_name || action.pool_short_name || action.pool_id,
      ACTION_TYPE_LABELS[action.action_type] || action.action_type,
      asset,
      amount,
    ]
  })

  const csvRows = [headers, ...rows].map((row) =>
    row.map(escapeCSV).join(',')
  )

  return csvRows.join('\n')
}

export function getExportFilename(userAddress: string, startDate?: string, endDate?: string): string {
  const addressShort = userAddress.slice(0, 8)
  const datePart = startDate && endDate
    ? `_${startDate}_to_${endDate}`
    : startDate
      ? `_from_${startDate}`
      : endDate
        ? `_to_${endDate}`
        : ''

  return `transactions_${addressShort}${datePart}.csv`
}
