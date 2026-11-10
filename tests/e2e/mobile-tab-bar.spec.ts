import { expect, test, type Page } from '@playwright/test'

/**
 * Mobile bottom tab bar.
 *
 * What is pinned is BEHAVIOR, not VISIBILITY: the bar does NOT APPEAR on desktop,
 * does NOT OVERLAP full-screen pages (reader) and for guests the profile tab
 * leads to sign-in. All three can break silently.
 */

const MOBILE = { width: 390, height: 844 }

async function stubNetwork(page: Page) {
  // Guests are redirected from the root route to the WELCOME page; this file measures the bottom tab bar,
  // not the funnel.
  await page.addInitScript(() => {
    window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
  })
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
  // Catch-all FIRST: a single unmocked call goes to the real project.
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/rpc/community_v2_availability', async route => { await route.fulfill(json(true)) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
}

test.describe('Mobile bottom tab bar', () => {
  test.beforeEach(async ({ page }) => { await stubNetwork(page) })

  test('visible on mobile and carries five tabs', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tr')
    const bar = page.getByTestId('mobile-tab-bar')
    await expect(bar).toBeVisible({ timeout: 20_000 })
    await expect(bar.getByRole('link')).toHaveCount(5)
  })

  test('does NOT APPEAR on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr')
    await page.waitForTimeout(1500)
    // A second navigation surface next to the sidebar weakens both.
    await expect(page.getByTestId('mobile-tab-bar')).toBeHidden()
  })

  test('for guests the profile tab leads to sign-in', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tr')
    const bar = page.getByTestId('mobile-tab-bar')
    await expect(bar).toBeVisible({ timeout: 20_000 })
    // Gezinmeyi uyelige kilitlemek yerine kapiyi gosteriyoruz.
    await expect(bar.getByRole('link', { name: /Profil/ })).toHaveAttribute('href', '/giris')
  })

  test('the active tab shows where you are', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tr/kesfet')
    const bar = page.getByTestId('mobile-tab-bar')
    await expect(bar).toBeVisible({ timeout: 20_000 })
    await expect(bar.getByRole('link', { name: /Keşfet/ })).toHaveAttribute('aria-current', 'page')
    // Ana Sayfa on-eki HER yola uyar; yalnizca tam eslesmede yanmali.
    await expect(bar.getByRole('link', { name: /Ana Sayfa/ })).not.toHaveAttribute('aria-current', 'page')
  })

  test('the bar does NOT OVERLAP in the reader', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tr/oku/test-manga/1')
    await page.waitForTimeout(2500)
    // The reader builds its own shell; a fixed bar sitting over the page eats the
    // reading area and cannot be closed.
    await expect(page.getByTestId('mobile-tab-bar')).toHaveCount(0)
  })

  test('icerik cubugun altinda kalmaz', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tr')
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })

    /*
     * First let the PAGE STOP GROWING. When lazy rails arrive after measuring the page
     * lengthens and the "I reached the bottom" assumption breaks; the first
     * version of the test reported a -22px "overlap" this way, though the settled page had
     * none. An assertion made before the measure settles looks as if
     * it measured what it did not.
     */
    await page.waitForFunction(() => {
      const el = document.scrollingElement
      if (!el) return false
      const w = window as unknown as { __h?: number; __n?: number }
      const h = el.scrollHeight
      w.__n = w.__h === h ? (w.__n ?? 0) + 1 : 0
      w.__h = h
      return (w.__n ?? 0) >= 3
    }, undefined, { timeout: 20_000, polling: 250 })

    /*
     * `behavior: 'instant'` is REQUIRED: index.css gives html `scroll-smooth`,
     * so a plain `scrollTo` crosses 2000 pixels with animation. Measuring after a fixed
     * wait meant measuring halfway through the scroll
     * (gave -22, then -231). Then we also verify the scroll has STOPPED.
     */
    await page.evaluate(() => {
      const el = document.scrollingElement
      if (el) window.scrollTo({ top: el.scrollHeight, behavior: 'instant' as ScrollBehavior })
    })
    await page.waitForFunction(() => {
      const el = document.scrollingElement
      if (!el) return false
      return Math.abs(el.scrollHeight - window.innerHeight - window.scrollY) <= 4
    }, undefined, { timeout: 10_000, polling: 150 })

    const gap = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="mobile-tab-bar"]') as HTMLElement | null
      const footer = document.querySelector('footer')
      if (!bar || !footer) return null
      // Sayfa sonuna inildiginde footer'in alti cubugun USTUNDE kalmali.
      return Math.round(bar.getBoundingClientRect().top - footer.getBoundingClientRect().bottom)
    })
    expect(gap).not.toBeNull()
    expect(gap as number).toBeGreaterThanOrEqual(0)
  })

  test('the spacer CANNOT be shorter than the bar', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tr')
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })

    /*
     * This is the real invariant: the separator space must be as TALL as the bar. Originally
     * the height was written `calc(4.5rem+env(...))`: with no spaces around `+` in calc
     * it was INVALID CSS and the space became 0 pixels.
     * Not tied to scrolling, so this assertion is not fragile either.
     */
    const size = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="mobile-tab-bar"]') as HTMLElement | null
      const spacer = document.querySelector('#layout-content > div[aria-hidden="true"]') as HTMLElement | null
      if (!bar || !spacer) return null
      return {
        bar: Math.round(bar.getBoundingClientRect().height),
        spacer: Math.round(spacer.getBoundingClientRect().height),
      }
    })
    expect(size).not.toBeNull()
    expect(size!.spacer).toBeGreaterThanOrEqual(size!.bar)
  })
})
