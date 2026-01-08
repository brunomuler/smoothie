/**
 * API Utilities
 *
 * Provides standardized patterns for API route handlers:
 * - createApiHandler: Factory for GET handlers
 * - createPostApiHandler: Factory for POST handlers
 * - Error types and utilities
 * - Response helpers
 * - Query parameter validators
 */

// Handler factory
export {
  createApiHandler,
  createPostApiHandler,
  type ApiHandlerConfig,
  type HandlerContext,
  type RedisCacheConfig,
} from './create-api-handler'

// Error types
export {
  ApiError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  isApiError,
} from './errors'

// Response utilities
export {
  jsonResponse,
  errorResponse,
  CACHE_CONFIGS,
  type CacheConfig,
  type ApiErrorResponse,
} from './responses'

// Query validators
export {
  requireString,
  optionalString,
  requireInt,
  optionalInt,
  parseList,
  requireList,
  parseJson,
  getTimezone,
  type ParsedParams,
} from './query-validators'

// Wallet address resolution (for demo wallet support)
export {
  resolveWalletAddress,
  resolveWalletAddresses,
  isDemoWalletParam,
} from './resolve-wallet'
