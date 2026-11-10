import { expect, test, type Page } from '@playwright/test'

async function stub(page: Page, response: boolean | 'error' = false) {
  const calls: string[] = []
  await page.addInitScript(() => localStorage.setItem('bsgmanga:guest-welcome-seen', '1'))
  await page.route('**/rest/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('community_v2_')) calls.push(path)
    const availability = path.endsWith('/community_v2_availability')
    await route.fulfill({ status: availability && response === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(availability ? response : []) })
  })
  await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }))
  return calls
}

test('A closed community leaves mobile and desktop navigation', async ({ page }) => {
  const calls = await stub(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tr/kesfet')
  await expect(page.getByTestId('mobile-tab-bar').getByRole('link')).toHaveCount(4)
  await expect(page.locator('a[href="/topluluk"]')).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('navigation', { name: 'Ana gezinme', exact: true })).toBeVisible()
  await expect(page.locator('a[href="/topluluk"]')).toHaveCount(0)
  expect(calls.every(path => path.endsWith('/community_v2_availability'))).toBe(true)
})

for (const route of ['/topluluk?davet=test', '/discussion/kapali-icerik']) {
  test(`A direct link does not load the chat: ${route}`, async ({ page }) => {
    const calls = await stub(page)
    await page.goto(route)
    await expect(page.getByRole('heading', { name: 'Topluluk henüz kullanıma açılmadı' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ana sayfaya dön', exact: true }).last()).toBeVisible()
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(path => path.endsWith('/community_v2_availability'))).toBe(true)
  })
}

test('If the status service fails the community stays closed', async ({ page }) => {
  await stub(page, 'error')
  await page.goto('/tr/topluluk')
  await expect(page.getByRole('heading', { name: 'Topluluk henüz kullanıma açılmadı' })).toBeVisible()
})

test('An enabled flag brings the menu back; a local close event removes it again', async ({ page }) => {
  await stub(page, true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tr/kesfet')
  await expect(page.getByTestId('mobile-tab-bar').getByRole('link')).toHaveCount(5)
  await page.route('**/rpc/community_v2_availability', route => route.fulfill({ contentType: 'application/json', body: 'false' }))
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('bsgmanga:feature-flag-updated', { detail: { key: 'community.enabled', value: false } })))
  await expect(page.getByTestId('mobile-tab-bar').getByRole('link')).toHaveCount(4)
  await expect(page.locator('a[href="/topluluk"]')).toHaveCount(0)
})
