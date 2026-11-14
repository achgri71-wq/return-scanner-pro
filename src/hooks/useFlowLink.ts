import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import { toast } from '../components/Toast'
import {
  DEFAULT_LINK_KEY,
  DEFAULT_LINK_URL,
  flowErrorKey,
  syncFlow,
} from '../lib/flowLink'

const SYNC_INTERVAL_MS = 5 * 60 * 1000
const INITIAL_DELAY_MS = 5000

/**
 * Background link with ColisFlow: publishes this app's return statuses to the
 * shared server slot and refreshes the distributor cache used by the search
 * page. Runs shortly after startup, then every few minutes while the app is
 * visible and online. Failures are silent and retried on the next tick.
 */
export function useFlowLink(enabled: boolean): void {
  const { t } = useI18n()
  const linkUrl = useStore((state) => state.settings.linkUrl)
  const linkKey = useStore((state) => state.settings.linkKey)

  const busy = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const url = (linkUrl || DEFAULT_LINK_URL).trim()
    const key = (linkKey || DEFAULT_LINK_KEY).trim()
    if (!url || !key) return

    let stopped = false
    const timers: number[] = []

    const sync = async () => {
      if (stopped || busy.current) return
      if (!navigator.onLine) return
      if (document.visibilityState !== 'visible') return
      busy.current = true
      try {
        const result = await syncFlow(url, key, () => {
          const state = useStore.getState()
          const listNames = new Map(state.lists.map((list) => [list.id, list.name]))
          return {
            parcels: state.parcels,
            registry: state.registry,
            blacklist: state.blacklist,
            listNames,
          }
        })
        if (result.pushed > 0) {
          toast(t('flow.synced', { count: result.pushed }), 'info')
        }
      } catch (error) {
        console.warn('flow link sync failed:', flowErrorKey(error))
      } finally {
        busy.current = false
      }
    }

    const tick = () => void sync()

    timers.push(window.setTimeout(tick, INITIAL_DELAY_MS))
    timers.push(window.setInterval(tick, SYNC_INTERVAL_MS))
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('online', tick)

    return () => {
      stopped = true
      for (const id of timers) {
        clearTimeout(id)
        clearInterval(id)
      }
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('online', tick)
    }
  }, [enabled, linkUrl, linkKey, t])
}
