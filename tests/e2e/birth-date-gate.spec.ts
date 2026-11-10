import { expect, test, type Page } from '@playwright/test'

/**
 * Age gate.
 *
 * 18+ visibility relies on `users.birth_date` (mangas/chapters RLS).
 * Adding a field to the signup form solves only NEW users: no existing
 * user has a date, and social sign-in and email-verified
 * signup also open accounts without passing the form. Without asking for the date 18+ content stays closed
 * to EVERYONE and the gate means nothing.
 *
 * The form "collects", the gate "guarantees".
 */

const MOBILE = { width: 360, height: 800 }

async function stub(page: Page) {
  const json = (body: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
}

async function signIn(page: Page, birthDate: string | null) {
  await page.addInitScript(({ birth }) => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: 'yas-test', authUserId: 'yas-test', username: 'demo',
        avatar: '', role: 'user', isBanned: false, isActive: true, stones: 0,
        ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
        frameType: 'default',
        onboardingCompletedAt: '2026-08-01T09:00:00.000Z',
        birthDate: birth,
      },
    }
  }, { birth: birthDate })
}

test.describe('Age gate', () => {
  test.beforeEach(async ({ page }) => {
    await stub(page)
    await page.setViewportSize(MOBILE)
  })

  test('a user with no date is taken to the gate FROM EVERY ROUTE', async ({ page }) => {
    await signIn(page, null)
    await page.goto('/tr/kutuphane?e2e=1')
    await expect(page).toHaveURL(/\/dogum-tarihi/)
    await expect(page.getByTestId('birth-date-gate')).toBeVisible({ timeout: 20_000 })
  })

  test('a user with a date does NOT HIT the gate', async ({ page }) => {
    await signIn(page, '1998-04-12')
    await page.goto('/tr/kutuphane?e2e=1')
    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('birth-date-gate')).toHaveCount(0)
  })

  test('the gate comes before ONBOARDING', async ({ page }) => {
    // The genre and suggestion step has to know which series to show.
    await page.addInitScript(() => {
      window.__BSGMANGA_E2E__ = {
        mockAuthUser: {
          id: 'yas-test2', authUserId: 'yas-test2', username: 'yeni',
          avatar: '', role: 'user', isBanned: false, isActive: true, stones: 0,
          ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
          frameType: 'default',
          onboardingCompletedAt: null,
          birthDate: null,
        },
      }
    })
    await page.goto('/tr/kesfet?e2e=1')
    await expect(page).toHaveURL(/\/dogum-tarihi/)
  })

  test('under 13 is REJECTED', async ({ page }) => {
    await signIn(page, null)
    await page.goto('/tr/dogum-tarihi?e2e=1')
    await expect(page.getByTestId('birth-date-gate')).toBeVisible({ timeout: 20_000 })

    const bugun = new Date()
    const kucuk = new Date(bugun.getFullYear() - 10, bugun.getMonth(), bugun.getDate())
    await page.locator('#birth-date-gate-input').fill(kucuk.toISOString().slice(0, 10))
    await page.getByRole('button', { name: /Kaydet/ }).click()

    await expect(page.getByTestId('birth-date-gate')).toContainText('13 yaşından küçükler')
  })

  test('the result is stated UP FRONT: for under 18, 18+ stays hidden', async ({ page }) => {
    await signIn(page, null)
    await page.goto('/tr/dogum-tarihi?e2e=1')
    await expect(page.getByTestId('birth-date-gate')).toBeVisible({ timeout: 20_000 })

    const bugun = new Date()
    const onalti = new Date(bugun.getFullYear() - 16, bugun.getMonth(), bugun.getDate())
    await page.locator('#birth-date-gate-input').fill(onalti.toISOString().slice(0, 10))
    /*
     * Making someone fill a "written once" field without seeing its result is not right.
     */
    await expect(page.getByTestId('birth-date-gate')).toContainText('16 yaşındasın')
    await expect(page.getByTestId('birth-date-gate')).toContainText('gizli kalır')

    const yirmibes = new Date(bugun.getFullYear() - 25, bugun.getMonth(), bugun.getDate())
    await page.locator('#birth-date-gate-input').fill(yirmibes.toISOString().slice(0, 10))
    await expect(page.getByTestId('birth-date-gate')).toContainText('de görünür')
  })

  test('birth date is REQUIRED in the signup form', async ({ page }) => {
    await page.goto('/tr/giris?mod=kayit')
    await expect(page.getByRole('heading', { name: 'Aramıza katıl' })).toBeVisible({ timeout: 20_000 })
    // The field exists and is required at HTML level too.
    const alan = page.locator('#auth-birth-date')
    await expect(alan).toBeVisible()
    await expect(alan).toHaveAttribute('required', '')
  })

  test('SAVE works and takes them OUT of the gate', async ({ page }) => {
    /*
     * THIS IS THE TEST THAT WAS MISSED. Earlier tests only measured FALLING into the gate and
     * validation errors; the success path was never tried.
     * In reality the RPC wrote but nobody TOOK the user out of the gate:
     * the screen stayed in place and from outside it looked like "the button does not work".
     */
    await stub(page)
    await page.route('**/rest/v1/rpc/set_my_birth_date', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json', body: '"1998-04-12"',
      })
    })
    await signIn(page, null)
    await page.goto('/tr/dogum-tarihi?e2e=1')
    await expect(page.getByTestId('birth-date-gate')).toBeVisible({ timeout: 20_000 })

    await page.locator('#birth-date-gate-input').fill('1998-04-12')
    await page.getByRole('button', { name: /Kaydet/ }).click()

    // The gate must close: the user must NOT GET STUCK here.
    await expect(page.getByTestId('birth-date-gate')).toHaveCount(0, { timeout: 15_000 })
    await expect(page).not.toHaveURL(/\/dogum-tarihi/)
  })

  test('a user WITH a date does not stop at the gate', async ({ page }) => {
    await stub(page)
    await signIn(page, '1998-04-12')
    // Adresi elle yazsa bile kapida kalmamali.
    await page.goto('/tr/dogum-tarihi?e2e=1')
    await expect(page).not.toHaveURL(/\/dogum-tarihi/)
    await expect(page.getByTestId('birth-date-gate')).toHaveCount(0)
  })
})
