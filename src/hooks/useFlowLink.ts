import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import { toast } from '../components/Toast'
import { onLinkUpdate, syncFlow } from '../lib/flowLink'

const SYNC_INTERVAL_MS = 60 * 1000
const INITIAL_DELAY_MS = 3000

/**
 * Background link with ColisFlow: publishes this app's return statuses into
 * the shared browser database and refreshes the distributor cache used by
 * the search page. Both apps live on the same origin, so no server is
 * involved — updates are also exchanged instantly through BroadcastChannel.
 */
export function useFlowLink(enabled: boolean): void {
  const { t } = useI18n()

  const busy = useRef(false)
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    if (!enabled) return
    let stopped = false

    const sync = async () => {
      if (stopped || busy.current) return
      busy.current = true
      try {
        const result = await syncFlow(() => {
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
          toast(tRef.current('flow.synced', { count: result.pushed }), 'info')
        }
      } catch (error) {
        console.warn('flow link sync failed:', error)
      } finally {
        busy.current = false
      }
    }

    const tick = () => void sync()
    const offLink = onLinkUpdate(tick)

    const timers: number[] = []
    timers.push(window.setTimeout(tick, INITIAL_DELAY_MS))
    timers.push(window.setInterval(tick, SYNC_INTERVAL_MS))
    document.addEventListener('visibilitychange', tick)

    return () => {
      stopped = true
      offLink()
      for (const id of timers) {
        clearTimeout(id)
        clearInterval(id)
      }
      document.removeEventListener('visibilitychange', tick)
    }
  }, [enabled])
}
