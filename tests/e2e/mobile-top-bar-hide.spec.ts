import { expect, test, type Page } from '@playwright/test'

/**
 * Hiding the top bar on scroll.
 *
 * What is pinned is behavior: hide going down, bring back AT ONCE ON SCROLL UP.
 * The second half is critical: a bar returning only at page top would mean
 * scrolling back 3000 pixels to reach search, worse than
 * never hiding the bar.
 */

async function stubNetwork(page: Page) {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
}

/** Like a real finger: stepwise scrolling, not one jump. */
async function scrollBy(page: Page, total: number) {
  const step = total > 0 ? 240 : -240
  for (let moved = 0; Math.abs(moved) < Math.abs(total); moved += step) {
    await page.mouse.wheel(0, step)
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(350)
}

test.describe('Mobile top bar', () => {
  test.beforeEach(async ({ page }) => {
    // Guests are redirected from the root route to the WELCOME page; this file measures the shell/content
    // layout, not the funnel. The marker opens the real home page.
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
    })
    await stubNetwork(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tr')
    await expect(page.getByTestId('mobile-top-bar')).toBeVisible({ timeout: 20_000 })

    /*
     * A LONG spacer is added to the page.
     *
     * What is tested is the scroll HOOK, not how much content renders.
     * With mocked data (and after the mobile footer was simplified) the home page
     * could only scroll ~140px and tests could not set up assertions like "came back
     * without returning to page top": scrolling always
     * returned to the top. The spacer runs the hook as on a real long page.
     */
    await page.evaluate(() => {
      const filler = document.createElement('div')
      filler.style.height = '3000px'
      filler.setAttribute('data-test-filler', 'true')
      document.body.appendChild(filler)
    })
    await page.waitForTimeout(200)
  })

  test('visible at page top', async ({ page }) => {
    // A bar hidden at the start would be the one moment the user looks for "where is the menu".
    await expect(page.getByTestId('mobile-top-bar')).toHaveAttribute('data-hidden', 'false')
  })

  test('does not hide in the first few pixels', async ({ page }) => {
    /*
     * THIS is the test of the threshold (80px). The "visible at page top" test never
     * pressured the threshold: there is no scroll event on load, so with threshold 0 the bar
     * still stayed visible (a mutation test revealed this).
     *
     * Without a threshold the bar vanishes at the smallest finger move; on the page's first
     * screen the menu/search must not disappear.
     */
    await page.mouse.wheel(0, 50)
    await page.waitForTimeout(300)
    await expect(page.getByTestId('mobile-top-bar')).toHaveAttribute('data-hidden', 'false')
  })

  test('asagi kaydirinca gizlenir', async ({ page }) => {
    await scrollBy(page, 900)
    await expect(page.getByTestId('mobile-top-bar')).toHaveAttribute('data-hidden', 'true')
  })

  test('yukari kaydirinca HEMEN geri gelir', async ({ page }) => {
    await scrollBy(page, 1200)
    await expect(page.getByTestId('mobile-top-bar')).toHaveAttribute('data-hidden', 'true')

    // Sayfanin en ustune donmeden, yalnizca yon degistirerek.
    await scrollBy(page, -300)
    await expect(page.getByTestId('mobile-top-bar')).toHaveAttribute('data-hidden', 'false')
    const y = await page.evaluate(() => window.scrollY)
    expect(y, 'coming back must not depend on returning to page top').toBeGreaterThan(200)
  })

  test('does not vanish on a small finger move', async ({ page }) => {
    /*
     * This was the user complaint: the bar "suddenly disappears". Cause: treating a direction
     * change as a decision every 6 pixels, so a tiny finger move sent the
     * bar away. Hiding now needs an accumulation of CONTINUOUS downward
     * motion.
     */
    await scrollBy(page, 900)
    await expect(page.getByTestId('mobile-top-bar')).toHaveAttribute('data-hidden', 'true')

    // Returning up brings it back and resets the accumulation.
    await scrollBy(page, -300)
    await expect(page.getByTestId('mobile-top-bar')).toHaveAttribute('data-hidden', 'false')

    // Now a small downward move: it cannot fill the threshold, the bar must STAY.
    await page.mouse.wheel(0, 30)
    await page.waitForTimeout(350)
    await expect(page.getByTestId('mobile-top-bar')).toHaveAttribute('data-hidden', 'false')
  })

  test('this bar does not exist on desktop anyway', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(500)
    await expect(page.getByTestId('mobile-top-bar')).toBeHidden()
  })
})
