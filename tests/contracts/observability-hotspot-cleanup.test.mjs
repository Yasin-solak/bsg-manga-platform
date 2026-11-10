import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const files = [
  {
    path: 'src/components/admin/mangaManagement/useMangaDetailControl.ts',
    required: ['reportMangaDetailControlError'],
  },
  {
    path: 'src/components/admin/mangaManagement/mangaDetailControlErrors.ts',
    required: ['reportUserFacingError', 'createRequestContext', 'createScopedLogger'],
  },
  {
    path: 'src/components/admin/AdminRewardsSection.tsx',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/services/fansubService/management.ts',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/services/fansubService/requests.ts',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/services/mangaService/details.ts',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/services/notificationService/notifications.ts',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/pages/MangaDetailPage.tsx',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/pages/MangaListDetailPage.tsx',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/components/common/FansubModal/FansubModal.tsx',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/components/common/UserHoverCard.tsx',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/components/common/userHoverState.ts',
    required: ['createRequestContext', 'logger.warn'],
  },
  {
    path: 'src/components/common/FansubHoverCard.tsx',
    required: ['createScopedLogger', 'createRequestContext'],
  },
  {
    path: 'src/pages/fansub/useFansubDetailController.ts',
    required: ['warnFansubDetailIssue', 'reportFansubDetailError'],
  },
  {
    path: 'src/pages/fansub/fansubDetailErrors.ts',
    required: ['createScopedLogger', 'createRequestContext', 'reportUserFacingError'],
  },
  {
    path: 'src/pages/profile/useProfilePageController.ts',
    required: ['useProfileFollowState', 'reportProfilePageError'],
  },
  {
    path: 'src/pages/profile/profilePageErrors.ts',
    required: ['createScopedLogger', 'createRequestContext', 'reportUserFacingError'],
  },
  {
    path: 'src/pages/profile/useProfileFollowState.ts',
    required: ['warnProfilePageIssue', 'reportProfilePageError'],
  },
  {
    path: 'src/pages/fansub/useFansubInteractionState.ts',
    required: ['warnFansubDetailIssue', 'reportFansubDetailError'],
  },
]

for (const entry of files) {
  const source = readFileSync(path.join(rootDir, entry.path), 'utf8')
  assert.doesNotMatch(source, /console\.(log|warn|error|info|debug)/, `${entry.path} ham console kullanmamalidir`)
  for (const token of entry.required) {
    assert.match(source, new RegExp(token), `${entry.path} ${token} standardini korumali`)
  }
}

console.log('PASS observability hotspot cleanup contract kept')


