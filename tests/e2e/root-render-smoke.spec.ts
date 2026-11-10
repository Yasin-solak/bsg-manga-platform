import { expect, test } from '@playwright/test'

test.describe('Root Render Smoke', () => {
  test('the home page does not stay on a blank white screen on first open', async ({ page }) => {
    const targetUrl = process.env.ROOT_RENDER_SMOKE_URL || '/'
    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    const requestFailures: string[] = []
    const startedRequests: string[] = []
    const navigations: string[] = []
    const lifecycleEvents: string[] = []

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    page.on('request', (request) => {
      startedRequests.push(`${request.method()} ${request.url()}`)
    })

    page.on('requestfailed', (request) => {
      requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'bilinmeyen hata'}`)
    })

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations.push(frame.url())
      }
    })

    page.on('domcontentloaded', () => {
      lifecycleEvents.push('domcontentloaded')
    })

    page.on('load', () => {
      lifecycleEvents.push('load')
    })

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1_500)

    const currentUrl = page.url()
    const domSnapshot = await page.evaluate(() => ({
      href: window.location.href,
      readyState: document.readyState,
      bodyHtmlLength: document.body?.innerHTML.length ?? -1,
      rootHtmlLength: document.getElementById('root')?.innerHTML.length ?? -1,
      bodyChildCount: document.body?.childElementCount ?? -1,
    })).catch((error) => ({
      evalError: error instanceof Error ? error.message : String(error),
    }))
    const filteredConsoleErrors = consoleErrors.filter(
      (entry) => !entry.includes('Failed to load resource: the server responded with a status of 404'),
    )

    expect(
      {
        currentUrl,
        domSnapshot,
        pageErrors,
        consoleErrors: filteredConsoleErrors,
        requestFailures,
        startedRequests,
        navigations,
        lifecycleEvents,
      },
      'Kok render beklenen sekilde gelmedi',
    ).toMatchObject({
      pageErrors: [],
      consoleErrors: [],
      requestFailures: [],
    })

    expect(
      'rootHtmlLength' in domSnapshot ? domSnapshot.rootHtmlLength : -1,
      `URL: ${currentUrl}\nDOM: ${JSON.stringify(domSnapshot)}\nNavigations: ${navigations.join(' | ')}\nLifecycle: ${lifecycleEvents.join(' | ')}\nStarted requests: ${startedRequests.join(' | ')}`,
    ).toBeGreaterThan(0)
    expect('bodyHtmlLength' in domSnapshot ? domSnapshot.bodyHtmlLength : -1).toBeGreaterThan(0)
  })
})
