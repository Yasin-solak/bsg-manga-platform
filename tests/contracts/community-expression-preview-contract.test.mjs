import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const previewTextareaPath = 'src/components/community/CommunityExpressionTextarea.tsx'
const previewRendererPath = 'src/components/community/CommunityExpressionTextareaPreview.tsx'
const commentThreadPath = 'src/components/common/CommentThread/CommentThread.tsx'
const commentAutocompletePath = 'src/components/common/CommentThread/CommentThreadAutocompleteTextarea.tsx'
const communityRichTextPath = 'src/components/common/CommunityRichText.tsx'
const adminCommentBodyPreviewPath = 'src/components/admin/sections/comments/AdminCommentBodyPreview.tsx'
const supporterAssetServicePath = 'src/services/fansubSupporterAssetService.ts'

for (const relativePath of [
  previewTextareaPath,
  previewRendererPath,
  commentThreadPath,
  commentAutocompletePath,
  communityRichTextPath,
  adminCommentBodyPreviewPath,
  supporterAssetServicePath,
]) {
  assert.equal(existsSync(path.join(rootDir, relativePath)), true, `${relativePath} bulunamadi`)
}

const previewTextareaSource = readSource(previewTextareaPath)
const previewRendererSource = readSource(previewRendererPath)
const commentThreadSource = readSource(commentThreadPath)
const commentAutocompleteSource = readSource(commentAutocompletePath)
const communityRichTextSource = readSource(communityRichTextPath)
const adminCommentBodyPreviewSource = readSource(adminCommentBodyPreviewPath)
const supporterAssetServiceSource = readSource(supporterAssetServicePath)

assert.match(previewRendererSource, /getPublicFansubSupporterAssetRenderCatalog/)
assert.match(previewRendererSource, /FansubSupporterAssetMedia/)

assert.match(previewTextareaSource, /CommunityExpressionTextareaPreview/)
assert.match(previewTextareaSource, /hasCommunityExpressionPreviewTokens/)
assert.match(previewTextareaSource, /caret-transparent/)
assert.match(previewTextareaSource, /selection:text-transparent/)
assert.match(previewTextareaSource, /bg-transparent/)
assert.match(previewTextareaSource, /WebkitTextFillColor/)
assert.match(previewTextareaSource, /findDeletionRange/)
assert.match(previewTextareaSource, /expandSelectionToTokenBoundaries/)
assert.match(previewRendererSource, /resolvedRevisionAssets\[supporterAssetToken\.revisionId\][\s\S]*supporterAssetByKey\.get/)
assert.match(previewRendererSource, /unresolvedSupporterRevisionIds/)
assert.match(previewRendererSource, /isAbortLikeError/)
assert.match(previewRendererSource, /!supporterAssetByKey\.has\(buildCatalogKey\(token\.kind, token\.shortcode\)\)/)
assert.match(previewRendererSource, /caretIndex/)
assert.match(previewRendererSource, /renderCaret/)
assert.match(supporterAssetServiceSource, /requestPublicFansubSupporterAssetRenderCatalog/)
assert.match(supporterAssetServiceSource, /if \(signal\) \{[\s\S]*await requestPublicFansubSupporterAssetRenderCatalog\(missingRevisionIds, signal\)/)
assert.match(supporterAssetServiceSource, /if \(!isAbortLikeError\(error\)\)/)

assert.match(commentThreadSource, /CommentThreadAutocompleteTextarea/)
assert.match(commentThreadSource, /let alive = true[\s\S]*listPublicFansubSupporterAssets\(supporterAssetFansubId\)[\s\S]*alive = false/)
assert.doesNotMatch(
  commentThreadSource,
  /listPublicFansubSupporterAssets\([^)]*controller\.signal|listPublicFansubSupporterAssets\([^)]*signal/,
  'a comment thread supporter asset catalog request must not be aborted by component cleanup; the service cache/in-flight layer must finish the request',
)
assert.match(commentAutocompleteSource, /CommunityExpressionTextarea/)
assert.match(commentAutocompleteSource, /supporterAssets=\{supporterAssets\}/)
assert.doesNotMatch(commentAutocompleteSource, /<Textarea/)


for (const [label, source] of [
  ['topluluk rich text', communityRichTextSource],
  ['composer preview', previewRendererSource],
  ['admin yorum preview', adminCommentBodyPreviewSource],
]) {
  assert.match(
    source,
    /let alive = true[\s\S]*getPublicFansubSupporterAssetRenderCatalog\([^)]*RevisionIds\)[\s\S]*alive = false/,
    `${label} must safely ignore the catalog result with a stale state guard`,
  )
  assert.doesNotMatch(
    source,
    /getPublicFansubSupporterAssetRenderCatalog\([^)]*controller\.signal|getPublicFansubSupporterAssetRenderCatalog\([^)]*signal/,
    `${label} supporter asset render must not abort the catalog request with component cleanup`,
  )
}

console.log('PASS community expression preview contract kept')
