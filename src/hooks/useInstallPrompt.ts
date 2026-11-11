import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallPrompt {
  canInstall: boolean
  installed: boolean
  install: () => Promise<boolean>
}

export function useInstallPrompt(): InstallPrompt {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches
  })

  useEffect(() => {
    const onPrompt = (raw: Event) => {
      raw.preventDefault()
      setEvent(raw as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!event) return false
    try {
      await event.prompt()
      const choice = await event.userChoice
      if (choice.outcome === 'accepted') {
        setInstalled(true)
        setEvent(null)
        return true
      }
    } catch {
      /* ignored */
    }
    return false
  }, [event])

  return { canInstall: Boolean(event) && !installed, installed, install }
}
