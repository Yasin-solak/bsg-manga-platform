import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planTiles } from '../../functions/api/ceviri/scan.js'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// Rota: kendi tam ekran kabugunda.
const app = read('src/App.tsx')
// The studio route is protected: fansub admin or "View studio" permission (Roles and Permissions).
assert.match(app, /path='fansub\/:id\/studyo\/\*'[\s\S]{0,200}RequireFansubRoleRoute allowedRoles=\{\['admin'\]\} requiredPermission='ceviri\.gor'[\s\S]{0,80}<TranslationStudioPage \/>/)
const layout = read('src/components/layout/Layout.tsx')
assert.match(layout, /\(\?:yonet\|studyo\)/, 'the studio route must be in the Layout chrome exception')

// The flag is registered; the DB side (tl_can_fansub) reads the same key.
assert.match(read('src/services/featureFlagRegistry.ts'), /'translation\.studio_v3': \{/)
assert.match(read('supabase/migrations/20260925200412_translation_studio_v3_foundation.sql'), /is_feature_enabled\('translation\.studio_v3', false\)/)

// Wizard steps and Worker endpoints.
const page = read('src/pages/translationStudio/TranslationStudioPage.tsx')
for (const label of ['Seri', 'Bölüm', 'Yükle', 'Tara', 'Düzenle', 'Yayınla']) {
  assert.ok(page.includes(`label: txa('${label}')`) || page.includes(`get label() { return txa('${label}') }`), `adim eksik: ${label}`)
}
const service = read('src/services/translationStudioService.ts')
for (const endpoint of ['/api/ceviri/raw', '/api/ceviri/scan', '/api/ceviri/translate']) {
  assert.ok(service.includes(endpoint), `service endpoint missing: ${endpoint}`)
}

// The client tile plan must match the server; otherwise scan.js rejects the tile.
assert.match(service, /export function planTiles\(width: number, height: number, size = 1024, overlap = 256\)/)
assert.deepEqual(planTiles(800, 2500).map((tile) => [tile.x, tile.y, tile.width, tile.height]), [
  [0, 0, 800, 1024], [0, 738, 800, 1024], [0, 1476, 800, 1024],
])

// Tasarim tokenlari studyo kapsaminda; site temasini ezmez.
const css = read('src/pages/translationStudio/translationStudio.css')
assert.match(css, /\.tl-studio \{[\s\S]*--tl-p: oklch\(0\.832 0\.074 186\.1\);/)
assert.doesNotMatch(css, /:root\s*\{/)

// The raw page is in private R2: the preview is fetched not with <img src> but with an authorized fetch + blob.
assert.match(read('src/pages/translationStudio/useRawThumbnail.ts'), /Authorization: `Bearer \$\{token\}`[\s\S]*URL\.createObjectURL/)

console.log('PASS translation studio v3 wizard contract (route, flag, steps, tile plan, tokens)')

// Series draft approval: site admin only; the approval moves the series + projects in one transaction.
const approval = read('supabase/migrations/20260926011828_translation_studio_v3_series_approval.sql')
assert.match(approval, /if not app_private\.is_admin\(\) then\s+raise exception 'yalniz site admini onaylayabilir'/)
assert.match(approval, /update public\.translation_projects set manga_id = v_manga, series_draft_id = null where series_draft_id = p_draft_id/)
assert.ok([...approval].every((char) => char.charCodeAt(0) < 128), 'no accented characters in migration code (unicode escapes)')
assert.match(read('src/pages/AdminPage.tsx'), /activeSection === 'series_requests'[\s\S]{0,160}<AdminSeriesRequestsSection \/>/)
console.log('PASS translation studio v3 series request approval')

// Entry point: studio link in the fansub panel (flag on or site admin).
const sidebar = read('src/pages/fansubYonet/FansubStudioSidebarNav.tsx')
assert.match(sidebar, /\/fansub\/\$\{encodeURIComponent\(fansubSlug \|\| fansubId\)\}\/studyo/)
assert.match(read('src/pages/FansubYonetPage.tsx'), /showTranslationStudio=\{isSiteAdmin \|\| \(isTranslationStudioEnabled && permissions\.has\('ceviri\.gor'\)\)\}/)
console.log('PASS translation studio v3 fansub panel entry')

// On reload a failed page arrives as an error (retry is visible);
// an interrupted scan does not count as "done", a continue button is offered.
const scanStep = read('src/pages/translationStudio/StepScan.tsx')
assert.match(scanStep, /page\.scanStage === 'failed'\) return -1/)
assert.match(scanStep, /data-testid='tl-scan-resume'/)
console.log('PASS translation studio v3 scan continue/retry states')
