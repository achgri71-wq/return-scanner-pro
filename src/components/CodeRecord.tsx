import { useMemo } from 'react'
import { ScrollText } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n, type TKey } from '../i18n'
import type { ReturnStatus } from '../lib/flowLink'
import { formatDate, formatDateTime } from '../lib/utils'
import { Badge, Modal, type Tone } from './ui'
import { ParcelStatusBadge, RegistryStatusBadge } from './StatusBadge'

/**
 * Shared record of a single code: what ColisFlow knows about it (list + entry
 * date) and what this app knows (return status, Entrepôt, return list, blacklist).
 */

export const STATUS_TONES: Record<ReturnStatus, Tone> = {
  returned: 'success',
  pending: 'warning',
  'not-required': 'warning',
  prohibited: 'danger',
}

export const STATUS_KEYS: Record<ReturnStatus, TKey> = {
  returned: 'search.returnedStatus',
  pending: 'search.pendingStatus',
  'not-required': 'search.notRequiredStatus',
  prohibited: 'search.prohibitedStatus',
}

export interface CodeHit {
  code: string
  /** ColisFlow list holding the code (absent when only the Entrepôt knows it). */
  listName?: string
  date?: string
  archived: boolean
  /** Already present in this app's own scan registry (Entrepôt). */
  inEntrepot: boolean
}

export function CodeRecordModal({
  hit,
  statusOf,
  onClose,
}: {
  hit: CodeHit | null
  statusOf: Map<string, ReturnStatus>
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)

  const info = useMemo(() => {
    if (!hit) return null
    const key = hit.code.toUpperCase()
    const parcel = parcels.find((entry) => entry.code.toUpperCase() === key) ?? null
    const entry = registry.find((item) => item.code.toUpperCase() === key) ?? null
    const banned = blacklist.find((item) => item.code.toUpperCase() === key) ?? null
    const list = parcel ? lists.find((item) => item.id === parcel.listId) ?? null : null
    return { parcel, entry, banned, list }
  }, [hit, parcels, registry, blacklist, lists])

  const status = hit ? statusOf.get(hit.code.toUpperCase()) : undefined

  return (
    <Modal
      open={Boolean(hit)}
      onClose={onClose}
      title={t('fixed.codeRecord')}
      subtitle={hit?.code}
      icon={<ScrollText size={20} />}
      size="sm"
    >
      {hit && info ? (
        <div className="code-record">
          <div className="code-record-row">
            <span className="code-record-label">{t('fixed.labelStatus')}</span>
            <div className="code-record-value">
              {status ? (
                <Badge tone={STATUS_TONES[status]}>{t(STATUS_KEYS[status])}</Badge>
              ) : (
                <Badge tone="muted">{t('fixed.noStatus')}</Badge>
              )}
            </div>
          </div>

          <div className="code-record-row">
            <span className="code-record-label">{t('fixed.labelColisflow')}</span>
            <div className="code-record-value">
              {hit.listName ? (
                <>
                  <strong>{hit.listName}</strong>
                  {hit.date ? <small>{formatDateTime(hit.date, lang)}</small> : null}
                </>
              ) : (
                <Badge tone="muted">{t('fixed.notInColisflow')}</Badge>
              )}
            </div>
          </div>

          <div className="code-record-row">
            <span className="code-record-label">{t('fixed.labelEntrepot')}</span>
            <div className="code-record-value">
              {info.entry ? (
                <>
                  <RegistryStatusBadge
                    status={info.banned ? 'return-prohibited' : info.entry.status}
                  />
                  <small>
                    {t('registry.firstScan')} : {formatDate(info.entry.firstScanAt, lang)}
                  </small>
                  <small>
                    {t('records.attempts')} : {info.entry.attempts}
                  </small>
                </>
              ) : (
                <Badge tone="muted">{t('fixed.notInEntrepot')}</Badge>
              )}
            </div>
          </div>

          {info.parcel && info.list ? (
            <div className="code-record-row">
              <span className="code-record-label">{t('fixed.labelList')}</span>
              <div className="code-record-value">
                <strong>{info.list.name}</strong>
                <ParcelStatusBadge status={info.parcel.status} />
                <small>
                  {t('records.addedAt')} : {formatDate(info.parcel.addedAt, lang)}
                </small>
                {info.parcel.returnedAt ? (
                  <small>
                    {t('records.returnedAt')} : {formatDate(info.parcel.returnedAt, lang)}
                  </small>
                ) : null}
              </div>
            </div>
          ) : null}

          {info.banned ? (
            <div className="code-record-row">
              <span className="code-record-label">{t('fixed.labelBlacklist')}</span>
              <div className="code-record-value">
                <Badge tone="danger">{t('search.prohibitedStatus')}</Badge>
                {info.banned.reason ? <small>{info.banned.reason}</small> : null}
                {info.banned.addedAt ? (
                  <small>{formatDate(info.banned.addedAt, lang)}</small>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}
