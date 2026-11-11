import { useEffect, useState } from 'react'
import {
  BellRing,
  DatabaseBackup,
  Download,
  Fingerprint,
  Info,
  Languages,
  Moon,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Volume2,
  Vibrate,
  Monitor,
  UserRound,
  Eye,
} from 'lucide-react'
import type { ThemeMode } from '../types'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import { testFeedback, unlockAudio, type SoundKind } from '../lib/feedback'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { isStandalone } from '../lib/utils'
import {
  Badge,
  PageHeader,
  Section,
  Segmented,
  StatCard,
  Toggle,
} from '../components/ui'
import { toast } from '../components/Toast'

const SOUNDS: Array<{ kind: SoundKind; labelKey: 'settings.soundSuccess' | 'settings.soundRejection' | 'settings.soundWarning' | 'settings.soundDuplicate'; tone: string }> = [
  { kind: 'success', labelKey: 'settings.soundSuccess', tone: 'success' },
  { kind: 'rejection', labelKey: 'settings.soundRejection', tone: 'danger' },
  { kind: 'warning', labelKey: 'settings.soundWarning', tone: 'warning' },
  { kind: 'duplicate', labelKey: 'settings.soundDuplicate', tone: 'info' },
]

export function SettingsPage() {
  const { t } = useI18n()
  const settings = useStore((state) => state.settings)
  const setSettings = useStore((state) => state.setSettings)
  const { canInstall, installed, install } = useInstallPrompt()

  const [operatorName, setOperatorName] = useState(settings.operatorName)
  const [adminPin, setAdminPin] = useState(settings.adminPin)
  const [reminderDays, setReminderDays] = useState(String(settings.backupReminderDays))
  const [showPin, setShowPin] = useState(false)

  useEffect(() => {
    setOperatorName(settings.operatorName)
    setAdminPin(settings.adminPin)
    setReminderDays(String(settings.backupReminderDays))
  }, [settings.operatorName, settings.adminPin, settings.backupReminderDays])

  const saveIdentity = () => {
    setSettings({
      operatorName: operatorName.trim(),
      adminPin: adminPin.trim(),
      backupReminderDays: Math.min(365, Math.max(1, Number(reminderDays) || 7)),
    })
    toast(t('toast.settingsSaved'))
  }

  const testSound = (kind: SoundKind) => {
    unlockAudio()
    testFeedback(kind, {
      enabled: true,
      volume: settings.volume,
      speech: settings.speech,
      haptics: settings.haptics,
      lang: settings.lang,
    })
  }

  const doInstall = async () => {
    if (installed || isStandalone()) return
    const ok = await install()
    if (!ok) toast(t('toast.installUnavailable'), 'warning')
  }

  return (
    <div className="page">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="stats-grid">
        <StatCard
          icon={ShieldCheck}
          label={t('settings.localOnly')}
          value={t('settings.offlineReady')}
          hint={t('settings.localOnlyText')}
          tone="success"
        />
        <StatCard
          icon={Languages}
          label={t('settings.language')}
          value={settings.lang === 'fr' ? 'Français' : 'العربية'}
          hint={settings.lang === 'ar' ? 'RTL' : 'LTR'}
          tone="info"
        />
        <StatCard
          icon={settings.sounds ? Volume2 : BellRing}
          label={t('settings.sound')}
          value={settings.sounds ? t('common.enabled') : t('common.disabled')}
          hint={`${Math.round(settings.volume * 100)}%`}
          tone={settings.sounds ? 'accent' : 'muted'}
        />
      </div>

      <Section title={t('settings.theme')}>
        <div className="settings-grid">
          <div className="settings-block">
            <span className="field-label">{t('settings.language')}</span>
            <Segmented
              value={settings.lang}
              onChange={(value) => setSettings({ lang: value })}
              options={[
                { value: 'fr', label: 'Français' },
                { value: 'ar', label: 'العربية' },
              ]}
            />
            <p className="hint">{t('settings.subtitle')}</p>
          </div>
          <div className="settings-block">
            <span className="field-label">{t('settings.theme')}</span>
            <Segmented
              value={settings.theme}
              onChange={(value) => setSettings({ theme: value as ThemeMode })}
              options={[
                { value: 'dark', label: <span className="segment-icon"><Moon size={15} /> {t('settings.dark')}</span> },
                { value: 'light', label: <span className="segment-icon"><Sun size={15} /> {t('settings.light')}</span> },
                { value: 'system', label: <span className="segment-icon"><Monitor size={15} /> {t('settings.system')}</span> },
              ]}
            />
            <p className="hint">{t('settings.theme')}</p>
          </div>
        </div>
      </Section>

      <Section title={t('settings.sound')}>
        <Toggle
          checked={settings.sounds}
          onChange={(checked) => setSettings({ sounds: checked })}
          label={t('settings.sound')}
          description={t('settings.soundText')}
          icon={Volume2}
        />

        <div className="volume-row">
          <label className="field-label" htmlFor="volume">
            {t('settings.volume')} — {Math.round(settings.volume * 100)}%
          </label>
          <input
            id="volume"
            type="range"
            className="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.volume * 100)}
            onChange={(event) => setSettings({ volume: Number(event.target.value) / 100 })}
          />
        </div>

        <div className="sound-grid">
          {SOUNDS.map((sound) => (
            <button
              key={sound.kind}
              type="button"
              className={`sound-test tone-${sound.tone}`}
              onClick={() => testSound(sound.kind)}
            >
              <span className="sound-wave" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>{t(sound.labelKey)}</span>
              <small>{t('common.test')}</small>
            </button>
          ))}
        </div>

        <Toggle
          checked={settings.speech}
          onChange={(checked) => setSettings({ speech: checked })}
          label={t('settings.speech')}
          description={t('settings.speechText')}
          icon={Sparkles}
        />
        <Toggle
          checked={settings.haptics}
          onChange={(checked) => setSettings({ haptics: checked })}
          label={t('settings.haptics')}
          description={t('settings.haptics')}
          icon={Vibrate}
        />
      </Section>

      <Section title={t('scan.title')}>
        <Toggle
          checked={settings.autoFocus}
          onChange={(checked) => setSettings({ autoFocus: checked })}
          label={t('settings.autoFocus')}
          description={t('settings.autoFocusText')}
          icon={ScanLine}
        />
        <Toggle
          checked={settings.keepAwake}
          onChange={(checked) => setSettings({ keepAwake: checked })}
          label={t('settings.keepAwake')}
          description={t('settings.keepAwakeText')}
          icon={Eye}
        />
        <Toggle
          checked={settings.confirmSwitch}
          onChange={(checked) => setSettings({ confirmSwitch: checked })}
          label={t('settings.confirmSwitch')}
          description={t('settings.confirmSwitchText')}
          icon={ShieldCheck}
        />
      </Section>

      <Section title={t('settings.security')}>
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="operator-name">
              <UserRound size={14} /> {t('settings.operator')}
            </label>
            <input
              id="operator-name"
              className="input"
              value={operatorName}
              onChange={(event) => setOperatorName(event.target.value)}
              placeholder={t('settings.operatorPlaceholder')}
              maxLength={80}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="admin-pin">
              <Fingerprint size={14} /> {t('settings.adminPin')}
            </label>
            <div className="input-with-action">
              <input
                id="admin-pin"
                className="input mono"
                type={showPin ? 'text' : 'password'}
                value={adminPin}
                onChange={(event) => setAdminPin(event.target.value)}
                placeholder="••••"
                autoComplete="new-password"
                maxLength={32}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPin((value) => !value)}
                title={showPin ? t('common.close') : t('common.open')}
              >
                <Eye size={16} />
              </button>
            </div>
            <small className="field-hint">{t('settings.adminPinText')}</small>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="reminder-days">
              <DatabaseBackup size={14} /> {t('settings.backupReminder')}
            </label>
            <div className="input-with-suffix">
              <input
                id="reminder-days"
                className="input"
                type="number"
                min={1}
                max={365}
                value={reminderDays}
                onChange={(event) => setReminderDays(event.target.value)}
              />
              <span>{t('settings.days')}</span>
            </div>
            <small className="field-hint">
              {t('backups.autoWarn', { days: Number(reminderDays) || 7 })}
            </small>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={saveIdentity}>
            {t('common.save')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.install')}>
        <div className="install-row">
          <span className="install-icon">
            <Smartphone size={24} />
          </span>
          <div>
            <strong>{installed || isStandalone() ? t('settings.installed') : t('settings.install')}</strong>
            <p>{installed || isStandalone() ? t('settings.offlineReady') : t('settings.installText')}</p>
          </div>
          <Badge tone={installed || isStandalone() ? 'success' : canInstall ? 'accent' : 'neutral'} dot>
            {installed || isStandalone()
              ? t('common.enabled')
              : canInstall
                ? t('settings.install')
                : t('app.offline')}
          </Badge>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void doInstall()}
            disabled={installed || isStandalone() || !canInstall}
          >
            <Download size={16} />
            {installed || isStandalone() ? t('settings.installed') : t('settings.install')}
          </button>
        </div>
        {!canInstall && !installed && !isStandalone() ? (
          <div className="inline-alert info">{t('settings.installUnavailable')}</div>
        ) : null}
      </Section>

      <Section title={t('settings.about')}>
        <div className="about-grid">
          <div>
            <Info size={18} />
            <span>{t('settings.version')}</span>
            <strong>1.0.0</strong>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>{t('settings.privacy')}</span>
            <strong>{t('settings.localOnly')}</strong>
          </div>
          <div>
            <DatabaseBackup size={18} />
            <span>{t('backups.last')}</span>
            <strong>{settings.lastBackupAt ? settings.lastBackupAt.slice(0, 10) : t('backups.never')}</strong>
          </div>
        </div>
        <p className="hint">{t('settings.dataStored')} — {t('settings.localOnlyText')}</p>
      </Section>
    </div>
  )
}
