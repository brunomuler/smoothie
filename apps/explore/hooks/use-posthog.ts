import posthog from 'posthog-js'

export function usePostHog() {
  const capture = (event: string, properties?: Record<string, any>) => {
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.capture(event, properties)
    }
  }

  const identify = (properties?: Record<string, any>) => {
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.identify(undefined, properties)
    }
  }

  return { capture, identify }
}
