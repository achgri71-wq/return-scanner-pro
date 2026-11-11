import { useMemo, useState } from 'react'
import {
  Crown,
  Pencil,
  Phone,
  Plus,
  Search,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react'
import type { Employee, EmployeeRole } from '../types'
import { useStore } from '../store/useStore'
import { useI18n, errorKey } from '../i18n'
import { computeEmployeeStats } from '../lib/stats'
import { formatDate, initials } from '../lib/utils'
import {
  Badge,
  EmptyState,
  Modal,
  PageHeader,
  SearchField,
  Section,
  SelectField,
  StatCard,
  Toggle,
} from '../components/ui'
import { toast } from '../components/Toast'

export function EmployeesPage() {
  const { t, lang } = useI18n()
  const employees = useStore((state) => state.employees)
  const sessions = useStore((state) => state.sessions)
  const events = useStore((state) => state.events)
  const parcels = useStore((state) => state.parcels)
  const lists = useStore((state) => state.lists)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)
  const audit = useStore((state) => state.audit)
  const settings = useStore((state) => state.settings)
  const setSettings = useStore((state) => state.setSettings)
  const addEmployee = useStore((state) => state.addEmployee)
  const updateEmployee = useStore((state) => state.updateEmployee)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<EmployeeRole>('operator')
  const [active, setActive] = useState(true)

  const data = useMemo(
    () => ({ lists, parcels, registry, events, blacklist, sessions, employees, audit }),
    [lists, parcels, registry, events, blacklist, sessions, employees, audit],
  )
  const stats = useMemo(() => computeEmployeeStats(data), [data])
  const statsById = useMemo(
    () => new Map(stats.map((row) => [row.employeeId, row])),
    [stats],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return employees
      .filter(
        (employee) =>
          !needle ||
          employee.name.toLocaleLowerCase().includes(needle) ||
          (employee.phone ?? '').toLocaleLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          a.name.localeCompare(b.name, lang === 'ar' ? 'ar' : 'fr'),
      )
  }, [employees, query, lang])

  const current = employees.find((employee) => employee.id === settings.currentEmployeeId)
  const activeCount = employees.filter((employee) => employee.active).length

  const openAdd = () => {
    setEditing(null)
    setName('')
    setPhone('')
    setRole('operator')
    setActive(true)
    setOpen(true)
  }

  const openEdit = (employee: Employee) => {
    setEditing(employee)
    setName(employee.name)
    setPhone(employee.phone ?? '')
    setRole(employee.role)
    setActive(employee.active)
    setOpen(true)
  }

  const submit = () => {
    if (editing) {
      const result = updateEmployee(editing.id, { name, phone, role, active })
      if (!result.ok) {
        toast(t(errorKey(result.error)), 'error')
        return
      }
      toast(t('toast.employeeUpdated'))
    } else {
      const result = addEmployee({ name, phone, role })
      if (!result.ok) {
        toast(t(errorKey(result.error)), 'error')
        return
      }
      toast(t('toast.employeeAdded'))
    }
    setOpen(false)
  }

  const useEmployee = (employee: Employee) => {
    setSettings({ currentEmployeeId: employee.id })
    toast(t('toast.employeeCurrent', { name: employee.name }))
  }

  const toggleActive = (employee: Employee) => {
    const result = updateEmployee(employee.id, { active: !employee.active })
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.employeeUpdated'))
  }

  return (
    <div className="page">
      <PageHeader
        title={t('employees.title')}
        subtitle={t('employees.subtitle')}
        actions={
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} />
            {t('employees.add')}
          </button>
        }
      />

      <div className="stats-grid">
        <StatCard
          icon={Users}
          label={t('employees.title')}
          value={employees.length}
          hint={`${activeCount} ${t('common.active').toLocaleLowerCase()}`}
          tone="info"
        />
        <StatCard
          icon={UserCheck}
          label={t('employees.current')}
          value={current?.name || t('common.none')}
          hint={current ? t('employees.select') : t('session.selectEmployee')}
          tone="success"
        />
        <StatCard
          icon={UserX}
          label={t('common.inactive')}
          value={employees.length - activeCount}
          tone="warning"
        />
      </div>

      <div className="callout info">
        <span className="callout-icon">
          <UserPlus size={20} />
        </span>
        <div className="callout-text">
          <strong>{t('employees.current')}</strong>
          <p>{current ? `${current.name} — ${t('employees.select')}` : t('session.selectEmployee')}</p>
        </div>
        {current ? (
          <span className="avatar">{initials(current.name)}</span>
        ) : null}
      </div>

      <Section>
        <div className="toolbar">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={t('search.placeholder')}
          />
          <Badge tone="neutral" dot>
            {visible.length} / {employees.length}
          </Badge>
        </div>

        {visible.length ? (
          <div className="record-list employee-list">
            {visible.map((employee) => {
              const row = statsById.get(employee.id)
              const isCurrent = employee.id === settings.currentEmployeeId
              return (
                <div
                  className={`record-row employee-row${isCurrent ? ' is-current' : ''}${employee.active ? '' : ' is-inactive'}`}
                  key={employee.id}
                >
                  <span className="avatar">{initials(employee.name)}</span>
                  <div className="record-main">
                    <div className="employee-title">
                      <strong>{employee.name}</strong>
                      <Badge tone={employee.role === 'admin' ? 'accent' : 'neutral'}>
                        {employee.role === 'admin' ? (
                          <Crown size={13} />
                        ) : (
                          <Users size={13} />
                        )}
                        {employee.role === 'admin' ? t('common.admin') : t('common.operator')}
                      </Badge>
                      {isCurrent ? (
                        <Badge tone="success" dot>
                          {t('employees.current')}
                        </Badge>
                      ) : null}
                      {!employee.active ? <Badge tone="muted">{t('common.inactive')}</Badge> : null}
                    </div>
                    <small>
                      {employee.phone ? (
                        <span>
                          <Phone size={13} /> {employee.phone}
                        </span>
                      ) : null}
                      <span>{t('common.created')} {formatDate(employee.createdAt, lang)}</span>
                    </small>
                  </div>
                  <div className="employee-kpis">
                    <span>
                      <strong>{row?.sessions ?? 0}</strong> {t('employees.sessions')}
                    </span>
                    <span>
                      <strong>{row?.scans ?? 0}</strong> {t('employees.scans')}
                    </span>
                    <span className="good">
                      <strong>{row?.accepted ?? 0}</strong> {t('employees.accepted')}
                    </span>
                  </div>
                  <div className="row-actions">
                    {employee.active && !isCurrent ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => useEmployee(employee)}
                      >
                        <UserCheck size={15} />
                        {t('employees.select')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-btn"
                      title={t('common.edit')}
                      onClick={() => openEdit(employee)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className={`icon-btn${employee.active ? ' danger' : ''}`}
                      title={employee.active ? t('employees.deactivate') : t('employees.activate')}
                      onClick={() => toggleActive(employee)}
                    >
                      {employee.active ? <UserX size={16} /> : <UserCheck size={16} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={employees.length ? t('lists.noMatch') : t('employees.empty')}
            text={employees.length ? t('lists.noMatchText') : t('employees.emptyText')}
            action={
              employees.length ? (
                <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>
                  <Search size={16} />
                  {t('common.reset')}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={openAdd}>
                  <Plus size={16} />
                  {t('employees.add')}
                </button>
              )
            }
          />
        )}
      </Section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('employees.editTitle') : t('employees.addTitle')}
        icon={editing ? <Pencil size={20} /> : <UserPlus size={20} />}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
              {editing ? t('common.save') : t('employees.add')}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="employee-name">
            {t('employees.name')} *
          </label>
          <input
            id="employee-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('employees.namePlaceholder')}
            autoFocus
            maxLength={80}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="employee-phone">
            {t('employees.phone')}
          </label>
          <input
            id="employee-phone"
            className="input"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t('employees.phonePlaceholder')}
            inputMode="tel"
            maxLength={30}
          />
        </div>
        <SelectField
          label={t('employees.role')}
          value={role}
          onChange={(value) => setRole(value as EmployeeRole)}
          options={[
            { value: 'operator', label: t('common.operator') },
            { value: 'admin', label: t('common.admin') },
          ]}
        />
        {editing ? (
          <Toggle
            checked={active}
            onChange={setActive}
            label={t('employees.active')}
            description={t('employees.deactivate')}
            icon={UserCheck}
          />
        ) : null}
      </Modal>
    </div>
  )
}
