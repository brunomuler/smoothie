import { useCallback } from 'react'
import posthog from 'posthog-js'

export function usePostHog() {
  const capture = useCallback((event: string, properties?: Record<string, any>) => {
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.capture(event, properties)
    }
  }, [])

  const identify = useCallback((properties?: Record<string, any>) => {
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.identify(undefined, properties)
    }
  }, [])

  return { capture, identify }
}
