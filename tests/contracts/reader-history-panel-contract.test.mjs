import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const readerPageSource = fs.readFileSync(path.join(root, 'src/pages/MangaReaderPage.tsx'), 'utf8')
const readerDataSource = fs.readFileSync(path.join(root, 'src/pages/mangaReader/useMangaReaderData.ts'), 'utf8')
const userActivitySource = fs.readFileSync(path.join(root, 'src/services/userService/activity.ts'), 'utf8')
const mangaDetailsSource = fs.readFileSync(path.join(root, 'src/services/mangaService/details.ts'), 'utf8')

assert.match(
  readerPageSource,
  /currentUserId:\s*currentUser\?\.id\s*\?\?\s*null/,
  'reader should pass the authenticated app user id into read tracking',
)

assert.match(
  readerDataSource,
  /import \{ addReadingHistory \} from '@\/services\/userService'/,
  'reader data hook should be able to write the account history fallback',
)

assert.match(
  readerDataSource,
  /trackMangaRead\(mangaData\.id, chapterData\.id, parsedChapterNumber, clientKey\)[\s\S]+addReadingHistory\(currentUserId, mangaData\.id, chapterData\.id, parsedChapterNumber\)/,
  'authenticated reader visits should update the account history panel after the view RPC runs',
)

assert.match(
  userActivitySource,
  /from\('reading_history'\)\.upsert\([\s\S]+onConflict:\s*'user_id,manga_id'/,
  'reader history fallback should upsert to avoid races with the view-tracking RPC',
)

assert.doesNotMatch(
  `${mangaDetailsSource}\n${userActivitySource}`,
  /claimCurrentReadingStreakRewards|claim_current_user_reading_streak_rewards/,
  'reader hot path should not fire reward claim RPCs while writing read history',
)

console.log('reader-history-panel-contract: ok')
