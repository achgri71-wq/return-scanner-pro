import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Archive,
  ArrowLeftRight,
  BadgeAlert,
  BarChart3,
  BookOpen,
  ClipboardList,
  Cloud,
  CloudOff,
  DatabaseBackup,
  History,
  Languages,
  ListChecks,
  Menu,
  Moon,
  PackageCheck,
  PackageX,
  ScanLine,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  Sun,
  Users,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useStore, useActiveList } from '../store/useStore'
import { useI18n } from '../i18n'
import { useOnline } from '../hooks/useOnline'
import { useWakeLock } from '../hooks/useWakeLock'
import { cx } from '../lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  primary?: boolean
}

export function Layout() {
  const { t } = useI18n()
  const location = useLocation()
  const activeList = useActiveList()
  const settings = useStore((state) => state.settings)
  const setSettings = useStore((state) => state.setSettings)
  const persistStatus = useStore((state) => state.persistStatus)
  const lastSavedAt = useStore((state) => state.lastSavedAt)
  const online = useOnline()
  useWakeLock(settings.keepAwake)

  const primary: NavItem[] = [
    { to: '/lists', label: t('nav.lists'), icon: ListChecks, primary: true },
    { to: '/scan', label: t('nav.scan'), icon: ScanLine, primary: true },
    { to: '/search', label: t('nav.search'), icon: Search, primary: true },
    { to: '/more', label: t('nav.more'), icon: Menu, primary: true },
  ]

  const secondary: NavItem[] = [
    { to: '/records', label: t('nav.records'), icon: ClipboardList },
    { to: '/blacklist', label: t('nav.blacklist'), icon: BadgeAlert },
    { to: '/reports', label: t('nav.reports'), icon: BarChart3 },
    { to: '/employees', label: t('nav.employees'), icon: Users },
    { to: '/audit', label: t('nav.audit'), icon: History },
    { to: '/settings', label: t('nav.settings'), icon: SettingsIcon },
  ]

  const isSecondary = secondary.some((item) => location.pathname.startsWith(item.to))

  const persistLabel =
    persistStatus === 'saving'
      ? t('app.saving')
      : persistStatus === 'error'
        ? t('app.saveError')
        : lastSavedAt
          ? t('app.saved')
          : t('common.loading')

  const ThemeIcon = settings.theme === 'light' ? Sun : Moon

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" end>
          <span className="brand-mark">
            <ArrowLeftRight size={22} />
          </span>
          <span className="brand-text">
            <strong>ReturnScanner</strong>
            <small>{t('app.tagline')}</small>
          </span>
        </NavLink>

        <nav className="side-nav">
          <span className="side-nav-title">{t('nav.home')}</span>
          {primary.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
          <span className="side-nav-title">{t('nav.more')}</span>
          {secondary.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className={cx('conn-pill', online ? 'is-online' : 'is-offline')}>
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            {online ? t('app.online') : t('app.offline')}
          </span>
          <small>{t('settings.localOnlyText')}</small>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-brand">
            <span className="brand-mark small">
              <ArrowLeftRight size={18} />
            </span>
            <strong>ReturnScanner</strong>
          </div>

          <div className="topbar-status">
            {activeList ? (
              <NavLink to={`/lists/${activeList.id}`} className="active-chip" title={activeList.name}>
                <span className="chip-pulse" />
                <span className="chip-text">{activeList.name}</span>
              </NavLink>
            ) : (
              <span className="active-chip is-empty">
                <span className="chip-pulse" />
                <span className="chip-text">{t('dashboard.noActive')}</span>
              </span>
            )}
            <span
              className={cx(
                'save-pill',
                persistStatus === 'saving' && 'is-saving',
                persistStatus === 'error' && 'is-error',
              )}
              title={persistLabel}
            >
              {persistStatus === 'error' ? <CloudOff size={15} /> : <Cloud size={15} />}
              <span className="save-label">{persistLabel}</span>
            </span>
            <span className={cx('conn-pill compact', online ? 'is-online' : 'is-offline')}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            </span>
          </div>

          <div className="topbar-actions">
            <NavLink to="/search" className="icon-btn topbar-search" aria-label={t('search.title')} title={t('search.title')}>
              <Search size={18} />
            </NavLink>
            <button
              type="button"
              className="icon-btn"
              onClick={() =>
                setSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' })
              }
              aria-label={t('settings.theme')}
              title={t('settings.theme')}
            >
              <ThemeIcon size={18} />
            </button>
            <button
              type="button"
              className="icon-btn lang-btn"
              onClick={() => setSettings({ lang: settings.lang === 'fr' ? 'ar' : 'fr' })}
              aria-label={t('settings.language')}
              title={t('settings.language')}
            >
              <Languages size={18} />
              <span>{settings.lang === 'fr' ? 'AR' : 'FR'}</span>
            </button>
          </div>
        </header>

        {!online ? (
          <div className="offline-banner">
            <CloudOff size={15} />
            {t('app.offline')} — {t('settings.localOnlyText')}
          </div>
        ) : null}

        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label={t('app.name')}>
        {primary
          .filter((item) => item.to !== '/search')
          .map((item) => {
            const Icon = item.icon
            const active =
              item.to === '/more'
                ? isSecondary
                : location.pathname === item.to ||
                  (item.to === '/lists' && location.pathname.startsWith('/lists'))
            if (item.to === '/scan') {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={cx('bottom-scan', active && 'is-active')}
                >
                  <span className="bottom-scan-circle">
                    <Icon size={25} />
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              )
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={cx('bottom-link', active && 'is-active')}
              >
                <Icon size={21} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
      </nav>
    </div>
  )
}

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cx('side-link', isActive && 'is-active')}
    >
      <Icon size={18} />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function MorePage() {
  const { t } = useI18n()

  const items = [
    { to: '/records?tab=returned', label: t('returned.title'), icon: PackageCheck, tone: 'green' },
    { to: '/records?tab=remaining', label: t('remaining.title'), icon: ClipboardList, tone: 'amber' },
    { to: '/records?tab=notRequired', label: t('notRequired.title'), icon: PackageX, tone: 'orange' },
    { to: '/blacklist', label: t('blacklist.title'), icon: ShieldAlert, tone: 'red' },
    { to: '/records?tab=registry', label: t('registry.title'), icon: BookOpen, tone: 'blue' },
    { to: '/reports', label: t('reports.title'), icon: BarChart3, tone: 'violet' },
    { to: '/employees', label: t('employees.title'), icon: Users, tone: 'cyan' },
    { to: '/settings', label: t('backups.title'), icon: DatabaseBackup, tone: 'indigo' },
    { to: '/audit', label: t('audit.title'), icon: History, tone: 'slate' },
    { to: '/settings', label: t('settings.title'), icon: SettingsIcon, tone: 'slate' },
  ]

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <h1>{t('nav.more')}</h1>
        </div>
      </header>

      <div className="more-grid">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} className={cx('more-tile', `tone-${item.tone}`)}>
              <span className="more-icon">
                <Icon size={22} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>

      <div className="card more-card">
        <div className="more-row">
          <span className="more-row-icon">
            <Archive size={18} />
          </span>
          <div>
            <strong>Return Scanner Pro</strong>
            <small>v1.0.0 · {t('settings.localOnly')}</small>
          </div>
        </div>
      </div>
    </div>
  )
}
