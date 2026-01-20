/**
 * APY Simulator - Predicts how APY changes based on deposit/withdraw/borrow/repay actions
 *
 * Based on Blend Protocol's interest rate model:
 * - 3-tier utilization-based interest rate
 * - Dynamic interest rate modifier
 * - Supply APY derived from borrow APY and utilization
 */

export type SimulationAction = "deposit" | "withdraw" | "borrow" | "repay";

export interface ReserveConfig {
  rBase: number; // Base interest rate (7 decimals in contract, normalized here)
  rOne: number; // Rate slope for tier 1 (below target utilization)
  rTwo: number; // Rate slope for tier 2 (target to 95%)
  rThree: number; // Rate slope for tier 3 (above 95%)
  targetUtil: number; // Target utilization (e.g., 0.8 = 80%)
  maxUtil: number; // Maximum utilization allowed
}

export interface SimulationInput {
  currentTotalSupply: number; // Current total supplied in pool (in tokens)
  currentTotalBorrow: number; // Current total borrowed from pool (in tokens)
  action: SimulationAction;
  amount: number; // Amount for action (in tokens)
  reserveConfig: ReserveConfig;
  irModifier: number; // Current interest rate modifier (normalized, e.g., 1.0 = no modification)
  backstopTakeRate: number; // Pool's backstop take rate (e.g., 0.2 = 20%)
  // For BLND emission calculation
  blndEmissionsPerYear?: number; // Total BLND emissions for this reserve per year
  blndPrice?: number; // Current BLND price in USD
  assetPrice?: number; // Current asset price in USD
}

export interface SimulationResult {
  // Utilization
  currentUtilization: number;
  newUtilization: number;
  utilizationChange: number;
  // Supply APY
  currentSupplyApy: number;
  newSupplyApy: number;
  supplyApyChange: number;
  // Borrow APY
  currentBorrowApy: number;
  newBorrowApy: number;
  borrowApyChange: number;
  // BLND Emission APY (for suppliers)
  currentBlndApy: number;
  newBlndApy: number;
  blndApyChange: number;
  // Total (Supply + BLND)
  currentTotalApy: number;
  newTotalApy: number;
  totalApyChange: number;
  // Validation
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Calculate utilization ratio
 */
function calculateUtilization(
  totalBorrow: number,
  totalSupply: number
): number {
  if (totalSupply <= 0) return 0;
  return Math.min(totalBorrow / totalSupply, 1);
}

/**
 * Calculate borrow APR based on utilization using Blend's 3-tier model
 *
 * Blend Interest Rate Formula:
 * - If U <= target: rate = IR_mod * (r_base + (U / target) * r_one)
 * - If target < U <= 0.95: rate = IR_mod * (r_base + r_one + ((U - target) / (0.95 - target)) * r_two)
 * - If U > 0.95: rate = IR_mod * (r_base + r_one + r_two) + ((U - 0.95) / 0.05) * r_three
 */
function calculateBorrowApr(
  utilization: number,
  config: ReserveConfig,
  irModifier: number
): number {
  const { rBase, rOne, rTwo, rThree, targetUtil } = config;

  let rate: number;

  if (utilization <= targetUtil) {
    // Tier 1: Below target utilization
    const utilRatio = targetUtil > 0 ? utilization / targetUtil : 0;
    rate = irModifier * (rBase + utilRatio * rOne);
  } else if (utilization <= 0.95) {
    // Tier 2: Between target and 95%
    const utilRatio =
      0.95 - targetUtil > 0 ? (utilization - targetUtil) / (0.95 - targetUtil) : 0;
    rate = irModifier * (rBase + rOne + utilRatio * rTwo);
  } else {
    // Tier 3: Above 95%
    const utilRatio = (utilization - 0.95) / 0.05;
    rate = irModifier * (rBase + rOne + rTwo) + utilRatio * rThree;
  }

  return rate;
}

/**
 * Calculate supply APR from borrow APR
 * Supply APR = Borrow APR * Utilization * (1 - backstopTakeRate)
 */
function calculateSupplyApr(
  borrowApr: number,
  utilization: number,
  backstopTakeRate: number
): number {
  return borrowApr * utilization * (1 - backstopTakeRate);
}

/**
 * Convert APR to APY with compounding
 * APY = (1 + APR/periods)^periods - 1
 */
function aprToApy(apr: number, compoundingPeriods: number): number {
  if (apr <= 0) return 0;
  return Math.pow(1 + apr / compoundingPeriods, compoundingPeriods) - 1;
}

/**
 * Calculate BLND emission APY for suppliers
 * BLND APY = (emissions_per_year * BLND_price) / (total_supply * asset_price)
 */
function calculateBlndApy(
  totalSupply: number,
  blndEmissionsPerYear: number | undefined,
  blndPrice: number | undefined,
  assetPrice: number | undefined
): number {
  if (!blndEmissionsPerYear || !blndPrice || !assetPrice || totalSupply <= 0) {
    return 0;
  }

  const emissionsValuePerYear = blndEmissionsPerYear * blndPrice;
  const totalSupplyValue = totalSupply * assetPrice;

  if (totalSupplyValue <= 0) return 0;

  return emissionsValuePerYear / totalSupplyValue;
}

/**
 * Apply action to get new supply and borrow amounts
 */
function applyAction(
  currentSupply: number,
  currentBorrow: number,
  action: SimulationAction,
  amount: number
): { newSupply: number; newBorrow: number } {
  let newSupply = currentSupply;
  let newBorrow = currentBorrow;

  switch (action) {
    case "deposit":
      newSupply = currentSupply + amount;
      break;
    case "withdraw":
      newSupply = Math.max(0, currentSupply - amount);
      break;
    case "borrow":
      newBorrow = currentBorrow + amount;
      break;
    case "repay":
      newBorrow = Math.max(0, currentBorrow - amount);
      break;
  }

  return { newSupply, newBorrow };
}

/**
 * Validate the simulation inputs and results
 */
function validateSimulation(
  action: SimulationAction,
  amount: number,
  currentSupply: number,
  currentBorrow: number,
  newSupply: number,
  newBorrow: number,
  newUtilization: number,
  maxUtil: number
): { isValid: boolean; errorMessage?: string } {
  if (amount <= 0) {
    return { isValid: false, errorMessage: "Amount must be greater than 0" };
  }

  if (action === "withdraw" && amount > currentSupply) {
    return {
      isValid: false,
      errorMessage: "Cannot withdraw more than total supply",
    };
  }

  if (action === "repay" && amount > currentBorrow) {
    return {
      isValid: false,
      errorMessage: "Cannot repay more than total borrowed",
    };
  }

  if (newUtilization > maxUtil) {
    return {
      isValid: false,
      errorMessage: `Would exceed maximum utilization (${(maxUtil * 100).toFixed(0)}%)`,
    };
  }

  // Check if withdrawal would make utilization exceed max
  if (action === "withdraw" && newSupply > 0 && newBorrow / newSupply > maxUtil) {
    return {
      isValid: false,
      errorMessage: `Withdrawal would push utilization above ${(maxUtil * 100).toFixed(0)}%`,
    };
  }

  return { isValid: true };
}

/**
 * Main simulation function - predicts APY changes based on user action
 */
export function simulateApyChange(input: SimulationInput): SimulationResult {
  const {
    currentTotalSupply,
    currentTotalBorrow,
    action,
    amount,
    reserveConfig,
    irModifier,
    backstopTakeRate,
    blndEmissionsPerYear,
    blndPrice,
    assetPrice,
  } = input;

  // Calculate current state
  const currentUtilization = calculateUtilization(
    currentTotalBorrow,
    currentTotalSupply
  );
  const currentBorrowApr = calculateBorrowApr(
    currentUtilization,
    reserveConfig,
    irModifier
  );
  const currentSupplyApr = calculateSupplyApr(
    currentBorrowApr,
    currentUtilization,
    backstopTakeRate
  );

  // Convert APR to APY (borrow compounds daily, supply compounds weekly per Blend)
  const currentBorrowApy = aprToApy(currentBorrowApr, 365) * 100; // Convert to percentage
  const currentSupplyApy = aprToApy(currentSupplyApr, 52) * 100;

  // Calculate current BLND APY
  const currentBlndApy =
    calculateBlndApy(
      currentTotalSupply,
      blndEmissionsPerYear,
      blndPrice,
      assetPrice
    ) * 100;

  // Apply action to get new state
  const { newSupply, newBorrow } = applyAction(
    currentTotalSupply,
    currentTotalBorrow,
    action,
    amount
  );

  // Calculate new state
  const newUtilization = calculateUtilization(newBorrow, newSupply);

  // Validate
  const validation = validateSimulation(
    action,
    amount,
    currentTotalSupply,
    currentTotalBorrow,
    newSupply,
    newBorrow,
    newUtilization,
    reserveConfig.maxUtil
  );

  // Calculate new APYs
  const newBorrowApr = calculateBorrowApr(
    newUtilization,
    reserveConfig,
    irModifier
  );
  const newSupplyApr = calculateSupplyApr(
    newBorrowApr,
    newUtilization,
    backstopTakeRate
  );

  const newBorrowApy = aprToApy(newBorrowApr, 365) * 100;
  const newSupplyApy = aprToApy(newSupplyApr, 52) * 100;

  // Calculate new BLND APY (dilution effect for deposits, concentration for withdrawals)
  const newBlndApy =
    calculateBlndApy(newSupply, blndEmissionsPerYear, blndPrice, assetPrice) *
    100;

  // Calculate totals
  const currentTotalApy = currentSupplyApy + currentBlndApy;
  const newTotalApy = newSupplyApy + newBlndApy;

  return {
    // Utilization
    currentUtilization: currentUtilization * 100,
    newUtilization: newUtilization * 100,
    utilizationChange: (newUtilization - currentUtilization) * 100,
    // Supply APY
    currentSupplyApy,
    newSupplyApy,
    supplyApyChange: newSupplyApy - currentSupplyApy,
    // Borrow APY
    currentBorrowApy,
    newBorrowApy,
    borrowApyChange: newBorrowApy - currentBorrowApy,
    // BLND Emission APY
    currentBlndApy,
    newBlndApy,
    blndApyChange: newBlndApy - currentBlndApy,
    // Total
    currentTotalApy,
    newTotalApy,
    totalApyChange: newTotalApy - currentTotalApy,
    // Validation
    isValid: validation.isValid,
    errorMessage: validation.errorMessage,
  };
}

/**
 * Get dynamic slider amounts based on pool TVL
 */
export function getSliderAmounts(totalSupplied: number): number[] {
  // Base amounts for pools with >= $500k supplied
  const baseAmounts = [1000, 5000, 10000, 25000, 50000, 100000];

  // For smaller pools, scale down proportionally
  if (totalSupplied < 100000) {
    // Very small pool: 100, 500, 1k, 2.5k, 5k, 10k
    return [100, 500, 1000, 2500, 5000, 10000];
  } else if (totalSupplied < 500000) {
    // Small pool: 500, 1k, 5k, 10k, 25k, 50k
    return [500, 1000, 5000, 10000, 25000, 50000];
  }

  return baseAmounts;
}

/**
 * Format amount for display (compact notation)
 */
export function formatAmountCompact(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}k`;
  }
  return amount.toString();
}

/**
 * Get a human-readable explanation of the APY change
 */
export function getApyChangeExplanation(
  action: SimulationAction,
  amount: number,
  tokenSymbol: string,
  utilizationChange: number
): string {
  const formattedAmount = formatAmountCompact(amount);
  const utilizationDirection = utilizationChange > 0 ? "increases" : "decreases";
  const apyDirection = utilizationChange > 0 ? "increases" : "decreases";

  switch (action) {
    case "deposit":
      return `Depositing ${formattedAmount} ${tokenSymbol} ${utilizationDirection} utilization, which ${apyDirection} APY for all suppliers.`;
    case "withdraw":
      return `Withdrawing ${formattedAmount} ${tokenSymbol} ${utilizationDirection} utilization, which ${apyDirection} APY for all suppliers.`;
    case "borrow":
      return `Borrowing ${formattedAmount} ${tokenSymbol} ${utilizationDirection} utilization, which ${apyDirection} APY for suppliers and borrowers.`;
    case "repay":
      return `Repaying ${formattedAmount} ${tokenSymbol} ${utilizationDirection} utilization, which ${apyDirection} APY for suppliers and borrowers.`;
  }
}
