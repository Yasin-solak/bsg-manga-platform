import { expect, test, type Page } from '@playwright/test'

/**
 * Hero swipe + real follow, and the mobile footer simplification.
 *
 * All three are things the user noticed on the phone:
 * - the hero did not swipe by finger (only dots)
 * - the "Kitapligima ekle" button ADDED nothing, it only navigated
 * - the footer took a screen's height at the end of every scroll
 */

const MOBILE = { width: 390, height: 844 }

async function stubNetwork(page: Page) {
  const json = (body: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
}

test.describe('Mobile hero and footer', () => {
  test.beforeEach(async ({ page }) => {
    // Guests are redirected from the root route to the WELCOME page; this file measures the shell/content
    // layout, not the funnel. The marker opens the real home page.
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
    })
    await stubNetwork(page)
    await page.setViewportSize(MOBILE)
  })

  test('the footer link list is HIDDEN on mobile', async ({ page }) => {
    await page.goto('/tr')
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })
    // The four-column link farm took a screen's height on the phone.
    await expect(page.getByRole('link', { name: 'KVKK Aydinlatma Metni' })).toBeHidden()
  })

  test('the copyright and policy door STAYS on mobile', async ({ page }) => {
    await page.goto('/tr')
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })
    /*
     * Access to legal pages is not a layout preference but a requirement.
     * Hiding this door while hiding the link list would make the pages inaccessible.
     */
    await expect(page.getByRole('link', { name: 'Kurallar ve politikalar' })).toBeVisible()
  })

  test('legal links are REACHABLE in the menu', async ({ page }) => {
    await page.goto('/tr')
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })

    // Hamburger: the FIRST button in the top bar. It has no accessible name, selecting by position
    // would be fragile; we branch from the top bar itself.
    await page.getByTestId('mobile-top-bar').getByRole('button').first().click()
    await page.waitForTimeout(700)

    // Links removed from the footer MUST have somewhere to go.
    await expect(page.getByRole('link', { name: 'DMCA Bildirimi' })).toBeVisible()
  })

  test('the footer link list STAYS on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr')
    await page.waitForTimeout(2500)
    // Sadelestirme yalnizca mobil; masaustu duzeni degismemeli.
    await expect(page.getByRole('link', { name: 'KVKK Aydinlatma Metni' })).toBeVisible()
  })
})
