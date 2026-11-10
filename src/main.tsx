import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import './components/home/desktop/desktop-home.css'
import AppErrorBoundary from '@/components/common/AppErrorBoundary'
import { installLegacyAlertToToastBridge } from '@/services/toastService'
import { installStaleChunkReloadHandler } from '@/lib/staleChunkReload'
import { loadEnDictionary } from '@/i18n/activeLocale'
import { localeFromPathname } from '@/i18n/localizedRoutes'

installLegacyAlertToToastBridge()
installStaleChunkReloadHandler()

function render() {
  createRoot(document.getElementById('root')!).render(
      <StrictMode>
          <BrowserRouter>
              <AppErrorBoundary>
                  <App />
              </AppErrorBoundary>
          </BrowserRouter>
      </StrictMode>,
  )
}

// On English addresses the dictionary arrives before render; if it fails to load, the app opens with Turkish text.
if (localeFromPathname(window.location.pathname) === 'en') {
  void loadEnDictionary().catch(() => undefined).finally(render)
} else {
  render()
}
