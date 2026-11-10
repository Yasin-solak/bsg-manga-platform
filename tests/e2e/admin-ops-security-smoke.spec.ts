import { expect, test, type Page } from '@playwright/test'

/**
 * Operations > Security tab smoke.
 *
 * **This tab tests that the numbers AGREE WITH EACH OTHER**, because boxes are now
 * filters. A box saying 2 and opening 5 rows in the list breaks the panel's only
 * job: reporting the right state. Three real traps are pinned here:
 *
 * 1. The RPC's `high_events` field counts criticals TOO; the box must show the difference.
 * 2. The summary is windowed, the event list is not ("last N records"); the list must be limited
 * to the summary's window.
 * 3. If the fetch limit cuts the window this must be STATED; a silently incomplete list
 * gives a false "clean" impression.
 */

const ADMIN_ID = 'ops-admin-user'

/** Hours relative to the test's "now": window logic cannot be tested with a fixed date. */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

async function enableAdminMode(page: Page) {
  await page.addInitScript(({ userId }) => {
    window.__BSGMANGA_E2E__ = {
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

interface SecurityMockOptions {
  /** Event sayisini limite esitleyip kirpilma yolunu acar. */
  fillEventLimit?: boolean
}

async function mockSecurityRoutes(page: Page, options: SecurityMockOptions = {}) {
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

  /*
   * high_events = 4, critical_events = 2.
   * By RPC semantics the 4 INCLUDES criticals; on screen the "High" box should
   * show 2 (4-2), because the list filtered by severity='high' gives 2 rows.
   */
  await page.route('**/rest/v1/rpc/get_security_overview', async (route) => {
    await route.fulfill(json([{
      window_hours: 24,
      total_events: 6,
      high_events: 4,
      critical_events: 2,
      pending_reports: 3,
      banned_users: 12,
      code_redemptions: 340,
      suspicious_redeemers: 1,
    }]))
  })

  await page.route('**/rest/v1/rpc/list_security_events', async (route) => {
    const payload = route.request().postDataJSON() as { p_limit?: number } | null
    const limit = Number(payload?.p_limit ?? 120)

    const row = (id: string, severity: string, ageHours: number) => ({
      id,
      event_type: `test_${severity}`,
      source: 'test',
      severity,
      message: `${severity} olay`,
      metadata: {},
      actor_user_id: null,
      actor_username: null,
      target_user_id: null,
      target_username: null,
      created_at: hoursAgo(ageHours),
    })

    // Inside the window: 2 high + 2 critical + 2 low = 6, exactly the summary total.
    const inWindow = [
      row('c1', 'critical', 1),
      row('c2', 'critical', 2),
      row('h1', 'high', 3),
      row('h2', 'high', 4),
      row('l1', 'low', 5),
      row('l2', 'low', 6),
    ]
    // Outside the window: 48 hours ago. It arrives since the list fetches unwindowed but
    // must not show on screen.
    const outOfWindow = [row('old1', 'critical', 48)]

    if (options.fillEventLimit) {
      // A pile filling the limit exactly, all inside the window: the oldest record is
      // still in the window, so the trim warning must appear.
      const filler = Array.from({ length: limit }, (_, index) =>
        row(`f${index}`, 'low', 1 + (index % 20) * 0.1),
      )
      await route.fulfill(json(filler))
      return
    }

    await route.fulfill(json([...inWindow, ...outOfWindow]))
  })

  await page.route('**/rest/v1/rpc/list_redeem_anomaly_users', async (route) => {
    await route.fulfill(json([{
      user_id: 'suspect-1',
      username: 'supheli_kullanici',
      avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=suspect',
      total_redemptions: 9,
      user_wallet_redemptions: 6,
      fansub_wallet_redemptions: 3,
      last_redeemed_at: hoursAgo(1),
      is_banned: false,
    }]))
  })

  await page.route('**/rest/v1/rpc/list_security_alerts', async (route) => {
    await route.fulfill(json([]))
  })
  await page.route('**/rest/v1/rpc/list_security_alert_rules', async (route) => {
    await route.fulfill(json([]))
  })
  await page.route('**/rest/v1/rpc/list_security_alert_mutes', async (route) => {
    await route.fulfill(json([]))
  })
}

/** Opens the security tab and waits for the stream card. */
async function openSecurityTab(page: Page) {
  await page.goto('/tr/admin/operasyon?e2e=1#security')
  await expect(page.getByTestId('admin-ops-security-events')).toBeVisible({ timeout: 20_000 })
}

test.describe('Operasyon > Guvenlik', () => {
  test.beforeEach(async ({ page }) => {
    await enableAdminMode(page)
  })

  test('the high box does not count criticals; it shows the difference from the RPC total', async ({ page }) => {
    await mockSecurityRoutes(page)
    await openSecurityTab(page)

    /*
     * The assertion looks at the number element, not the WHOLE box. The box text also contains
     * "Son 24 saat"; a loose "no 4 appears" assertion trips on that text and
     * does not measure what it means to.
     */
    const highBox = page.getByRole('button', { name: /Yuksek/ })
    // RPC high_events=4 dondu (kritikler dahil). Ham degeri bassa 4 yazardi.
    await expect(highBox.locator('p')).toHaveText('2')

    const criticalBox = page.getByRole('button', { name: /Kritik/ })
    await expect(criticalBox.locator('p')).toHaveText('2')

    // The total is 6 in the same window; boxes must not break independently of the total.
    await expect(page.getByRole('button', { name: /Toplam event/ }).locator('p')).toHaveText('6')
  })

  test('the severity box filters the stream and the row count matches the box', async ({ page }) => {
    await mockSecurityRoutes(page)
    await openSecurityTab(page)

    const events = page.getByTestId('admin-ops-security-events')
    // 6 records inside the window; the 48-hour-old record outside the window must DROP.
    await expect(events.locator('tbody tr')).toHaveCount(6)

    await page.getByRole('button', { name: /Kritik/ }).click()
    // Kutu 2 diyorsa liste de 2 satir olmali.
    await expect(events.locator('tbody tr')).toHaveCount(2)

    await page.getByRole('button', { name: /Yuksek/ }).click()
    await expect(events.locator('tbody tr')).toHaveCount(2)
    await expect(events.locator('tbody tr').first()).toContainText('high')
  })

  test('pressing the same box again removes the filter', async ({ page }) => {
    await mockSecurityRoutes(page)
    await openSecurityTab(page)

    const criticalBox = page.getByRole('button', { name: /Kritik/ })
    await criticalBox.click()
    await expect(criticalBox).toHaveAttribute('aria-pressed', 'true')
    await expect(criticalBox).toContainText('Filtreyi kaldır')

    await criticalBox.click()
    await expect(criticalBox).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('admin-ops-security-events').locator('tbody tr')).toHaveCount(6)
  })

  test('a warning appears if the fetch limit cuts the window', async ({ page }) => {
    await mockSecurityRoutes(page, { fillEventLimit: true })
    await openSecurityTab(page)

    // Sessiz eksik liste yasak: limit dolduysa ekran bunu SOYLEMELI.
    const warning = page.getByTestId('admin-ops-security-events-truncated')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('120')
  })

  test('NO warning if the limit does not cut the window', async ({ page }) => {
    await mockSecurityRoutes(page)
    await openSecurityTab(page)

    // An always-visible warning is not a warning.
    await expect(page.getByTestId('admin-ops-security-events-truncated')).toHaveCount(0)
  })

  test('a suspicious account row seeds the user search', async ({ page }) => {
    await mockSecurityRoutes(page)
    await openSecurityTab(page)

    const anomaly = page.getByTestId('admin-ops-security-anomaly')
    await expect(anomaly).toContainText('supheli_kullanici')

    await anomaly.getByRole('button', { name: /Hesabi ac/ }).click()

    // Kapi karsi tarafta BOS arama kutusuna dusmemeli.
    await expect(page).toHaveURL(/\/admin\/kullanicilar\?q=supheli_kullanici/)
  })
})
