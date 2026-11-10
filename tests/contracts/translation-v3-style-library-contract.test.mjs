import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// --- DB: ekip stil kutuphanesi -----------------------------------------------------------
const migration = read('supabase/migrations/20260927190242_translation_studio_v3_style_presets.sql')
assert.match(migration, /create table public\.translation_style_presets/)
assert.match(migration, /check \(app_private\.tl_style_valid\(style\) and style <> '\{\}'::jsonb\)/, 'the style passes the same validator as items, no empty style')
assert.match(migration, /constraint translation_style_presets_unique unique \(fansub_id, name\)/, 'name is unique within a team')
assert.match(migration, /alter table public\.translation_style_presets enable row level security/)
assert.match(migration, /revoke all on public\.translation_style_presets from anon, authenticated/)
assert.match(migration, /grant update \(name, style\) on public\.translation_style_presets to authenticated/, 'fansub_id guncellenemez (baska ekibe tasinamaz)')
for (const action of ['read', 'insert', 'update', 'delete']) {
  assert.match(migration, new RegExp(`translation_style_presets_staff_${action}[\\s\\S]{0,160}app_private\\.tl_can_fansub\\(fansub_id\\)`), `${action} only for team officers`)
}
assert.match(migration, />= 100 then/, 'ekip basina 100 stil siniri')
assert.match(migration, /new\.fansub_id := old\.fansub_id;/, 'guncellemede ekip degismez')
// created_by links to public.users(id): auth.uid() is a different identity and gives an FK error (caught in a live test).
assert.match(read('supabase/migrations/20260927191726_translation_studio_v3_style_presets_owner_fix.sql'), /alter column created_by set default app_private\.current_public_user_id\(\)/)

// --- Servis -------------------------------------------------------------------------------
const service = read('src/services/translationEditorService.ts')
assert.match(service, /from\('translation_style_presets'\)\s*\.select\('id,name,style'\)\.eq\('fansub_id', fansubId\)/)
assert.match(service, /if \(inserted\.error\?\.code === '23505'\)/, 'same name: overwritten')
assert.match(service, /\.update\(\{ style: body \}\)\.eq\('fansub_id', fansubId\)\.eq\('name', clean\)/, 'overwriting changes only the style')

// --- Editor: kaydet / uygula / sil ----------------------------------------------------------
const screen = read('src/pages/translationStudio/editor/EditorScreen.tsx')
// Team resources moved from the editor to useTeamResources (same behavior).
const team = read('src/pages/translationStudio/editor/useTeamResources.ts')
assert.match(team, /listStylePresets\(fansubId, controller\.signal\)/)
assert.match(team, /Object\.keys\(target\.style\)\.length \? target\.style : \{ font: resolveStyle\(target, pageWidth\)\.font \}/, 'an empty style saves the visible font')
assert.match(screen, /const team = useTeamResources\(project\.fansubId, width, onToast\)/)
assert.match(screen, /for \(const item of selectedItems\) editor\.updateItem\(item\.id, \{ style: \{ \.\.\.preset\.style \} \}, \{ snapshot: false \}\)/, 'team style on the whole selection in one step')
const panels = read('src/pages/translationStudio/editor/EditorPanels.tsx')
assert.match(panels, /data-testid='tl-style-presets'/)
assert.match(panels, /aria-label=\{txa\('"\{v1\}" stilini sil', \{ v1: preset\.name \}\)\}/, 'the delete button has an accessible name')

// --- Katmanlar: gizle / kilitle ------------------------------------------------------------
assert.match(panels, /data-testid='tl-layer-hide'/)
assert.match(panels, /data-testid='tl-layer-lock'/)
assert.match(panels, /onSelect\(item\.id, event\.shiftKey \? 'toggle' : undefined\)/, 'listede Shift+tik coklu secim')
const canvas = read('src/pages/translationStudio/editor/EditorCanvas.tsx')
assert.match(canvas, /items\.filter\(\(item\) => !hiddenIds\.has\(item\.id\)\)\.map\(\(item\) => <TranslatedTextBox/, 'gizli yazi editorde cizilmez')
assert.match(canvas, /&& !lockedIds\.has\(item\.id\) \? 'auto' : 'none'/, 'kilitli oge tuvalde tutulamaz')
assert.match(canvas, /!lockedIds\.has\(item\.id\) && intersects\(item, box\)/, 'kilitli oge dikdortgenle secilmez')
assert.match(screen, /if \(!target \|\| lockedIds\.has\(item\.id\)\) continue/, 'kilitli oge hizalama / ok tusuyla kaymaz')
assert.match(screen, /removeItems\(selectedIds\.filter\(\(id\) => !lockedIds\.has\(id\)\)\)/, 'a locked item is not removed with Delete')
// Hiding is an editor view only: publish render draws all items.
assert.match(read('src/pages/translationStudio/editor/finalRender.ts'), /for \(const item of input\.items\) drawItemText\(context, item, input\.width\)/)

console.log('PASS translation studio v3 team style library and layers (RLS, overwrite, hide/lock)')
