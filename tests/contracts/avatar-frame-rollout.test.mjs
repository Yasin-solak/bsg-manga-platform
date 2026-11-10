import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const avatarFrameSource = readFileSync(path.join(rootDir, 'src', 'components', 'common', 'AvatarFrame', 'AvatarFrame.tsx'), 'utf8')
const avatarConstantsSource = readFileSync(path.join(rootDir, 'src', 'components', 'common', 'AvatarFrame', 'avatarFrameConstants.ts'), 'utf8')
const avatarAssetsSource = readFileSync(path.join(rootDir, 'src', 'components', 'common', 'AvatarFrame', 'useAvatarFrameResolvedAssets.ts'), 'utf8')
const commentThreadSource = readFileSync(path.join(rootDir, 'src', 'components', 'common', 'CommentThread', 'CommentThread.tsx'), 'utf8')
const mangaCommentSource = readFileSync(path.join(rootDir, 'src', 'components', 'manga', 'MangaCommentItem.tsx'), 'utf8')
const userHoverSource = readFileSync(path.join(rootDir, 'src', 'components', 'common', 'UserHoverCardSurface.tsx'), 'utf8')
const fansubHoverSource = readFileSync(path.join(rootDir, 'src', 'components', 'common', 'FansubHoverCard.tsx'), 'utf8')

assert.match(avatarConstantsSource, /export type LazyFrameAsset = 'christmas' \| 'halloween' \| 'avatarframe1' \| 'avatarframe2' \| 'avatarframe3' \| 'avatarframe4'/)
assert.ok(avatarConstantsSource.includes("christmas: () => import('../../../assets/frames/christmas-frame.png')"))
assert.ok(avatarConstantsSource.includes("halloween: () => import('../../../assets/frames/halloween-frame.png')"))
assert.match(avatarAssetsSource, /builtInFrameUrlCache/)
assert.match(avatarAssetsSource, /hoverPlayback === 'always'/)
assert.match(avatarAssetsSource, /hoverPlayback !== 'never'/)
assert.match(avatarFrameSource, /hoverPlayback: requestedPlayback = 'auto'/)
assert.match(avatarFrameSource, /hoverActive/)
assert.match(commentThreadSource, /hoverPlayback='never'/)
assert.match(mangaCommentSource, /hoverPlayback='never'/)
assert.match(userHoverSource, /hoverActive/)
assert.match(fansubHoverSource, /hoverActive/)

console.log('PASS avatar poster-hover rollout contract kept')
