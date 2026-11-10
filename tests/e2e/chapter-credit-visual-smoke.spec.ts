import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { loadProjectEnv } from '../../scripts/lib/project-env.mjs'

loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })

const REPORT_DIR = path.resolve('docs/reports/chapter-credit-smoke')
const TARGET_FANSUB_ID = process.env.AUTH_SMOKE_FANSUB_ID || 'b33e2830-8cb6-4fe3-9467-9795ef28b109'
const TARGET_READER_PATH = process.env.AUTH_SMOKE_READER_PATH || '/manga/1bdd6a7f-99ef-4d83-be84-47c76601eb0e/chapter/123'
const E2E_QUERY = 'e2e=1'

async function mockChapterCreditManagementData(page: Page) {
  await page.route('**/rest/v1/rpc/get_fansub_manage_chapter_credit_settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fansubId: TARGET_FANSUB_ID,
        isEnabled: true,
        title: null,
        body: null,
        ctaLabel: null,
        ctaTarget: null,
        showMetrics: true,
        showSupporters: true,
        maxSupporterCount: 2,
        createdAt: '2026-04-09T10:00:00.000Z',
        updatedAt: '2026-04-09T10:00:00.000Z',
      }),
    })
  })

  await page.route('**/rest/v1/rpc/list_fansub_manage_chapter_credit_overrides', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    })
  })

  await page.route('**/rest/v1/rpc/list_fansub_manage_chapters', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: '11111111-2222-3333-4444-555555555555',
            manga_id: '1bdd6a7f-99ef-4d83-be84-47c76601eb0e',
            manga_title: 'Deneme Manga',
            manga_slug: 'deneme-manga',
            chapter_number: 123,
            title: 'Bolum sonu smoke',
            is_approved: true,
            publish_at: '2026-04-09T10:00:00.000Z',
            created_at: '2026-04-09T10:00:00.000Z',
            updated_at: '2026-04-09T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 100,
      }),
    })
  })
}

async function enableAdminE2EMode(page: Page) {
  await page.addInitScript(() => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: '11111111-1111-1111-1111-111111111111',
        authUserId: '11111111-1111-1111-1111-111111111111',
        username: 'yonetici',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=yonetici',
        role: 'admin',
        isBanned: false,
        isActive: true,
        stones: 8000,
        ownedItems: {
          frames: ['default'],
          backgrounds: [],
          patterns: [],
          premium: [],
        },
        frameType: 'default',
        // The age gate (Layout) sends every session with no date to /dogum-tarihi.
        birthDate: '1998-04-12',
        onboardingCompletedAt: '2026-04-01T09:00:00.000Z',
        premiumExpiresAt: null,
      },
    }
  })
}

async function ensureReportDir() {
  await fs.mkdir(REPORT_DIR, { recursive: true })
}

async function openChapterCreditManagement(page: Page) {
  await page.goto(`/tr/fansub/${TARGET_FANSUB_ID}/yonet?${E2E_QUERY}`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/fansub\/.+\/yonet\?e2e=1/, { timeout: 20_000 })
  await page.waitForTimeout(1_200)

  await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('tab', { name: /Kapanis Kredisi/i }).first().click()
  await page.waitForTimeout(1_000)
}

async function openReaderWithCredit(page: Page) {
  const readerPath = TARGET_READER_PATH.includes('?')
    ? `${TARGET_READER_PATH}&${E2E_QUERY}`
    : `${TARGET_READER_PATH}?${E2E_QUERY}`
  await page.goto(readerPath, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1_800)
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
  await page.waitForTimeout(1_000)
  await expect(page.getByTestId('chapter-credit-rail').first()).toBeVisible({ timeout: 15_000 })
}

test.describe('Chapter Credit Visual Smoke', () => {
  test('admin and reader surfaces visual smoke', async ({ page }) => {
    test.setTimeout(120_000)
    await ensureReportDir()
    await enableAdminE2EMode(page)
    await mockChapterCreditManagementData(page)
    await openChapterCreditManagement(page)
    await expect(page.getByRole('heading', { name: 'Kapanis Kredisi' }).first()).toBeVisible()

    await page.screenshot({
      path: path.join(REPORT_DIR, 'management-desktop.png'),
      fullPage: true,
    })

    const previewSection = page.getByText('Kapanis seridi onizlemesi', { exact: true }).locator('..').locator('..')
    await page.getByRole('button', { name: 'Mobil' }).click()
    await page.waitForTimeout(500)
    await previewSection.screenshot({
      path: path.join(REPORT_DIR, 'management-mobile-preview.png'),
    })

    await page.getByRole('button', { name: 'Override ekle' }).click()
    const dialog = page.getByRole('dialog').last()
    await expect(dialog.getByText('Preview icin once bolum sec')).toBeVisible({ timeout: 10_000 })

    await dialog.screenshot({
      path: path.join(REPORT_DIR, 'override-dialog.png'),
    })

    await dialog.getByRole('button', { name: 'Iptal' }).click()
    await page.waitForTimeout(300)

    await openReaderWithCredit(page)
    const rail = page.getByTestId('chapter-credit-rail').first()
    await rail.scrollIntoViewIfNeeded()
    await rail.screenshot({
      path: path.join(REPORT_DIR, 'reader-credit-rail.png'),
    })
  })
})
