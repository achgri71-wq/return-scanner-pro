import { useEffect, useMemo, useState } from 'react'
import { AlarmClock, Boxes, Inbox, MessageCircle, RefreshCw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import {
  buildReturnIndex,
  loadFlowDistributors,
  loadFlowPublishedAt,
  syncFlow,
  type FlowDistributor,
  type ReturnStatus,
} from '../lib/flowLink'
import { isFixedDistributor } from '../lib/fixedLists'
import { cx, formatDate, relativeTime } from '../lib/utils'
import { Badge, EmptyState, PageHeader } from '../components/ui'
import { CodeRecordModal, type CodeHit } from '../components/CodeRecord'

/**
 * Late-code notices.
 *
 * A code is "late" when it has been sitting in a normal ColisFlow distributor
 * for the configured number of days (Settings) without being resolved: it has
 * not been returned to us, moved to a permanent routeur list, nor scanned into
 * the Entrepôt. When a code was moved to another distributor the count restarts
 * from the move date, while the list keeps showing the code's original scan
 * date.
 *
 * Each distributor can be notified on WhatsApp with the list of its late codes.
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** Local numbers (06…) are turned into international form for wa.me. */
const COUNTRY_CODE = '212'

interface LateCode {
  code: string
  at: string
  days: number
}

interface LateGroup {
  name: string
  phone?: string
  codes: LateCode[]
}

function whatsappLink(phone: string | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const intl = digits.startsWith('0') ? `${COUNTRY_CODE}${digits.slice(1)}` : digits
  const query = `text=${encodeURIComponent(text)}`
  return intl ? `https://wa.me/${intl}?${query}` : `https://wa.me/?${query}`
}

export function LateCodesPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)
  const lateDays = useStore((state) => state.settings.lateDays)

  const [tick, setTick] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<CodeHit | null>(null)

  useEffect(() => {
    const handler = () => setTick((value) => value + 1)
    window.addEventListener('rsp.flow', handler)
    return () => window.removeEventListener('rsp.flow', handler)
  }, [])

  const flow = useMemo<FlowDistributor[]>(() => loadFlowDistributors(), [tick])
  // When ColisFlow last published on this browser; null means it never did.
  const publishedAt = useMemo(() => loadFlowPublishedAt(), [tick])

  const statusOf = useMemo(() => {
    const listNames = new Map(lists.map((list) => [list.id, list.name]))
    const index = buildReturnIndex({ parcels, registry, blacklist, listNames })
    const map = new Map<string, ReturnStatus>()
    for (const entry of index) map.set(entry.code.toUpperCase(), entry.status)
    return map
  }, [lists, parcels, registry, blacklist])

  const groups = useMemo<LateGroup[]>(() => {
    const now = Date.now()

    // Codes already resolved: returned to us, scanned into the Entrepôt, or
    // moved to one of the permanent routeur lists.
    const done = new Set<string>()
    for (const parcel of parcels) {
      if (parcel.status === 'returned') done.add(parcel.code.toUpperCase())
    }
    for (const entry of registry) done.add(entry.code.toUpperCase())
    for (const item of flow) {
      if (!isFixedDistributor(item)) continue
      for (const code of item.codes) done.add(code.toUpperCase())
    }

    const result: LateGroup[] = []
    for (const item of flow) {
      if (item.archived || isFixedDistributor(item)) continue
      const dates = item.dates ?? []
      const since = item.since ?? []
      const late: LateCode[] = []
      item.codes.forEach((code, index) => {
        const key = code.toUpperCase()
        if (done.has(key)) return
        const at = dates[index]
        // The late count runs from the move date when the code was moved;
        // without a move it falls back to the original scan date.
        const from = since[index] || at
        if (!from) return
        const stamp = Date.parse(from)
        if (Number.isNaN(stamp)) return
        const days = Math.floor((now - stamp) / DAY_MS)
        // One full day with the distributor already counts as late.
        if (days < lateDays) return
        late.push({ code, at: at || from, days })
      })
      if (!late.length) continue
      late.sort((a, b) => a.at.localeCompare(b.at))
      result.push({ name: item.name, phone: item.phone, codes: late })
    }

    // Order the distributors by the first letters of their name.
    result.sort((a, b) => a.name.localeCompare(b.name, lang === 'ar' ? 'ar' : 'fr'))
    return result
  }, [flow, parcels, registry, lang, lateDays])

  const total = useMemo(
    () => groups.reduce((sum, group) => sum + group.codes.length, 0),
    [groups],
  )

  const messageFor = (group: LateGroup): string => {
    const header = t('late.waHeader', { name: group.name, count: group.codes.length })
    const lines = group.codes.map((item) => `• ${item.code} — ${formatDate(item.at, lang)}`)
    return [header, '', ...lines, '', t('late.waFooter')].join('\n')
  }

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const state = useStore.getState()
      await syncFlow(() => ({
        parcels: state.parcels,
        registry: state.registry,
        blacklist: state.blacklist,
        listNames: new Map(state.lists.map((list) => [list.id, list.name])),
      }))
    } finally {
      setRefreshing(false)
      setTick((value) => value + 1)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('late.title')}
        subtitle={
          flow.length
            ? t('late.summary', { count: total, distributors: groups.length })
            : t('late.subtitle')
        }
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={cx(refreshing && 'spin')} />
            {t('fixed.refresh')}
          </button>
        }
      />

      {!flow.length ? (
        <EmptyState
          icon={Boxes}
          title={t('late.linkTitle')}
          text={
            publishedAt
              ? t('late.linkSeen', { when: relativeTime(publishedAt, lang) })
              : t('late.linkNever')
          }
        />
      ) : !groups.length ? (
        <EmptyState icon={Inbox} title={t('late.empty')} text={t('late.emptyText')} />
      ) : (
        <div className="late-grid">
          {groups.map((group) => (
            <article key={group.name} className="late-card">
              <header className="late-card-head">
                <span className="late-card-icon">
                  <AlarmClock size={18} />
                </span>
                <span className="late-card-name">{group.name}</span>
                <Badge tone="danger">{t('fixed.codes', { count: group.codes.length })}</Badge>
                <a
                  className="btn btn-primary btn-sm late-wa"
                  href={whatsappLink(group.phone, messageFor(group))}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={16} />
                  {t('late.whatsapp')}
                </a>
              </header>

              <ul className="late-codes">
                {group.codes.map((item) => (
                  <li key={item.code}>
                    <button
                      type="button"
                      className="late-code-row"
                      onClick={() =>
                        setSelected({
                          code: item.code,
                          listName: group.name,
                          date: item.at,
                          archived: false,
                          inEntrepot: false,
                        })
                      }
                      aria-label={item.code}
                    >
                      <span className="mono">{item.code}</span>
                      <span className="late-code-meta">
                        <span>{formatDate(item.at, lang)}</span>
                        <Badge tone="danger">{t('late.days', { count: item.days })}</Badge>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      <CodeRecordModal hit={selected} statusOf={statusOf} onClose={() => setSelected(null)} />
    </div>
  )
}
