import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { ReturnParcel } from '../types'
import { useStore } from '../store/useStore'
import { useI18n, errorKey } from '../i18n'
import { Modal, Spinner } from './ui'
import { toast } from './Toast'

interface CorrectionDialogProps {
  open: boolean
  parcel: ReturnParcel | null
  onClose: () => void
  onDone?: () => void
}

export function CorrectionDialog({ open, parcel, onClose, onDone }: CorrectionDialogProps) {
  const { t } = useI18n()
  const correctReturn = useStore((state) => state.correctReturn)
  const settings = useStore((state) => state.settings)
  const employees = useStore((state) => state.employees)
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setReason('')
      setPin('')
      setError('')
      setBusy(false)
    }
  }, [open])

  if (!parcel) return null

  const submit = () => {
    const employee = employees.find((item) => item.id === settings.currentEmployeeId)
    const actor = employee?.name || settings.operatorName || 'local'
    setBusy(true)
    setError('')
    const result = correctReturn({
      parcelId: parcel.id,
      reason,
      actor,
      pin: pin || undefined,
    })
    setBusy(false)
    if (!result.ok) {
      setError(t(errorKey(result.error)))
      return
    }
    toast(t('toast.correctionDone'))
    onDone?.()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('correction.title')}
      subtitle={`${parcel.code} — ${t('correction.text')}`}
      icon={<ShieldAlert size={20} />}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={submit}
            disabled={busy || reason.trim().length < 5}
          >
            {busy ? <Spinner inline /> : <ShieldAlert size={16} />}
            {t('correction.confirm')}
          </button>
        </>
      }
    >
      <div className="inline-alert warning">{t('correction.text')}</div>

      <div className="field">
        <label className="field-label" htmlFor="correction-reason">
          {t('correction.reason')} *
        </label>
        <textarea
          id="correction-reason"
          className="input textarea"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('correction.reasonPlaceholder')}
          autoFocus
        />
      </div>

      {settings.adminPin ? (
        <div className="field">
          <label className="field-label" htmlFor="correction-pin">
            {t('correction.pin')}
          </label>
          <input
            id="correction-pin"
            className="input"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder={t('correction.pinPlaceholder')}
            autoComplete="off"
          />
        </div>
      ) : null}

      {error ? <div className="inline-alert danger">{error}</div> : null}
    </Modal>
  )
}
