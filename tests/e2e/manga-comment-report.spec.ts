import { expect, test, type Page } from '@playwright/test'
import { prepareMangaCommentReportBrowserSmoke } from './manga-comment-report-browser-smoke'

// Opens a real account on the live database and writes comments/reports: runs only when explicitly requested.
test.skip(process.env.E2E_ALLOW_LIVE_ACCOUNTS !== '1', 'Canli veritabanina yazar; E2E_ALLOW_LIVE_ACCOUNTS=1 ile acilir')

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/tr/giris')
  await page.locator('#auth-email').fill(email)
  await page.locator('#auth-password').fill(password)
  await page.getByRole('button', { name: 'Giriş Yap' }).click()
  await expect(page).not.toHaveURL(/\/giris(?:\?|$)/)
  const skipOnboardingButton = page.getByRole('button', { name: 'Simdilik gec' })
  if (await skipOnboardingButton.count()) {
    await skipOnboardingButton.click()
    await expect(page).not.toHaveURL(/\/onboarding(?:\?|$)/)
  }
}

async function openMangaComments(page: Page, mangaId: string) {
  await page.goto(`/tr/manga/${mangaId}`)
  await expect(page.getByRole('button', { name: /Yorumlar/ })).toBeVisible()
  await page.getByRole('button', { name: /Yorumlar/ }).click()
  await expect(page.getByTestId('comment-thread-input')).toBeVisible()
}

test.describe('Manga Comment Report Flow', () => {
  test('supports real browser comment create + report flow', async ({ browser }) => {
    test.slow()
    test.setTimeout(120_000)

    const smoke = await prepareMangaCommentReportBrowserSmoke()
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    try {
      await signIn(pageA, smoke.userAEmail, smoke.userAPassword)
      await openMangaComments(pageA, smoke.mangaId)

      await pageA.getByTestId('comment-thread-input').fill(smoke.commentText)
      await pageA.getByRole('button', { name: 'Yorum Yap' }).click()
      await expect(pageA.getByText(smoke.commentText)).toBeVisible()

      const commentId = await smoke.assertCommentCreated()

      await signIn(pageB, smoke.userBEmail, smoke.userBPassword)
      await openMangaComments(pageB, smoke.mangaId)

      const commentItem = pageB.getByTestId(`comment-thread-item-${commentId}`)
      await expect(commentItem).toBeVisible()
      await commentItem.hover()
      await commentItem.getByTestId(`comment-thread-report-${commentId}`).click()

      const reportDialog = pageB.locator('[data-slot="dialog-content"]')
      await expect(reportDialog.locator('#report-description-textarea')).toBeVisible()
      await reportDialog.locator('#report-description-textarea').fill(smoke.reportDescription)
      await reportDialog.getByRole('button', { name: 'Raporla' }).click()
      await expect(reportDialog).toHaveCount(0)

      await smoke.assertReportCreated(commentId)
    } finally {
      await contextA.close()
      await contextB.close()
      await smoke.cleanup()
    }
  })
})
