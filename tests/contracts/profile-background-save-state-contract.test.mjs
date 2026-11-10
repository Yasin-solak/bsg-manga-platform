import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const mutationSource = fs.readFileSync(path.join(root, 'src/pages/profile/useProfileEditMutations.ts'), 'utf8')

assert.match(
  mutationSource,
  /const nextEquippedBackground = backgroundUploadFile && nextBackgroundRef[\s\S]+: equippedBackground[\s\S]+\.\.\.equippedBackground,[\s\S]+id: nextBackgroundRef,/,
  'store background save should keep the selected background object while updating the persisted id',
)

assert.doesNotMatch(
  mutationSource,
  /background:\s*nextBackgroundRef/,
  'store background save must not replace the preview/render asset URL with the store identifier',
)

console.log('profile-background-save-state-contract: ok')
