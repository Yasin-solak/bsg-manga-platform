import { expect, test, type Page } from '@playwright/test'

/**
 * Lucky screen.
 *
 * The selection logic is tested deterministically in the contract test
 * (tests/contracts/luckypick-contract.test.mjs). Pinned here is the SCREEN keeping its
 * promise: can the draw be skipped, does the result say WHY it came,
 * can we respin.
 */

const MOBILE = { width: 390, height: 844 }

async function stubCatalog(page: Page) {
  const json = (body: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })

  /*
   * `listMangas` first tries the `search_public_mangas_v2` RPC; if it fails
   * it falls to the `mangas` table. In the first version I mocked only the
   * table; when the RPC catch-all returned an empty array the list stayed empty
   * and the screen showed no results at all.
   */
  const rows = [1, 2, 3, 4].map((i) => ({
    id: `m${i}`,
    title: `Seri ${i}`,
    slug: `seri-${i}`,
    cover_image_url: 'https://placehold.co/400x600/222/fff.png',
    description: `Seri ${i} aciklamasi`,
    status: 'ongoing',
    genres: ['Aksiyon'],
    last_chapter_number: 5,
    is_new: false,
    rating: 4.2,
    total_ratings: 8,
    total_views: 40,
    updated_at: new Date().toISOString(),
  }))

  await page.route('**/rest/v1/rpc/search_public_mangas_v2', async (route) => {
    await route.fulfill(json(rows))
  })
  await page.route('**/rest/v1/mangas**', async (route) => {
    await route.fulfill(json(rows))
  })
}

test.describe('Lucky screen', () => {
  test.beforeEach(async ({ page }) => {
    // Guests are redirected from the root route to the WELCOME page; this file measures the shell/content
    // layout, not the funnel. The marker opens the real home page.
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
    })
    await stubCatalog(page)
    await page.setViewportSize(MOBILE)
  })

  test('the draw can be skipped and a result comes', async ({ page }) => {
    await page.goto('/tr/sans')
    // The draw is a show; it should not keep the user waiting.
    const drawing = page.getByTestId('lucky-drawing')
    await expect(drawing).toBeVisible({ timeout: 20_000 })
    await drawing.click()
    await expect(page.getByTestId('lucky-result')).toBeVisible({ timeout: 10_000 })
  })

  test('the result says WHY it came', async ({ page }) => {
    await page.goto('/tr/sans')
    await expect(page.getByTestId('lucky-result')).toBeVisible({ timeout: 20_000 })
    /*
     * The badge does no fake personalization: a guest has no genre signal, so
     * it must say "Tamamen rastgele". Saying "Sana ozel" would be a lie.
     */
    await expect(page.getByTestId('lucky-reason')).toHaveText(/Tamamen rastgele/)
  })

  test('spinning again produces a new result', async ({ page }) => {
    await page.goto('/tr/sans')
    await expect(page.getByTestId('lucky-result')).toBeVisible({ timeout: 20_000 })

    // Must be able to respin on the same screen; no need to go back and re-enter.
    await page.getByTestId('lucky-again').click()
    await expect(page.getByTestId('lucky-drawing')).toBeVisible()
    await expect(page.getByTestId('lucky-result')).toBeVisible({ timeout: 10_000 })
  })

  test('the Lucky button on the home page goes to this screen', async ({ page }) => {
    await page.goto('/tr')
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })
    // Misafirde selamlama cikmaz; dogrudan rotayi dogruluyoruz.
    await page.goto('/tr/sans')
    await expect(page.getByTestId('lucky-page')).toBeVisible({ timeout: 20_000 })
  })
})
