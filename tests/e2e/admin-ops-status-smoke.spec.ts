import { expect, test, type Page } from '@playwright/test'

/**
 * Operations > Status tab smoke.
 *
 * **Why needed.** The tab sits behind an admin session; we only see the difference between "compiled"
 * and "works" by really rendering. Two things especially:
 * does the version id embedded at build time reach the browser, and
 * does the security score show the BREAKDOWN under the number.
 *
 * The session is mocked, the data layer is fed by a network interceptor:
 * no real password, not a single write to live.
 */

const ADMIN_ID = 'ops-admin-user'

async function enableAdminMode(page: Page) {
  await page.addInitScript(({ userId }) => {
    window.__BSGMANGA_E2E__ = {
      // The operations center is behind a flag; e2e mode used to pin it to OFF
      // and the surface could never be tested.
      mockFeatureFlags: { 'admin.operations_center': true },
      mockAuthUser: {
        id: userId,
        authUserId: userId,
        username: 'opsadmin',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=opsadmin',
        role: 'admin',
        isBanned: false,
        isActive: true,
        stones: 0,
        ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
        frameType: 'default',
        // The age gate (Layout) sends every session with no date to /dogum-tarihi.
        birthDate: '1998-04-12',
        onboardingCompletedAt: '2026-08-01T09:00:00.000Z',
        premiumExpiresAt: null,
      },
    }
  }, { userId: ADMIN_ID })
}

async function mockOpsRoutes(page: Page) {
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

  // Catch-all FIRST: a single unmocked call goes to the real project.
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })

  await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
    const payload = route.request().postDataJSON() as { p_keys?: string[] } | null
    const keys = Array.isArray(payload?.p_keys) ? payload.p_keys : []
    await route.fulfill(json(keys.map((key) => ({ key, is_enabled: key === 'admin.operations_center' }))))
  })
  await page.route('**/rest/v1/rpc/current_app_role', async (route) => {
    await route.fulfill(json('admin'))
  })

  // Guvenlik ozeti: kritik olay sayaci buradan.
  await page.route('**/rest/v1/rpc/get_security_overview', async (route) => {
    await route.fulfill(json([{
      window_hours: 24,
      total_events: 1247,
      high_events: 4,
      critical_events: 2,
      pending_reports: 0,
      banned_users: 12,
      code_redemptions: 340,
      suspicious_redeemers: 5,
    }]))
  })

  // Acik alarmlar: skorun calisma zamani ekseni.
  await page.route('**/rest/v1/rpc/list_security_alerts', async (route) => {
    await route.fulfill(json([
      { id: 'a1', rule_id: 'r1', event_type: 'user_banned', scope_type: 'global', scope_key: 'g', severity: 'critical', status: 'open', title: 'Cok sayida ban', message: '', metadata: {}, created_at: '2026-08-06T10:00:00.000Z' },
      { id: 'a2', rule_id: 'r2', event_type: 'redeem_velocity_high', scope_type: 'global', scope_key: 'g', severity: 'high', status: 'open', title: 'Redeem hizi', message: '', metadata: {}, created_at: '2026-08-06T10:05:00.000Z' },
    ]))
  })

  await page.route('**/rest/v1/rpc/get_admin_user_management_overview', async (route) => {
    await route.fulfill(json({
      generatedAt: '2026-08-06T12:00:00.000Z',
      total: 1842,
      activeLast30Days: 900,
      onlineNow: 37,
      admins: 1,
      moderators: 2,
      verified: 10,
      lowTrustReview: 0,
      newUsersCurrent: 5,
      newUsersPrevious: 3,
      newUsersDelta: 2,
      newUsersDeltaPercent: 66.7,
    }))
  })

  await page.route('**/rest/v1/audit_logs**', async (route) => {
    await route.fulfill(json([
      { id: 'l1', actor_role: 'admin', action: 'flag_guncellendi', resource_type: 'feature_flag', summary: '', metadata: {}, created_at: '2026-08-06T11:00:00.000Z' },
      { id: 'l2', actor_role: 'admin', action: 'fansub_pasif', resource_type: 'fansub', summary: '', metadata: {}, created_at: '2026-08-06T10:30:00.000Z' },
    ]))
  })
}

test.describe('Operasyon > Durum', () => {
  test.beforeEach(async ({ page }) => {
    // Guests are redirected from the root route to the WELCOME page; this file measures the shell/content
    // layout, not the funnel. The marker opens the real home page.
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
    })
    await enableAdminMode(page)
    await mockOpsRoutes(page)
  })

  test('the status tab opens, version and score breakdown show', async ({ page }) => {
    await page.goto('/tr/admin/operasyon?e2e=1#durum')

    const status = page.getByTestId('admin-ops-status')
    await expect(status).toBeVisible({ timeout: 20_000 })

    // Derleme aninda gomulen surum tarayiciya ulasmali; "bilinmiyor" ise
    // vite define'i calismamis demektir.
    const version = status.getByText(/Calisan surum/i).locator('..')
    await expect(version).toBeVisible()
    await expect(status.getByText('bilinmiyor')).toHaveCount(0)

    // Score box and BREAKDOWN: the number alone does not say what to do.
    const scoreCard = page.getByTestId('admin-ops-security-score')
    await expect(scoreCard).toBeVisible()
    await expect(scoreCard.getByText(/Acik alarm: 1 kritik, 1 yuksek/i)).toBeVisible()

    // Skorun canli olmadigi acikca yazmali.
    await expect(scoreCard.getByText(/canli degil/i)).toBeVisible()
  })

  test('online and alarm counters come from real data', async ({ page }) => {
    await page.goto('/tr/admin/operasyon?e2e=1#durum')
    const status = page.getByTestId('admin-ops-status')
    await expect(status).toBeVisible({ timeout: 20_000 })

    // The online box is fed from a REAL field (onlineNow); its value in e2e
    // mode comes from the mock user snapshot, so here we verify
    // 'is there a numeric value': '-' means the field never arrived.
    const online = status.getByText('Cevrimici').locator('..')
    await expect(online).toBeVisible()
    await expect(online).not.toContainText('-')

    // The alarm counter comes from the data we mock: 1 critical + 1 high.
    // The same text shows in both the box hint and the score breakdown; both are
    // right, so it is verified by count.
    await expect(status.getByText(/1 kritik, 1 yuksek/i)).toHaveCount(2)
  })
})

test.describe('Bakim modu', () => {
  const j = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

  /** Bayrak acikken ziyaretci bakim ekranini gormeli. */
  test('with maintenance mode on the visitor stops at the gate', async ({ page }) => {
    await page.route('**/rest/v1/**', (r) => r.fulfill(j([])))
    await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
      const payload = route.request().postDataJSON() as { p_keys?: string[] } | null
      const keys = Array.isArray(payload?.p_keys) ? payload.p_keys : []
      await route.fulfill(j(keys.map((key) => ({ key, is_enabled: key === 'system.maintenance' }))))
    })

    await page.goto('/tr')
    await expect(page.getByTestId('maintenance-gate')).toBeVisible({ timeout: 20_000 })
  })

  /**
   * Admin bakim ekranini GORMEMELI: modu acan kisinin kendini disari
   * kilitlemesi, modu geri kapatmasini da imkansiz kilardi.
   */
  test('admin bakim modunda da girebilir', async ({ page }) => {
    await enableAdminMode(page)
    await page.route('**/rest/v1/**', (r) => r.fulfill(j([])))
    await page.route('**/rest/v1/rpc/current_app_role', (r) => r.fulfill(j('admin')))
    await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
      const payload = route.request().postDataJSON() as { p_keys?: string[] } | null
      const keys = Array.isArray(payload?.p_keys) ? payload.p_keys : []
      await route.fulfill(j(keys.map((key) => ({ key, is_enabled: key === 'system.maintenance' }))))
    })

    await page.goto('/tr?e2e=1')
    await page.waitForTimeout(2500)
    await expect(page.getByTestId('maintenance-gate')).toHaveCount(0)
  })
})

/**
 * Maintenance mode WRITE path.
 *
 * The previous e2e only mocked flag READING; the write path was never tried,
 * so the "every enable makes the flag non-public" bug
 * passed tests and only surfaced when tried by hand in incognito.
 */
test('bakim modunu acmak bayragi public BIRAKIR', async ({ page }) => {
  const j = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  const writes: Record<string, unknown>[] = []

  await enableAdminMode(page)
  await page.route('**/rest/v1/**', (r) => r.fulfill(j([])))
  await page.route('**/rest/v1/rpc/current_app_role', (r) => r.fulfill(j('admin')))
  await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
    const payload = route.request().postDataJSON() as { p_keys?: string[] } | null
    const keys = Array.isArray(payload?.p_keys) ? payload.p_keys : []
    await route.fulfill(j(keys.map((key) => ({ key, is_enabled: key === 'admin.operations_center' }))))
  })
  await page.route('**/rest/v1/feature_flags**', (r) => r.fulfill(j([{
    id: 'f1',
    key: 'system.maintenance',
    label: 'Bakim modu',
    description: 'Aciklama korunmali',
    is_enabled: false,
    rollout_percent: 100,
    is_public: true,
    metadata: {},
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
  }])))
  await page.route('**/rest/v1/rpc/set_feature_flag', async (route) => {
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill(j([]))
  })

  await page.goto('/tr/admin/operasyon?e2e=1#durum')
  const card = page.getByTestId('admin-ops-maintenance')
  await expect(card).toBeVisible({ timeout: 20_000 })

  // Opening takes two steps.
  await card.getByRole('button', { name: /Bakım moduna al/i }).click()
  await card.getByRole('button', { name: /Evet, bakım moduna al/i }).click()

  await expect.poll(() => writes.length, { timeout: 10_000 }).toBeGreaterThan(0)
  const payload = writes.at(-1) as Record<string, unknown>

  // THE MAIN PIN: since a write is a full overwrite, if these fields are lost maintenance
  // mode silently does not work for visitors.
  expect(payload.p_is_public).toBe(true)
  expect(payload.p_is_enabled).toBe(true)
  expect(payload.p_description).toBe('Aciklama korunmali')
})

/**
 * Feature Flags tab: counters are each a FILTER.
 *
 * The numbers were dead: writing "Active 21" and leaving it left finding those 21 in the list
 * to the user.
 */
test('flag counters narrow the list and the filter stays visible', async ({ page }) => {
  const j = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

  await enableAdminMode(page)
  await page.route('**/rest/v1/**', (r) => r.fulfill(j([])))
  await page.route('**/rest/v1/rpc/current_app_role', (r) => r.fulfill(j('admin')))
  await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
    const payload = route.request().postDataJSON() as { p_keys?: string[] } | null
    const keys = Array.isArray(payload?.p_keys) ? payload.p_keys : []
    await route.fulfill(j(keys.map((key) => ({ key, is_enabled: key === 'admin.operations_center' }))))
  })
  await page.route('**/rest/v1/feature_flags**', (r) => r.fulfill(j([
    { id: 'f1', key: 'alpha.acik', label: 'Alpha', description: '', is_enabled: true, rollout_percent: 100, is_public: true, metadata: {}, created_at: '2026-08-06T00:00:00.000Z', updated_at: '2026-08-06T00:00:00.000Z' },
    { id: 'f2', key: 'beta.kapali', label: 'Beta', description: '', is_enabled: false, rollout_percent: 100, is_public: false, metadata: {}, created_at: '2026-08-06T00:00:00.000Z', updated_at: '2026-08-06T00:00:00.000Z' },
  ])))

  await page.goto('/tr/admin/operasyon?e2e=1#feature-flags')

  // Once ikisi de listede.
  await expect(page.getByText('alpha.acik')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('beta.kapali')).toBeVisible()

  // Clicking the "Inactive" box must leave only the disabled ones.
  await page.getByRole('button', { name: /Pasif/i }).click()
  await expect(page.getByText('beta.kapali')).toBeVisible()
  await expect(page.getByText('alpha.acik')).toHaveCount(0)

  // Filtre GORUNUR olmali: liste sessizce daralmamali.
  const chip = page.getByRole('button', { name: /filtreyi kaldır/i })
  await expect(chip).toBeVisible()

  // Ve kaldirilabilmeli.
  await chip.click()
  await expect(page.getByText('alpha.acik')).toBeVisible()
})
