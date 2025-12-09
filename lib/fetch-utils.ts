/**
 * Fetch utilities with timeout and abort signal support
 */

const DEFAULT_TIMEOUT = 15000 // 15 seconds

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number
}

/**
 * Fetch with automatic timeout and abort signal support
 * Prevents hanging requests and supports React Query cancellation
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, signal: externalSignal, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // If an external signal is provided, abort when it does
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort())
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Create a query function that supports cancellation via AbortSignal
 * Use with React Query's signal option for automatic cancellation on unmount
 */
export function createCancellableFetch<T>(
  url: string,
  options: FetchWithTimeoutOptions = {}
) {
  return async ({ signal }: { signal?: AbortSignal }): Promise<T> => {
    const response = await fetchWithTimeout(url, {
      ...options,
      signal,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Request failed with status ${response.status}`)
    }

    return response.json()
  }
}
