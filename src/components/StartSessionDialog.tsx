import { useEffect, useState } from 'react'
import { PlayCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n, errorKey } from '../i18n'
import { Modal, Spinner } from './ui'
import { toast } from './Toast'

interface StartSessionDialogProps {
  open: boolean
  listId?: string
  onClose: () => void
  onStarted?: () => void
}

export function StartSessionDialog({ open, listId, onClose, onStarted }: StartSessionDialogProps) {
  const { t } = useI18n()
  const startSession = useStore((state) => state.startSession)
  const employees = useStore((state) => state.employees)
  const settings = useStore((state) => state.settings)
  const openSession = useStore((state) =>
    state.sessions.find((session) => session.status === 'open'),
  )
  const [employeeId, setEmployeeId] = useState(settings.currentEmployeeId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setEmployeeId(settings.currentEmployeeId ?? '')
      setError('')
      setBusy(false)
    }
  }, [open, settings.currentEmployeeId])

  const submit = () => {
    setBusy(true)
    setError('')
    const result = startSession(listId, employeeId || undefined)
    setBusy(false)
    if (!result.ok) {
      setError(t(errorKey(result.error)))
      return
    }
    toast(t('toast.sessionStarted'))
    onStarted?.()
    onClose()
  }

  const activeEmployees = employees.filter((employee) => employee.active)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('session.title')}
      subtitle={t('session.startText')}
      icon={<PlayCircle size={20} />}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner inline /> : <PlayCircle size={16} />}
            {t('session.start')}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="session-employee">
          {t('session.employee')}
        </label>
        <select
          id="session-employee"
          className="input"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
        >
          <option value="">{t('session.selectEmployee')}</option>
          {activeEmployees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name} {employee.role === 'admin' ? `(${t('common.admin')})` : ''}
            </option>
          ))}
        </select>
        {!activeEmployees.length ? <p className="hint">{t('employees.emptyText')}</p> : null}
      </div>

      {openSession ? (
        <div className="inline-alert warning">
          {t('session.startText')} — <strong>{openSession.listName}</strong>
        </div>
      ) : null}

      {error ? <div className="inline-alert danger">{error}</div> : null}
    </Modal>
  )
}
