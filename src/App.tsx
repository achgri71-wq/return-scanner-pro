import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout, MorePage } from './components/Layout'
import { ToastViewport } from './components/Toast'
import { Spinner } from './components/ui'
import { useStore } from './store/useStore'
import { useI18n } from './i18n'
import { installAudioUnlock } from './lib/feedback'
import { useWakeLock } from './hooks/useWakeLock'
import { ListsPage } from './pages/Lists'
import { ListDetailPage } from './pages/ListDetail'
import { ScanPage } from './pages/Scan'
import { SearchPage } from './pages/Search'
import { ReturnedPage, RemainingPage, NotRequiredPage } from './pages/Records'
import { BlacklistPage } from './pages/Blacklist'
import { RegistryPage } from './pages/Registry'
import { ReportsPage } from './pages/Reports'
import { EmployeesPage } from './pages/Employees'
import { BackupsPage } from './pages/Backups'
import { SettingsPage } from './pages/Settings'
import { AuditPage } from './pages/Audit'

function NotFoundPage() {
  const { t } = useI18n()
  return <Navigate to="/scan" replace state={{ message: t('common.noData') }} />
}

export default function App() {
  const ready = useStore((state) => state.ready)
  const loadError = useStore((state) => state.loadError)
  const init = useStore((state) => state.init)
  const settings = useStore((state) => state.settings)
  const { lang } = useI18n()
  useWakeLock(settings.keepAwake)

  useEffect(() => {
    void init()
    const uninstall = installAudioUnlock()
    return uninstall
  }, [init])

  useEffect(() => {
    const root = document.documentElement
    const dark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.dataset.theme = dark ? 'dark' : 'light'
    root.lang = lang
    root.dir = lang === 'ar' ? 'rtl' : 'ltr'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? '#070d18' : '#eef3fb')
  }, [settings.theme, lang])

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash-mark">RS</div>
        <h1>Return Scanner Pro</h1>
        <Spinner label="Chargement…" />
      </div>
    )
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, '') || undefined}>
      {loadError ? (
        <div className="fatal-banner" role="alert">
          {loadError}
        </div>
      ) : null}
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/scan" replace />} />
          <Route path="lists" element={<ListsPage />} />
          <Route path="lists/:listId" element={<ListDetailPage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="returned" element={<ReturnedPage />} />
          <Route path="remaining" element={<RemainingPage />} />
          <Route path="not-required" element={<NotRequiredPage />} />
          <Route path="blacklist" element={<BlacklistPage />} />
          <Route path="registry" element={<RegistryPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="backups" element={<BackupsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <ToastViewport />
    </BrowserRouter>
  )
}
