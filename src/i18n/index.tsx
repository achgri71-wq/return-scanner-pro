import { useCallback } from 'react'
import { useStore } from '../store/useStore'
import { translate, type TKey } from './dict'

export type Translate = (key: TKey, vars?: Record<string, string | number>) => string

const ERROR_KEYS: Record<string, TKey> = {
  'empty-name': 'error.empty-name',
  'duplicate-name': 'error.duplicate-name',
  'list-not-found': 'error.list-not-found',
  'list-closed': 'error.list-closed',
  'session-open': 'error.session-open',
  'no-list': 'error.no-list',
  'no-session': 'error.no-session',
  'session-not-found': 'error.session-not-found',
  'invalid-code': 'error.invalid-code',
  'not-found': 'error.not-found',
  'duplicate-code': 'error.duplicate-code',
  unauthorized: 'error.unauthorized',
  'reason-required': 'error.reason-required',
  'not-returned': 'error.not-returned',
  'not-completed': 'error.not-completed',
  'close-failed': 'error.close-failed',
  'invalid-backup': 'error.invalid-backup',
}

export function errorKey(code: string | undefined): TKey {
  if (!code) return 'error.unknown'
  return ERROR_KEYS[code] ?? 'error.unknown'
}

export function useI18n(): {
  lang: 'fr' | 'ar'
  dir: 'ltr' | 'rtl'
  t: Translate
} {
  const lang = useStore((state) => state.settings.lang)
  const t = useCallback<Translate>(
    (key, vars) => translate(lang, key, vars),
    [lang],
  )
  return { lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t }
}

export function useLanguage(): 'fr' | 'ar' {
  return useStore((state) => state.settings.lang)
}

export { translate }
export type { TKey }
