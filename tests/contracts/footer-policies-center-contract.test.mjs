import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function run(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

run('footer and policy center are wired to real routes', () => {
  const appSource = readSource('src/App.tsx')
  const footerSource = readSource('src/components/layout/Footer.tsx')
  const authSource = readSource('src/pages/AuthPage.tsx')
  const fansubRequestSource = [
    readSource('src/components/common/FansubRequestModal/FansubRequestModal.tsx'),
    readSource('src/components/common/FansubRequestModal/FansubRequestSteps.tsx'),
  ].join('\n')
  const shopPurchaseSource = readSource('src/pages/shop/ShopPurchaseDialog.tsx')
  const redeemSource = readSource('src/components/common/RedeemCodeActivationPanel.tsx')

  assert.match(appSource, /path=\{POLICY_HUB_PATH\.slice\(1\)\}/)
  assert.match(appSource, /path=\{HELP_CENTER_PATH\.slice\(1\)\}/)
  assert.match(appSource, /path=\{TERMS_PATH\.slice\(1\)\}/)
  assert.match(appSource, /path=\{STORE_RULES_PATH\.slice\(1\)\}/)
  assert.match(appSource, /path=\{COPYRIGHT_POLICY_PATH\.slice\(1\)\}/)
  assert.match(appSource, /path=\{DMCA_PATH\.slice\(1\)\}/)
  assert.match(appSource, /LegalRequestCenterPage defaultType='copyright'/)
  assert.match(appSource, /LegalRequestCenterPage defaultType='dmca'/)

  assert.doesNotMatch(footerSource, /to="#"/)
  assert.doesNotMatch(footerSource, /href="#"/)
  // Cok dilli (2026-11-03): metinler sozlukte; footer kurallarin baglantilarini anahtarla basar.
  const trMessages = readFileSync(path.join(rootDir, 'src/i18n/messages/tr.ts'), 'utf8')
  for (const [key, label] of [
    ['footer.communityRules', 'Topluluk Kuralları'],
    ['footer.fansubRules', 'Fansub Kuralları'],
    ['footer.storeRules', 'Mağaza ve Coin Kuralları'],
    ['nav.policies', 'Kurallar ve politikalar'],
    ['nav.dmca', 'DMCA Bildirimi'],
  ]) {
    assert.ok(footerSource.includes(`t('${key}')`), `footer ${key} baglantisini basar`)
    assert.ok(trMessages.includes(`'${key}': '${label}'`), `${key} Turkce metni`)
  }

  assert.match(authSource, /tx\('Kullanım Koşulları'\)/)
  assert.match(authSource, /tx\('Gizlilik Politikası'\)/)
  assert.match(authSource, /KVKK_PATH/)


  assert.match(fansubRequestSource, /FANSUB_RULES_PATH/)
  assert.match(fansubRequestSource, /COPYRIGHT_POLICY_PATH/)
  assert.match(fansubRequestSource, /Yaptirim Politikasi/)

  // Shop v3: one purchase / gift window links to store rules and the refund policy.
  assert.doesNotMatch(shopPurchaseSource, /Site Kullanici Sozlesmesi/)
  assert.match(shopPurchaseSource, /<Link to=\{STORE_RULES_PATH\}/)
  assert.match(shopPurchaseSource, /<Link to=\{REFUND_POLICY_PATH\}/)

  assert.match(redeemSource, /STORE_RULES_PATH/)
  assert.match(redeemSource, /REFUND_POLICY_PATH/)
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
