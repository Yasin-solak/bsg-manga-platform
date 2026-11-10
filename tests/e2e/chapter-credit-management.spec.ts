import { expect, test, type Page } from '@playwright/test'
import { prepareChapterCreditManagementBrowserSmoke } from './chapter-credit-management-browser-smoke'

// Opens a real account on the live database and writes comments/reports: runs only when explicitly requested.
test.skip(process.env.E2E_ALLOW_LIVE_ACCOUNTS !== '1', 'Canli veritabanina yazar; E2E_ALLOW_LIVE_ACCOUNTS=1 ile acilir')

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/tr/giris')
  await page.locator('#auth-email').fill(email)
  await page.locator('#auth-password').fill(password)
  await page.locator('#auth-remember-device').check()
  await page.getByRole('button', { name: 'Giriş Yap' }).click()
  await expect(page).not.toHaveURL(/\/giris(?:\?|$)/)
}

async function completeOnboardingIfNeeded(page: Page, _fansubId: string) {
  const skipButton = page.getByRole('button', { name: 'Simdilik gec' })
  const shouldCompleteOnboarding = await skipButton.isVisible().catch(() => false)

  if (!shouldCompleteOnboarding) {
    return
  }

  await skipButton.click()
  await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 20_000 })
}

async function openChapterCreditManagement(page: Page, fansubId: string) {
  await page.goto(`/tr/fansub/${fansubId}/yonet`)

  // In a real auth flow the onboarding redirect can arrive after hydration.
  // Waiting for the visible surface instead of the URL locks the smoke more stably.
  await expect.poll(
    async () => {
      const skipVisible = await page.getByRole('button', { name: 'Simdilik gec' }).isVisible().catch(() => false)
      if (skipVisible) return 'onboarding'

      const tablistVisible = await page.getByRole('tablist').first().isVisible().catch(() => false)
      if (tablistVisible) return 'management'

      return 'pending'
    },
    { timeout: 20_000, intervals: [250, 500, 1000] },
  ).toMatch(/onboarding|management/)

  await completeOnboardingIfNeeded(page, fansubId)
  await expect(page.getByRole('tablist').first()).toBeVisible()
  await page.getByRole('tab', { name: /Kapanis Kredisi/i }).click()
  await expect(page.getByRole('heading', { name: 'Kapanis Kredisi' }).first()).toBeVisible()
}

test.describe('Chapter Credit Management', () => {
  test('opens the closing credit tab on the fansub admin page with real auth', async ({ page }) => {
    test.slow()
    test.setTimeout(120_000)

    const smoke = await prepareChapterCreditManagementBrowserSmoke()

    try {
      await signIn(page, smoke.email, smoke.password)
      await openChapterCreditManagement(page, smoke.fansubId)

      await expect(page.getByText('Varsayilan sablon', { exact: true })).toBeVisible()
      await expect(page.getByText('Kapanis seridi onizlemesi', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Override ekle' })).toBeEnabled()

      await page.getByRole('button', { name: 'Override ekle' }).click()
      const dialog = page.getByRole('dialog').last()
      await expect(dialog.getByText('Bolum bazli kapanis kredisi', { exact: true })).toBeVisible()
      await expect(dialog.getByText('Preview icin once bolum sec', { exact: true })).toBeVisible()
      await expect(dialog.getByText('Bolum sec', { exact: true }).first()).toBeVisible()
    } finally {
      await smoke.cleanup()
    }
  })
})
