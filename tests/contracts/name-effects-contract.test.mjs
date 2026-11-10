import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

// Animasyonlu isim efektleri: gorsel tabanli (animasyonlu WebP / APNG / GIF), Magaza Kontrol'den yonetilir.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// User decision: the effect is an animated image, not canvas / particles.
assert.ok(!existsSync(new URL('../../src/lib/nameParticles.ts', import.meta.url)), 'no canvas particle layer')
assert.doesNotMatch(read('src/App.tsx'), /NameParticleLayer/, 'no canvas name layer mounts in the app')

const migration = read('supabase/migrations/20261001130000_name_effects.sql')
assert.match(migration, /create table if not exists public\.name_effects/, 'name effects table')
assert.match(migration, /revoke all on public\.name_effects from anon, authenticated/, 'no direct table access (RPC only)')
assert.match(migration, /where e\.status = 'published'/, 'readers get only published effects')
assert.match(migration, /grant execute on function public\.name_effects_list\(\) to anon, authenticated/, 'the list is public')
for (const fn of ['name_effects_admin_list', 'name_effects_admin_save']) {
  const body = migration.slice(migration.indexOf(`function public.${fn}`))
  assert.match(body.slice(0, 400), /if not app_private\.is_admin\(\) then/, `${fn} admin only`)
}

const effects = read('src/data/nameTextEffects.ts')
assert.match(effects, /const NAME_ASSET_EFFECT_ID_PATTERN = \/\^fx-\[a-z0-9\]\[a-z0-9-\]\{1,40\}\$\//, 'animasyonlu efekt kimligi fx-<slug>')
assert.match(effects, /if \(isNameAssetEffectId\(normalized\)\) return `name-effect-solid name-fx-asset name-\$\{normalized\}`/, 'the effect travels as a class (the name is styled everywhere)')

const registry = read('src/lib/nameEffectRegistry.ts')
assert.match(registry, /supabase\.rpc\('name_effects_list'\)/, 'list via RPC')
assert.match(registry, /withServiceTimeout/, 'request with timeout')
assert.match(registry, /`--name-fx-image:\$\{cssUrl\(url\)\}`/, 'one CSS rule per effect (image)')
assert.match(registry, /value\.replace\(\/\["\\\\\\n\\r\]\/g, ''\)/, 'CSS url enjeksiyonuna karsi temizlik')

const css = read('src/index.css')
assert.match(css, /\.name-fx-asset::before \{[\s\S]{0,400}background: var\(--name-fx-image, none\) center \/ 100% 100% no-repeat;/, 'the image stretches to the name box')
assert.match(css, /\.name-fx-asset \{\s+position: relative;\s+isolation: isolate;/, 'the effect stays behind the name (does not overlap the text)')

assert.match(read('src/components/common/NameStylePickerPanel.tsx'), /data-name-asset-effects/, 'animated effects in the name style picker')
assert.match(read('src/components/admin/shop/AdminShopSection.tsx'), /id: 'name-effects'/, 'Shop Control > Name effects')
assert.match(read('src/components/admin/shop/ShopAdminNameEffects.tsx'), /uploadStorefrontVisual\(file, 'name-effects'\)/, 'the effect image goes to R2 by admin upload')
for (const slug of ['alev', 'simsek', 'buz', 'sakura', 'yildiz', 'duman']) {
  assert.ok(existsSync(new URL(`../../public/name-effects/${slug}.webp`, import.meta.url)), `${slug} yerlesik efekt gorseli`)
}

console.log('PASS animated name effects (image based, admin managed, the name is styled everywhere)')
