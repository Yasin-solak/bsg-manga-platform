import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const authContextSource = read('src/contexts/AuthContext.tsx')
const userHoverResolveSource = read('src/services/hoverCardService/userHover.resolve.ts')
const fansubHoverResolveSource = read('src/services/hoverCardService/fansubHover.resolve.ts')
const fansubHoverDataSource = read('src/services/hoverCardService/fansubHover.resolve.data.ts')
const fansubHoverRowSource = read('src/services/hoverCardService/fansubHover.resolve.row.ts')
const mangaHoverSource = read('src/services/hoverCardService/mangaHover.ts')
const profilePageControllerSource = read('src/pages/profile/useProfilePageController.ts')
const profilePageErrorsSource = read('src/pages/profile/profilePageErrors.ts')
const profileEditActionsSource = read('src/pages/profile/useProfileEditActions.ts')
const profileEditMutationsSource = read('src/pages/profile/useProfileEditMutations.ts')
const fansubDetailControllerSource = read('src/pages/fansub/useFansubDetailController.ts')
const fansubDetailErrorsSource = read('src/pages/fansub/fansubDetailErrors.ts')

for (const source of [
  authContextSource,
  userHoverResolveSource,
  fansubHoverResolveSource,
  fansubHoverDataSource,
  fansubHoverRowSource,
  mangaHoverSource,
]) {
  assert.doesNotMatch(source, /console\.(log|warn|error|info|debug)/)
}

assert.match(authContextSource, /createRequestContext/)
assert.match(userHoverResolveSource, /createRequestContext/)
assert.match(fansubHoverResolveSource, /createRequestContext/)
assert.match(fansubHoverDataSource, /createRequestContext/)
assert.match(fansubHoverRowSource, /createRequestContext/)
assert.match(mangaHoverSource, /createRequestContext/)
assert.match(profilePageControllerSource, /reportProfilePageError/)
assert.match(profilePageErrorsSource, /reportUserFacingError/)
assert.match(profileEditActionsSource, /useProfileEditMutations/)
assert.match(profileEditMutationsSource, /reportUserFacingError/)
assert.match(profileEditMutationsSource, /createRequestContext/)
assert.match(fansubDetailControllerSource, /reportFansubDetailError/)
assert.match(fansubDetailErrorsSource, /reportUserFacingError/)

console.log('PASS risky surfaces moved to the observability and user-facing error standard')
