import { expect, test, type Page } from '@playwright/test'

const userId = '10000000-0000-4000-8000-000000000001'
const serverId = '10000000-0000-4000-8000-000000000002'
const channelId = '10000000-0000-4000-8000-000000000003'
const profile = { id: serverId, name: 'Okuma kulübü', description: '', rules: '', avatar_url: null, banner_url: null, slug: '', owner_id: userId, kind: 'room', join_mode: 'open', archived_at: null, version: 1 }
const channel = { id: channelId, name: 'Genel', topic: '', category: '', position: 0, is_private: false, can_read: true, unread: 0, mention_count: 0, role_ids: [], archived_at: null, version: 1, manga_id: null, series: null, can_link_series: false, read_only_reason: null, slowmode_seconds: 0, next_send_at: null }
const permissions = ['messages.read', 'messages.send', 'members.list', 'channel.view']

async function setup(page: Page, mobile: boolean) {
  const calls: string[] = []
  let denied = false
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  await page.addInitScript(({ userId }) => {
    localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
    window.__BSGMANGA_E2E__ = { mockAuthUser: { id: userId, authUserId: userId, username: 'okur', avatar: '', role: 'user', isBanned: false, isActive: true, stones: 0, ownedItems: { frames: [], backgrounds: [], patterns: [], premium: [] }, frameType: 'default', birthDate: '1998-04-12', onboardingCompletedAt: '2026-08-01T09:00:00Z', premiumExpiresAt: null } }
  }, { userId })
  await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }))
  // No live Supabase socket is opened. The socketless HTTP start/fallback check is tested.
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {})
  await page.route('**/rest/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const action = route.request().postDataJSON()?.p_action
    let body: unknown = []
    if (path.endsWith('/community_v2_availability')) body = true
    if (path.endsWith('/community_v2_read')) {
      calls.push(action)
      const shared = { server_now: new Date().toISOString(), is_owner: false, permissions, timeout_until: null, channels: [channel] }
      if (action === 'home') body = { auto_join: true, servers: [profile], owned_fansubs: [] }
      if (action === 'server') body = { ...shared, my_nickname: null, profile, my_rank: 1000, roles: [] }
      if (action === 'activity') body = { ...shared, server_id: serverId }
      if (action === 'message_refresh') body = { latest: [], snapshot: [] }
      if (denied && ['server', 'activity', 'message_refresh', 'members'].includes(action)) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'Bu kanala erişimin yok.' }) }); return
      }
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.clock.install()
  await page.goto(`/tr/topluluk?e2e=1&sunucu=${serverId}&kanal=${channelId}`)
  await expect(page.getByRole('textbox', { name: 'Mesajın', exact: true })).toBeVisible()
  await expect(page.locator('.cv2-messages .cv2-loading')).toHaveCount(0)
  return { calls, deny: () => { denied = true } }
}

test('Hidden members are not loaded on mobile; an opened panel makes the request, activity does not repeat', async ({ page }) => {
  const { calls } = await setup(page, true)
  expect(calls.filter(c => c === 'members')).toHaveLength(0)
  await page.clock.runFor(35000)
  await expect.poll(() => calls.filter(c => c === 'activity').length).toBeGreaterThan(0)
  expect(calls.filter(c => c === 'server')).toHaveLength(1)
  expect(calls.filter(c => c === 'members')).toHaveLength(0)
  await page.getByRole('navigation', { name: 'Topluluk panelleri' }).getByRole('button', { name: 'Üyeler', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Kanal üyelerinde ara' })).toBeVisible()
  await expect.poll(() => calls.filter(c => c === 'members').length).toBe(1)
  await page.clock.runFor(35000)
  expect(calls.filter(c => c === 'members')).toHaveLength(1)
})

test('The desktop periodic check does not refetch the member list; it closes on lost access', async ({ page }) => {
  const { calls, deny } = await setup(page, false)
  await expect.poll(() => calls.filter(c => c === 'members').length).toBe(1)
  await page.clock.runFor(35000)
  await expect.poll(() => calls.filter(c => c === 'activity').length).toBeGreaterThan(0)
  expect(calls.filter(c => c === 'server')).toHaveLength(1)
  expect(calls.filter(c => c === 'members')).toHaveLength(1)
  deny()
  await page.clock.runFor(35000)
  await expect(page.getByRole('textbox', { name: 'Mesajın', exact: true })).toHaveCount(0)
  await expect(page.locator('.cv2-members input')).toHaveCount(0)
  await expect(page.locator('.cv2-error').first()).toContainText('erişimin yok')
})
