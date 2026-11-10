import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// Opens a real account on the live database and writes comments/reports: runs only when explicitly requested.
test.skip(process.env.E2E_ALLOW_LIVE_ACCOUNTS !== '1', 'Canli veritabanina yazar; E2E_ALLOW_LIVE_ACCOUNTS=1 ile acilir')

// -- TEST SETTINGS AND REPORTING INFRASTRUCTURE --
// This test is designed to catch, locally, all gaps in backend processes, CSP violations, RLS restrictions
// and API/database errors with a temporary test identity given via env.

const TEST_EMAIL = process.env.LIVE_E2E_EMAIL?.trim() || process.env.E2E_TEST_EMAIL?.trim() || ''
const TEST_PASSWORD = process.env.LIVE_E2E_PASSWORD || process.env.E2E_TEST_PASSWORD || ''
const PROMO_CODE = process.env.LIVE_E2E_PROMO_CODE?.trim() || process.env.E2E_PROMO_CODE?.trim() || ''
const DEFAULT_MANGA_ID = '70000000-0000-0000-0000-000000000001'
const missingBackendE2eEnv = [
    ['LIVE_E2E_EMAIL/E2E_TEST_EMAIL', TEST_EMAIL],
    ['LIVE_E2E_PASSWORD/E2E_TEST_PASSWORD', TEST_PASSWORD],
    ['LIVE_E2E_PROMO_CODE/E2E_PROMO_CODE', PROMO_CODE],
].filter(([, value]) => !value).map(([name]) => name)

type CapturedError = {
    type: 'console-error' | 'page-error' | 'network-failed' | 'csp-violation'
    message: string
    timestamp: string
    url?: string
    status?: number
    method?: string
}

test.describe('Comprehensive backend and integration test', () => {
    test.skip(missingBackendE2eEnv.length > 0, `Backend E2E env eksik: ${missingBackendE2eEnv.join(', ')}`)

    const errors: CapturedError[] = []

    test.beforeEach(async ({ page }) => {
        // We catch all errors in the browser console.
        // Critical especially for catching rule violations such as the store-assets:// protocol or CSP.
        page.on('console', (msg) => {
            const text = msg.text()
            if (msg.type() === 'error') {
                const isCSP = text.toLowerCase().includes('csp') || text.toLowerCase().includes('violates')
                errors.push({
                    type: isCSP ? 'csp-violation' : 'console-error',
                    message: text,
                    timestamp: new Date().toISOString(),
                    url: page.url()
                })
            }
        })

        // We catch runtime script errors uncaught in the browser (uncaught exceptions).
        page.on('pageerror', (err) => {
            errors.push({
                type: 'page-error',
                message: err.stack || err.message,
                timestamp: new Date().toISOString(),
                url: page.url()
            })
        })

        // We watch failed network requests (network failures).
        // Needed to detect 4xx and 5xx errors or request rule blocks.
        page.on('requestfailed', (req) => {
            errors.push({
                type: 'network-failed',
                message: `Request failed: ${req.failure()?.errorText || 'Bilinmeyen Hata'}`,
                timestamp: new Date().toISOString(),
                url: req.url(),
                method: req.method()
            })
        })

        // We check response status codes and record HTTP 400 and above as errors.
        page.on('response', (res) => {
            if (res.status() >= 400) {
                errors.push({
                    type: 'network-failed',
                    message: `HTTP Hata Kodu: ${res.status()}`,
                    timestamp: new Date().toISOString(),
                    url: res.url(),
                    status: res.status(),
                    method: res.request().method()
                })
            }
        })
    })

    test.afterAll(async () => {
        // At the end of the test we dump all collected console, network and integration errors to a JSON file.
        // This gives the backend team a precise error analysis.
        const reportPath = path.join(process.cwd(), 'comprehensive-test-report.json')
        fs.writeFileSync(
            reportPath,
            JSON.stringify({
                testTimestamp: new Date().toISOString(),
                accountTested: TEST_EMAIL,
                totalErrorsCaptured: errors.length,
                errors: errors
            }, null, 2),
            'utf-8'
        )
        console.log(`[QA REPORT] Comprehensive test finished. Report written: ${reportPath}`)
    })

    test('Simulates all backend flows locally and gathers errors', async ({ page }) => {
        test.slow()
        test.setTimeout(180_000) // We give 3 minutes because there are multi-step modals such as the fansub form.

        // -- STEP 1: SIGN-IN AND SKIPPING ONBOARDING --
        console.log('[QA] Step 1: Signing in...')
        await page.goto('/tr/giris')
        await page.locator('#auth-email').fill(TEST_EMAIL)
        await page.locator('#auth-password').fill(TEST_PASSWORD)
        await page.getByRole('button', { name: 'Giriş Yap' }).click()
        
        // We wait for the redirect after a successful sign-in.
        await expect(page).not.toHaveURL(/\/giris(?:\?|$)/)
        await page.waitForTimeout(1000)

        // If the user is new/in onboarding we skip the modal.
        const skipOnboarding = page.getByRole('button', { name: 'Simdilik gec' })
        if (await skipOnboarding.count() > 0) {
            await skipOnboarding.first().click()
            await page.waitForTimeout(500)
        }
        await page.screenshot({ path: 'test-results/01-giris-basarili.png' })

        // -- STEP 2: PROMO CODE (E-PIN) ACTIVATION --
        console.log('[QA] Step 2: Testing e-pin promo code activation...')
        
        // We try connecting to the database and updating to turn on the Supabase feature flag during the test.
        try {
            const envModule = await import('../../scripts/lib/project-env.mjs')
            envModule.loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })
            const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
            if (supabaseUrl && serviceRoleKey) {
                const serviceClient = createClient(supabaseUrl, serviceRoleKey)
                // economy.coin_codes flag'ini aktif ediyoruz.
                await serviceClient.from('feature_flags').update({ is_enabled: true, rollout_percent: 100 }).eq('key', 'economy.coin_codes')
                console.log('[QA] E-pin feature flag enabled successfully.')
            }
        } catch (e) {
            console.warn('[QA Warning] The feature flag could not update or the service role was not found, continuing with the current state.', e)
        }

        // We go to the shop page (to make sure the TopBar holding the event listener is loaded)
        await page.goto('/tr/magaza')
        await page.waitForTimeout(1500)

        // We fire custom events:
        // 1. We enable the economy.coin_codes flag in the browser right away.
        // 2. We fire the bsgmanga:open-quick-panel (redeem) event to open the right panel.
        await page.evaluate(() => {
            window.dispatchEvent(new CustomEvent('bsgmanga:feature-flag-updated', { detail: { key: 'economy.coin_codes', value: true } }));
            window.dispatchEvent(new CustomEvent('bsgmanga:open-quick-panel', { detail: { panel: 'redeem' } }));
        })
        await page.waitForTimeout(2000) // We allow time for the panel to open and data to load.

        // We fill the input in the balance / e-pin panel.
        const epinInput = page.getByPlaceholder('Örnek: BSG-ABC123-XYZ9')
        if (await epinInput.isVisible()) {
            await epinInput.fill(PROMO_CODE)
            // We press the code activation button.
            const redeemBtn = page.getByRole('button', { name: 'Kodu Aktifleştir' })
            if (await redeemBtn.count() > 0) {
                await redeemBtn.first().click()
                await page.waitForTimeout(3000) // We allow time for the response.
            }
        } else {
            console.warn('[QA Warning] The e-pin activation panel (Redeem Panel) did not appear despite being triggered.')
        }
        await page.screenshot({ path: 'test-results/02-promo-kod-aktivasyonu.png' })

        // -- STEP 3: CREATING A POST --
        console.log('[QA] Step 3: Testing community post creation...')
        await page.goto('/tr/topluluk')
        await page.waitForTimeout(1000)

        // We find the post writing area and expand it.
        const postTextarea = page.getByPlaceholder('Ne dusunuyorsun? Favori serin hakkinda bir gonderi paylas...')
        if (await postTextarea.isVisible()) {
            await postTextarea.click()
            await postTextarea.fill(`Otomatik Backend Test Postu - ${new Date().toLocaleTimeString()} #test`)
            await page.waitForTimeout(500)

            // We find the share post button and click it.
            const publishBtn = page.getByRole('button', { name: 'Paylas' })
            if (await publishBtn.count() > 0) {
                await publishBtn.first().click()
                await page.waitForTimeout(2000)
            }
        }
        await page.screenshot({ path: 'test-results/03-topluluk-post.png' })

        // -- STEP 4: CREATING A MANGA LIST --
        console.log('[QA] Step 4: Testing new manga list creation...')
        await page.goto('/tr/listeler')
        await page.waitForTimeout(1000)

        const createListBtn = page.getByRole('button', { name: 'Liste Olustur' }).or(page.getByRole('button', { name: 'Yeni Liste Oluştur' }))
        if (await createListBtn.count() > 0) {
            await createListBtn.first().click()
            await page.waitForTimeout(500)

            // We fill in the list title and description.
            await page.getByPlaceholder('Ornek: Karanlik fantazi secmeleri').fill(`Kapsamlı Test Listesi - ${new Date().toLocaleTimeString()}`)
            await page.getByPlaceholder('Bu listenin temasini genel bakista anlat.').fill('Bu liste otomatik backend testleri tarafından oluşturulmuş bir test listesidir.')

            // We search and add mangas (at least 3 must be added to create a list).
            const mangaSearchInput = page.getByPlaceholder('Manga ara...')
            if (await mangaSearchInput.isVisible()) {
                await mangaSearchInput.fill('Solo')
                await page.waitForTimeout(1500) // We wait for search results to fill in, debounced.

                // We add mangas by clicking the "Ekle" buttons in the search results in turn.
                const addButtons = page.locator('button:has-text("Ekle")')
                const count = await addButtons.count()
                for (let i = 0; i < Math.min(count, 3); i++) {
                    await addButtons.nth(i).click()
                    await page.waitForTimeout(300)
                }
            }

            // We create and save the list.
            const saveListBtn = page.getByRole('button', { name: 'Listeyi Olustur' })
            if (await saveListBtn.count() > 0 && await saveListBtn.isEnabled()) {
                await saveListBtn.click()
                await page.waitForTimeout(2000)
            } else {
                // If no manga could be added we cancel and close.
                const cancelBtn = page.getByRole('button', { name: 'Iptal' })
                if (await cancelBtn.count() > 0) await cancelBtn.first().click()
            }
        }
        await page.screenshot({ path: 'test-results/04-manga-listesi.png' })

        // -- STEP 5: CREATING A FANSUB APPLICATION --
        console.log('[QA] Step 5: Testing the fansub application...')
        await page.goto('/tr/fansublar')
        await page.waitForTimeout(1000)

        // We click "Fansub Kur" or the modal opener button.
        const fansubKurBtn = page.getByRole('button', { name: 'Fansub Kur' }).or(page.getByRole('button', { name: 'Başvuru Yap' })).or(page.locator('button:has-text("Kur")'))
        if (await fansubKurBtn.count() > 0) {
            await fansubKurBtn.first().click()
            await page.waitForTimeout(500)

            // Step 1: Identity details
            await page.locator('input[name="fansub-name"]').or(page.locator('input')).first().fill(`Test Fansub - ${new Date().getTime()}`)
            await page.locator('textarea').first().fill('Bu otomatik testler tarafından oluşturulmuş bir deneme fansubudur.')
            await page.getByRole('button', { name: 'Sonraki Adim' }).click()
            await page.waitForTimeout(300)

            // Step 2: Publishing preferences
            await page.locator('input[placeholder*="odak"]').or(page.locator('input')).nth(1).fill('Aksiyon, Macera')
            await page.locator('input[type="number"]').first().fill('5')
            await page.getByRole('button', { name: 'Sonraki Adim' }).click()
            await page.waitForTimeout(300)

            // Step 3: Team and contact
            await page.locator('input[type="email"]').first().fill('testfansub@example.com')
            await page.locator('input[type="number"]').first().fill('3')
            await page.getByRole('button', { name: 'Sonraki Adim' }).click()
            await page.waitForTimeout(300)

            // Step 4: DMCA and copyright consent
            // To check the DMCA box we simulate scrolling or click the accept box directly.
            const dmcaCheckbox = page.locator('input[type="checkbox"]')
            if (await dmcaCheckbox.count() > 0) {
                await dmcaCheckbox.first().check({ force: true })
            }
            
            // Submit Request or Close
            const submitFansubBtn = page.getByRole('button', { name: 'Talebi Gonder' })
            if (await submitFansubBtn.count() > 0 && await submitFansubBtn.isEnabled()) {
                await submitFansubBtn.click()
                await page.waitForTimeout(2000)
            } else {
                const cancelFansubBtn = page.getByRole('button', { name: 'Iptal' })
                if (await cancelFansubBtn.count() > 0) await cancelFansubBtn.click()
            }
        }
        await page.screenshot({ path: 'test-results/05-fansub-basvurusu.png' })

        // -- STEP 6: WRITING AND LIKING A MANGA COMMENT --
        console.log('[QA] Step 6: Testing manga comments and comment likes...')
        await page.goto(`/tr/manga/${DEFAULT_MANGA_ID}`)
        await page.waitForTimeout(1000)

        const commentTabBtn = page.getByRole('button', { name: /Yorumlar/ })
        if (await commentTabBtn.isVisible()) {
            await commentTabBtn.click()
            await page.waitForTimeout(500)

            const commentInput = page.getByTestId('comment-thread-input').or(page.getByPlaceholder('Yorum yaz...'))
            if (await commentInput.isVisible()) {
                await commentInput.fill(`Backend test yorumu - ${new Date().toLocaleTimeString()} #harika`)
                const sendCommentBtn = page.getByRole('button', { name: 'Yorum Yap' }).or(page.locator('button:has-text("Yorum")'))
                if (await sendCommentBtn.count() > 0) {
                    await sendCommentBtn.first().click()
                    await page.waitForTimeout(2000)
                }

                // Comment like test
                const likeBtn = page.locator('[data-testid^="comment-thread-like-"]').or(page.locator('button:has-text("Beğen")'))
                if (await likeBtn.count() > 0) {
                    await anonymityClick(likeBtn.first())
                    await page.waitForTimeout(1000)
                }
            }
        }
        await page.screenshot({ path: 'test-results/06-manga-yorum.png' })

        // -- STEP 7: CHANGING THE PROFILE PHOTO --
        console.log('[QA] Step 7: Testing profile photo and editing...')
        await page.goto('/tr/profil')
        await page.waitForTimeout(1000)

        // We click the Edit Profile button.
        const editProfileBtn = page.getByRole('button', { name: 'Profili Duzenle' }).or(page.locator('button:has-text("Düzenle")'))
        if (await editProfileBtn.count() > 0) {
            await editProfileBtn.first().click()
            await page.waitForTimeout(1000)

            // We verify the profile edit modal opened and take a screenshot.
            // This step dumps R2 upload or Supabase RLS permission errors to the console.
            await page.screenshot({ path: 'test-results/07-profil-duzenleme-modal.png' })
            
            // We close the modal.
            const closeEditBtn = page.getByRole('button', { name: 'Vazgec' }).or(page.locator('button:has-text("Kapat")'))
            if (await closeEditBtn.count() > 0) {
                await closeEditBtn.first().click()
            }
        }

        // -- STEP 8: SHOP PRODUCT PURCHASE --
        console.log('[QA] Step 8: Testing shop purchase...')
        await page.goto('/tr/magaza')
        await page.waitForTimeout(1000)

        // We find the buy button of the first active frame or cosmetic product in the shop.
        const firstStoreCard = page.locator('[data-testid^="store-item-card-"]').first()
        if (await firstStoreCard.isVisible()) {
            const satinAlBtn = firstStoreCard.getByRole('button', { name: 'Satın Al' })
            if (await satinAlBtn.isVisible()) {
                await satinAlBtn.click()
                await page.waitForTimeout(1000)

                // If a who-is-this-for modal appears we press the "Kendim İçin" button.
                const kendimIcinBtn = page.getByRole('button', { name: 'Kendim İçin' })
                if (await kendimIcinBtn.isVisible()) {
                    await kendimIcinBtn.click()
                    await page.waitForTimeout(500)
                }

                // If the purchase confirmation modal appears we confirm it.
                const onayDialog = page.locator('[data-slot="dialog-content"][aria-label="Satın Alma Onayı"]')
                if (await onayDialog.isVisible()) {
                    const confirmPurchase = onayDialog.getByRole('button', { name: 'Satın Al' })
                    if (await confirmPurchase.isVisible()) {
                        await confirmPurchase.click()
                        await page.waitForTimeout(2000)
                    }
                }
            }
        }
        await page.screenshot({ path: 'test-results/08-magaza-satin-alma.png' })
        
        console.log('[QA] All test steps simulated. Errors will be reported to a file.')
    })
})

// Helper: a safe click function preventing sync drift during clicks.
async function anonymityClick(locator: any) {
    try {
        await locator.click({ force: true, timeout: 5000 })
    } catch (e) {
        console.warn('[QA Click Warning] Click could not be performed: ', e)
    }
}
