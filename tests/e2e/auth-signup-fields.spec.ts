import { expect, test, type Page } from '@playwright/test'

/**
 * Signup form: live feedback from prototype screen 3.
 *
 * Availability used to be known only AFTER submitting: the user filled the form,
 * got a "this handle is taken" error and started over.
 */

const MOBILE = { width: 390, height: 900 }

async function stub(page: Page, opts: { available?: boolean; fail?: boolean } = {}) {
  const json = (body: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
  await page.route('**/rest/v1/rpc/is_username_available', async (route) => {
    if (opts.fail) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' })
      return
    }
    await route.fulfill(json(opts.available ?? true))
  })
}

test.describe('Signup form live feedback', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE)
  })

  test('MUSAIT etiket olumlu isaretlenir', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=kayit')
    await page.locator('#auth-username').fill('yeni_okur')
    await expect(page.getByTestId('auth-username-state')).toContainText('kullanılabilir', { timeout: 15_000 })
  })

  test('an alternative is SUGGESTED for a TAKEN handle', async ({ page }) => {
    await stub(page, { available: false })
    await page.goto('/tr/giris?mod=kayit')
    await page.locator('#auth-username').fill('site_owner')

    const durum = page.getByTestId('auth-username-state')
    await expect(durum).toContainText('alınmış', { timeout: 15_000 })
    // Suggestion chips from the prototype: the user should not have to start over.
    const oneri = durum.getByRole('button').first()
    await expect(oneri).toBeVisible()
    await oneri.click()
    await expect(page.locator('#auth-username')).not.toHaveValue('site_owner')
  })

  test('kontrol DUSERSE musait denmez', async ({ page }) => {
    await stub(page, { fail: true })
    await page.goto('/tr/giris?mod=kayit')
    await page.locator('#auth-username').fill('belirsiz_ad')

    /*
     * The unknown state DOES NOT COUNT AS AVAILABLE: showing a green tick and getting an
     * error on submit is worse than showing nothing.
     */
    await page.waitForTimeout(1500)
    const durum = page.getByTestId('auth-username-state')
    if (await durum.count()) {
      await expect(durum).not.toContainText('kullanılabilir')
    }
  })

  test('PASSWORD STRENGTH is consistent with the policy', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=kayit')

    const gosterge = page.getByTestId('auth-password-strength')
    await page.locator('#auth-password').fill('abc')
    await expect(gosterge).toContainText('Zayıf')

    // A password passing the policy with variety should be able to reach "Strong".
    await page.locator('#auth-password').fill('Kuvvetli_Parola_2026')
    await expect(gosterge).toContainText('Güçlü')
  })

  test('a password FAILING THE POLICY does not look strong', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=kayit')

    /*
     * This password passes ALL length and variety criteria (16 characters,
     * four character classes); a separate scoring would say "Güçlü". But the policy
     * rejects it: it contains the username. Showing a password that will be rejected on submit as green
     * is worse than showing nothing.
     */
    await page.locator('#auth-username').fill('yeni_okur')
    await page.locator('#auth-password').fill('Yeni_Okur_2026!')

    const gosterge = page.getByTestId('auth-password-strength')
    await expect(gosterge).toBeVisible()
    await expect(gosterge).not.toContainText('Güçlü')

    // A password with the same length/variety but no identity should be able to be STRONG:
    // the indicator is not a rubber stamp showing everything as weak.
    await page.locator('#auth-password').fill('Kartal_Ruzgar_2026!')
    await expect(gosterge).toContainText('Güçlü')
  })

  test('SIGNUP FIELD ORDER matches the prototype: identity first', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=kayit')
    await expect(page.locator('#auth-username')).toBeVisible({ timeout: 15_000 })

    /*
     * The prototype asks for the username FIRST: it is the signup screen's main decision.
     * Email and birth date follow. Ours had email first
     * and the identity decision stayed three fields down.
     */
    const y = async (selector: string) => {
      const box = await page.locator(selector).boundingBox()
      if (!box) throw new Error(`${selector} olculemedi`)
      return box.y
    }
    const kullaniciAdi = await y('#auth-username')
    const eposta = await y('#auth-email')
    const dogum = await y('#auth-birth-date')
    const sifre = await y('#auth-password')

    expect(kullaniciAdi).toBeLessThan(eposta)
    expect(eposta).toBeLessThan(dogum)
    expect(dogum).toBeLessThan(sifre)
  })

  test('PASSWORD show/hide works', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=giris')
    const alan = page.locator('#auth-password')
    await expect(alan).toHaveAttribute('type', 'password')

    /*
     * On a phone keyboard fixing a mistyped password without seeing it is hard;
     * the prototype has this button.
     */
    await page.getByTestId('auth-password-toggle').click()
    await expect(alan).toHaveAttribute('type', 'text')
    await page.getByTestId('auth-password-toggle').click()
    await expect(alan).toHaveAttribute('type', 'password')
  })

  test('the FORGOT PASSWORD link does NOT PRINT', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=giris')
    await expect(page.locator('#auth-password')).toBeVisible({ timeout: 15_000 })

    /*
     * In the prototype but not working here: password reset is defined only for SIGNED-IN
     * users and tied to the SMTP work pending email delivery.
     * A dead link means a button that does nothing when tapped;
     * the same rule applies to the social sign-in buttons.
     */
    await expect(page.getByText('Şifremi unuttum')).toHaveCount(0)
  })

  test('a configured provider also shows on the SIGN-IN screen', async ({ page }) => {
    const json = (body: unknown) => ({
      status: 200, contentType: 'application/json', body: JSON.stringify(body),
    })
    await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
    await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
    await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
      await route.fulfill(json([{ key: 'auth.oauth_discord', is_enabled: true }]))
    })

    await page.goto('/tr/giris?mod=giris')
    /*
     * Welcome and form read from the SAME source; keeping two lists for two screens
     * meant a button showing on one and not the other.
     */
    await expect(page.getByTestId('auth-oauth-discord')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('auth-oauth-google')).toHaveCount(0)
  })

  test('the WELCOME BACK card shows the remembered account, stores no TOKEN', async ({ page }) => {
    await stub(page, { available: true })
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:last-account', JSON.stringify({
        username: 'demo', displayName: 'Demo', avatar: '', email: 'demo@example.com',
      }))
    })
    await page.goto('/tr/giris?mod=giris')

    const kart = page.getByTestId('auth-last-account')
    await expect(kart).toBeVisible({ timeout: 15_000 })
    await expect(kart).toContainText('Tekrar hoş geldin')

    /*
     * Email shows MASKED: a shoulder surfer should not learn the full address.
     * The full value is used for prefill but not written on screen.
     */
    await expect(kart).toContainText('de•••@example.com')
    await expect(kart).not.toContainText('demo@example.com')
    await expect(page.locator('#auth-email')).toHaveValue('demo@example.com')

    // Sifre yine sorulur: kart erisim vermez, yalnizca hatirlatir.
    await expect(page.locator('#auth-password')).toBeVisible()

    // The stored record must have no TOKEN.
    const kayit = await page.evaluate(() => window.localStorage.getItem('bsgmanga:last-account') || '')
    expect(kayit).not.toMatch(/token|jwt|refresh|access/i)
  })

  test('SIGN IN WITH ANOTHER ACCOUNT clears the remembered one', async ({ page }) => {
    await stub(page, { available: true })
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:last-account', JSON.stringify({
        username: 'demo', displayName: 'Demo', avatar: '', email: 'demo@example.com',
      }))
    })
    await page.goto('/tr/giris?mod=giris')
    await expect(page.getByTestId('auth-last-account')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('auth-forget-account').click()
    await expect(page.getByTestId('auth-last-account')).toHaveCount(0)
    await expect(page.locator('#auth-email')).toHaveValue('')
    const kayit = await page.evaluate(() => window.localStorage.getItem('bsgmanga:last-account'))
    expect(kayit).toBeNull()
  })

  test('signup does NOT PROCEED without the CONSENT BOX', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=kayit')
    await page.locator('#auth-username').fill('yeni_okur')
    await page.locator('#auth-email').fill('new@example.com')
    await page.locator('#auth-birth-date').fill('1998-04-12')
    await page.locator('#auth-password').fill('Kartal_Ruzgar_2026!')
    await page.locator('#auth-password-again').fill('Kartal_Ruzgar_2026!')

    await expect(page.locator('#auth-terms-consent')).not.toBeChecked()

    /*
     * The form is submitted PROGRAMMATICALLY: on a normal click the browser's own
     * `required` validation kicks in and shadows the JS check;
     * this is why the first version of the test PASSED mutation (still green with the check removed).
     * A dispatched submit skips native validation, so what is
     * measured here is the REAL guard.
     */
    await page.evaluate(() => {
      const form = document.querySelector('form')
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await expect(page.getByText('kabul etmelisin', { exact: false })).toBeVisible()

    // With the box checked the same submit does not hit the block.
    await page.locator('#auth-terms-consent').check()
    await page.evaluate(() => {
      const form = document.querySelector('form')
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await expect(page.getByText('kabul etmelisin', { exact: false })).toHaveCount(0)
  })

  test('the PASSWORD RULE LIST moves with the policy', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=kayit')
    await page.locator('#auth-username').fill('yeni_okur')
    await page.locator('#auth-password').fill('yeni_okur123')

    const kurallar = page.getByTestId('auth-password-rules')
    await expect(kurallar).toBeVisible()
    // Kullanici adini iceriyor: o kural GECMEMELI.
    await expect(kurallar).toContainText('Kullanıcı adını/e-postanı içermiyor')

    await page.locator('#auth-password').fill('Kartal_Ruzgar_2026!')
    await expect(page.getByTestId('auth-password-strength')).toContainText('Güçlü')
  })

  test('an invalid email is told AT ONCE', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=kayit')
    await page.locator('#auth-email').fill('bozuk-adres')
    await expect(page.getByTestId('auth-email-invalid')).toBeVisible()
    await page.locator('#auth-email').fill('duzgun@eposta.com')
    await expect(page.getByTestId('auth-email-invalid')).toHaveCount(0)
  })

  test('SIGNUP SAYS it has TWO STAGES', async ({ page }) => {
    await stub(page, { available: true })
    await page.goto('/tr/giris?mod=kayit')

    /*
     * In the prototype signup is "1/2": the form is not the END of signup but the first setup step.
     * A button saying "Kayıt Ol" implied it was finished.
     */
    const gosterge = page.getByTestId('auth-signup-progress')
    await expect(gosterge).toBeVisible({ timeout: 15_000 })
    await expect(gosterge).toContainText('1/2')
    await expect(page.getByRole('button', { name: 'Devam' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kayıt Ol' })).toHaveCount(0)

    // Sign-in has NO such indicator: sign-in is one step.
    await page.goto('/tr/giris?mod=giris')
    await expect(page.getByTestId('auth-signup-progress')).toHaveCount(0)
  })

  test('the USERNAME field has an @ prefix and a state ICON', async ({ page }) => {
    await stub(page, { available: false })
    await page.goto('/tr/giris?mod=kayit')

    // `@` is INSIDE the field: the user should not add @ at the start themselves.
    await expect(page.getByText('@', { exact: true })).toBeVisible({ timeout: 15_000 })

    await page.locator('#auth-username').fill('site_owner')
    const ikon = page.getByTestId('auth-username-icon')
    await expect(ikon).toHaveAttribute('data-state', 'taken', { timeout: 15_000 })
  })

  test('SIGNUP provider buttons are SIDE BY SIDE with short labels', async ({ page }) => {
    const json = (body: unknown) => ({
      status: 200, contentType: 'application/json', body: JSON.stringify(body),
    })
    await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
    await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
    await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
      await route.fulfill(json([
        { key: 'auth.oauth_google', is_enabled: true },
        { key: 'auth.oauth_discord', is_enabled: true },
      ]))
    })

    await page.goto('/tr/giris?mod=kayit')
    const google = page.getByTestId('auth-oauth-google')
    const discord = page.getByTestId('auth-oauth-discord')
    await expect(google).toBeVisible({ timeout: 15_000 })

    /*
     * The signup form is long; stacked buttons would cover half the screen.
     * In the prototype they sit side by side with short labels ("Google", "Discord").
     */
    const g = await google.boundingBox()
    const d = await discord.boundingBox()
    if (!g || !d) throw new Error('Buttons could not be measured')
    expect(Math.abs(g.y - d.y)).toBeLessThan(4)
    await expect(google).toHaveText('Google')

    // Stacked with long labels on sign-in.
    await page.goto('/tr/giris?mod=giris')
    await expect(page.getByTestId('auth-oauth-google')).toHaveText('Google ile devam et')
  })
})
