import { Badge, type Tone } from './ui'
import { useI18n } from '../i18n'
import type {
  ListSource,
  ListStatus,
  ParcelStatus,
  RegistryStatus,
  ScanOutcomeStatus,
  ScanResultKind,
} from '../types'

const LIST_TONES: Record<ListStatus, Tone> = {
  new: 'info',
  active: 'success',
  completed: 'neutral',
  archived: 'muted',
}

export function ListStatusBadge({ status }: { status: ListStatus }) {
  const { t } = useI18n()
  return (
    <Badge tone={LIST_TONES[status]} dot>
      {t(`status.${status}` as 'status.new')}
    </Badge>
  )
}

export function ListSourceBadge({ source }: { source: ListSource }) {
  const { t } = useI18n()
  return <Badge tone="neutral">{t(`source.${source}` as 'source.manual')}</Badge>
}

export function ParcelStatusBadge({ status }: { status: ParcelStatus }) {
  const { t } = useI18n()
  return (
    <Badge tone={status === 'returned' ? 'success' : 'warning'} dot>
      {t(status === 'returned' ? 'status.returned' : 'status.pending')}
    </Badge>
  )
}

const REGISTRY_TONES: Record<RegistryStatus, Tone> = {
  'required-returned': 'success',
  'not-required': 'warning',
  'return-prohibited': 'danger',
}

export function RegistryStatusBadge({ status }: { status: RegistryStatus }) {
  const { t } = useI18n()
  const labels: Record<RegistryStatus, string> = {
    'required-returned': t('status.requiredReturned'),
    'not-required': t('status.notRequired'),
    'return-prohibited': t('status.prohibited'),
  }
  return (
    <Badge tone={REGISTRY_TONES[status]} dot>
      {labels[status]}
    </Badge>
  )
}

const RESULT_TONES: Record<ScanResultKind, Tone> = {
  accepted: 'success',
  duplicate: 'warning',
  blacklisted: 'danger',
  'not-required': 'warning',
  'other-list': 'info',
}

const RESULT_LABELS: Record<ScanResultKind, string> = {
  accepted: 'status.accepted',
  duplicate: 'status.duplicate',
  blacklisted: 'status.blacklisted',
  'not-required': 'status.notRequired',
  'other-list': 'status.otherList',
}

export function ScanResultBadge({ result }: { result: ScanResultKind }) {
  const { t } = useI18n()
  return (
    <Badge tone={RESULT_TONES[result]} dot>
      {t(RESULT_LABELS[result] as 'status.accepted')}
    </Badge>
  )
}

const OUTCOME_TONES: Record<ScanOutcomeStatus, Tone> = {
  accepted: 'success',
  duplicate: 'warning',
  blacklisted: 'danger',
  'not-required': 'warning',
  'other-list': 'info',
  invalid: 'muted',
  'no-list': 'muted',
  'list-closed': 'muted',
  ignored: 'muted',
}

const OUTCOME_LABELS: Record<ScanOutcomeStatus, string> = {
  accepted: 'scan.resultAccepted',
  duplicate: 'scan.resultDuplicate',
  blacklisted: 'scan.resultBlacklisted',
  'not-required': 'scan.resultNotRequired',
  'other-list': 'scan.resultOther',
  invalid: 'scan.resultInvalid',
  'no-list': 'scan.resultNoList',
  'list-closed': 'scan.resultClosed',
  ignored: 'scan.waiting',
}

export function OutcomeBadge({ status }: { status: ScanOutcomeStatus }) {
  const { t } = useI18n()
  return (
    <Badge tone={OUTCOME_TONES[status]} dot>
      {t(OUTCOME_LABELS[status] as 'scan.resultAccepted')}
    </Badge>
  )
}

export function AttemptsBadge({ count }: { count: number }) {
  return <Badge tone={count > 1 ? 'warning' : 'neutral'}>{count}×</Badge>
}
