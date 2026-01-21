/**
 * Comet Pool Utilities
 *
 * Provides functions to interact with the Comet AMM pool for BLND/USDC LP tokens.
 * Used for simulating single-sided deposits to get exact LP token amounts.
 */

import {
  Contract,
  nativeToScVal,
  xdr,
  rpc,
  Account,
  TransactionBuilder,
  BASE_FEE,
  scValToBigInt,
} from "@stellar/stellar-sdk";
import { FixedMath, parseResult } from "@blend-capital/blend-sdk";
import { getBlendNetwork } from "./network";

export interface CometSingleSidedDepositArgs {
  depositTokenAddress: string;
  depositTokenAmount: bigint;
  minLPTokenAmount: bigint;
  user: string;
}

/**
 * Client for interacting with the Comet AMM pool contract
 */
export class CometClient {
  private comet: Contract;

  constructor(address: string) {
    this.comet = new Contract(address);
  }

  /**
   * Create a single sided deposit operation for the Comet pool
   * @param args - Arguments for the deposit operation
   * @returns - An XDR operation
   */
  public depositTokenInGetLPOut(args: CometSingleSidedDepositArgs): xdr.Operation {
    const invokeArgs = {
      method: "dep_tokn_amt_in_get_lp_tokns_out",
      args: [
        nativeToScVal(args.depositTokenAddress, { type: "address" }),
        nativeToScVal(args.depositTokenAmount, { type: "i128" }),
        nativeToScVal(args.minLPTokenAmount, { type: "i128" }),
        nativeToScVal(args.user, { type: "address" }),
      ],
    };
    return this.comet.call(invokeArgs.method, ...invokeArgs.args);
  }
}

/**
 * Parse a simulation result to extract the return value as BigInt
 * Uses the same approach as Blend UI: parseResult + scValToBigInt
 */
function parseSimulationResult(simResult: rpc.Api.SimulateTransactionResponse): bigint | null {
  if (!rpc.Api.isSimulationSuccess(simResult)) {
    return null;
  }

  try {
    // Use parseResult from Blend SDK + scValToBigInt from Stellar SDK
    // This is exactly what Blend UI does
    const result = parseResult(simResult, (xdrString: string) => {
      return scValToBigInt(xdr.ScVal.fromXDR(xdrString, "base64"));
    });
    return result ?? null;
  } catch (e) {
    console.warn("[comet] Failed to parse simulation result:", e);
    return null;
  }
}

/**
 * Simulate a single-sided BLND deposit to get the exact LP tokens out
 *
 * This replicates what Blend UI does via cometContract.depositTokenInGetLPOut()
 * and useSimulateOperation to get the exact LP token amount from the contract.
 *
 * @param cometPoolAddress - Address of the comet LP token contract
 * @param blndTokenAddress - Address of the BLND token
 * @param backstopAddress - Address of the backstop contract (used as the "user" for simulation)
 * @param blndAmount - Amount of BLND to simulate depositing (as a float, will be converted to 7 decimals)
 * @returns The simulated LP tokens out (as a float), or null if simulation fails
 */
// Dummy account for simulation - any valid G address works
const SIMULATION_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export async function simulateCometDeposit(
  cometPoolAddress: string,
  blndTokenAddress: string,
  backstopAddress: string,
  blndAmount: number
): Promise<number | null> {
  try {
    const network = getBlendNetwork();
    const stellarRpc = new rpc.Server(network.rpc);

    // Convert BLND amount to 7 decimal fixed-point
    const blndAmountFixed = FixedMath.toFixed(blndAmount, 7);

    // Create the comet client and operation
    const cometClient = new CometClient(cometPoolAddress);
    const operation = cometClient.depositTokenInGetLPOut({
      depositTokenAddress: blndTokenAddress,
      depositTokenAmount: blndAmountFixed,
      minLPTokenAmount: BigInt(0),
      user: backstopAddress,
    });

    // Build a transaction with the operation for simulation
    // Use a dummy G-address account since we're just simulating (contract addresses don't work)
    const dummyAccount = new Account(SIMULATION_ACCOUNT, "0");
    const transaction = new TransactionBuilder(dummyAccount, {
      networkPassphrase: network.passphrase,
      fee: BASE_FEE,
      timebounds: {
        minTime: 0,
        maxTime: Math.floor(Date.now() / 1000) + 5 * 60,
      },
    })
      .addOperation(operation)
      .build();

    // Simulate the transaction
    const simResult = await stellarRpc.simulateTransaction(transaction);

    // Check if simulation was successful
    if (!rpc.Api.isSimulationSuccess(simResult)) {
      console.warn("[comet] Simulation not successful:", simResult);
      return null;
    }

    // Parse the result
    const lpTokensOut = parseSimulationResult(simResult);
    if (lpTokensOut === null) {
      return null;
    }

    // Convert from 7 decimal fixed-point to float
    return FixedMath.toFloat(lpTokensOut, 7);
  } catch (error) {
    console.warn("[comet] Simulation failed:", error);
    return null;
  }
}
