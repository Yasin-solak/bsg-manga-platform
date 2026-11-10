import {
  expect,
  test,
  type Page,
} from '@playwright/test'

async function openCoinCodes(page: Page) {
  await page.goto('/tr/admin/coin-kodlari?e2e=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Coin Kodlari', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Aktivasyon Dağılımı' })).toBeVisible()
}

test.describe('Coin kodlari operasyon akislari', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('the chart period only updates the distribution card and is keyboard navigable', async ({ page }) => {
    await openCoinCodes(page)

    await page.evaluate(() => {
      const audit = { globalLoadingSeen: false }
      const observer = new MutationObserver(() => {
        if (document.body.textContent?.includes('Operasyon ozeti yukleniyor...')) {
          audit.globalLoadingSeen = true
        }
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      Object.assign(window, { __coinCodePeriodAudit: audit })
    })

    await page.getByRole('button', { name: '30 gün' }).click()

    const chart = page.getByRole('img', { name: /30 günlük aktivasyon grafiği/ })
    await expect(chart).toBeVisible()
    await expect(page.getByRole('button', { name: '30 gün' })).toHaveAttribute('aria-pressed', 'true')
    await chart.focus()
    await chart.press('ArrowLeft')

    const globalLoadingSeen = await page.evaluate(
      () => Boolean((window as typeof window & { __coinCodePeriodAudit?: { globalLoadingSeen: boolean } }).__coinCodePeriodAudit?.globalLoadingSeen),
    )
    expect(globalLoadingSeen).toBe(false)
  })

  test('template creation and moving from latest generations to all codes works', async ({ page }) => {
    await openCoinCodes(page)
    await page.getByRole('tab', { name: 'Kod Uret' }).click()

    await expect(page.getByText('Üretime Hazırlık')).toBeVisible()
    await page.getByRole('button', { name: 'Yeni Şablon Oluştur' }).click()
    await expect(page.getByRole('dialog', { name: 'Yeni Kod Şablonu' })).toBeVisible()

    await page.getByLabel(/Şablon Adı/i).fill('Haftalık Okur Kampanyası')
    await page.getByLabel('Prefix').last().fill('HFT')
    await page.getByRole('button', { name: 'Şablonu Kaydet' }).click()

    await expect(page.getByRole('button', { name: /Haftalık Okur Kampanyası/ })).toBeVisible()
    await page.getByRole('button', { name: /Haftalık Okur Kampanyası/ }).click()
    await expect(page.getByLabel('Prefix').first()).toHaveValue('HFT')

    await page.getByRole('button', { name: 'Tümünü Gör' }).click()
    await expect(page.getByRole('tab', { name: 'Kod Listesi' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('MZ-0001-VITRIN0').first()).toBeVisible()
  })

  test('code selection opens the right panel, the detail action opens the window; activations stay in the tab', async ({ page }) => {
    await openCoinCodes(page)
    await page.getByRole('tab', { name: 'Kod Listesi' }).click()
    await page.getByText('MZ-0001-VITRIN0').first().click()

    await expect(page.getByRole('heading', { name: 'Seçili Kod' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Kullanım' })).toBeVisible()
    await page.getByRole('button', { name: 'Detaylı Kod Bilgileri' }).click()
    const detailDialog = page.getByRole('dialog')
    await expect(detailDialog).toContainText('Kimlik, yaşam döngüsü, maruziyet')
    await detailDialog.getByRole('button', { name: 'Kapat' }).click()

    await page.getByRole('tab', { name: 'Aktivasyonlar' }).click()
    await expect(page.getByRole('heading', { name: 'Kod Aktivasyonları' })).toBeVisible()
    await expect(page.getByText('Son Kod Aktivasyonlari')).toHaveCount(0)
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  })
})
