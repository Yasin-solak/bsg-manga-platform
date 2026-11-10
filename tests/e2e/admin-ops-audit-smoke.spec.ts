import { expect, test, type Page } from '@playwright/test'

/**
 * Operations > Audit log smoke.
 *
 * Counters are new in this tab; but what is really pinned is **the click really
 * fetching data**. Filters are server side and do not auto-refresh: pressing a chip
 * and only changing state leaves a hidden "Apply" step for the user
 * and the click looks like it did nothing. Tests verify a request is
 * sent and with the RIGHT parameter.
 */

const ADMIN_ID = 'ops-admin-user'

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

/** Denetim kaydi isteklerinin sorgu dizeleri; parametre gercekten gitti mi? */
const auditRequests: string[] = []

async function mockAuditRoutes(page: Page) {
  auditRequests.length = 0
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

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

  await page.route('**/rest/v1/audit_logs**', async (route) => {
    auditRequests.push(route.request().url())

    // 8 records, 5 hours apart. The first 5 are in the last 24 hours (0,5,10,15,20),
    // the last 3 outside (25,30,35); the time narrowing is measured with this split.
    const actions = [
      'flag_guncellendi', 'flag_guncellendi', 'flag_guncellendi',
      'fansub_pasif', 'fansub_pasif',
      'kullanici_ban', 'manga_silindi', 'bolum_onay',
    ]
    await route.fulfill(json(actions.map((action, index) => ({
      id: `l${index}`,
      actor_user_id: ADMIN_ID,
      actor_role: 'admin',
      action,
      resource_type: action.split('_')[0],
      resource_id: `res-${index}`,
      summary: `${action} islemi`,
      metadata: {},
      created_at: new Date(Date.now() - index * 5 * 60 * 60 * 1000).toISOString(),
    }))))
  })
}

async function openAuditTab(page: Page) {
  await page.goto('/tr/admin/operasyon?e2e=1#audit-logs')
  await expect(page.getByTestId('admin-ops-audit-table')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('admin-ops-audit-row')).toHaveCount(8)
}

test.describe('Operasyon > Denetim kaydi', () => {
  test.beforeEach(async ({ page }) => {
    await enableAdminMode(page)
    await mockAuditRoutes(page)
  })

  test('counters are computed from fetched data', async ({ page }) => {
    await openAuditTab(page)

    await expect(page.getByRole('button', { name: /Gösterilen kayıt/ }).locator('p')).toHaveText('8')
    // 0,5,10,15,20 hours ago = 5 records within 24 hours.
    await expect(page.getByRole('button', { name: /Son 24 saat/ }).locator('p')).toHaveText('5')
    // flag_guncellendi, fansub_pasif, kullanici_ban, manga_silindi, bolum_onay
    await expect(page.getByRole('button', { name: /İşlem türü/ }).locator('p')).toHaveText('5')
  })

  test('the last 24 hours box narrows the list and says so', async ({ page }) => {
    await openAuditTab(page)

    const rows = page.getByTestId('admin-ops-audit-row')
    await page.getByRole('button', { name: /Son 24 saat/ }).click()
    await expect(rows).toHaveCount(5)
    // The narrowing must be VISIBLE; a silently shrinking list looks like "records went missing".
    await expect(page.getByText('Yalnizca son 24 saat')).toBeVisible()

    await page.getByRole('button', { name: /Son 24 saat/ }).click()
    await expect(rows).toHaveCount(8)
  })

  test('the action chip list opens from the box and shows counts', async ({ page }) => {
    await openAuditTab(page)

    await expect(page.getByTestId('admin-ops-audit-action-chips')).toHaveCount(0)
    await page.getByRole('button', { name: /İşlem türü/ }).click()

    const chips = page.getByTestId('admin-ops-audit-action-chips')
    await expect(chips).toBeVisible()
    // Most frequent first: the first chip must be flag_guncellendi with count 3.
    await expect(chips.locator('button').first()).toContainText('flag_guncellendi')
    await expect(chips.locator('button').first()).toContainText('3')
  })

  test('a chip click sends the filter to the server AT ONCE', async ({ page }) => {
    await openAuditTab(page)
    await page.getByRole('button', { name: /İşlem türü/ }).click()

    const before = auditRequests.length
    await page.getByTestId('admin-ops-audit-action-chips')
      .getByRole('button', { name: /fansub_pasif/ })
      .click()

    // Only changing state and waiting is FORBIDDEN: a new request must go...
    await expect.poll(() => auditRequests.length).toBeGreaterThan(before)
    // ...and it must CARRY the selected action.
    expect(auditRequests[auditRequests.length - 1]).toContain('fansub_pasif')
  })

  test('clearing the filter refetches from the server', async ({ page }) => {
    await openAuditTab(page)
    await page.getByRole('button', { name: /İşlem türü/ }).click()
    await page.getByTestId('admin-ops-audit-action-chips')
      .getByRole('button', { name: /fansub_pasif/ })
      .click()
    await expect.poll(() => auditRequests.length).toBeGreaterThan(1)

    const before = auditRequests.length
    await page.getByRole('button', { name: 'Filtreyi temizle' }).click()

    await expect.poll(() => auditRequests.length).toBeGreaterThan(before)
    // Temizlemek state'i sifirlamak DEGIL; daralmis liste ekranda kalmamali.
    expect(auditRequests[auditRequests.length - 1]).not.toContain('fansub_pasif')
  })
})
