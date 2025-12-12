/**
 * SVG icon path data extracted from Lucide icons (lucide-react v0.552.0)
 * Used for rendering icons inside SVG elements (e.g., Recharts custom components)
 *
 * All icons are designed for 24x24 viewBox with:
 * - stroke-width: 2
 * - stroke-linecap: round
 * - stroke-linejoin: round
 * - fill: none (stroke-based icons)
 */

export interface IconPathData {
  paths: string[]
  circles?: { cx: number; cy: number; r: number }[]
  rects?: { x: number; y: number; width: number; height: number; rx?: number }[]
}

/**
 * Event icon paths for chart rendering
 * Maps action types to their SVG path data
 */
export const EVENT_ICON_PATHS: Record<string, IconPathData> = {
  // CircleArrowDown - supply/deposit (green in history)
  supply: {
    paths: ["M12 8v8", "m8 12 4 4 4-4"],
    circles: [{ cx: 12, cy: 12, r: 10 }],
  },
  supply_collateral: {
    paths: ["M12 8v8", "m8 12 4 4 4-4"],
    circles: [{ cx: 12, cy: 12, r: 10 }],
  },

  // CircleArrowUp - withdraw (red in history)
  withdraw: {
    paths: ["m16 12-4-4-4 4", "M12 16V8"],
    circles: [{ cx: 12, cy: 12, r: 10 }],
  },
  withdraw_collateral: {
    paths: ["m16 12-4-4-4 4", "M12 16V8"],
    circles: [{ cx: 12, cy: 12, r: 10 }],
  },

  // Banknote - borrow (orange in history)
  borrow: {
    paths: ["M6 12h.01M18 12h.01"],
    circles: [{ cx: 12, cy: 12, r: 2 }],
    rects: [{ x: 2, y: 6, width: 20, height: 12, rx: 2 }],
  },

  // CircleCheckBig - repay (blue in history)
  repay: {
    paths: ["M21.801 10A10 10 0 1 1 17 3.335", "m9 11 3 3L22 4"],
  },

  // Flame - claim (purple in history)
  claim: {
    paths: [
      "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4",
    ],
  },

  // TriangleAlert - liquidate (red in history)
  liquidate: {
    paths: [
      "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      "M12 9v4",
      "M12 17h.01",
    ],
  },

  // Shield - backstop events (purple)
  backstop_deposit: {
    paths: [
      "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    ],
  },
  backstop_withdraw: {
    paths: [
      "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    ],
  },
  backstop_queue_withdrawal: {
    paths: [
      "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    ],
  },
  backstop_dequeue_withdrawal: {
    paths: [
      "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    ],
  },
  backstop_claim: {
    paths: [
      "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    ],
  },
}

// Fallback circle icon
export const FALLBACK_ICON: IconPathData = {
  paths: [],
  circles: [{ cx: 12, cy: 12, r: 10 }],
}

/**
 * Map event types to icon categories (for grouping events with same visual icon)
 */
export const EVENT_ICON_CATEGORY: Record<string, string> = {
  supply: 'arrow-down',
  supply_collateral: 'arrow-down',
  withdraw: 'arrow-up',
  withdraw_collateral: 'arrow-up',
  borrow: 'banknote',
  repay: 'check',
  claim: 'flame',
  liquidate: 'alert',
  backstop_deposit: 'shield',
  backstop_withdraw: 'shield',
  backstop_queue_withdrawal: 'shield',
  backstop_dequeue_withdrawal: 'shield',
  backstop_claim: 'shield',
}
