import process from 'node:process'
import { chromium } from '@playwright/test'

const BASE_URL = process.env.LIVE_AUDIT_BASE_URL?.trim()
const EMAIL = process.env.LIVE_AUDIT_EMAIL?.trim()
const PASSWORD = process.env.LIVE_AUDIT_PASSWORD ?? ''

function requireEnv(value, name) {
  if (!value) {
    throw new Error(`${name} gerekli.`)
  }
  return value
}

function toUrl(pathname) {
  return new URL(pathname, BASE_URL).toString()
}

async function waitForInteractive(page) {
  await page.waitForTimeout(2500)
  await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {})
}

async function main() {
  requireEnv(BASE_URL, 'LIVE_AUDIT_BASE_URL')
  requireEnv(EMAIL, 'LIVE_AUDIT_EMAIL')
  requireEnv(PASSWORD, 'LIVE_AUDIT_PASSWORD')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()

  try {
    await page.goto(toUrl('/giris'), { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForInteractive(page)

    await page.locator('#auth-email').fill(EMAIL)
    await page.locator('#auth-password').fill(PASSWORD)
    await page.locator('form button[type="submit"]').first().click()
    await page.waitForFunction(() => !location.pathname.startsWith('/giris'), { timeout: 20000 })
    await waitForInteractive(page)

    console.log('\n== login sonu ==')
    console.log(page.url())

    const adminAnchors = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href*="/admin"]')]
      return anchors.map((anchor) => {
        const rect = anchor.getBoundingClientRect()
        const style = window.getComputedStyle(anchor)
        return {
          href: anchor.getAttribute('href'),
          text: (anchor.textContent || '').trim(),
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
          ariaLabel: anchor.getAttribute('aria-label'),
          title: anchor.getAttribute('title'),
        }
      })
    })

    console.log('\n== sidebar admin anchorlari ==')
    console.log(JSON.stringify(adminAnchors, null, 2))

    if (adminAnchors.length > 0) {
      await page.locator('a[href="/admin"]').first().click()
      await waitForInteractive(page)

      const afterClickSnapshot = await page.evaluate(() => ({
        title: document.title,
        pathname: location.pathname,
        hasAdminHeading: Boolean([...document.querySelectorAll('h1,h2,h3')].find((node) => (node.textContent || '').toLowerCase().includes('kullanici yonetimi') || (node.textContent || '').toLowerCase().includes('admin'))),
        bodySample: (document.body?.innerText || '').slice(0, 500),
      }))

      console.log('\n== admin link click result ==')
      console.log(JSON.stringify({
        finalUrl: page.url(),
        ...afterClickSnapshot,
      }, null, 2))
    }

    const adminReloadNetwork = []
    page.on('response', async (response) => {
      const url = response.url()
      if (!url.includes('/rest/v1/rpc/') && !url.includes('/auth/v1/')) {
        return
      }

      const normalized = (() => {
        try {
          const parsed = new URL(url)
          return `${parsed.origin}${parsed.pathname}`
        } catch {
          return url
        }
      })()

      let body = null
      if (
        normalized.includes('/rest/v1/rpc/get_my_session_guard_state')
        || normalized.includes('/rest/v1/rpc/current_app_role')
        || normalized.includes('/rest/v1/rpc/get_my_user_identity')
      ) {
        try {
          body = await response.text()
        } catch {
          body = null
        }
      }

      adminReloadNetwork.push({
        url: normalized,
        status: response.status(),
        body,
      })
    })

    const storageBeforeHardReload = await page.evaluate(() => ({
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
    }))

    await page.goto(toUrl('/admin'), { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForInteractive(page)

    const adminSnapshot = await page.evaluate(() => ({
      title: document.title,
      pathname: location.pathname,
      hasAdminHeading: Boolean([...document.querySelectorAll('h1,h2,h3')].find((node) => (node.textContent || '').toLowerCase().includes('kullanici yonetimi') || (node.textContent || '').toLowerCase().includes('admin'))),
      bodySample: (document.body?.innerText || '').slice(0, 800),
      historyState: window.history.state,
      storageAfterHardReload: {
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionStorage),
      },
    }))

    console.log('\n== /admin result ==')
    console.log(JSON.stringify({
      finalUrl: page.url(),
      storageBeforeHardReload,
      adminReloadNetwork,
      ...adminSnapshot,
    }, null, 2))
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('\n[FAIL] inspect-live-admin-browser')
  console.error(error?.message || error)
  process.exit(1)
})
