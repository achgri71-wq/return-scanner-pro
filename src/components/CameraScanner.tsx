import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import {
  CameraOff,
  Flashlight,
  Keyboard,
  ScanBarcode,
  SwitchCamera,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
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

/** Formats seen on parcel labels (Code 128 shipping codes, EAN/UPC, QR, Data Matrix…). */
const WANTED_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.CODABAR,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417,
]

/** Same list using the native BarcodeDetector naming scheme. */
const NATIVE_FORMATS = [
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'qr_code',
  'data_matrix',
  'pdf417',
]

/** High resolution so thin / distant / angled codes still have enough pixels. */
const HIGH_RES: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
}

const HIT_WINDOW = 1800
const NATIVE_INTERVAL = 70

interface NativeCode {
  rawValue: string
  boundingBox?: { width: number; height: number }
}

interface NativeDetector {
  detect: (source: HTMLVideoElement) => Promise<NativeCode[]>
}

type NativeDetectorCtor = {
  new (options: { formats?: string[] }): NativeDetector
  getSupportedFormats?: () => Promise<string[]>
}

interface ZoomRange {
  min: number
  max: number
  step: number
}

export function CameraScanner({ open, onClose, onDetect, continuous = true }: CameraScannerProps) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
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
  const [zoom, setZoom] = useState<number | null>(null)
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null)
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
      setZoom(null)
      setZoomRange(null)
      setStatus('starting')
    }
  }, [open])

  useEffect(() => {
    if (!open || manualMode) return

    let cancelled = false
    const cleanups: Array<() => void> = []
    const hits = lastHitRef.current

    const emit = (raw: string) => {
      const code = normalizeCode(raw)
      if (!code) return
      const now = Date.now()
      if (now - (hits.get(code) ?? 0) < HIT_WINDOW) return
      hits.set(code, now)

      setDetected(code)
      window.setTimeout(() => {
        setDetected((current) => (current === code ? null : current))
      }, 1800)
      onDetectRef.current(code)
      if (!continuous) onCloseRef.current()
    }

    /** Multiple codes in one frame (a label often has barcode + QR): keep the biggest one. */
    const emitBest = (found: NativeCode[]) => {
      const sorted = found
        .filter((item) => item.rawValue)
        .sort((a, b) => {
          const areaA = (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0)
          const areaB = (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0)
          return areaB - areaA
        })
      for (const item of sorted) emit(item.rawValue)
    }

    const start = async () => {
      setStatus('starting')
      try {
        const facing: MediaTrackConstraints = deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: 'environment' } }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { ...facing, ...HIGH_RES },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((item) => item.stop())
          return
        }
        cleanups.push(() => stream.getTracks().forEach((item) => item.stop()))

        const element = videoRef.current
        if (element) {
          element.srcObject = stream
          await element.play().catch(() => undefined)
        }

        const track = stream.getVideoTracks()[0] ?? null
        trackRef.current = track

        if (track) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            } as unknown as MediaTrackConstraints)
          } catch {
            /* fixed-focus cameras */
          }

          let capabilities: (MediaTrackCapabilities & {
            torch?: boolean
            zoom?: { min: number; max: number; step?: number }
          }) | undefined
          try {
            capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & {
              torch?: boolean
              zoom?: { min: number; max: number; step?: number }
            }) | undefined
          } catch {
            capabilities = undefined
          }

          setTorchAvailable(Boolean(capabilities?.torch))

          const range = capabilities?.zoom
          if (range && range.max > range.min) {
            const settings = track.getSettings() as MediaTrackSettings & { zoom?: number }
            setZoomRange({
              min: range.min,
              max: range.max,
              step: range.step && range.step > 0 ? range.step : (range.max - range.min) / 8,
            })
            setZoom(settings.zoom ?? range.min)
          } else {
            setZoomRange(null)
            setZoom(null)
          }
        }

        // Fast path: hardware/ML-accelerated BarcodeDetector (Chrome / Android).
        let nativeDetector: NativeDetector | null = null
        const NativeCtor = (window as unknown as { BarcodeDetector?: NativeDetectorCtor })
          .BarcodeDetector
        if (NativeCtor && element) {
          try {
            let formats = NATIVE_FORMATS
            try {
              const supported = await NativeCtor.getSupportedFormats?.()
              const filtered = supported?.length
                ? NATIVE_FORMATS.filter((format) => supported.includes(format))
                : NATIVE_FORMATS
              if (filtered.length) formats = filtered
            } catch {
              /* keep the default list */
            }
            nativeDetector = new NativeCtor({ formats })
          } catch {
            nativeDetector = null
          }
        }

        if (nativeDetector && element) {
          let busy = false
          let timer = 0
          const tick = async () => {
            if (cancelled) return
            if (!busy && element.readyState >= 2 && !document.hidden) {
              busy = true
              try {
                emitBest(await nativeDetector.detect(element))
              } catch {
                /* frame not decodable — keep looping */
              }
              busy = false
            }
            timer = window.setTimeout(tick, NATIVE_INTERVAL)
          }
          void tick()
          cleanups.push(() => window.clearTimeout(timer))
        } else {
          // Fallback: ZXing, tuned for speed and limited to useful formats.
          const hints = new Map<DecodeHintType, unknown>()
          hints.set(DecodeHintType.POSSIBLE_FORMATS, WANTED_FORMATS)
          hints.set(DecodeHintType.TRY_HARDER, true)
          const reader = new BrowserMultiFormatReader(hints, {
            delayBetweenScanAttempts: 60,
            delayBetweenScanSuccess: 120,
          })
          const controls = await reader.decodeFromStream(
            stream,
            element ?? undefined,
            (result) => {
              if (result) emit(result.getText())
            },
          )
          if (cancelled) {
            controls.stop()
            return
          }
          cleanups.push(() => controls.stop())
        }

        if (cancelled) return
        setStatus('running')

        try {
          const list = (await navigator.mediaDevices.enumerateDevices()).filter(
            (device) => device.kind === 'videoinput',
          )
          if (!cancelled) setDevices(list)
        } catch {
          /* labels require permission */
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    void start()

    return () => {
      cancelled = true
      trackRef.current = null
      for (const fn of cleanups) fn()
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
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  const zoomStep = () => {
    const range = zoomRange
    if (!range) return 1
    return range.step || (range.max - range.min) / 8
  }

  const applyZoom = async (value: number) => {
    const range = zoomRange
    const track = trackRef.current
    if (!range || !track) return
    const clamped = Math.min(range.max, Math.max(range.min, value))
    try {
      await track.applyConstraints({
        advanced: [{ zoom: clamped }],
      } as unknown as MediaTrackConstraints)
      setZoom(clamped)
    } catch {
      /* ignore */
    }
  }

  const zoomLabel = () => {
    const range = zoomRange
    if (!range || zoom === null) return '1.0×'
    return range.max <= 10 ? `${zoom.toFixed(1)}×` : `×${(zoom / range.min).toFixed(1)}`
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
      className={cx('scanner-modal', !manualMode && 'scanner-fullscreen')}
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

          {zoomRange && status === 'running' ? (
            <div className="scanner-zoom" role="group" aria-label={t('scan.zoom')}>
              <button
                type="button"
                aria-label={t('scan.zoom')}
                onClick={() => void applyZoom((zoom ?? zoomRange.min) - zoomStep())}
              >
                <ZoomOut size={16} />
              </button>
              <strong>{zoomLabel()}</strong>
              <button
                type="button"
                aria-label={t('scan.zoom')}
                onClick={() => void applyZoom((zoom ?? zoomRange.min) + zoomStep())}
              >
                <ZoomIn size={16} />
              </button>
            </div>
          ) : null}

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
