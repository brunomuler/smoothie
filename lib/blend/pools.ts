import { Version } from "@blend-capital/blend-sdk";
import type { Pool } from "@/lib/db/types";

export interface TrackedPool {
  id: string;
  name: string;
  version: Version;
}

/**
 * Convert a DB Pool to a TrackedPool for use with the Blend SDK
 */
export function toTrackedPool(pool: Pool): TrackedPool {
  return {
    id: pool.pool_id,
    name: pool.name,
    version: pool.version === 1 ? Version.V1 : Version.V2,
  };
}

/**
 * Convert an array of DB Pools to TrackedPools
 */
export function toTrackedPools(pools: Pool[]): TrackedPool[] {
  return pools.map(toTrackedPool);
}
