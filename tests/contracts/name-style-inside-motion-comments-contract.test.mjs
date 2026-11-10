import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { untranslate } from './i18n-source.mjs'

// Name style: effect images playing inside letters, pure motion animations and name style in comments.
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))

const migration = read('supabase/migrations/20261004120000_name_style_comments_inside_layer.sql')
assert.match(migration, /check \(layer in \('back', 'front', 'inside'\)\)/, 'efekt katmani: arka / on / ic')
assert.match(migration, /premium_expires_at <= pg_catalog\.now\(\) then null/, 'an expired premium style does not leak out')
assert.match(migration, /app_private\.premium_visible_name_style\(/, 'the perk gate (name_style / name_effects) is kept')
assert.match(migration, /app_private\.public_user_name_style\(u\.id\) as active_name_style/, 'public_user_directory carries the name style')
assert.match(migration, /or not app_private\.is_blocked_with_viewer\(u\.id\)/, 'the live block gate is kept')

// Inner layer: the image paints inside the letters, the ::before layer closes, glow through drop-shadow.
const registry = read('src/lib/nameEffectRegistry.ts')
assert.match(registry, /z\.enum\(\['back', 'front', 'inside'\]\)/, 'the registry reads the inner layer')
assert.match(registry, /background-clip:text/, 'the inner layer is drawn with background-clip: text')
assert.match(registry, /-webkit-text-fill-color:transparent/, 'text fill is transparent: the image shows in the letters')
assert.match(registry, /::before\{content:none\}/, 'no back / front image layer in the inner layer')
assert.match(registry, /filter:drop-shadow\(/, 'ic katmanda parlama harfleri kapatmaz')
assert.match(read('src/services/nameEffectAdminService.ts'), /z\.enum\(\['back', 'front', 'inside'\]\)/, 'the admin service reads the inner layer')
assert.match(read('src/components/admin/shop/ShopAdminNameEffects.tsx'), /\{ value: 'inside', label: 'İsmin içi' \}/, 'Shop Control: third layer option')

// Motion: independent of effect, carried as a class, does not override the effect animation.
const effects = read('src/data/nameTextEffects.ts')
assert.match(effects, /export const NAME_TEXT_MOTIONS = \[/, 'hareket listesi')
assert.match(effects, /motionId\?: NameTextMotionId/, 'name style selection carries motion')
assert.match(effects, /const motionClassName = getNameTextMotionClassName\(style\?\.motionId\)/, 'motion is added as a class')
const css = read('src/index.css')
assert.match(css, /--name-effect-animation: none;/, 'the effect animation is in a variable (default none)')
assert.match(css, /\.name-motion-float \{ animation: var\(--name-effect-animation\), name-motion-float/, 'hareket efekt animasyonunun yanina eklenir')
assert.doesNotMatch(css.slice(css.indexOf('@keyframes name-motion-float'), css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .name-effect-gradient')), /transform:/, 'hareket transform kullanmaz (efektlerin transformunu ezmez)')
assert.match(css, /\[class\*='name-motion-'\] \{\s+animation: none !important;/, 'azaltilmis harekette hareket kapanir')
assert.match(read('src/components/common/NameStylePickerPanel.tsx'), /data-name-motion-picker/, 'a Motion section in the name style picker')
assert.match(read('src/pages/profile/profileEditMutationHelpers.ts'), /motionId: safeSelectedNameMotionId/, 'profil kaydi hareketi yazar')

// Yorumlar: yazarin isim stili satirdaki adda da gorunur.
assert.match(read('src/services/commentService/shared.ts'), /nameStyle: parsePublicNameTextStyle\(row\.users\?\.active_name_style\)/, 'manga / chapter comments carry the name style')
const thread = read('src/components/common/CommentThread/CommentThread.tsx')
assert.match(thread, /buildUserNameStyleProps\(c\.nameStyle, \{ guardSurfaces: nameSurfaces \}\)\.className/, 'a name in comments draws with the name style')
assert.match(thread, /buildUserNameStyleProps\(c\.nameStyle, \{ guardSurfaces: nameSurfaces \}\)\.style/, 'a name in comments takes color / effect color variables')

// Name style v2 (user): only animated effects, effect color, free color, gradient fill, contrast shield.
const userStyle = read('src/data/userNameStyle.ts')
assert.match(userStyle, /const LEGACY_GRADIENT_EFFECT_IDS = new Set<string>\(\['gradient', 'prism'\]\)/, 'old transition effects convert to a gradient fill')
assert.match(userStyle, /const effectId: NameTextEffectId = isNameAssetEffectId\(rawEffectId\) \? rawEffectId : DEFAULT_NAME_TEXT_EFFECT_ID/, 'users get only animated effects; old CSS effects become a plain style')
assert.match(effects, /export type NameTextCustomColor = `#\$\{string\}`/, 'a free color (#rrggbb) is a valid color id')
assert.match(userStyle, /vars\['--name-fx-tint'\] = `linear-gradient\(100deg, \$\{a\}, \$\{b\}\)`/, 'effect color travels with the transition variable')
assert.match(userStyle, /if \(worst >= 2\.2\) return null/, 'the contrast shield kicks in only when the color is very close to the ground')
assert.match(css, /\.name-fx-asset\.name-fx-tinted::before \{[\s\S]{0,200}background-blend-mode: color, normal;[\s\S]{0,200}mask: var\(--name-fx-image, none\)/, 'efekt boyanirken isik / doku korunur, saydam yerler maskelenir')
assert.match(css, /\.name-guard \{\s+-webkit-text-stroke: 0\.07em var\(--name-guard\);/, 'kontrast kalkani: zit tonda ince kontur')
assert.match(registry, /background-blend-mode:color,normal/, 'ic katman efekt de boyanabilir')
const studio = read('src/pages/profile/UserNameStyleStudio.tsx')
assert.match(studio, /data-user-name-style-studio/, 'the new name style editor on the profile')
assert.match(studio, /\{ value: 'original', label: 'Orijinal' \}, \{ value: 'name', label: 'İsmimle aynı' \}, \{ value: 'custom', label: 'Özel' \}/, 'efekt rengi secenekleri')
assert.match(studio, /<ProfileThemeBackdrop theme=\{theme\}/, 'preview with the profile theme')
assert.match(read('src/pages/profile/useProfilePageDerived.ts'), /guardSurfaces: themeSurfaces/, 'the name in the profile header gets a contrast shield by theme')

console.log('PASS name style: inner layer effect, motion and name style in comments')
