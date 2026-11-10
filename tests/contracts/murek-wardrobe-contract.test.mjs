import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Mürek Closet: cosmetic colors/accessories. Coins come from the same balance and are written to the ledger; an unowned
// piece cannot be equipped; catalog and ownership tables are closed to clients.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const require = createRequire(import.meta.url)

function loadTs(path, resolve = () => ({})) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)(resolve, exports)
  return exports
}

// --- Veritabani ---------------------------------------------------------------------------
const sql = read('supabase/migrations/20261005130000_murek_wardrobe.sql')
assert.match(sql, /revoke all on table public\.murek_items from public, anon, authenticated;/)
assert.match(sql, /revoke all on table public\.user_murek from public, anon, authenticated;/)
assert.match(sql, /perform 1 from public\.users u where u\.id = v_user_id for update;/, 'bakiye satiri kilitli')
assert.match(sql, /if v_balance < v_item\.price then\s*raise exception 'MUREK_INSUFFICIENT_COIN'/)
assert.match(sql, /raise exception 'MUREK_ITEM_OWNED'/, 'the same item is not sold twice')
assert.match(sql, /'murek_item', v_user_id::text \|\| ':' \|\| v_item\.id, 'debit', 'Coin', -v_item\.price/, 'ledger debit, idempotent ref')
assert.match(sql, /perform set_config\('app\.store_purchase_user_update', 'true', true\);/)
assert.equal((sql.match(/raise exception 'MUREK_ITEM_NOT_OWNED'/g) ?? []).length, 2, 'color and accessory ownership check')
assert.match(sql, /grant execute on function public\.buy_murek_item\(text\) to authenticated;/)
assert.doesNotMatch(sql, /grant execute on function public\.buy_murek_item\(text\) to anon/, 'a guest cannot buy')
for (const fn of ['admin_murek_items', 'admin_save_murek_item']) {
  const body = sql.slice(sql.indexOf(`create or replace function public.${fn}`))
  assert.match(body.slice(0, 400), /if not app_private\.is_admin\(\) then/, `${fn} admin only`)
}
assert.match(sql, /Varsayilan renk kapatilamaz\./)
assert.match(sql, /\('mor', 'color', '[^']+', '[^']*(''[^']*)*', 0, 'common'/, 'default purple is a free color')

// --- Istemci: servis ----------------------------------------------------------------------
const service = loadTs('src/services/murekService.ts', (name) => (name === 'zod' ? require('zod') : name === '@/i18n/activeLocale' ? { txa: (text) => text } : {}))
const shop = service.parseMurekShop({
  items: [{ id: 'tac', kind: 'accessory', name: 'Taç', price: 600, rarity: 'epic', data: {} }],
  owned: ['mor'],
  look: { color: 'gece', colorHex: '#3b5bdb', animated: null, accessory: null },
  balance: 120,
})
assert.equal(shop.items[0].isActive, true)
assert.equal(service.parseMurekShop({ items: [], owned: [], look: { colorHex: 'kirmizi' }, balance: 0 }).look.colorHex, '#7c6cff', 'a broken color falls to the default')
const base = service.DEFAULT_MUREK_LOOK
assert.equal(service.previewMurekLook(base, shop.items[0]).accessory, 'tac', 'aksesuar denenir')
assert.equal(service.previewMurekLook(base, { id: 'gokkusagi', kind: 'color', data: { hex: '#ff5a5a', animated: 'rainbow' } }).animated, 'rainbow')
assert.equal(service.previewMurekLook(base, shop.items[0]).accessoryName, 'Taç', 'the tried item name goes to the hint')
assert.equal(service.parseMurekLook({ color: 'mor', colorHex: '#7c6cff' }).colorName, null, 'an old response has no name')
assert.equal(await service.getUserMurekCached('demo-user'), service.DEFAULT_MUREK_LOOK, 'a non-uuid id sends no request')
assert.equal(service.toMurekErrorMessage(new Error('MUREK_INSUFFICIENT_COIN')).startsWith('Coinin yetmiyor'), true)

// --- Piksel aksesuarlar: her parca cizilir, izgaradan tasmaz ----------------------------------
const sprite = loadTs('src/components/murek/murekSprite.ts')
for (const id of ['bere', 'fiyonk', 'atki', 'gozluk', 'kulaklik', 'tac']) {
  const pixels = sprite.murekAccessoryPixels(id)
  assert.ok(pixels.length > 0, `${id} has a drawing`)
  for (const [x, y, color] of pixels) {
    assert.ok(x >= 0 && x < 16 && y >= -4 && y < 16, `${id} piksel sinirda`)
    assert.match(color, /^#[0-9a-f]{6}$/i)
  }
  assert.ok(sprite.murekFrame('happy', 0, id).some(([, , paint]) => String(paint).startsWith('#')), 'tuval aksesuari cizer')
}
for (const id of ['bere', 'fiyonk', 'atki', 'gozluk', 'kulaklik', 'tac']) {
  assert.match(read('supabase/migrations/20261005130000_murek_wardrobe.sql'), new RegExp(`\\('${id}', 'accessory'`), `${id} katalogda`)
}

// --- Baglantilar --------------------------------------------------------------------------
assert.match(read('src/pages/ShopPage.tsx'), /<Route path='murek' element=\{<ShopMurekView \/>\} \/>/)
assert.match(read('src/pages/shop/ShopHeader.tsx'), /to: '\/magaza\/murek'/)
assert.match(read('src/pages/shop/ShopRail.tsx'), /to: '\/magaza\/murek', label: txa\('Mürek Dolabı'\)/)
assert.match(read('src/components/games/ArcadeKit.tsx'), /<MyMurek key=\{reactionKey\}/, 'the user Murek in games')
assert.match(read('src/pages/games/MurekRunPage.tsx'), /murekFrame\([^)]*colors\.accessory\)/, 'kosuda kusanilan aksesuar')
// The user's Mürek on the profile and hover card (a live look on your own card + a Closet link)
const buddy = read('src/components/murek/UserMurekBuddy.tsx')
assert.match(buddy, /useMyMurekLook\(isOwn \? userId : null\)/, 'a live look on your own card')
assert.match(buddy, /getUserMurekCached\(userId\)/, 'another user Murek look is cached')
assert.match(buddy, /<Link to='\/magaza\/murek'/, 'kendi Murek ikonundan Dolaba')
assert.match(read('src/pages/profile/ProfileIdentityShowcase.tsx'), /<UserMurekBuddy userId=\{user\.id\} isOwn=\{isOwnProfile\}/)
assert.match(read('src/components/common/UserHoverCardSurface.tsx'), /<UserMurekBuddy userId=\{userId\} isOwn=\{isOwnHoverProfile\}/)
assert.match(read('src/components/common/UserHoverCard.tsx'), /userId=\{resolvedUserId \|\| null\}/)
assert.match(read('src/components/admin/games/AdminGamesSection.tsx'), /<AdminMurekWardrobe \/>/)

console.log('PASS Murek Wardrobe: catalog, purchase, equip, pixel accessories, Murek on the profile card and links')
