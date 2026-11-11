import type { Language } from '../types'

export type SoundKind = 'success' | 'rejection' | 'warning' | 'duplicate'

export interface FeedbackOptions {
  enabled: boolean
  volume: number
  speech: boolean
  haptics: boolean
  lang: Language
}

const SPEECH: Record<SoundKind, Record<Language, string>> = {
  success: { fr: 'Retour accepté', ar: 'تم قبول الإرجاع' },
  rejection: { fr: 'Colis non demandé', ar: 'الطرد غير مطلوب' },
  warning: { fr: 'Retour interdit', ar: 'الإرجاع ممنوع' },
  duplicate: { fr: 'Déjà enregistré', ar: 'مسجل مسبقاً' },
}

type Note = { frequency: number; start: number; duration: number; wave: OscillatorType }

const PATTERNS: Record<SoundKind, Note[]> = {
  success: [
    { frequency: 880, start: 0, duration: 0.09, wave: 'sine' },
    { frequency: 1174.66, start: 0.09, duration: 0.09, wave: 'sine' },
    { frequency: 1567.98, start: 0.18, duration: 0.16, wave: 'sine' },
  ],
  rejection: [
    { frequency: 210, start: 0, duration: 0.13, wave: 'sawtooth' },
    { frequency: 150, start: 0.15, duration: 0.22, wave: 'sawtooth' },
  ],
  warning: [
    { frequency: 740, start: 0, duration: 0.11, wave: 'square' },
    { frequency: 554, start: 0.13, duration: 0.11, wave: 'square' },
    { frequency: 740, start: 0.26, duration: 0.18, wave: 'square' },
  ],
  duplicate: [
    { frequency: 440, start: 0, duration: 0.1, wave: 'triangle' },
    { frequency: 440, start: 0.16, duration: 0.12, wave: 'triangle' },
  ],
}

const VIBRATION: Record<SoundKind, number | number[]> = {
  success: 35,
  rejection: [80, 45, 80],
  warning: [60, 40, 60, 40, 60],
  duplicate: [40, 60, 40],
}

let audioContext: AudioContext | null = null
let unlockInstalled = false

function getContext(): AudioContext | null {
  try {
    if (!audioContext) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      audioContext = new Ctor()
    }
    return audioContext
  } catch {
    return null
  }
}

export function unlockAudio(): void {
  try {
    const context = getContext()
    if (context?.state === 'suspended') void context.resume()
  } catch {
    /* audio is optional */
  }
}

/** Browsers require a user gesture before audio can start. */
export function installAudioUnlock(): () => void {
  if (unlockInstalled) return () => undefined
  unlockInstalled = true

  const unlock = () => {
    unlockAudio()
    if (audioContext?.state === 'running') {
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
      document.removeEventListener('touchstart', unlock, true)
      unlockInstalled = false
    }
  }

  document.addEventListener('pointerdown', unlock, true)
  document.addEventListener('keydown', unlock, true)
  document.addEventListener('touchstart', unlock, true)
  return () => {
    document.removeEventListener('pointerdown', unlock, true)
    document.removeEventListener('keydown', unlock, true)
    document.removeEventListener('touchstart', unlock, true)
    unlockInstalled = false
  }
}

function speaker(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null
  } catch {
    return null
  }
}

function speak(text: string, lang: Language): void {
  const synth = speaker()
  if (!synth) return
  try {
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang === 'ar' ? 'ar-MA' : 'fr-FR'
    utterance.rate = 1.08
    utterance.volume = 1
    synth.speak(utterance)
  } catch {
    /* speech is optional */
  }
}

export function playFeedback(kind: SoundKind, options: FeedbackOptions): void {
  if (options.haptics && typeof navigator !== 'undefined') {
    try {
      navigator.vibrate?.(VIBRATION[kind])
    } catch {
      /* ignore */
    }
  }

  if (options.speech) speak(SPEECH[kind][options.lang], options.lang)
  if (!options.enabled) return

  const context = getContext()
  if (!context) return
  try {
    if (context.state === 'suspended') void context.resume()
    const start = context.currentTime + 0.01
    const master = context.createGain()
    master.gain.value = Math.max(0, Math.min(1, options.volume)) * 0.26
    master.connect(context.destination)

    for (const note of PATTERNS[kind]) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = note.wave
      oscillator.frequency.setValueAtTime(note.frequency, start + note.start)
      gain.gain.setValueAtTime(0.0001, start + note.start)
      gain.gain.exponentialRampToValueAtTime(1, start + note.start + 0.012)
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + note.start + note.duration,
      )
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(start + note.start)
      oscillator.stop(start + note.start + note.duration + 0.02)
    }
  } catch {
    /* audio is a nice-to-have */
  }
}

export function testFeedback(kind: SoundKind, options: FeedbackOptions): void {
  unlockAudio()
  playFeedback(kind, options)
}
