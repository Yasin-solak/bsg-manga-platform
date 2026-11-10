import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// A slow auth summary during a long scan must not drop the page: first the summary, if unavailable the local session
// key (time limited). The server re-validates the key on each request.
const studioAuth = read('src/services/studioAuth.ts')
assert.match(studioAuth, /try \{\s*const token = await getCurrentAccessToken\(\)\s*if \(token\) return token\s*\} catch/)
assert.match(studioAuth, /withServiceTimeout\(\(\) => supabase\.auth\.getSession\(\)/)
assert.doesNotMatch(studioAuth, /refreshSession|signIn/, 'the fallback path does not change the session, it only reads')

// Studio calls (scan, editor, publish, reader translation, preview) use this path.
for (const path of [
  'src/services/translationStudioService.ts',
  'src/services/translationEditorService.ts',
  'src/services/translationReaderService.ts',
  'src/pages/translationStudio/editor/EditorScreen.tsx',
  'src/pages/translationStudio/editor/StepPublish.tsx',
  'src/pages/translationStudio/useRawThumbnail.ts',
]) {
  const source = read(path)
  assert.match(source, /from '@\/services\/studioAuth'/, `${path} studioAccessToken kullanmali`)
  assert.doesNotMatch(source, /getCurrentAccessToken/, `${path} must not stay tied to the direct auth summary`)
}

console.log('PASS studio session key (summary -> local session fallback, all studio calls)')
