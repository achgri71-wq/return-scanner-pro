import { useEffect } from 'react'

interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

/**
 * Keeps the screen awake during long scan sessions when enabled.
 * Silently degrades on unsupported browsers.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const request = async () => {
      try {
        const api = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock
        if (!api?.request) return
        const next = await api.request('screen')
        if (cancelled) {
          void next.release()
          return
        }
        sentinel = next
        next.addEventListener('release', () => {
          sentinel = null
        })
      } catch {
        /* not supported or denied */
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel) void sentinel.release()
    }
  }, [enabled])
}
