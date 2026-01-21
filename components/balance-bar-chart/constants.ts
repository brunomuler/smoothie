import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CheckCircle,
  Flame,
  AlertTriangle,
  Shield,
} from "lucide-react"
import type { TimePeriod } from "@/types/balance-history"

export const TIME_PERIODS: { value: TimePeriod; label: string }[] = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "1Y", label: "1Y" },
  { value: "All", label: "All" },
  { value: "Projection", label: "Projection" },
]

export const PROJECTION_SETTINGS_KEY = "smoothie-projection-settings"

export const COMPOUND_FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "52", label: "Weekly" },
  { value: "26", label: "Bi-weekly" },
  { value: "12", label: "Monthly" },
  { value: "4", label: "Quarterly" },
  { value: "2", label: "Semi-annually" },
]

// Icon components for events
export const EventIcons: Record<string, React.ComponentType<{ className?: string; color?: string }>> = {
  supply: ArrowDownCircle,
  supply_collateral: ArrowDownCircle,
  withdraw: ArrowUpCircle,
  withdraw_collateral: ArrowUpCircle,
  borrow: Banknote,
  repay: CheckCircle,
  claim: Flame,
  liquidate: AlertTriangle,
  backstop_deposit: Shield,
  backstop_withdraw: Shield,
  backstop_queue_withdrawal: Shield,
  backstop_dequeue_withdrawal: Shield,
  backstop_claim: Shield,
}
