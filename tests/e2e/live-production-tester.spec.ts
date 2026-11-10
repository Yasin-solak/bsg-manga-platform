import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const BASE_URL = process.env.LIVE_E2E_BASE_URL?.trim() || 'https://7b02cd1d.bsgmanga.pages.dev'
const EMAIL = process.env.LIVE_E2E_EMAIL?.trim() || ''
const PASSWORD = process.env.LIVE_E2E_PASSWORD || ''
const COIN_CODE = process.env.LIVE_E2E_COIN_CODE?.trim() || ''
const SCREENSHOT_DIR = path.resolve('docs/reports/screenshots')
const missingLiveE2eEnv = [
    ['LIVE_E2E_EMAIL', EMAIL],
    ['LIVE_E2E_PASSWORD', PASSWORD],
    ['LIVE_E2E_COIN_CODE', COIN_CODE],
].filter(([, value]) => !value).map(([name]) => name)

test.describe('BSG Manga live end-to-end test and security audit', () => {
    test.skip(missingLiveE2eEnv.length > 0, `Canli E2E env eksik: ${missingLiveE2eEnv.join(', ')}`)

    const consoleLogs: string[] = []
    const consoleErrors: string[] = []
    const networkRequests: { url: string; method: string; status: number }[] = []

    test.beforeAll(async () => {
        await fs.mkdir(SCREENSHOT_DIR, { recursive: true })
    })

    test('Member sign-in, Coin code redeem, shop and security/privacy analysis', async ({ page }) => {
        // 1. Set up console and network listeners
        page.on('console', (msg) => {
            const text = `[Console ${msg.type()}] ${msg.text()}`
            consoleLogs.push(text)
            if (msg.type() === 'error') {
                consoleErrors.push(text)
            }
        })

        page.on('pageerror', (err) => {
            const text = `[Page Error] ${err.message}`
            consoleLogs.push(text)
            consoleErrors.push(text)
        })

        page.on('response', (res) => {
            networkRequests.push({
                url: res.url(),
                method: res.request().method(),
                status: res.status(),
            })
        })

        // 2. Giris Sayfasina Git
        console.log('[TEST] Going to the sign-in page...')
        await page.goto(`${BASE_URL}/giris`, { waitUntil: 'networkidle' })
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_giris_sayfasi.png') })

        // 3. Fill in the form and sign in
        console.log('[TEST] Filling in the member sign-in form...')
        await page.locator('#auth-email').fill(EMAIL)
        await page.locator('#auth-password').fill(PASSWORD)
        
        // Privacy check: make sure the password field has type "password" (required for privacy)
        const passwordInputType = await page.locator('#auth-password').getAttribute('type')
        console.log(`[SECURITY] Password input type: ${passwordInputType}`)
        expect(passwordInputType).toBe('password')

        await page.getByRole('button', { name: 'Giriş Yap' }).click()

        // 4. Yonlendirmeyi Bekle
        console.log('[TEST] Yonlendirme bekleniyor...')
        await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/profil/tester' || url.pathname.includes('/hos-geldin'), { timeout: 20000 })
        await page.waitForTimeout(2000) // A short wait for hydration and loading
        
        const currentPath = new URL(page.url()).pathname
        console.log(`[TEST] Page reached after sign-in: ${currentPath}`)
        
        if (currentPath.includes('/hos-geldin')) {
            console.log('[TEST] Looking for the "Devam Et" button on /hos-geldin or redirecting...')
            const continueButton = page.locator('button:has-text("Devam Et"), a:has-text("Devam Et"), button[class*="continue"]')
            if (await continueButton.isVisible()) {
                await continueButton.click()
                await page.waitForTimeout(2000)
            } else {
                console.log('[TEST] "Devam Et" button not found, redirecting straight to the home page...')
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
            }
        }
        
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_giris_sonrasi_anasayfa.png') })
        console.log(`[TEST] Signed in successfully. Current URL: ${page.url()}`)

        // 5. Privacy and security analysis: LocalStorage, SessionStorage and Cookie check
        const storageState = await page.evaluate(() => {
            const readEntries = (storage: Storage) => Object.keys(storage).map((key) => ({
                key,
                maskedValue: /token|session|auth/i.test(key) ? '[MASKELI]' : String(storage.getItem(key)).slice(0, 100)
            }))
            return {
                localStorage: readEntries(localStorage),
                sessionStorage: readEntries(sessionStorage),
                cookies: document.cookie.split(';').map(c => c.trim()).filter(Boolean).map(c => c.split('=')[0])
            }
        })

        console.log('[SECURITY] LocalStorage Anahtarlari:', JSON.stringify(storageState.localStorage, null, 2))
        console.log('[SECURITY] SessionStorage Anahtarlari:', JSON.stringify(storageState.sessionStorage, null, 2))
        console.log('[SECURITY] Cookies:', JSON.stringify(storageState.cookies, null, 2))

        // 6. Coin Kodu Yukleme Akisi
        console.log('[TEST] Triggering the profile dropdown and quick panel to redeem a Coin code...')
        
        // Find and click the User Menu button in the top bar
        const userMenuButton = page.locator('button[aria-label="Kullanici menusu"]')
        await expect(userMenuButton).toBeVisible()
        await userMenuButton.click()
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_kullanici_menusu_dropdown.png') })

        // Click the "Coin Kodu" menu item
        const coinCodeMenuItem = page.getByRole('menuitem', { name: /Coin Kodu/i })
        await expect(coinCodeMenuItem).toBeVisible()
        await coinCodeMenuItem.click()
        await page.waitForTimeout(1000)
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_coin_kodu_paneli.png') })

        // 7. Enter and activate the code
        console.log(`[TEST] Coin kodu giriliyor: ${COIN_CODE}`)
        const codeInput = page.getByPlaceholder('Örnek: BSG-ABC123-XYZ9')
        await expect(codeInput).toBeVisible()
        await codeInput.fill(COIN_CODE)

        // Click the "Kodu Aktifleştir" button
        const submitButton = page.getByRole('button', { name: 'Kodu Aktifleştir' })
        await expect(submitButton).toBeVisible()
        await submitButton.click()
        
        console.log('[TEST] Code activation request sent, waiting for the result...')
        await page.waitForTimeout(3000) // Wait for toast messages or balance updates
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_coin_kodu_sonuc.png') })

        // Look at toast messages or error notices
        const toastMessage = page.locator('[role="status"], .toast, [class*="toast"]').first()
        const toastText = await toastMessage.innerText().catch(() => 'Bulunamadi')
        console.log(`[TEST] Alinan Toast Mesaji: ${toastText}`)

        // 8. Magaza Akisi Testi
        console.log('[TEST] Going to the shop page...')
        await page.goto(`${BASE_URL}/magaza`, { waitUntil: 'networkidle' })
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_magaza_sayfasi.png') })

        // Make sure at least one product loaded in the shop
        const firstStoreCard = page.locator('[data-testid^="store-item-card-"]').first()
        const storeCardsCount = await page.locator('[data-testid^="store-item-card-"]').count()
        console.log(`[TEST] Products in the shop: ${storeCardsCount}`)
        
        if (storeCardsCount > 0) {
            await expect(firstStoreCard).toBeVisible()
            const itemName = await firstStoreCard.locator('h3, .font-bold').first().innerText().catch(() => 'Bilinmeyen Urun')
            console.log(`[TEST] First product in the shop: ${itemName}`)
            
            // Try clicking the buy button (to test the confirm modal stage)
            const buyButton = firstStoreCard.getByRole('button', { name: 'Satın Al' })
            if (await buyButton.isVisible()) {
                await buyButton.click()
                await page.waitForTimeout(1000)
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_satin_alma_secim_modali.png') })
                console.log('[TEST] Satin alma secim modali basariyla tetiklendi.')
                
                // Close the dialog or cancel (search for the cancel button to avoid spending balance and keep the test intact)
                const closeButton = page.locator('button:has-text("Vazgeç"), button[aria-label="Kapat"], [data-slot="dialog-content"] button').first()
                if (await closeButton.isVisible()) {
                    await closeButton.click()
                    console.log('[TEST] Satin alma akisi guvenle sonlandirildi (vazgecildi).')
                }
            }
        }

        // 9. Fansublar Sayfasi Akisi
        console.log('[TEST] Going to the fansubs page...')
        await page.goto(`${BASE_URL}/fansublar`, { waitUntil: 'networkidle' })
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_fansublar_sayfasi.png') })
        
        const fansubCardsCount = await page.locator('.fansub-card, [class*="FansubCard"]').count().catch(() => 0)
        console.log(`[TEST] Sitedeki fansub sayisi: ${fansubCardsCount}`)

        // 10. Security check: unauthorized admin access attempt
        console.log('[SECURITY] Trying unauthorized access to the admin page...')
        await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_admin_yetkisiz_erisim.png') })
        
        const currentUrl = page.url()
        console.log(`[SECURITY] URL after admin route access: ${currentUrl}`)
        // Without admin rights we expect a redirect to the home or sign-in page
        if (currentUrl.includes('/admin')) {
            console.log('[SECURITY WARNING] A normal user reached the admin route! RLS or the client-side route guard may be missing.')
        } else {
            console.log('[SECURITY OK] Access to the admin route was blocked and redirected.')
        }

        // 11. Test Sonu Rapor Hazirligi: Toplanan Verileri Diske Yaz
        const reportData = {
            generatedAt: new Date().toISOString(),
            email: EMAIL,
            storageState,
            toastText,
            storeCardsCount,
            fansubCardsCount,
            adminRouteRedirected: !currentUrl.includes('/admin'),
            consoleLogsCount: consoleLogs.length,
            consoleErrorsCount: consoleErrors.length,
            consoleErrors,
            networkRequestsCount: networkRequests.length,
            duplicatedRequests: findDuplicatedRequests(networkRequests)
        }

        const reportJsonPath = path.resolve('docs/reports/live-tester-e2e-results.json')
        await fs.writeFile(reportJsonPath, JSON.stringify(reportData, null, 2), 'utf8')
        console.log(`[OK] End-to-end live test report saved: ${reportJsonPath}`)
    })
})

function findDuplicatedRequests(requests: { url: string; method: string; status: number }[]) {
    const counts: Record<string, number> = {}
    requests.forEach(r => {
        // Skip static assets and supabase auth token logs
        if (r.url.includes('.png') || r.url.includes('.jpg') || r.url.includes('.svg') || r.url.includes('/auth/v1/')) return
        const key = `${r.method} ${r.url.split('?')[0]}`
        counts[key] = (counts[key] || 0) + 1
    })
    return Object.entries(counts).filter(([_, count]) => count > 1).map(([key, count]) => ({ request: key, count }))
}
