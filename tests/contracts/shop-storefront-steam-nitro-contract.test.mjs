import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Magaza okur tarafi (Steam / Discord esinli): sagda gizlenebilir kategori rayi, one cikanlar vitrini, koleksiyon
// bloklari, Steam satiri raflar, ustte sahne / altta bilgi kartlari, Nitro duzeninde Premium.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const shop = (name) => read(`src/pages/shop/${name}`)

// --- Shell: side rail -----------------------------------------------------------------------
// User decision: categories are not on the left; on the right and hideable.
assert.match(read('src/pages/ShopPage.tsx'), /<\/Routes>\s*<\/div>\s*<ShopRail \/>/, 'kategori rayi icerigin saginda')
const rail = shop('ShopRail.tsx')
for (const group of ['Öne çıkan', 'Profil', 'Premium', 'Hesabım']) assert.ok(rail.includes(`title: txa('${group}')`), `rayda ${group} grubu`)
assert.match(rail, /link\.count === null \|\| link\.count > 0/, 'bos kategori rayda listelenmez')
assert.match(rail, /lg:flex/, 'rail on desktop; top strip tabs on narrow screens')
assert.match(rail, /const COLLAPSE_KEY = 'bsg:shop-rail-collapsed'/, 'ray gizlenebilir, tercih hatirlanir')
assert.match(rail, /if \(collapsed\) \{/, 'an icon strip while hidden')
assert.match(shop('ShopHeader.tsx'), /lg:hidden/, 'on narrow screens sections are in the top strip')

// --- Kesfet ----------------------------------------------------------------------------------
const home = shop('ShopHome.tsx')
assert.match(home, /aria-roledescription='carousel'/, 'one cikanlar donen vitrin')
assert.match(home, /if \(paused \|\| count < 2\) return undefined/, 'vitrin ustune gelince / odakta durur')
assert.match(home, /function CollectionBlock/, 'collection blocks with a theme banner')
assert.match(home, /Tümünü gör \(\{count\}\)/, 'raflarda "Tumunu gor (N)"')
assert.match(home, /function PremiumBand[\s\S]{0,200}usePremiumPerks\(\)/, 'the Premium band counts only enabled perks')

// --- Kart ------------------------------------------------------------------------------------
const tile = shop('ShopShowTile.tsx')
assert.match(tile, /data-shop-card-media/, 'product scene on the card')
// Discord card: a single product is square, the scene fills the card; when live the price line becomes a buy button.
assert.match(tile, /tall: 'aspect-square'/, 'a single product card is square (no empty area)')
assert.match(tile, /Coin ile al/, 'on hover "Buy with X Coin"')
assert.match(shop('ShopFrameStage.tsx'), /export function ShopFrameAvatar/, 'a frame on the avatar (default when idle, the reader avatar while live)')
assert.match(shop('ShopBundleStage.tsx'), /function EffectCard/, 'bundle: frames with the avatar, effect on the mini profile card')
assert.match(tile, /card\.quote\.memberPrice !== null/, 'a "with Premium" price on the card (if member price is on)')
assert.match(tile, /card\.quote\.earlyAccess/, 'Premium shop early access is marked on the card')
assert.match(shop('ShopShelf.tsx'), /uppercase tracking-\[0\.08em\]/, 'Steam satiri: buyuk harfli raf basligi')
// User decision: no scrolling row; as many cards as fit, the rest under "See all".
for (const name of ['ShopShelf.tsx', 'ShopHome.tsx']) assert.doesNotMatch(shop(name), /overflow-x-auto/, `${name}: no horizontal scroll`)
assert.match(shop('ShopShelf.tsx'), /const visible = wrap \? cards : takeRow\(cards, columns\)/, 'single row: only fitting cards render, no scrollbar')
// Banners are dark: collection / season blocks are a dark island on every theme (not faded on the light theme).
assert.match(home, /<section className='dark relative isolate[^']*' data-shop-collection/, 'koleksiyon blogu koyu ada')
assert.match(shop('ShopSeasonView.tsx'), /<section className='dark relative isolate/, 'sezon basligi koyu ada')
// Theme colors are oklch: hsl(var(--x)) is invalid and the browser silently drops it.
for (const name of ['ShopHome.tsx', 'ShopShowTile.tsx', 'ShopFrameStage.tsx', 'ShopBundleStage.tsx', 'ShopEffectStage.tsx', 'ShopSeasonView.tsx', 'ShopPremiumView.tsx', 'ShopLockedStage.tsx']) {
  assert.doesNotMatch(shop(name), /hsl\(var\(--/, `${name}: an oklch theme variable is not used inside hsl()`)
}
assert.match(shop('ShopEffectStage.tsx'), /ambient && poster/, 'the profile effect fits the card exactly, sides get ambient light')

// --- Katalog -------------------------------------------------------------------------------
const catalog = shop('ShopCatalogView.tsx')
assert.match(catalog, /data-shop-catalog-toolbar/, 'katalog filtreleri ust arac cubugunda')
assert.match(catalog, /function pageTitle/, 'raydan gelinen kategori basligi')

// --- Premium (Nitro) ---------------------------------------------------------------------------
const premium = shop('ShopPremiumView.tsx')
assert.match(premium, /const enabledPerks = PREMIUM_PERKS\.filter\(\(perk\) => on\(perk\.key\)\)/, 'only enabled perks are described')
assert.match(premium, /data-premium-plans/, 'Standard / Premium plan cards')
assert.match(premium, /data-premium-bento=\{perk\}/, 'shop benefits in bento cards')
assert.match(premium, /data-premium-feature=\{id\}/, 'rotating "best of Premium" sections')
assert.match(premium, /on\('member_pricing'\) && \(/, 'member price card only if on')
assert.match(premium, /Tek plan var: 30 gün/, 'single plan: 30 days')

// --- Istek listesi indirim bildirimi ------------------------------------------------------------
const wishlist = read('supabase/migrations/20261001150000_shop_wishlist_sale_notify.sql')
assert.match(wishlist, /cron\.schedule\('shop-v3-wishlist-sales'/, 'wishlist discounts with a scheduled job')
assert.match(wishlist, /\(v_quote ->> 'source'\) in \('discount', 'daily_deal'\)/, 'a member price alone does not trigger a discount notification')
assert.match(wishlist, /v_row\.sale_notified_price is null or v_price < v_row\.sale_notified_price/, 'no repeat notification for the same discount')

console.log('PASS shop Steam / Nitro layout (rail, showcase, collection, card, catalog, Premium, wishlist notification)')
