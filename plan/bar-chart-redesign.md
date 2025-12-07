# Bar Chart Redesign Plan

## Overview

Redesign the topmost chart in `WalletBalance` component from an AreaChart to a BarChart with time period tabs, event markers, and enhanced tooltips.

---

## Current State

- **Component**: [wallet-balance.tsx](components/wallet-balance.tsx)
- **Chart Type**: `AreaChart` from recharts with deposit + total balance lines
- **Data Source**: `enhancedChartData` - combines historical data, today's live balance, and 12-month projections
- **Events Available**: User actions from `useUserActions` hook with types: supply, withdraw, supply_collateral, withdraw_collateral, borrow, repay, claim, liquidate

---

## Requirements

### 1. Time Period Tabs
| Tab | Period | Bars | Aggregation |
|-----|--------|------|-------------|
| 1W | 7 days including today | 7 bars | 1 bar per day |
| 1M | 30 days including today | 30 bars | 1 bar per day |
| 1Y | 365 days including today | 12 bars | 1 bar per month |
| All | From day before first event | Variable | 1 bar per month |
| Projection | 20 years from today | 20 bars | 1 bar per year |

### 2. Bar Chart Display
- Replace `AreaChart` with `BarChart` (vertical bars)
- Each bar represents the total balance for that period
- Bars should have a gradient fill from bottom to top

### 3. Event Markers
- Small circle with icon at the bottom of bars where events occurred
- Event types and suggested icons:
  - `supply` / `supply_collateral` - ArrowDownCircle (deposit in)
  - `withdraw` / `withdraw_collateral` - ArrowUpCircle (withdraw out)
  - `borrow` - Banknote
  - `repay` - CheckCircle
  - `claim` - Gift
  - `liquidate` - AlertTriangle
- When multiple events on same bar, stack icons or show count badge

### 4. Enhanced Tooltip (on hover)
Display on bar hover:
- **Date/Period**: e.g., "Dec 5, 2025" or "December 2025"
- **Balance**: The actual balance at end of that period
- **Yield Earned**: How much yield was earned during that bar's period
- **Events**: List of events that occurred (if any)

---

## Implementation Steps

### Step 1: Create New Types

Add to [types/balance-history.ts](types/balance-history.ts):

```typescript
export type TimePeriod = '1W' | '1M' | '1Y' | 'All' | 'Projection'

export interface BarChartDataPoint {
  // Period identification
  period: string              // Display label: "Dec 5" or "Dec 2025" or "2025"
  periodStart: string         // Start date ISO string
  periodEnd: string           // End date ISO string

  // Values
  balance: number             // Balance at end of period
  yieldEarned: number         // Yield earned during this period
  deposit: number             // Principal/cost basis

  // Events for this period
  events: {
    type: ActionType
    date: string
    amount: number | null
    assetSymbol: string | null
  }[]

  // Metadata
  isProjected?: boolean       // True for projection tab data
  isToday?: boolean           // True if period contains today
}
```

### Step 2: Create Data Aggregation Utility

Create [lib/chart-utils.ts](lib/chart-utils.ts):

```typescript
// Functions to implement:

// 1. aggregateDataByPeriod(
//      chartData: ChartDataPoint[],
//      userActions: UserAction[],
//      period: TimePeriod,
//      currentBalance: number,
//      apy: number
//    ): BarChartDataPoint[]

// 2. getDateRangeForPeriod(
//      period: TimePeriod,
//      firstEventDate: string | null
//    ): { start: Date, end: Date }

// 3. groupDataByMonth(data: ChartDataPoint[]): Map<string, ChartDataPoint[]>

// 4. groupDataByYear(data: ChartDataPoint[]): Map<string, ChartDataPoint[]>

// 5. generateProjectionData(
//      currentBalance: number,
//      apy: number,
//      years: number
//    ): BarChartDataPoint[]

// 6. mapEventsToBar(
//      events: UserAction[],
//      periodStart: Date,
//      periodEnd: Date
//    ): BarChartDataPoint['events']
```

### Step 3: Create Reusable Bar Chart Component

Create [components/balance-bar-chart.tsx](components/balance-bar-chart.tsx):

Features:
- Tab selector for time periods (using shadcn Tabs component)
- BarChart from recharts with customized bars
- Custom tooltip component showing balance, yield, and events
- Event markers using ReferenceDot or custom shape at bar base
- Loading and empty states

```tsx
interface BalanceBarChartProps {
  historyData: ChartDataPoint[]
  userActions: UserAction[]
  currentBalance: number
  apy: number
  firstEventDate: string | null
  isLoading?: boolean
}
```

### Step 4: Create Custom Tooltip Component

Create [components/chart-tooltip.tsx](components/chart-tooltip.tsx):

```tsx
interface ChartTooltipProps {
  active?: boolean
  payload?: any[]
  period: TimePeriod
}

// Display:
// - Period label with proper formatting
// - Balance in USD (formatted)
// - Yield earned in period (formatted, with +/- sign)
// - List of events with icons and amounts
```

### Step 5: Create Event Marker Component

Create [components/event-marker.tsx](components/event-marker.tsx):

```tsx
interface EventMarkerProps {
  events: BarChartDataPoint['events']
  x: number
  y: number
}

// Renders appropriate icon(s) at the base of the bar
// Uses lucide-react icons
// If multiple events, shows a stacked indicator or count badge
```

### Step 6: Integrate into WalletBalance

Modify [components/wallet-balance.tsx](components/wallet-balance.tsx):

1. Import `useUserActions` hook to fetch events
2. Replace the `<AreaChart>` block with `<BalanceBarChart>`
3. Pass required props: historyData, userActions, currentBalance, apy, firstEventDate
4. Keep existing header stats and footer yield info
5. Update "View Full History" dialog to use new bar chart

### Step 7: Add Missing UI Components

Check if these shadcn components exist, add if needed:
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` - for period selection

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      WalletBalance                          │
├─────────────────────────────────────────────────────────────┤
│  Props: balanceHistoryData, publicKey, currentBalance, apy  │
│                                                             │
│  ┌──────────────────┐   ┌─────────────────────┐            │
│  │  useUserActions  │   │  balanceHistoryData │            │
│  │  (fetch events)  │   │  (from parent)      │            │
│  └────────┬─────────┘   └──────────┬──────────┘            │
│           │                        │                        │
│           ▼                        ▼                        │
│  ┌──────────────────────────────────────────────────┐      │
│  │            BalanceBarChart Component              │      │
│  │  ┌─────────────────────────────────────────────┐ │      │
│  │  │  Tabs: [1W] [1M] [1Y] [All] [Projection]    │ │      │
│  │  └─────────────────────────────────────────────┘ │      │
│  │  ┌─────────────────────────────────────────────┐ │      │
│  │  │  aggregateDataByPeriod(selectedTab)         │ │      │
│  │  └────────────────────┬────────────────────────┘ │      │
│  │                       ▼                          │      │
│  │  ┌─────────────────────────────────────────────┐ │      │
│  │  │  BarChart with:                             │ │      │
│  │  │  - Bars for each period                     │ │      │
│  │  │  - Event markers at bar base                │ │      │
│  │  │  - Custom tooltip on hover                  │ │      │
│  │  └─────────────────────────────────────────────┘ │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## Period Aggregation Logic

### 1W (7 days)
- Generate 7 bars from `today - 6 days` to `today`
- Each bar = 1 day
- For each day: find balance from chartData, calculate daily yield

### 1M (30 days)
- Generate 30 bars from `today - 29 days` to `today`
- Each bar = 1 day
- Same logic as 1W

### 1Y (12 months)
- Generate 12 bars from `today - 11 months` to `today`
- Each bar = 1 month
- Take end-of-month balance for each month
- Calculate yield as: month_end_balance - month_start_balance - net_deposits_in_month

### All
- Start from day before firstEventDate
- Group all data by month
- Calculate bars for each month with data

### Projection
- Start from current balance
- Apply compound interest: `balance * (1 + apy/100)^year`
- Generate 20 bars (configurable)
- Mark all as `isProjected: true`

---

## Visual Design Notes

### Bar Appearance
- Fill: Gradient from `hsl(var(--chart-2))` (bottom) to lighter shade (top)
- Border radius on top corners
- Gap between bars: ~4px

### Event Markers
- Position: Centered below each bar, near x-axis
- Size: 16px icons
- Colors by type:
  - supply/deposit: green (#22c55e)
  - withdraw: red (#ef4444)
  - borrow: orange (#f97316)
  - repay: blue (#3b82f6)
  - claim: purple (#a855f7)
  - liquidate: red (#dc2626)

### Tooltip
- Background: Card background color
- Border: 1px border with muted color
- Shadow: subtle shadow
- Content padding: 12px
- Min width: 200px

---

## Files to Create/Modify

### New Files
1. `lib/chart-utils.ts` - Data aggregation functions
2. `components/balance-bar-chart.tsx` - Main bar chart component
3. `components/chart-tooltip.tsx` - Custom tooltip (optional, could be inline)

### Modified Files
1. `types/balance-history.ts` - Add new types
2. `components/wallet-balance.tsx` - Replace AreaChart with BalanceBarChart
3. `components/ui/tabs.tsx` - Add if not present (via shadcn)

---

## Testing Checklist

- [ ] All 5 tabs render correctly
- [ ] 1W shows 7 daily bars
- [ ] 1M shows 30 daily bars
- [ ] 1Y shows 12 monthly bars
- [ ] All shows correct range from first event
- [ ] Projection shows 20 yearly bars with compounding
- [ ] Event markers appear on correct bars
- [ ] Multiple events on same bar handled correctly
- [ ] Tooltip shows balance, yield, and events
- [ ] Loading state displays skeleton
- [ ] Empty state handled gracefully
- [ ] Demo mode works with dummy data
- [ ] Responsive on mobile
- [ ] "View Full History" dialog works

---

## Design Decisions (Confirmed)

1. **Projection APY**: Use current weighted average APY for compound projections

2. **Event aggregation for 1Y/All**: Show icon + count badge when multiple events, full list in tooltip

3. **Empty periods**: Show zero-height bar to maintain timeline continuity

4. **Today marker**: No special visual distinction needed
