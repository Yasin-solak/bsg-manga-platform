import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function listSourceFiles(dir) {
  const out = []
  for (const name of readdirSync(path.join(rootDir, dir))) {
    const relative = `${dir}/${name}`
    const stats = statSync(path.join(rootDir, relative))
    if (stats.isDirectory()) out.push(...listSourceFiles(relative))
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative)
  }
  return out
}

const queriesSource = readSource('src/services/commentService/queries.ts')
const indexSource = readSource('src/services/commentService/index.ts')
const pagerSource = readSource('src/hooks/useCommentPager.ts')
const threadSource = readSource('src/components/common/CommentThread/CommentThread.tsx')

// Public comment loading must be bounded: a page of top-level comments via range().
assert.match(queriesSource, /export const COMMENT_PAGE_SIZE = (3\d|4\d|50)\b/, 'Public comment page size must stay between 30 and 50.')
assert.match(queriesSource, /export async function getCommentsPage\(/, 'The bounded public comment loader must exist.')
assert.match(queriesSource, /\.is\('parent_id', null\)/, 'Pagination must apply to top-level comments only.')
assert.match(queriesSource, /\.range\(offset, offset \+ limit\)/, 'Top-level comment loading must use range() so it is bounded.')
assert.match(queriesSource, /Math\.min\(Math\.max\(1, Math\.floor\(options\.limit \?\? COMMENT_PAGE_SIZE\)\), 50\)/, 'Callers must not be able to raise the page limit above 50.')
assert.match(queriesSource, /\.in\('parent_id', chunk\)/, 'Replies of the loaded roots must be fetched with parent_id in (...) so threads stay complete.')
assert.match(queriesSource, /\.limit\(REPLIES_PER_LEVEL_LIMIT\)/, 'Reply fetches must be bounded too.')
assert.match(queriesSource, /count: 'exact', head: true/, 'The total comment count must come from a head count request, not from loaded rows.')

// No unbounded public loader may exist or be exported.
assert.doesNotMatch(queriesSource, /export async function getComments\(/, 'The unbounded getComments loader must not come back to the public query module.')
assert.doesNotMatch(indexSource, /\bgetComments\b(?!Page)/, 'commentService must not export an unbounded getComments.')
for (const file of listSourceFiles('src')) {
  const source = readSource(file)
  assert.doesNotMatch(source, /commentService\.getComments\(/, `${file} must use getCommentsPage, not an unbounded loader.`)
}

// Load-more path: every public comment surface wires the pager into CommentThread.
assert.match(pagerSource, /loadMore/, 'The comment pager must expose loadMore.')
assert.match(pagerSource, /commentService\.getCommentsPage\(/, 'loadMore must fetch the next bounded page.')
assert.match(pagerSource, /knownIds\.has\(comment\.id\)/, 'loadMore must de-duplicate against optimistic and already loaded comments.')
assert.match(pagerSource, /generation !== generationRef\.current/, 'A stale load-more response must be dropped after the list was replaced.')
assert.match(threadSource, /onLoadMore\?: \(\) => void/, 'CommentThread must accept a server-side load-more handler.')
assert.match(threadSource, /data-testid="comment-thread-load-more"/, 'CommentThread must render the load-more control.')
assert.match(threadSource, /typeof totalCount === 'number'/, 'CommentThread must prefer the server total over the loaded count.')

for (const [file, marker] of [
  ['src/pages/MangaDetailPage.tsx', 'onLoadMoreComments'],
  ['src/pages/MangaReaderPage.tsx', 'onLoadMoreComments'],
  ['src/pages/reader/ReaderV2Page.tsx', 'onLoadMoreComments'],
  ['src/pages/mangaDetail/MangaDetailCommentsPanel.tsx', 'onLoadMore={onLoadMoreComments}'],
  ['src/pages/mangaReader/ReaderSupplementaryContent.tsx', 'onLoadMore={onLoadMoreComments}'],
  ['src/pages/reader/ReaderV2Comments.tsx', 'onLoadMore={onLoadMoreComments}'],
]) {
  assert.ok(readSource(file).includes(marker), `${file} must wire the comment load-more path.`)
}

// Optimistic flows keep the server total in sync after a load-more.
for (const file of ['src/pages/MangaDetailPage.tsx', 'src/pages/MangaReaderPage.tsx', 'src/pages/reader/useReaderV2Comments.ts']) {
  assert.match(readSource(file), /adjustTotal\(1\)/, `${file} must bump the total after an optimistic add or reply.`)
}
assert.match(readSource('src/pages/reader/useReaderV2Comments.ts'), /adjustTotal\(-countCommentTree\(removed\)\)/, 'Reader v2 delete must lower the total by the removed thread size.')

console.log('comment pagination contract passed')
