import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const showcaseSource = read('src/pages/fansub/FansubShowcaseHero.tsx')
const detailPageSource = read('src/pages/FansubDetailPage.tsx')
const showcaseDialogSource = read('src/pages/fansub/FansubShowcaseMangaDialog.tsx')
const editModalSource = read('src/components/fansub/FansubEditModal.tsx')
const editFormSource = read('src/pages/fansub/fansubEditForm.ts')
const requestModalSource = [
  read('src/components/common/FansubRequestModal/FansubRequestModal.tsx'),
  read('src/components/common/FansubRequestModal/FansubRequestSteps.tsx'),
].join('\n')
const sharedUtilsSource = read('src/services/fansubService/shared.utils.ts')
const sharedValidationSource = read('src/services/fansubService/shared.validation.ts')
const managementSource = read('src/services/fansubService/management.ts')
const migrationSource = read('supabase/migrations/20260401235901_fansub_showcase_and_boost_supporter_state_hardening.sql')

assert.match(sharedUtilsSource, /FANSUB_DESCRIPTION_MAX_LENGTH = 150/)
assert.match(sharedUtilsSource, /FANSUB_NAME_MAX_LENGTH = 32/)
assert.match(sharedUtilsSource, /FANSUB_SLUG_MAX_LENGTH = 40/)
assert.match(sharedUtilsSource, /slice\(0, FANSUB_SLUG_MAX_LENGTH\)|slugifyText\(name, \{ maxLength: FANSUB_SLUG_MAX_LENGTH \}\)/)

assert.match(sharedValidationSource, /FANSUB_NAME_MAX_LENGTH/)
assert.match(sharedValidationSource, /FANSUB_DESCRIPTION_MAX_LENGTH/)
assert.match(sharedValidationSource, /fansubNameSchema/)
assert.doesNotMatch(sharedValidationSource, /\.max\(48/)

assert.match(requestModalSource, /maxLength=\{FANSUB_NAME_MAX_LENGTH\}/)
assert.match(requestModalSource, /name\.trim\(\)\.length > FANSUB_NAME_MAX_LENGTH/)
assert.match(requestModalSource, /maxLength=\{FANSUB_DESCRIPTION_MAX_LENGTH\}/)
assert.match(editFormSource, /FANSUB_EDIT_DESCRIPTION_MAX_LENGTH = FANSUB_DESCRIPTION_MAX_LENGTH/)

assert.match(managementSource, /fansubNameSchema\.parse\(fansub\.name\)/)

assert.match(showcaseSource, /truncate whitespace-nowrap/)
assert.match(showcaseSource, /truncateFansubDescription/)
assert.match(showcaseSource, /line-clamp-4/)
assert.match(showcaseSource, /h-8 w-8 object-contain/)
assert.match(showcaseSource, /mt-auto border-t border-border\/50 pt-3/)
assert.match(showcaseSource, /mt-3 border-t border-border\/50 pt-4/)
assert.doesNotMatch(showcaseSource, /Katilim guncelleme/)
assert.doesNotMatch(showcaseSource, /Aktif/)
assert.doesNotMatch(showcaseSource, /Tarih bilgisi yok/)

assert.match(detailPageSource, /FansubShowcaseMangaDialog/)
assert.match(detailPageSource, /setIsShowcaseMangaDialogOpen\(true\)/)

assert.match(showcaseDialogSource, /SHOWCASE_MANGA_PAGE_SIZE = 6/)
assert.match(showcaseDialogSource, /sm:grid-cols-2 lg:grid-cols-3/)
assert.match(showcaseDialogSource, /min-h-\[520px\]/)
assert.doesNotMatch(showcaseDialogSource, /Vitrinde yer alan ve fansubun yayinda tuttugu seriler burada listelenir\./)
assert.match(showcaseDialogSource, /txa\('Sayfa \{v1\} \/ \{v2\}', \{ v1: page, v2: totalPages \}\)/)
assert.match(editModalSource, /FansubHoverCardSurface/)
assert.match(editModalSource, /FANSUB_SHOWCASE_HEIGHT_PX/)
assert.match(editModalSource, /PREVIEW_SCALE/)
assert.match(editModalSource, /FANSUB_EDIT_DESCRIPTION_MAX_LENGTH/)
assert.match(editModalSource, /Fansub vitrini/)

assert.match(migrationSource, /maybe_refresh_fansub_boost_supporter_state/)
assert.match(migrationSource, /create function public\.get_my_fansub_boost_supporter_state/)
assert.match(migrationSource, /volatile/)
assert.match(migrationSource, /assert_fansub_identifier_rules/)

console.log('PASS fansub showcase layout, name rules and supporter state hardening kept')
