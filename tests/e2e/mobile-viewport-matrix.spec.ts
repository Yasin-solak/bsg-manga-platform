import { expect, test, type Page } from '@playwright/test'

/**
 * Mobile viewport matrix: the measurable form of "does it work on every phone?".
 *
 * **Why needed.** Checking one 390x844 screen and saying "mobile done" means never
 * seeing the two most broken ends: the 320px old iPhone SE and the folded
 * Galaxy Fold's 344px. 46 pixels are enough for something to overflow.
 *
 * **WIDTH is tested, not device names.** To a browser the difference between "iPhone 17 Pro Max" and "Redmi
 * Note" is just width and height in CSS pixels;
 * writing tests by device name would test the same width dozens of
 * times and never try the gaps between. The list below
 * scans the width RANGE in use end to end.
 *
 * **What is measured** (all three break silently, unnoticed in screenshots):
 * 1. Horizontal overflow: mobile web's number one defect.
 * 2. Touch target size: below 44px a finger cannot hit it.
 * 3. The fixed bar not covering content.
 */

interface Viewport {
  name: string
  width: number
  height: number
  /** Why we keep this width on the list. */
  why: string
}

/*
 * Ends and dense regions of the width range. Heights are kept realistic:
 * a short screen is a separate breakpoint squeezing the content area together with
 * fixed top/bottom bars.
 */
const VIEWPORTS: Viewport[] = [
  { name: 'dar-320', width: 320, height: 568, why: 'iPhone SE 1. nesil / en dar yaygin ekran' },
  { name: 'fold-344', width: 344, height: 882, why: 'Galaxy Z Fold katli hali — dar ama uzun' },
  { name: 'android-360', width: 360, height: 640, why: 'en yaygin Android tabani (Redmi dahil)' },
  { name: 'iphone-390', width: 390, height: 844, why: 'iPhone 14/15 — tasarim handoff olcusu' },
  { name: 'genis-430', width: 430, height: 932, why: 'iPhone Pro Max / buyuk Android' },
]

/** The bottom and top bars exist on every route; both must be tested at each width. */
const ROUTES = ['/', '/kesfet', '/magaza', '/topluluk']

async function stubNetwork(page: Page) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
  // Catch-all FIRST: a single unmocked call goes to the real project.
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
}

/** Let the page stop growing; if lazy rails arrive after the measure the measure lies. */
async function waitForLayoutSettle(page: Page) {
  await page.waitForFunction(() => {
    const el = document.scrollingElement
    if (!el) return false
    const w = window as unknown as { __h?: number; __n?: number }
    const h = el.scrollHeight
    w.__n = w.__h === h ? (w.__n ?? 0) + 1 : 0
    w.__h = h
    return (w.__n ?? 0) >= 3
  }, undefined, { timeout: 20_000, polling: 250 })
}

test.describe('Mobile viewport matrix', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} (${vp.width}x${vp.height}) — ${vp.why}`, () => {
      test.beforeEach(async ({ page }) => {
    // Guests are redirected from the root route to the WELCOME page; this file measures the shell/content
    // layout, not the funnel. The marker opens the real home page.
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
    })
        await stubNetwork(page)
        await page.setViewportSize({ width: vp.width, height: vp.height })
      })

      test('no horizontal overflow on any page', async ({ page }) => {
        for (const route of ROUTES) {
          await page.goto(route)
          await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })
          await waitForLayoutSettle(page)

          const overflow = await page.evaluate(() => {
            const el = document.documentElement
            return {
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              // Also report the element CAUSING the overflow: saying "there is an overflow somewhere"
              // leaves the search to the developer.
              culprits: [...document.querySelectorAll('body *')]
                .filter((node) => {
                  const r = node.getBoundingClientRect()
                  return r.width > 0 && r.right > el.clientWidth + 1
                })
                .slice(0, 3)
                .map((node) => `${node.tagName}.${(node.className || '').toString().slice(0, 60)}`),
            }
          })

          expect(
            overflow.scrollWidth,
            `${route} yatay tasiyor. Suphuliler: ${overflow.culprits.join(' | ')}`,
          ).toBeLessThanOrEqual(overflow.clientWidth + 1)
        }
      })

      test('bottom tabs can be hit by a finger', async ({ page }) => {
        await page.goto('/tr')
        await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })

        const sizes = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="mobile-tab-bar"]')
          return [...(bar?.querySelectorAll('a') ?? [])].map((a) => {
            const r = a.getBoundingClientRect()
            return { label: a.textContent?.trim() ?? '', w: Math.round(r.width), h: Math.round(r.height) }
          })
        })

        expect(sizes.length).toBe(5)
        for (const s of sizes) {
          // 44px is the lower bound of Apple HIG; below it touch errors rise.
          expect(s.h, `${s.label} tab is ${s.h}px tall`).toBeGreaterThanOrEqual(44)
          // 320px'de bes sekme = 64px; bunun altina duserse sekme sayisi
          // ya da duzen yeniden dusunulmeli.
          expect(s.w, `${s.label} tab is ${s.w}px wide`).toBeGreaterThanOrEqual(44)
        }
      })

      test('the fixed bar does not cover the page end', async ({ page }) => {
        /*
         * Two separate things are measured, because the earlier version only measured the MECHANISM
         * (spacer height >= bar height) and missed the real defect:
         * `#layout-content` took a full 100vh min-height, but the mobile
         * top bar is `sticky` and takes 56px IN FLOW. The page always grew
         * 56px and on short pages the footer went UNDER the bottom bar
         * (measured in the Library: footer bottom 784, bar top 731).
         * The guard was green, the screen was broken.
         *
         * A short page was picked: on a long page the footer is already outside the viewport
         * and the defect is invisible.
         */
        await page.goto('/tr/kutuphane')
        await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })
        await waitForLayoutSettle(page)

        const olcum = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="mobile-tab-bar"]') as HTMLElement | null
          const topBar = document.querySelector('[data-testid="mobile-top-bar"]') as HTMLElement | null
          const spacer = document.querySelector('#layout-content > div[aria-hidden="true"]') as HTMLElement | null
          const main = document.querySelector('#layout-content > main') as HTMLElement | null
          const footer = document.querySelector('footer')
          if (!bar || !topBar || !spacer || !main || !footer) return null
          const h = (el: Element) => Math.round(el.getBoundingClientRect().height)
          /*
           * Not `main` but main's CONTENT is measured. Since main is `flex-1` it
           * absorbs extra space into itself; measuring its box would hide the excess
           * (the mutation test passed in the first version because of this).
           */
          const icerik = main.firstElementChild
          if (!icerik) return null
          return {
            bar: h(bar),
            spacer: h(spacer),
            dogalToplam: h(topBar) + h(icerik) + h(footer) + h(spacer),
            belgeYuksekligi: document.documentElement.scrollHeight,
            viewport: window.innerHeight,
          }
        })
        expect(olcum).not.toBeNull()

        /*
         * 1) The document can be as long as the SCREEN or the REAL content; it cannot exceed
         * the larger of the two. Filling the screen is what is wanted
         * (the footer should not hang in the middle); EXCEEDING it is empty space the layout
         * set aside, which pushes the footer under the bar.
         * The 100vh bug yields an excess of exactly the top bar (56px) here.
         */
        const ustSinir = Math.max(olcum!.viewport, olcum!.dogalToplam)
        expect(
          olcum!.belgeYuksekligi,
          `document ${olcum!.belgeYuksekligi}px, upper limit ${ustSinir}px (screen ${olcum!.viewport}, natural content ${olcum!.dogalToplam}): excess empty space`,
        ).toBeLessThanOrEqual(ustSinir)

        /*
         * 2) Sayfanin sonuna inildiginde son satir cubugun ustunde bitmeli.
         */
        await page.evaluate(() => window.scrollTo({ top: 999_999, behavior: 'instant' }))
        await waitForLayoutSettle(page)
        const son = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="mobile-tab-bar"]')?.getBoundingClientRect()
          const footer = document.querySelector('footer')?.getBoundingClientRect()
          if (!bar || !footer) return null
          return { barTop: Math.round(bar.top), footerBottom: Math.round(footer.bottom) }
        })
        expect(son).not.toBeNull()
        expect(
          son!.footerBottom,
          `footer bottom ${son!.footerBottom}px, bar top ${son!.barTop}px: the page end stays under the bar`,
        ).toBeLessThanOrEqual(son!.barTop)
      })
    })
  }
})
