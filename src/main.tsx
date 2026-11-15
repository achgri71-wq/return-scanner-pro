import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Registers the service worker through the workbox auto-update helper, so a
// new deployment activates and reloads the app by itself. The plain injected
// registerSW.js never updates anything, which left phones on stale builds.
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

void registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
