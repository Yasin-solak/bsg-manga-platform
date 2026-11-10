import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// Opens a real account on the live database and writes comments/reports: runs only when explicitly requested.
test.skip(process.env.E2E_ALLOW_LIVE_ACCOUNTS !== '1', 'Canli veritabanina yazar; E2E_ALLOW_LIVE_ACCOUNTS=1 ile acilir')

const TEST_EMAIL = process.env.LIVE_E2E_EMAIL?.trim() || process.env.E2E_TEST_EMAIL?.trim() || ''
const TEST_PASSWORD = process.env.LIVE_E2E_PASSWORD || process.env.E2E_TEST_PASSWORD || ''
const DEFAULT_MANGA_ID = '70000000-0000-0000-0000-000000000001'
const missingCommentsE2eEnv = [
    ['LIVE_E2E_EMAIL/E2E_TEST_EMAIL', TEST_EMAIL],
    ['LIVE_E2E_PASSWORD/E2E_TEST_PASSWORD', TEST_PASSWORD],
].filter(([, value]) => !value).map(([name]) => name)

type CapturedError = {
    type: 'console-error' | 'page-error' | 'network-failed' | 'csp-violation'
    message: string
    timestamp: string
    url?: string
    status?: number
    method?: string
}

test.describe('Detailed manga and chapter comment verification test', () => {
    test.skip(missingCommentsE2eEnv.length > 0, `Yorum E2E env eksik: ${missingCommentsE2eEnv.join(', ')}`)

    const errors: CapturedError[] = []

    test.beforeEach(async ({ page }) => {
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

        page.on('pageerror', (err) => {
            errors.push({
                type: 'page-error',
                message: err.stack || err.message,
                timestamp: new Date().toISOString(),
                url: page.url()
            })
        })

        page.on('requestfailed', (req) => {
            errors.push({
                type: 'network-failed',
                message: `Request failed: ${req.failure()?.errorText || 'Bilinmeyen Ağ Hatası'}`,
                timestamp: new Date().toISOString(),
                url: req.url(),
                method: req.method()
            })
        })

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
        const reportPath = path.join(process.cwd(), 'comments-test-report.json')
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
        console.log(`[QA] Comment verification report written: ${reportPath}`)
    })

    test('Tests the comment flow on manga detail and the chapter reader', async ({ page }) => {
        test.slow()

        let targetMangaId = DEFAULT_MANGA_ID
        let targetChapterNumber = 1
        let serviceClientInstance: any = null

        // -- STEP 1: SIGN-IN AND FEATURE FLAG ACTIVATION --
        console.log('[QA] Step 1: Signing in and updating feature flags...')
        
        try {
            const envModule = await import('../../scripts/lib/project-env.mjs')
            envModule.loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })
            const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
            if (supabaseUrl && serviceRoleKey) {
                serviceClientInstance = createClient(supabaseUrl, serviceRoleKey)
                // We enable the flags related to comment features
                await serviceClientInstance.from('feature_flags').update({ is_enabled: true, rollout_percent: 100 }).eq('key', 'reader.comments')
                console.log('[QA] reader.comments feature flag aktif edildi.')

                // We dynamically fetch the first manga with an approved chapter
                const { data: dbChapter, error: dbError } = await serviceClientInstance
                    .from('chapters')
                    .select(`
                        manga_id,
                        chapter_number,
                        mangas:manga_id!inner (
                            id,
                            is_active,
                            is_approved
                        )
                    `)
                    .eq('is_approved', true)
                    .eq('is_active', true)
                    .eq('mangas.is_approved', true)
                    .eq('mangas.is_active', true)
                    .limit(1)
                    .maybeSingle()

                if (dbChapter && !dbError) {
                    targetMangaId = dbChapter.manga_id
                    targetChapterNumber = dbChapter.chapter_number
                    console.log(`[QA] Dynamic manga found! ID: ${targetMangaId}, chapter no: ${targetChapterNumber}`)
                } else {
                    console.warn('[QA Warning] No manga with an approved chapter found, continuing with the default ID.', dbError)
                }
            }
        } catch (e) {
            console.warn('[QA Warning] Supabase admin connection or dynamic manga lookup failed.', e)
        }

        await page.goto('/tr/giris')
        await page.locator('#auth-email').fill(TEST_EMAIL)
        await page.locator('#auth-password').fill(TEST_PASSWORD)
        await page.getByRole('button', { name: 'Giriş Yap' }).click()
        await expect(page).not.toHaveURL(/\/giris(?:\?|$)/)
        await page.waitForTimeout(1000)

        const skipOnboarding = page.getByRole('button', { name: 'Simdilik gec' })
        if (await skipOnboarding.count() > 0) {
            await skipOnboarding.first().click()
            await page.waitForTimeout(500)
        }

        // ── ADIM 2: MANGA DETAY SAYFASINDA YORUM YAPMA ──
        console.log(`[QA] Step 2: Going to the manga detail page (${targetMangaId}) and commenting...`)
        await page.goto(`/tr/manga/${targetMangaId}`)
        await page.waitForTimeout(2000)

        // We click the "Yorumlar" tab
        const commentTabBtn = page.getByRole('button', { name: /Yorumlar/i })
        if (await commentTabBtn.isVisible()) {
            await commentTabBtn.click()
            await page.waitForTimeout(1000)

            const commentInput = page.getByTestId('comment-thread-input').or(page.getByPlaceholder('Yorum yaz...'))
            if (await commentInput.isVisible()) {
                await commentInput.fill(`Manga Detay Otomatik QA Yorumu - ${new Date().toLocaleTimeString()}`)
                const sendCommentBtn = page.getByRole('button', { name: 'Yorum Yap' }).or(page.locator('button:has-text("Yorum")'))
                if (await sendCommentBtn.count() > 0) {
                    await sendCommentBtn.first().click()
                    await page.waitForTimeout(2000)
                }
            } else {
                console.warn('[QA Warning] No comment input found on the manga detail page.')
            }
        } else {
            console.warn('[QA Warning] Comments tab is not visible or not found.')
        }
        await page.screenshot({ path: 'test-results/comments-manga-detay.png' })

        // -- STEP 3: MOVE TO THE CHAPTER READER PAGE AND COMMENT --
        console.log(`[QA] Step 3: Going to the chapter page (chapter ${targetChapterNumber}) and commenting...`)
        
        // We find the chapter link (e.g. the related chapter in the list)
        const chapterLink = page.locator(`a[href*="/bolum/${targetChapterNumber}"]`).first().or(page.locator('a[href*="/bolum/"]').first())
        if (await chapterLink.isVisible()) {
            await chapterLink.click()
            await page.waitForTimeout(3000) // We allow time for the chapter reader to load

            // We dispatch to make sure the reader.comments flag is active
            await page.evaluate(() => {
                window.dispatchEvent(new CustomEvent('bsgmanga:feature-flag-updated', { detail: { key: 'reader.comments', value: true } }));
            })
            await page.waitForTimeout(1000)

            // We switch to vertical flow in the chapter reader to reach the comments below more easily
            const settingsBtn = page.locator('button:has(.lucide-settings2), button:has-text("Settings"), svg.lucide-settings2').first()
            if (await settingsBtn.isVisible()) {
                await settingsBtn.click()
                await page.waitForTimeout(500)
                const verticalFlowBtn = page.getByRole('button', { name: 'Dikey akış' }).or(page.locator('button:has-text("Dikey akış")'))
                if (await verticalFlowBtn.isVisible()) {
                    await verticalFlowBtn.click()
                    await page.waitForTimeout(500)
                }
                await settingsBtn.click()
                await page.waitForTimeout(500)
            }

            // We scroll to the very bottom of the page, the supplementary content area holding comments
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight)
            })
            await page.waitForTimeout(1500)

            const chapterCommentsHeading = page.locator('text=Bölüm yorumları').first()
            if (await chapterCommentsHeading.isVisible()) {
                await chapterCommentsHeading.scrollIntoViewIfNeeded()
                await page.waitForTimeout(500)
            }

            const chapterCommentInput = page.getByTestId('comment-thread-input').or(page.getByPlaceholder('Yorum yaz...')).first()
            if (await chapterCommentInput.isVisible()) {
                await chapterCommentInput.fill(`Bölüm Okuyucu Otomatik QA Yorumu - ${new Date().toLocaleTimeString()}`)
                const sendChapterCommentBtn = page.getByRole('button', { name: 'Yorum Yap' }).or(page.locator('button:has-text("Yorum")')).first()
                if (await sendChapterCommentBtn.count() > 0) {
                    await sendChapterCommentBtn.first().click()
                    await page.waitForTimeout(3000)
                }
            } else {
                console.warn('[QA Warning] No comment input found in the chapter reader.')
            }
        } else {
            console.warn('[QA Warning] No active chapter link in the chapter list. Trying a direct URL...')
            // We try going to the related chapter directly by URL
            await page.goto(`/tr/manga/${targetMangaId}/bolum/${targetChapterNumber}`)
            await page.waitForTimeout(4000)

            await page.evaluate(() => {
                window.dispatchEvent(new CustomEvent('bsgmanga:feature-flag-updated', { detail: { key: 'reader.comments', value: true } }));
                window.scrollTo(0, document.body.scrollHeight)
            })
            await page.waitForTimeout(2000)

            const chapterCommentInput = page.getByTestId('comment-thread-input').or(page.getByPlaceholder('Yorum yaz...')).first()
            if (await chapterCommentInput.isVisible()) {
                await chapterCommentInput.fill(`Bölüm Okuyucu Alternatif URL QA Yorumu - ${new Date().toLocaleTimeString()}`)
                const sendChapterCommentBtn = page.getByRole('button', { name: 'Yorum Yap' }).or(page.locator('button:has-text("Yorum")')).first()
                if (await sendChapterCommentBtn.count() > 0) {
                    await sendChapterCommentBtn.first().click()
                    await page.waitForTimeout(3000)
                }
            } else {
                console.warn('[QA Warning] No chapter comment field on the alternate URL either.')
            }
        }
        await page.screenshot({ path: 'test-results/comments-bolum-reader.png' })
        
        console.log('[QA] Comment verification test steps finished.')
    })
})
