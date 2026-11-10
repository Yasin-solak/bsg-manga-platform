import { expect, test, type Page } from '@playwright/test'

/**
 * The hero swipe works over the WHOLE CARD.
 *
 * In the first version handlers were only on the cover image: swiping over title/genre chips/
 * buttons did not work and the card felt like something that "sometimes swipes, sometimes
 * does not". Also the click after a swipe dropped the user onto the manga page.
 */

const MOBILE = { width: 390, height: 844 }

async function stubHome(page: Page) {
  const json = (body: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })

  /*
   * At least two series are needed for the hero; swiping one slide is meaningless.
   * The RPC name is `get_homepage_feed` (the first version wrote `get_home_page_feed` and
   * rendered nothing: with a stub name mismatch the catch-all returns an
   * empty array and the hero never appears).
   */
  await page.route('**/rest/v1/rpc/get_homepage_feed', async (route) => {
    const manga = (i: number) => ({
      id: `m${i}`,
      title: `Seri ${i}`,
      slug: `seri-${i}`,
      cover_image_url: 'https://placehold.co/400x600/222/fff.png',
      description: `Seri ${i} aciklamasi`,
      status: 'ongoing',
      genres: ['Aksiyon'],
      last_chapter_number: 10,
      is_new: false,
      rating: 4.5,
      total_ratings: 10,
      total_views: 100,
      updated_at: new Date().toISOString(),
    })
    await route.fulfill(json({
      trending_mangas: [1, 2, 3].map(manga),
      latest_mangas: [1, 2, 3].map(manga),
      popular_mangas: [],
      fansubs: [],
    }))
  })
}

/** A horizontal drag from a given point on the card. */
async function swipeAt(page: Page, selector: string, dx: number) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`bulunamadi: ${selector}`)
  const y = box.y + box.height / 2
  const startX = box.x + box.width / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + dx, y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(350)
}

test.describe('Hero kaydirma', () => {
  test.beforeEach(async ({ page }) => {
    // Guests are redirected from the root route to the WELCOME page; this file measures the shell/content
    // layout, not the funnel. The marker opens the real home page.
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
    })
    await stubHome(page)
    await page.setViewportSize(MOBILE)
    await page.goto('/tr')
    await expect(page.getByTestId('home-mobile-hero')).toBeVisible({ timeout: 20_000 })
  })

  test('BASLIK uzerinden kaydirma da slayt gecirir', async ({ page }) => {
    const hero = page.getByTestId('home-mobile-hero')
    const first = await hero.locator('h2').innerText()

    // We swipe from the TEXT half of the card; in the first version this was a dead zone.
    await swipeAt(page, '[data-testid="home-mobile-hero"] h2', -120)

    await expect
      .poll(async () => hero.locator('h2').innerText())
      .not.toBe(first)
  })

  /*
   * The "no drop onto the manga page after a swipe" test was REMOVED.
   *
   * It was written, ran and passed, but it ALSO passed when I disabled the protection
   * (click swallowing). Reason: Playwright's mouse drag already produces no click,
   * so the test never measured what it thought it measured. A guard that passes but
   * cannot break is not a guard but a rubber stamp.
   *
   * The protection STAYS in the code: click behavior after a drag on a real touch device
   * varies by browser and it is a four-line fuse.
   * We cannot produce a touch click in CI, so we state here that it is unverified;
   * it should stand as a known gap rather than silent trust.
   */

  test('a small move does NOT CHANGE the slide', async ({ page }) => {
    const hero = page.getByTestId('home-mobile-hero')
    const first = await hero.locator('h2').innerText()
    // 40px esigin altinda: dikey kaydirmadaki yatay sapma slayt gecirmemeli.
    await swipeAt(page, '[data-testid="home-mobile-hero"] h2', -20)
    await expect(hero.locator('h2')).toHaveText(first)
  })
})
