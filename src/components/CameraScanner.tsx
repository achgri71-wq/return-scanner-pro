import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { CameraOff, Flashlight, Keyboard, ScanBarcode, SwitchCamera, X } from 'lucide-react'
import { normalizeCode } from '../lib/codes'
import { useI18n } from '../i18n'
import { cx } from '../lib/utils'
import { Modal } from './ui'

interface CameraScannerProps {
  open: boolean
  onClose: () => void
  onDetect: (code: string) => void
  continuous?: boolean
}

export function CameraScanner({ open, onClose, onDetect, continuous = true }: CameraScannerProps) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const onDetectRef = useRef(onDetect)
  const onCloseRef = useRef(onClose)
  onDetectRef.current = onDetect
  onCloseRef.current = onClose
  const lastHitRef = useRef<Map<string, number>>(new Map())

  const [status, setStatus] = useState<'starting' | 'running' | 'error'>('starting')
  const [deviceId, setDeviceId] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [detected, setDetected] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setManualMode(false)
      setManualValue('')
      setDetected(null)
      setTorchOn(false)
      setTorchAvailable(false)
      setStatus('starting')
    }
  }, [open])

  useEffect(() => {
    if (!open || manualMode) return

    let cancelled = false
    const reader = new BrowserMultiFormatReader()
    let controls: IScannerControls | null = null
    const hits = lastHitRef.current

    const start = async () => {
      setStatus('starting')
      try {
        const constraints: MediaStreamConstraints = deviceId
          ? { video: { deviceId: { exact: deviceId } } }
          : { video: { facingMode: { ideal: 'environment' } } }

        const nextControls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current ?? undefined,
          (result) => {
            if (!result) return
            const code = normalizeCode(result.getText())
            if (!code) return
            const now = Date.now()
            if (now - (hits.get(code) ?? 0) < 2200) return
            hits.set(code, now)

            setDetected(code)
            window.setTimeout(() => {
              setDetected((current) => (current === code ? null : current))
            }, 1800)
            onDetectRef.current(code)
            if (!continuous) onCloseRef.current()
          },
        )

        if (cancelled) {
          nextControls.stop()
          return
        }

        controls = nextControls
        controlsRef.current = nextControls
        setStatus('running')

        try {
          const list = (await navigator.mediaDevices.enumerateDevices()).filter(
            (device) => device.kind === 'videoinput',
          )
          if (!cancelled) setDevices(list)
        } catch {
          /* labels require permission */
        }

        try {
          const capabilities = nextControls.streamVideoCapabilitiesGet?.((track) => [
            track,
          ]) as (MediaTrackCapabilities & { torch?: boolean }) | undefined
          if (!cancelled) setTorchAvailable(Boolean(capabilities?.torch))
        } catch {
          if (!cancelled) setTorchAvailable(false)
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    void start()

    return () => {
      cancelled = true
      controls?.stop()
      controlsRef.current = null
    }
  }, [open, manualMode, deviceId, continuous])

  const switchCamera = () => {
    if (devices.length < 2) return
    const index = devices.findIndex((device) => device.deviceId === deviceId)
    const next = devices[(index + 1) % devices.length]
    if (next) {
      setTorchOn(false)
      setDeviceId(next.deviceId)
    }
  }

  const toggleTorch = async () => {
    const controls = controlsRef.current
    if (!controls?.switchTorch) return
    const next = !torchOn
    try {
      await controls.switchTorch(next)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  const submitManual = () => {
    const code = normalizeCode(manualValue)
    if (!code) return
    setManualValue('')
    onDetectRef.current(code)
    if (!continuous) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={manualMode ? t('scan.manual') : t('scan.cameraTitle')}
      subtitle={manualMode ? t('scan.placeholder') : t('scan.cameraHint')}
      icon={<ScanBarcode size={20} />}
      size="md"
      className="scanner-modal"
      footer={
        <>
          {!manualMode && status === 'running' ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void toggleTorch()}
                disabled={!torchAvailable}
              >
                <Flashlight size={16} className={cx(torchOn && 'is-on')} />
                {t('scan.torch')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={switchCamera}
                disabled={devices.length < 2}
              >
                <SwitchCamera size={16} />
                {t('scan.switchCamera')}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setManualMode((value) => !value)}
          >
            <Keyboard size={16} />
            {manualMode ? t('scan.cameraTitle') : t('scan.manual')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
            {t('common.close')}
          </button>
        </>
      }
    >
      {manualMode ? (
        <form
          className="scanner-manual"
          onSubmit={(event) => {
            event.preventDefault()
            submitManual()
          }}
        >
          <label className="field-label" htmlFor="scanner-manual-input">
            {t('common.code')}
          </label>
          <input
            id="scanner-manual-input"
            className="input input-mono"
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            placeholder={t('scan.placeholder')}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={!manualValue.trim()}>
            <ScanBarcode size={16} />
            {t('scan.submit')}
          </button>
        </form>
      ) : (
        <div className="scanner-view">
          <video ref={videoRef} className="scanner-video" muted playsInline autoPlay />
          <div className="scanner-frame" aria-hidden="true">
            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner bl" />
            <span className="corner br" />
            <span className="scanner-line" />
          </div>

          {status === 'starting' ? (
            <div className="scanner-overlay">
              <span className="scanner-spinner" />
              <span>{t('scan.cameraStarting')}</span>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="scanner-overlay scanner-error">
              <CameraOff size={30} />
              <strong>{t('scan.cameraError')}</strong>
              <p>{t('scan.cameraErrorText')}</p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setManualMode(true)}
              >
                <Keyboard size={16} />
                {t('scan.manual')}
              </button>
            </div>
          ) : null}

          {detected ? (
            <div className="scanner-detected">
              <span>{t('scan.detected')}</span>
              <strong>{detected}</strong>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
