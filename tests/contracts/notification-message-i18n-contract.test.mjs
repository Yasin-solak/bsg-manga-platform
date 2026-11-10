import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Notification text from the DB with names: in English the pattern is translated and names kept;
// in Turkish the text and unrecognized (admin written) text stay as is.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function load(locale, dictionary = {}) {
  const out = {}
  const code = ts.transpileModule(read('src/components/notifications/notificationMessageText.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', code)((name) => {
    assert.equal(name, '@/i18n/activeLocale')
    return { getActiveLocale: () => locale, txa: (text) => dictionary[text] ?? text }
  }, out)
  return out.translateNotificationMessage
}

const en = load('en', { 'Spam / Reklam': 'Spam / Ads', 'Topluluk gonderisi': 'Community post', 'Bir fansub ekibinden davet aldiniz.': 'You got a fansub invitation.' })
assert.equal(en('Kara Kule, "Kırık Taç" mangasinda 12.5. Bolumu yayinladi.'), 'Kara Kule published chapter 12.5 of "Kırık Taç".')
assert.equal(en('aylin, "Son Büyücü" mangasinda yorumuna yanit verdi.'), 'aylin replied to your comment on "Son Büyücü".')
assert.equal(en('Topluluk gonderisi rapor incelemesi sonucunda gorunurlukten kaldirildi. Gerekce: Spam / Reklam'), 'Community post was removed after a report review. Reason: Spam / Ads')
assert.equal(en('Bir fansub ekibinden davet aldiniz.'), 'You got a fansub invitation.')
assert.equal(en('naber müdürler'), 'naber müdürler', 'unrecognized text stays as is')

const tr = load('tr')
const dbMessage = 'Kara Kule, "Kırık Taç" mangasini ekledi.'
assert.equal(tr(dbMessage), dbMessage, 'Turkcede DB metni degismez')

const presentation = read('src/components/notifications/notificationPresentation.ts')
assert.match(presentation, /translateNotificationMessage\(n\.message\)/, 'the notification row uses templates')
