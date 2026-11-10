/**
 * Reader v2 chapter comments contract (Phase 4b).
 *
 * In v1 comments were in a FIXED panel stuck under the reader.
 * The user's "cannot comment in horizontal mode / emoji-sticker picker does not open"
 * bug came from this: overflowing images overlapped the panel and swallowed clicks.
 * In v2 comments are a normal part of the chapter end flow; this contract prevents the fixed panel
 * from returning.
 *
 * Tree operations are in a pure module, so they are tested with REAL behavior.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

const moduleCache = new Map()
function resolveSourcePath(base) {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(path.join(rootDir, candidate))) return candidate
  }
  throw new Error(`The contract loader could not find the file: ${base}`)
}
function loadModule(relativePath) {
  if (moduleCache.has(relativePath)) return moduleCache.get(relativePath)
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  moduleCache.set(relativePath, shim.exports)
  const requireShim = (specifier) => {
    if (specifier.startsWith('@/')) return loadModule(resolveSourcePath(`src/${specifier.slice(2)}`))
    return {}
  }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, requireShim)
  return shim.exports
}

const tree = loadModule('src/pages/reader/readerV2CommentTree.ts')

// ---------- A) Agac islemleri ----------
const sample = () => ([
  {
    id: 'c1',
    isLiked: false,
    isDisliked: false,
    likes: 0,
    dislikes: 0,
    replies: [
      { id: 'c1r1', isLiked: false, isDisliked: false, likes: 2, dislikes: 0, replies: [] },
      { id: 'c1r2', isLiked: true, isDisliked: false, likes: 5, dislikes: 1, replies: [] },
    ],
  },
  { id: 'c2', isLiked: false, isDisliked: false, likes: 1, dislikes: 0, replies: [] },
])

{
  const list = sample()
  assert.equal(tree.findReaderV2Comment(list, 'c2').id, 'c2', 'kok seviyede bulunmali')
  assert.equal(tree.findReaderV2Comment(list, 'c1r2').likes, 5, 'yanit seviyesinde de bulunmali')
  assert.equal(tree.findReaderV2Comment(list, 'yok'), null, 'null for one that does not exist')
}

{
  const list = sample()
  const next = tree.updateReaderV2CommentReaction(list, 'c1r1', {
    isLiked: true, isDisliked: false, likes: 3, dislikes: 0,
  })
  assert.equal(next[0].replies[0].likes, 3, 'yanitin reaksiyonu guncellenmeli')
  assert.equal(next[0].replies[1].likes, 5, 'kardes yanit degismemeli')
  assert.equal(next[1].likes, 1, 'the other root comment must not change')
  assert.equal(list[0].replies[0].likes, 2, 'girdi mutasyona ugramamali (React state guvenligi)')
}

{
  const list = sample()
  const reply = { id: 'yeni', isLiked: false, isDisliked: false, likes: 0, dislikes: 0, replies: [] }
  const next = tree.insertReaderV2Reply(list, 'c1', reply)
  assert.equal(next[0].replies.length, 3, 'yanit dogru ebeveyne eklenmeli')
  assert.equal(next[0].replies[2].id, 'yeni', 'a new reply must be added at the end')
  assert.equal(next[1].replies.length, 0, 'the other comment must not be touched')
  assert.equal(list[0].replies.length, 2, 'girdi mutasyona ugramamali')

  const nested = tree.insertReaderV2Reply(sample(), 'c1r1', reply)
  assert.equal(nested[0].replies[0].replies.length, 1, 'nested replies must be supported too')
}

{
  const removedRoot = tree.removeReaderV2Comment(sample(), 'c2')
  assert.equal(removedRoot.length, 1, 'a root comment must be deletable')
  const removedReply = tree.removeReaderV2Comment(sample(), 'c1r1')
  assert.equal(removedReply[0].replies.length, 1, 'yanit silinebilmeli')
  assert.equal(removedReply[0].replies[0].id, 'c1r2', 'kalan yanit korunmali')
}

// ---------- B) Sabit panel geri gelmemeli ----------
const commentsSource = read('src/pages/reader/ReaderV2Comments.tsx')
assert.doesNotMatch(
  commentsSource,
  /className="[^"]*\bfixed\b/,
  'comments must not sit in a fixed panel: this was why v1 swallowed clicks',
)
assert.doesNotMatch(
  commentsSource,
  /\bsticky\b/,
  'the comment block must not be sticky either; it is a normal part of the chapter end flow',
)
assert.match(commentsSource, /data-testid="reader-v2-end-comments"/)

// With the flag off write paths must be closed (reading continues).
assert.match(commentsSource, /allowCommentCreate=\{commentsEnabled\}/)
assert.match(commentsSource, /allowReplyCreate=\{commentsEnabled\}/)
assert.match(commentsSource, /allowReport=\{reportsEnabled\}/)

// Rapor diyalogu yorum blogunun icinde: raporlama sonrasi bildirim okuyucunun
// USTUNDE gorunmeli (toast katmani okuyucu kabugundan yuksek).
assert.match(commentsSource, /<ReportModal/, 'the report dialog must be in the comment block')
const toastSource = read('src/components/common/Toast/ToastContainer.tsx')
const toastZ = Number(toastSource.match(/z-\[(\d+)\]/)?.[1] ?? 0)
const readerZ = Number(read('src/pages/reader/ReaderV2Page.tsx').match(/z-\[(\d+)\] flex flex-col bg-neutral-950/)?.[1] ?? 0)
assert.ok(readerZ > 0, 'the reader shell z-index must be measurable')
assert.ok(
  toastZ > readerZ,
  `the toast layer (${toastZ}) must be above the reader shell (${readerZ}): notices did not show after reporting`,
)

// ---------- C) Veri katmani ----------
const hookSource = read('src/pages/reader/useReaderV2Comments.ts')
// Except comment lines: an example in an explanation is not a rule violation.
const hookCode = hookSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
assert.match(hookSource, /active/, 'comments must not be fetched before chapter end is visible')
assert.doesNotMatch(hookCode, /console\.(error|log|warn)/, 'errors must go to the scoped logger, not console')
assert.match(hookSource, /createScopedLogger/)
// Tree walking from one source: no recursion copied in the page/hook.
assert.match(hookSource, /insertReaderV2Reply/)
assert.match(hookSource, /updateReaderV2CommentReaction/)
assert.doesNotMatch(
  hookSource,
  /const addRecursive|function addRecursive/,
  'reply insert recursion must stay in the pure module (it was in the handler body in v1)',
)

const pageSource = read('src/pages/reader/ReaderV2Page.tsx')
assert.match(pageSource, /commentsNode=/, 'the comment block must connect to the chapter end sequence')
assert.match(pageSource, /flags\.commentsEnabled/, 'the comment block must be tied to the flag')

console.log('PASS reader v2 comment contract verified')
