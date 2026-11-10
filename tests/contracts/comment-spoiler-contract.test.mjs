import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const commentThreadPath = 'src/components/common/CommentThread/CommentThread.tsx'
const commentAutocompletePath = 'src/components/common/CommentThread/CommentThreadAutocompleteTextarea.tsx'
const commentSpoilerBlockPath = 'src/components/common/CommentThread/CommentThreadSpoilerBlock.tsx'
const commentConstantsPath = 'src/services/commentService/constants.ts'
const typePath = 'src/types/index.ts'
const mangaMutationPath = 'src/services/commentService/mutations.ts'
const mangaListCommentsPath = 'src/services/mangaListService/comments.ts'
const mangaDetailPagePath = 'src/pages/MangaDetailPage.tsx'
const mangaReaderPagePath = 'src/pages/MangaReaderPage.tsx'
const readerSupplementaryContentPath = 'src/pages/mangaReader/ReaderSupplementaryContent.tsx'
const textareaPath = 'src/components/ui/textarea.tsx'
const communityExpressionTextareaPath = 'src/components/community/CommunityExpressionTextarea.tsx'
const communityExpressionPreviewPath = 'src/components/community/CommunityExpressionTextareaPreview.tsx'
const adminCommentPreviewPath = 'src/components/admin/sections/comments/AdminCommentBodyPreview.tsx'
// List comment moderation was rewritten; spoiler/token render responsibility must stay tied to
// the same shared component.
const adminMangaListCommentsCardPath = 'src/components/admin/mangaLists/ListDetailCommentsPanel.tsx'

for (const relativePath of [
  commentThreadPath,
  commentAutocompletePath,
  commentSpoilerBlockPath,
  commentConstantsPath,
  typePath,
  mangaMutationPath,
  mangaListCommentsPath,
  mangaDetailPagePath,
  mangaReaderPagePath,
  readerSupplementaryContentPath,
  textareaPath,
  communityExpressionTextareaPath,
  communityExpressionPreviewPath,
  adminCommentPreviewPath,
  adminMangaListCommentsCardPath,
]) {
  assert.equal(existsSync(path.join(rootDir, relativePath)), true, `${relativePath} bulunamadi`)
}

const commentThreadSource = readSource(commentThreadPath)
const commentAutocompleteSource = readSource(commentAutocompletePath)
const commentSpoilerBlockSource = readSource(commentSpoilerBlockPath)
const commentConstantsSource = readSource(commentConstantsPath)
const typeSource = readSource(typePath)
const mangaMutationSource = readSource(mangaMutationPath)
const mangaListCommentsSource = readSource(mangaListCommentsPath)
const mangaDetailPageSource = readSource(mangaDetailPagePath)
const mangaReaderPageSource = readSource(mangaReaderPagePath)
const readerSupplementaryContentSource = readSource(readerSupplementaryContentPath)
const textareaSource = readSource(textareaPath)
const communityExpressionTextareaSource = readSource(communityExpressionTextareaPath)
const communityExpressionPreviewSource = readSource(communityExpressionPreviewPath)
const adminCommentPreviewSource = readSource(adminCommentPreviewPath)
const adminMangaListCommentsCardSource = readSource(adminMangaListCommentsCardPath)

assert.match(typeSource, /isSpoiler\?: boolean/)
assert.match(commentConstantsSource, /MANGA_COMMENT_MAX_LENGTH = 500/)

assert.match(commentThreadSource, /type MaybePromise<T> = T \| Promise<T>/)
assert.match(commentThreadSource, /onAddComment: \(isSpoiler: boolean\) => MaybePromise<void>/)
assert.match(commentThreadSource, /onSubmitReply: \(parentId: string, replyToReplyId\?: string, isSpoiler\?: boolean\) => MaybePromise<void>/)
assert.match(commentThreadSource, /isSubmittingComment/)
assert.match(commentThreadSource, /submittingReplyKey/)
assert.match(commentThreadSource, /CommentSpoilerBlock/)
assert.match(commentSpoilerBlockSource, /backdrop-blur-\[1px\]/)
assert.match(commentThreadSource, /toggleSpoilerReveal/)
assert.match(commentThreadSource, /c\.isSpoiler/)
assert.match(commentThreadSource, /composerMaxLength\?: number/)
assert.match(commentThreadSource, /\[overflow-wrap:anywhere\]/)
assert.match(commentThreadSource, /min-w-0 flex-1/)
assert.doesNotMatch(commentThreadSource, /wrapSelectedTextareaText/)
assert.doesNotMatch(commentThreadSource, /enableSpoilers/)
assert.doesNotMatch(commentThreadSource, /Spoilerli yorum/)
assert.match(commentAutocompleteSource, /Gövde gizli başlar/)
assert.match(commentAutocompleteSource, /aria-pressed=\{isSpoiler\}/)
assert.match(commentAutocompleteSource, /maxLength=\{maxLength\}/)
assert.match(commentAutocompleteSource, /karakter/)

assert.match(mangaMutationSource, /is_spoiler/)
assert.match(mangaMutationSource, /MANGA_COMMENT_MAX_LENGTH/)
assert.match(mangaMutationSource, /Yorum en fazla/)
assert.match(mangaListCommentsSource, /options: \{ isSpoiler\?: boolean \} = \{\}/)
assert.match(mangaListCommentsSource, /is_spoiler/)
assert.match(mangaDetailPageSource, /composerMaxLength=\{MANGA_COMMENT_MAX_LENGTH\}/)
assert.match(mangaReaderPageSource, /ReaderSupplementaryContent/)
assert.match(readerSupplementaryContentSource, /composerMaxLength=\{MANGA_COMMENT_MAX_LENGTH\}/)
assert.match(textareaSource, /overflow-x-hidden/)
assert.match(communityExpressionTextareaSource, /break-all/)
assert.match(communityExpressionPreviewSource, /break-all/)
assert.match(adminCommentPreviewSource, /\[overflow-wrap:anywhere\]/)
assert.match(adminMangaListCommentsCardSource, /AdminCommentBodyPreview/)

console.log('PASS comment-level spoiler contract kept')
