import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { uid } from '../lib/utils'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  kind: ToastKind
  message: string
}

interface ToastState {
  items: ToastItem[]
  push: (message: string, kind?: ToastKind) => string
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (message, kind = 'success') => {
    const id = uid('toast')
    set((state) => ({ items: [...state.items, { id, kind, message }].slice(-4) }))
    window.setTimeout(() => {
      set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
    }, 4200)
    return id
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}))

export function toast(message: string, kind: ToastKind = 'success'): string {
  return useToastStore.getState().push(message, kind)
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

export function ToastViewport() {
  const items = useToastStore((state) => state.items)
  const dismiss = useToastStore((state) => state.dismiss)
  const onDismiss = useCallback((id: string) => dismiss(id), [dismiss])

  useEffect(() => {
    if (!items.length) return
  }, [items.length])

  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {items.map((item) => {
        const Icon = ICONS[item.kind]
        return (
          <div key={item.id} className={`toast toast-${item.kind}`}>
            <Icon size={18} aria-hidden="true" />
            <span>{item.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => onDismiss(item.id)}
              aria-label="×"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
