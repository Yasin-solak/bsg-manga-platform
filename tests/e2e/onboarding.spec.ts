import { expect, test, type Page } from '@playwright/test'

/**
 * Onboarding flow.
 *
 * This file was ROTTEN: it drove steps that NO LONGER EXIST such as "Gorunurlugunu belirle" and
 * "Bildirimlerini sec" and returned red when run. Since it was not tied to CI
 * nobody saw it; so it was a file that looked like coverage but
 * protected nothing. Rewritten for the real flow.
 *
 * Real flow: Welcome -> Genres -> Suggestions -> Profile -> Fansubs -> Explore.
 */

const MOBILE = { width: 360, height: 800 }

async function stub(page: Page) {
    const json = (body: unknown) => ({
        status: 200, contentType: 'application/json', body: JSON.stringify(body),
    })
    await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
    await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
}

async function asNewUser(page: Page) {
    await page.addInitScript(() => {
        window.__BSGMANGA_E2E__ = {
            mockAuthUser: {
                id: 'e2e-onboarding-user',
                authUserId: 'e2e-onboarding-auth-user',
                username: 'ilkadim',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ilkadim',
                role: 'user',
                isBanned: false,
                isActive: true,
                stones: 1200,
                ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
                frameType: 'default',
                // The age gate (Layout) sends every session with no date to /dogum-tarihi.
                birthDate: '1998-04-12',
                onboardingCompletedAt: null,
            },
        }
    })
}

test.describe('Onboarding akisi', () => {
    test.beforeEach(async ({ page }) => {
        await stub(page)
        await page.setViewportSize(MOBILE)
    })

    test('a user with unfinished setup is REDIRECTED to onboarding', async ({ page }) => {
        await asNewUser(page)
        await page.goto('/tr/kesfet?e2e=1')
        // Layout takes a user with empty onboardingCompletedAt here from every route.
        await expect(page).toHaveURL(/\/hos-geldin\?/)
    })

    test('KARSILAMA once gelir; adimlar ancak baslayinca acilir', async ({ page }) => {
        await asNewUser(page)
        await page.goto('/tr/hos-geldin?e2e=1')

        /*
         * Before welcome was added, signing in dropped the user straight onto the genre
         * grid: a choice was asked without saying what was wanted.
         */
        const karsilama = page.getByTestId('onboarding-welcome')
        await expect(karsilama).toBeVisible({ timeout: 20_000 })
        await expect(karsilama).toContainText('Hoş geldin, ilkadim')
        // Ilk adimin icerigi karsilamada GORUNMEMELI.
        await expect(page.getByRole('heading', { name: 'Ne okumayı seversin?' })).toHaveCount(0)

        await page.getByTestId('onboarding-welcome-start').click()
        await expect(page.getByRole('heading', { name: 'Ne okumayı seversin?' })).toBeVisible()
        await expect(page.getByTestId('onboarding-welcome')).toHaveCount(0)
    })

    test('welcome steps print from the same list AS THE CODE', async ({ page }) => {
        await asNewUser(page)
        await page.goto('/tr/hos-geldin?e2e=1')
        const karsilama = page.getByTestId('onboarding-welcome')
        await expect(karsilama).toBeVisible({ timeout: 20_000 })

        /*
         * Adim listesi karsilamaya elle yazilsaydi, akisa dorduncu adim
         * eklendigi gun karsilama sessizce yalan soylerdi. Uc adim da
         * ONBOARDING_STEPS'ten gelir; sayac da o listeden turer.
         */
        for (const etiket of ['Türler', 'Öneriler', 'Profil', 'Fansublar']) {
            await expect(karsilama).toContainText(etiket)
        }
        await expect(karsilama).toContainText('4 adım')
    })

    test('WELCOME DOES NOT COUNT AS A STEP: progress starts at 1/4', async ({ page }) => {
        await asNewUser(page)
        await page.goto('/tr/hos-geldin?e2e=1')
        await page.getByTestId('onboarding-welcome-start').click()

        /*
         * Counting welcome as the fourth step would show the user a job they did not do
         * as done: the first real step would say "2/4".
         */
        await expect(page.getByText('Adım 1 / 4')).toBeVisible()
    })

    test('four steps finish and exit to the HOME PAGE', async ({ page }) => {
        await asNewUser(page)
        await page.goto('/tr/hos-geldin?e2e=1')
        await page.getByTestId('onboarding-welcome-start').click()

        // 1) Genres: same as the prototype: at least 3
        await expect(page.getByRole('heading', { name: 'Ne okumayı seversin?' })).toBeVisible()
        for (const slug of ['aksiyon', 'romantizm', 'fantastik']) {
          await page.getByTestId(`onboarding-genre-${slug}`).click()
        }
        await page.getByRole('button', { name: 'Devam et' }).click()

        // 2) Oneriler
        await expect(page.getByRole('heading', { name: 'Sana göre seriler' })).toBeVisible()
        await page.getByRole('button', { name: 'Devam et' }).click()

        // 3) Profil
        await expect(page.getByRole('heading', { name: 'Profilini hazırla' })).toBeVisible()
        await page.locator('#onboarding-bio').fill('Ilk gun profil kurulumu E2E testi.')
        await page.getByRole('button', { name: 'Devam et' }).click()

        // 4) Fansublar
        await expect(page.getByRole('heading', { name: 'Takip etmeye başla' })).toBeVisible()
        await page.getByRole('button', { name: 'Kurulumu bitir' }).click()

        await expect(page).toHaveURL(/:\d+\/(\?|$)/)
    })

    test('the SKIP FOR NOW exit from welcome works', async ({ page }) => {
        await asNewUser(page)
        await page.goto('/tr/hos-geldin?e2e=1')
        /*
         * Saying up front that setup is optional beats making the user search
         * for an exit across three steps.
         */
        await page.getByTestId('onboarding-welcome-skip').click()
        await expect(page).toHaveURL(/:\d+\/(\?|$)/)
    })

  test('a user with FINISHED setup cannot return to onboarding', async ({ page }) => {
        await page.addInitScript(() => {
            window.__BSGMANGA_E2E__ = {
                mockAuthUser: {
                    id: 'e2e-done-user', authUserId: 'e2e-done-auth', username: 'bitmis',
                    avatar: '', role: 'user', isBanned: false, isActive: true, stones: 0,
                    ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
                    frameType: 'default',
                    // The age gate (Layout) sends every session with no date to /dogum-tarihi.
                    birthDate: '1998-04-12', onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
                },
            }
        })
        await page.goto('/tr/hos-geldin?e2e=1')
        /*
         * The exit path is the HOME PAGE. It was the profile first (an empty profile is a dead end),
         * then Explore; but the user just picked genres and followed series
         * and the payoff of that choice is on the home page: suggestions,
         * follow feed, "chapters waiting for you". The onboarding page's own
         * finishPath must point to the same place: two sources should not give two
         * answers.
         */
        await expect(page).toHaveURL(/:\d+\/(\?|$)/)
    })

    test('ADMIN preview can reopen the flow', async ({ page }) => {
        await page.addInitScript(() => {
            window.__BSGMANGA_E2E__ = {
                mockAuthUser: {
                    id: 'e2e-admin-user', authUserId: 'e2e-admin-auth', username: 'yonetici',
                    avatar: '', role: 'admin', isBanned: false, isActive: true, stones: 0,
                    ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
                    frameType: 'default',
                    // The age gate (Layout) sends every session with no date to /dogum-tarihi.
                    birthDate: '1998-04-12', onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
                },
            }
        })
        /*
         * Without this the only way to review the flow was resetting the database's
         * `onboarding_completed_at` field by hand.
         */
        await page.goto('/tr/hos-geldin?e2e=1&onizleme=1')
        await expect(page.getByTestId('onboarding-welcome')).toBeVisible({ timeout: 20_000 })
    })

    test('onizleme ADMIN OLMAYANA acilmaz', async ({ page }) => {
        await page.addInitScript(() => {
            window.__BSGMANGA_E2E__ = {
                mockAuthUser: {
                    id: 'e2e-user2', authUserId: 'e2e-auth2', username: 'siradan',
                    avatar: '', role: 'user', isBanned: false, isActive: true, stones: 0,
                    ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
                    frameType: 'default',
                    // The age gate (Layout) sends every session with no date to /dogum-tarihi.
                    birthDate: '1998-04-12', onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
                },
            }
        })
        // Parametreyi adres satirina yazan herkes akisi tekrar acamamali.
        await page.goto('/tr/hos-geldin?e2e=1&onizleme=1')
        await expect(page).toHaveURL(/:\d+\/(\?|$)/)
    })

  test('TUR SECIMI en az 3 ister; eksikken ilerlemez', async ({ page }) => {
        await asNewUser(page)
        await page.goto('/tr/hos-geldin?e2e=1')
        await page.getByTestId('onboarding-welcome-start').click()
        await expect(page.getByRole('heading', { name: 'Ne okumayı seversin?' })).toBeVisible()

        /*
         * Oneri adimi tamamen tur secimine dayaniyor. Sifir ya da eksik
         * secimle "sana ozel" liste uretmek, listeyi populer siralamasindan
         * ibaret birakirdi.
         */
        await page.getByTestId('onboarding-genre-aksiyon').click()
        await page.getByRole('button', { name: 'Devam et' }).click()
        // Hala tur adiminda.
        await expect(page.getByRole('heading', { name: 'Ne okumayı seversin?' })).toBeVisible()
        await expect(page.getByTestId('onboarding-genres-step')).toBeVisible()

        await page.getByTestId('onboarding-genre-romantizm').click()
        await page.getByTestId('onboarding-genre-fantastik').click()
        await page.getByRole('button', { name: 'Devam et' }).click()
        await expect(page.getByRole('heading', { name: 'Sana göre seriler' })).toBeVisible()
    })

    test('an UNDER 18 user is TOLD that 18+ content is hidden', async ({ page }) => {
        const bugun = new Date()
        const onalti = new Date(bugun.getFullYear() - 16, bugun.getMonth(), bugun.getDate())
          .toISOString().slice(0, 10)
        await page.addInitScript(({ birth }) => {
            window.__BSGMANGA_E2E__ = {
                mockAuthUser: {
                    id: 'genc', authUserId: 'genc', username: 'genc',
                    avatar: '', role: 'user', isBanned: false, isActive: true, stones: 0,
                    ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
                    frameType: 'default', birthDate: birth, onboardingCompletedAt: null,
                },
            }
        }, { birth: onalti })
        await page.goto('/tr/hos-geldin?e2e=1')
        await page.getByTestId('onboarding-welcome-start').click()

        /*
         * The prototype has an "Olgun içerik 18+" SWITCH here. Our rule is tied to
         * age and enforced in RLS; a switchable toggle would be a lying surface
         * that does not change the content state even when off.
         * In its place is a row STATING what it is.
         */
        const not = page.getByTestId('onboarding-mature-note')
        await expect(not).toBeVisible()
        await expect(not).toContainText('gizli kalır')
        await expect(page.getByRole('switch')).toHaveCount(0)
    })
})
