import { expect, test, type Page } from '@playwright/test'
import { buildTypesetTestPagePng } from './fixtures/typesetTestPage'

/** This contract is separate because the chapter add route lives independently of the V2 studio. */
const FANSUB_ID = 'b33e2830-8cb6-4fe3-9467-9795ef28b109'
const MANGA_ID = '9f000000-0000-4000-8000-00000000ab01'
const USER_ID = 'chapter-editor-user'
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const READ_ONLY_RPCS = new Set([
  'community_v2_availability', 'get_diagnostic_preference',
  'get_fansubs_with_stats', 'search_public_mangas_v2',
])

async function mockChapterRoutes(page: Page, approved: boolean) {
  let stored: { publish_at: string; pages: string[] } | undefined
  const unexpectedWrites: string[] = []
  const recordUnexpectedWrite = (pathname: string, method: string) => {
    if (method === 'GET') return
    if (pathname.startsWith('/rest/v1/rpc/') && READ_ONLY_RPCS.has(pathname.split('/').at(-1) ?? '')) return
    unexpectedWrites.push(pathname)
  }
  await page.addInitScript(({ userId }) => {
    window.__BSGMANGA_E2E__ = { mockAuthUser: {
      id: userId, authUserId: userId, username: 'bolumeditoru', avatar: '', role: 'user',
      isBanned: false, isActive: true, stones: 0,
      ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
      frameType: 'default', birthDate: '1998-04-12',
      onboardingCompletedAt: '2026-08-01T09:00:00.000Z', premiumExpiresAt: null,
    } }
  }, { userId: USER_ID })
  // Prevents unknown remote requests from reaching the real Supabase project.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173' && !url.pathname.startsWith('/api/')) return route.continue()
    recordUnexpectedWrite(url.pathname, route.request().method())
    return route.fulfill(json([]))
  })
  await page.route('**/auth/v1/**', (route) => route.fulfill(json({})))
  await page.route('**/rest/v1/**', (route) => {
    recordUnexpectedWrite(new URL(route.request().url()).pathname, route.request().method())
    return route.fulfill(json([]))
  })
  await page.route('**/rest/v1/rpc/get_runtime_feature_flags', (route) => {
    const body = route.request().postDataJSON() as { p_keys?: string[] } | null
    return route.fulfill(json((body?.p_keys ?? []).map((key) => ({ key, is_enabled: false }))))
  })
  await page.route('**/rest/v1/rpc/current_app_role', (route) => route.fulfill(json('user')))
  await page.route('**/rest/v1/fansub_members*', (route) => route.fulfill(json({ role: 'admin' })))
  await page.route('**/rest/v1/mangas*', (route) => route.fulfill(json([{
    id: MANGA_ID, title: 'Ay Işığı Günlüğü', slug: 'ay-isigi-gunlugu',
    cover_image: null, status: 'ongoing', is_approved: true, is_active: true,
  }])))
  await page.route('**/storage/v1/**', (route) => route.fulfill(json({ Key: 'chapter-pages/yayin-kontrolu.webp' })))
  await page.route('**/rest/v1/chapters*', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill(json([]))
    stored = route.request().postDataJSON() as typeof stored
    return route.fulfill(json({
      ...stored, id: '9f000000-0000-4000-8000-00000000ab02', manga_id: MANGA_ID,
      chapter_number: 12, is_approved: approved, is_active: true,
      created_at: '2026-09-24T08:00:00Z',
    }, 201))
  })
  return { getStored: () => stored, unexpectedWrites }
}

test.describe('Standalone chapter save: date and approval', () => {
  for (const scenario of [
    { name: 'onaysız', approved: false, date: '2099-01-01T12:00', feedback: 'Bölüm onay bekliyor' },
    { name: 'planlı', approved: true, date: '2099-01-01T12:00', feedback: 'Bölüm planlandı' },
    { name: 'yayımlanmış', approved: true, date: '2020-01-01T12:00', feedback: 'Bölüm yayına alındı' },
  ]) {
    test(`${scenario.name}: date is kept and the server approval shows`, async ({ page }) => {
      const state = await mockChapterRoutes(page, scenario.approved)
      await page.goto(`/tr/fansub/${FANSUB_ID}/bolum/ekle?e2e=1`)
      await expect(page.getByRole('heading', { name: 'Bolum Ekle', exact: true })).toBeVisible()
      await page.getByLabel('Manga', { exact: false }).selectOption(MANGA_ID)
      await page.getByLabel('Bolum numarasi', { exact: false }).fill('12')
      const date = page.getByLabel('Yayin tarihi')
      await date.fill(scenario.date)
      await date.press('Tab')
      await page.getByLabel('Bolum basligi').fill('Yayın Kontrolü')
      await page.setInputFiles('input[type="file"][accept="image/*"]', {
        name: '01.png', mimeType: 'image/png', buffer: await buildTypesetTestPagePng(),
      })
      await expect(date).toHaveValue(scenario.date)
      const save = page.getByRole('button', { name: 'Bolum Ekle', exact: true })
      await expect(save).toBeEnabled({ timeout: 20_000 })
      const expectedIso = await date.evaluate((input: HTMLInputElement) => new Date(input.value).toISOString())
      await save.click()
      await expect.poll(() => state.getStored()?.publish_at).toBe(expectedIso)
      expect(state.getStored()?.pages.length).toBeGreaterThan(0)
      await expect(page.getByText(scenario.feedback, { exact: true })).toBeVisible()
      expect(state.unexpectedWrites).toEqual([])
    })
  }
})
