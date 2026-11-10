import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { catalog, premiumOffer, productFor, profileEffectAssetRows, storefront } from './fixtures/shopStorefront'

/*
 * Shop live cards: idle cover, live layer mounts on hover / unmounts on leave, one active
 * card, center card on touch, tap only with reduced motion, zero horizontal overflow on mobile and the
 * premium live showcase. Data from shop_* RPC fixtures; assets are real R2 references.
 *
 * Running: with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (placeholder is enough) and
 * VITE_STORE_ASSET_PUBLIC_BASE_URL (R2). In an environment without R2 access,
 * with SHOP_E2E_ASSET_FALLBACK=1 R2 requests are answered with local assets from the repo.
 * Screenshots are written under SHOP_SHOTS_DIR (default test-results/shop-live-cards).
 */

const SHOTS = process.env.SHOP_SHOTS_DIR ?? 'test-results/shop-live-cards'
const ROOT = process.cwd()
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

// Without R2 access, local equivalents of real assets (for visual verification only).
function localFallback(url: string): { file: string, type: string } | null {
  if (url.includes('/frames/posters/')) return { file: 'src/assets/frames/idle/avatarframe1-idle.webp', type: 'image/webp' }
  if (url.includes('/frames/live/')) return { file: 'src/assets/frames/avatarframe1.webp', type: 'image/webp' }
  if (url.includes('/backgrounds/')) return { file: 'public/backgrounds/anime-neon-loop.webm', type: 'video/webm' }
  if (url.includes('/profile-effects/card-asset/')) return { file: 'src/components/profileEffects/skeletoprofil.png', type: 'image/png' }
  if (url.includes('/profile-effects/hover-loop/')) return { file: 'public/boost-examples/boost-sticker-1.png', type: 'image/png' }
  return null
}

async function stubShop(page: Page) {
  // A reader arriving with ?e2e=1: does not trip the birth date gate; the avatar is routed to a local image.
  await page.addInitScript(() => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: 'shop-okur', authUserId: 'shop-okur', username: 'demo', displayName: 'Demo',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=yasin', role: 'user', isBanned: false, isActive: true, stones: 4200,
        ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
        frameType: 'default',
        onboardingCompletedAt: '2026-08-01T09:00:00.000Z',
        birthDate: '2000-01-01',
        premiumExpiresAt: null,
      },
    }
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill(json([])))
  await page.route('**/auth/v1/**', (route) => route.fulfill(json({})))
  await page.route('**/rest/v1/rpc/shop_storefront', (route) => route.fulfill(json(storefront)))
  await page.route('**/rest/v1/rpc/shop_catalog', (route) => route.fulfill(json(catalog)))
  await page.route('**/rest/v1/rpc/shop_product', (route) => {
    const body = route.request().postDataJSON() as { p_slug?: string } | null
    return route.fulfill(json(productFor(body?.p_slug ?? '')))
  })
  await page.route('**/rest/v1/rpc/shop_toggle_wishlist', (route) => route.fulfill(json(true)))
  await page.route('**/rest/v1/rpc/get_active_premium_offer', (route) => route.fulfill(json(premiumOffer)))
  await page.route('**/rest/v1/store_profile_effect_assets*', (route) => route.fulfill(json(profileEffectAssetRows)))
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.route('https://api.dicebear.com/**', (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: readFileSync(path.join(ROOT, 'public/boost-examples/fansub-avatar.png')),
  }))
  if (process.env.SHOP_E2E_ASSET_FALLBACK === '1') {
    await page.route('https://*.r2.dev/**', (route) => {
      const fallback = localFallback(route.request().url())
      if (!fallback) return route.fulfill({ status: 404, body: '' })
      return route.fulfill({ status: 200, contentType: fallback.type, body: readFileSync(path.join(ROOT, fallback.file)) })
    })
  }
}

// Karttaki en distaki canli katmanlar (paket sahnesi kendi icinde arka plan katmani tasir).
const LIVE_LAYER = '[data-shop-live-layer]:not([data-shop-live-layer] [data-shop-live-layer])'

async function liveLayerCount(page: Page) {
  return page.locator('[data-testid="shop-product-card"] [data-shop-live-layer]').count()
}

// Walk the page before a full page screenshot: lazy images and videos attaching near the viewport load.
async function warmPage(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(250)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1200)
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

const CARD_TYPES = ['frame', 'background', 'profile_effect', 'bundle', 'premium', 'locked'] as const

test.describe('shop live cards (desktop)', () => {
  test.use({ viewport: DESKTOP })

  test('showcase: each type idle cover, live layer mounts on hover / unmounts on leave, one active card', async ({ page }) => {
    await stubShop(page)
    await page.goto('/tr/magaza?e2e=1')
    await expect(page.getByTestId('shop-home')).toBeVisible()
    await page.mouse.move(2, 2)
    await warmPage(page)
    await page.screenshot({ path: `${SHOTS}/desktop-vitrin.png`, fullPage: true })
    expect(await liveLayerCount(page)).toBe(0)

    for (const type of CARD_TYPES) {
      const card = page.locator(`[data-testid="shop-product-card"][data-shop-card-type="${type}"]`).first()
      await card.scrollIntoViewIfNeeded()
      await page.mouse.move(2, 2)
      await page.waitForTimeout(200)
      await card.screenshot({ path: `${SHOTS}/desktop-card-${type}-idle.png` })
      await expect(card.locator(LIVE_LAYER)).toHaveCount(0)

      await card.hover()
      await expect(card).toHaveAttribute('data-live', 'true')
      await expect(card.locator(LIVE_LAYER)).toHaveCount(1)
      await page.waitForTimeout(1200)
      await card.screenshot({ path: `${SHOTS}/desktop-card-${type}-hover.png` })
      expect(await page.locator('[data-testid="shop-product-card"][data-live="true"]').count()).toBe(1)

      await page.mouse.move(2, 2)
      await expect(card).toHaveAttribute('data-live', 'false')
      expect(await liveLayerCount(page)).toBe(0)
    }

    // Hizli gecis: hover-intent (120ms) dolmadan ayrilan kart canlanmaz.
    const frames = page.locator('[data-testid="shop-product-card"][data-shop-card-type="frame"]')
    await frames.nth(0).scrollIntoViewIfNeeded()
    await frames.nth(0).hover()
    await page.mouse.move(2, 2)
    await page.waitForTimeout(250)
    expect(await liveLayerCount(page)).toBe(0)

    // Keyboard focus acts like hover: the card comes alive when its link is focused.
    await frames.nth(1).locator('[data-shop-card-link]').focus()
    await expect(frames.nth(1)).toHaveAttribute('data-live', 'true')
    await frames.nth(2).locator('[data-shop-card-link]').focus()
    await expect(frames.nth(2)).toHaveAttribute('data-live', 'true')
    await expect(frames.nth(1)).toHaveAttribute('data-live', 'false')
    expect(await page.locator('[data-testid="shop-product-card"][data-live="true"]').count()).toBe(1)
  })

  test('catalog and product detail', async ({ page }) => {
    await stubShop(page)
    await page.goto('/tr/magaza/katalog?e2e=1')
    await expect(page.getByTestId('shop-catalog')).toBeVisible()
    await page.mouse.move(2, 2)
    await warmPage(page)
    await page.screenshot({ path: `${SHOTS}/desktop-katalog.png`, fullPage: true })
    const bundle = page.locator('[data-shop-card-type="bundle"]').first()
    await bundle.hover()
    await expect(bundle.locator(LIVE_LAYER)).toHaveCount(1)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${SHOTS}/desktop-katalog-hover-paket.png` })

    await page.goto('/tr/magaza/urun/paket-kis-savascisi?e2e=1')
    await expect(page.getByTestId('shop-product')).toBeVisible()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SHOTS}/desktop-detay-paket.png`, fullPage: true })
    await page.goto('/tr/magaza/urun/cerceve-iskambil?e2e=1')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SHOTS}/desktop-detay-cerceve.png` })
  })

  test('premium: each perk selected state and comparison', async ({ page }) => {
    await stubShop(page)
    await page.goto('/tr/magaza/premium?e2e=1')
    await expect(page.getByTestId('shop-premium')).toBeVisible()
    for (const perk of ['name', 'background', 'theme', 'expressions', 'early', 'monthly']) {
      await page.locator(`[data-shop-premium-perk="${perk}"]`).click()
      await expect(page.locator(`[data-shop-premium-mirror="${perk}"]`)).toBeVisible()
      await page.waitForTimeout(900)
      await page.screenshot({ path: `${SHOTS}/desktop-premium-${perk}.png` })
    }
    await expect(page.locator('[data-shop-premium-mirror="early"]')).toHaveCount(0)
    await page.locator('[data-shop-premium-perk="early"]').click()
    await expect(page.locator('[data-shop-premium-mirror="early"]')).toContainText('36 saat sonra')
    await page.locator('[data-shop-premium-perk="theme"]').click()
    await page.getByRole('radio', { name: 'Standart sen' }).click()
    await expect(page.locator('[data-shop-premium-mirror]')).toHaveAttribute('data-premium', 'false')
    await page.screenshot({ path: `${SHOTS}/desktop-premium-standart.png` })
    await expect(page.locator('[data-shop-premium-cta]')).toContainText('1.500')
    await page.locator('[data-shop-premium-buy]').click()
    await expect(page.getByTestId('shop-purchase-dialog')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/desktop-premium-satin-alma.png` })
  })

  test('signed out premium plays with the demo persona', async ({ page }) => {
    await stubShop(page)
    await page.goto('/tr/magaza/premium')
    await expect(page.getByTestId('shop-premium')).toBeVisible()
    await expect(page.locator('[data-shop-premium-mirror="name"]')).toContainText('Okur')
    await page.screenshot({ path: `${SHOTS}/desktop-premium-misafir.png` })
  })
})

test.describe('shop live cards (reduced motion)', () => {
  test.use({ viewport: DESKTOP })

  test('does not autoplay with hover, plays with the preview button', async ({ page }) => {
    await stubShop(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/tr/magaza/katalog?e2e=1')
    const card = page.locator('[data-shop-card-type="frame"]').first()
    await card.hover()
    await page.waitForTimeout(400)
    await expect(card).toHaveAttribute('data-live', 'false')
    await card.locator('[data-shop-live-toggle]').click()
    await expect(card).toHaveAttribute('data-live', 'true')
    await expect(card.locator(LIVE_LAYER)).toHaveCount(1)
    await card.locator('[data-shop-live-toggle]').click()
    await expect(card.locator(LIVE_LAYER)).toHaveCount(0)
  })
})

test.describe('shop live cards (mobile)', () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true })

  // Note: a fullPage screenshot resets touch (hover: none) emulation in Chromium;
  // so the center card check is separate and runs before the screenshot.
  test('the center card plays by itself, released on scroll', async ({ page }) => {
    await stubShop(page)
    await page.goto('/tr/magaza/katalog?e2e=1')
    const card = page.locator('[data-shop-card-type="background"]').first()
    await expect(card).toBeVisible()
    await page.waitForTimeout(1200)
    await card.evaluate((node) => node.scrollIntoView({ block: 'center' }))
    await expect(card).toHaveAttribute('data-live', 'true')
    await expect(card.locator(LIVE_LAYER)).toHaveCount(1)
    expect(await page.locator('[data-testid="shop-product-card"][data-live="true"]').count()).toBe(1)
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${SHOTS}/mobile-katalog-ortadaki-kart.png` })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(card).toHaveAttribute('data-live', 'false')
  })

  test('zero horizontal overflow and mobile screens', async ({ page }) => {
    await stubShop(page)
    for (const [route, name] of [['/magaza?e2e=1', 'vitrin'], ['/magaza/katalog?e2e=1', 'katalog'], ['/magaza/premium?e2e=1', 'premium'], ['/magaza/urun/paket-kis-savascisi?e2e=1', 'detay']] as const) {
      await page.goto(route)
      await warmPage(page)
      expect(await horizontalOverflow(page), `${name} yatay tasma`).toBeLessThanOrEqual(0)
      await page.screenshot({ path: `${SHOTS}/mobile-${name}.png`, fullPage: true })
    }

    await page.goto('/tr/magaza/premium?e2e=1')
    for (const perk of ['name', 'background', 'theme', 'expressions', 'early', 'monthly']) {
      await page.locator(`[data-shop-premium-perk="${perk}"]`).click()
      await page.locator(`[data-shop-premium-mirror="${perk}"]`).scrollIntoViewIfNeeded()
      await page.waitForTimeout(700)
      expect(await horizontalOverflow(page), `premium ${perk} yatay tasma`).toBeLessThanOrEqual(0)
      await page.screenshot({ path: `${SHOTS}/mobile-premium-${perk}.png` })
    }
  })
})
