import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// "Who is on the same page": a private Realtime presence channel, authorized in the DB.
const migration = read('supabase/migrations/20260929035921_translation_studio_v3_page_presence.sql')
assert.match(migration, /p_topic !~ '\^tl-page:\[0-9a-f\]\{8\}/, 'only the tl-page:<uuid> topic')
assert.match(migration, /return app_private\.tl_can_page\(v_page\);/, 'the channel is open to those able to see the page')
assert.match(migration, /create policy tl_page_presence_receive on realtime\.messages for select to authenticated\s+using \(extension = 'presence'/, 'presence alma yetkili')
assert.match(migration, /create policy tl_page_presence_track on realtime\.messages for insert to authenticated\s+with check \(extension = 'presence'/, 'presence yayma yetkili')

// Katilim okuma kontrolu broadcast'i da sorar (supabase-js varsayilani); canli testte yakalandi.
const joinFix = read('supabase/migrations/20260929041459_translation_studio_v3_page_presence_join.sql')
assert.match(joinFix, /using \(extension in \('presence', 'broadcast'\) and app_private\.tl_presence_allowed/)
assert.doesNotMatch(joinFix, /for insert/, 'no broadcast write permission')

const hookSource = read('src/pages/translationStudio/editor/usePagePresence.ts')
assert.match(hookSource, /supabase\.channel\(`tl-page:\$\{pageId\}`, \{ config: \{ private: true, presence: \{ key: me\.userId \} \} \}\)/, 'a private channel, with the user key')
assert.match(hookSource, /if \(key === me\.userId \|\| !metas\.length\) continue/, 'kendini listelemez')
assert.match(hookSource, /if \(!known\.has\(peer\.userId\) && !first\) onJoinRef\.current\?\.\(peer\.username\)/, 'no notice on first sync, one for later joiners')
assert.match(hookSource, /void supabase\.removeChannel\(channel\)/, 'leaves the channel on page change')

// The color is the same for the same person on each client.
const exports = {}
const code = ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function('require', 'exports', code)((name) => (name === 'react' ? {} : name === '@/services/supabase' ? { supabase: {} } : (() => { throw new Error(name) })()), exports)
assert.equal(exports.peerColor('user-a'), exports.peerColor('user-a'))
assert.match(exports.peerColor('user-b'), /^#[0-9a-f]{6}$/)

const screen = read('src/pages/translationStudio/editor/EditorScreen.tsx')
assert.match(screen, /usePagePresence\(page\?\.id \?\? null, me, selectedId,/)
assert.match(screen, /peerItems=\{peerItems\}/)
assert.match(read('src/pages/translationStudio/editor/EditorCanvas.tsx'), /data-testid='tl-peer-item'/, 'tuvalde baskasinin sectigi oge isaretli')
assert.match(read('src/pages/translationStudio/editor/EditorPanels.tsx'), /data-testid='tl-peer-warning'/, 'a warning on selecting the same item')

console.log('PASS translation studio presence (private channel permission, join notice, item mark)')
