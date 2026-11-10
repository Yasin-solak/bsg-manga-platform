import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { untranslate } from './i18n-source.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return untranslate(readFileSync(path.join(rootDir, relativePath), 'utf8'))
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

run('the dmca and copyright center is built with a separate legal queue', () => {
  const formSource = readSource('src/components/policies/LegalRequestForm.tsx')
  const centerSource = readSource('src/pages/LegalRequestCenterPage.tsx')
  const typesSource = readSource('src/services/legalRequestService/types.ts')
  const adminStateSource = readSource('src/pages/admin/useAdminPageState.ts')
  const adminPageSource = readSource('src/pages/AdminPage.tsx')
  const adminNavSource = readSource('src/pages/admin/adminNavigation.ts')
  const adminSectionSource = readSource('src/components/admin/sections/AdminLegalRequestsSection.tsx')
  const migrationSource = readSource('supabase/migrations/20260317235904_legal_requests_dmca_queue.sql')

  assert.match(formSource, /submitLegalRequest/)
  assert.match(formSource, /isLegalRequestValidationError/)
  assert.match(formSource, /mapValidationErrorsToFormErrors/)
  assert.match(formSource, /DMCA bildirimi iyi niyet, yetki ve doğruluk beyanları olmadan işleme alınmaz/)
  assert.match(formSource, /Yasal talebiniz alındı\. İnceleme kuyruğuna düşürüldü\./)
  assert.match(formSource, /ENFORCEMENT_POLICY_PATH/)
  assert.match(typesSource, /Formu gondermeden once isaretli alanlari duzeltin\./)
  assert.match(typesSource, /class LegalRequestValidationError extends Error/)

  assert.match(centerSource, /LegalRequestForm initialType=\{defaultType\}/)
  assert.match(centerSource, /Ayrık hukuk kuyruğu/)
  assert.match(centerSource, /Admin > Yasal Talepler/)

  assert.match(adminStateSource, /listLegalRequests/)
  assert.match(adminStateSource, /const \[legalRequests, setLegalRequests\] = useState<LegalRequest\[]>\(\[\]\)/)
  assert.match(adminStateSource, /refreshLegalRequests/)

  assert.match(adminPageSource, /AdminLegalRequestsSection/)
  assert.match(adminPageSource, /activeSection === 'legal_requests'/)

  assert.match(adminNavSource, /id: 'legal_requests'/)
  assert.match(adminNavSource, /label: 'Yasal [Tt]alepler'/)

  assert.match(adminSectionSource, /Ayr[i\u0131]k hukuk kuyru[g\u011f]u/)
  assert.match(adminSectionSource, /[I\u0130]ncelemek i[c\u00e7]in sol listeden bir yasal talep se[c\u00e7]in\./)
  assert.match(adminSectionSource, /[I\u0130][s\u015f]lem uyguland[i\u0131]/)

  assert.match(migrationSource, /create table if not exists public\.legal_requests/)
  assert.match(migrationSource, /legal_requests_insert_public/)
  assert.match(migrationSource, /legal_requests_update_admin/)
  assert.match(migrationSource, /attestation_good_faith = true/)
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
