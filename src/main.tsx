import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import './components/home/desktop/desktop-home.css'
import AppErrorBoundary from '@/components/common/AppErrorBoundary'
import { installLegacyAlertToToastBridge } from '@/services/toastService'
import { installStaleChunkReloadHandler, isStaleChunkError, reloadForStaleChunk } from '@/lib/staleChunkReload'
import { loadEnDictionary } from '@/i18n/activeLocale'
import { localeFromPathname } from '@/i18n/localizedRoutes'
import { installMobileViewportFix } from '@/lib/mobileViewport'

installLegacyAlertToToastBridge()
installStaleChunkReloadHandler()
installMobileViewportFix()

const EN_DICTIONARY_TIMEOUT_MS = 10_000

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
  let rendered = false
  const renderOnce = () => {
    if (rendered) return
    rendered = true
    clearTimeout(timeoutId)
    render()
  }
  // A hung dictionary request must not leave a permanently blank page: render without it after the timeout.
  const timeoutId = setTimeout(renderOnce, EN_DICTIONARY_TIMEOUT_MS)
  void loadEnDictionary()
    .catch((error: unknown) => {
      // Old tab after a deploy: the dictionary chunk is gone; reload once to pick up the new version.
      if (isStaleChunkError(error) && reloadForStaleChunk()) return new Promise<void>(() => {})
      return undefined
    })
    .finally(renderOnce)
} else {
  render()
}
