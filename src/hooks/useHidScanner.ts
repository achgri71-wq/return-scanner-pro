import { useEffect, useRef } from 'react'
import { isTypingTarget } from '../lib/utils'

/**
 * Listens for USB/Bluetooth barcode scanners that behave like keyboards.
 * Scanners emit characters very fast, then Enter (or a short idle gap).
 * Keystrokes typed in normal fields are ignored to avoid double capture.
 */
export function useHidScanner(onScan: (code: string) => void, enabled = true): void {
  const callbackRef = useRef(onScan)
  callbackRef.current = onScan

  useEffect(() => {
    if (!enabled) return

    let buffer = ''
    let lastKeyAt = 0
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
      const code = buffer.trim()
      buffer = ''
      if (code.length >= 4) callbackRef.current(code)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      if (document.querySelector('.modal-backdrop')) return

      const now = Date.now()
      if (now - lastKeyAt > 180) buffer = ''
      lastKeyAt = now

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (buffer.length >= 4) {
          event.preventDefault()
          event.stopPropagation()
          flush()
        } else {
          buffer = ''
        }
        return
      }

      if (event.key.length === 1 && event.key !== ' ') {
        buffer += event.key
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          if (buffer.length >= 6) flush()
          else buffer = ''
        }, 160)
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (idleTimer) clearTimeout(idleTimer)
    }
  }, [enabled])
}
