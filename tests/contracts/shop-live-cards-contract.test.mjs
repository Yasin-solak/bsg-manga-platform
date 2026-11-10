import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

// Shop live cards and premium live showcase: the design's behavior contract.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const shop = (name) => read(`src/pages/shop/${name}`)

// --- Product card: live scene on top, name / price below; card neutral (color only from the product) --------
assert.ok(!existsSync(new URL('../../src/pages/shop/ShopProductCard.tsx', import.meta.url)), 'the single general 5:4 card was removed')
const tile = shop('ShopShowTile.tsx')
for (const [type, stage] of [['frame', 'ShopFrameStage'], ['background', 'ShopBackgroundStage'], ['profile_effect', 'ShopEffectStage']]) {
  assert.match(tile, new RegExp(`card\\.type === '${type}'\\) return <${stage} `), `${type} kendi canli sahnesiyle`)
}
assert.match(tile, /card\.kind === 'bundle'\) return <ShopBundleStage /, 'a bundle with its own scene (full view)')
assert.match(tile, /if \(card\.locked\) return <ShopLockedStage /, 'a locked product with a silhouette scene')
assert.match(tile, /return card\.type === 'background' \|\| card\.kind === 'bundle' \? 'wide' : 'tall'/, 'cerceve / efekt dik, arka plan / paket genis')
// User decision: no color on cards (rarity glow, colored strip, colored price / button).
assert.doesNotMatch(tile, /rarity\.glow|rarity\.bar|rarity\.ink|amber-|rose-|violet-|primary/, 'neutral card: color only from the product itself')
const catalog = shop('ShopCatalogView.tsx')
assert.match(catalog, /grid-flow-dense/, 'karisik boyutlu katalog izgarasi bosluk birakmadan dolar')
assert.match(catalog, /size === 'wide' && 'col-span-2/, 'wide tile has two columns')

// --- The live layer mounts only while active ------------------------------------------------
for (const [file, layer] of [['ShopFrameStage.tsx', 'frame'], ['ShopBackgroundStage.tsx', 'background'], ['ShopEffectStage.tsx', 'effect'], ['ShopBundleStage.tsx', 'bundle']]) {
  const source = shop(file)
  assert.match(source, new RegExp(`\\{live[^}]*\\(\\s*<div[^>]*data-shop-live-layer='${layer}'`), `${file}: live layer mounts only while live`)
  assert.match(source, /playSession/, `${file}: each entry is a new session (plays from start)`)
}
assert.match(shop('ShopEffectStage.tsx'), /useShopEffectAssets\(grant\.id, live\)/, 'effect assets load only while live')
assert.match(shop('ShopPremiumStage.tsx'), /\{live \? \([\s\S]{0,160}data-shop-live-layer='premium'[\s\S]{0,120}<ShopPremiumName name=\{viewer\.name\} cycle \/>/, 'the premium card returns the reader name with name effects while live')
assert.doesNotMatch(shop('ShopLockedStage.tsx'), /card\.title|grants/, 'a locked card does not reveal the product (no name / asset)')

// --- Video: lazy, first frame without a poster, plays only while live -------------------------
const background = shop('ShopBackgroundStage.tsx')
assert.match(background, /const FIRST_FRAME = '#t=0\.1'/, 'a posterless mp4 is paused on its first frame')
for (const video of background.match(/<video[\s\S]*?\/>/g) ?? []) assert.match(video, /preload='metadata'/, 'her video preload=metadata (lazy)')
assert.match(background, /near && \(\s*<video/, 'an idle video attaches near the viewport')
assert.doesNotMatch(background.split('{live && media')[0], /autoPlay/, 'bosta video oynamaz')

// --- Tek aktif kart, hover-intent, dokunmatik, hareket azaltma, klavye ------------------------
const live = shop('shopLive.ts')
assert.match(live, /export const SHOP_LIVE_HOVER_INTENT_MS = 120/, 'hover-intent 120ms')
assert.match(live, /let liveState: LiveState = \{ id: null, session: 0 \}/, 'single global active card state')
assert.match(live, /if \(liveState\.id === id\) return\s+[\s\S]{0,160}liveState = \{ id, session: liveState\.session \+ 1 \}/, 'a new card becoming active replaces the previous (one active card)')
assert.match(live, /liveState\.id === id \? liveState\.session : 0/, 'only the affected card redraws')
assert.match(live, /const autoplay = !reducedMotion && !options\.disabled/, 'prefers-reduced-motion: no autoplay')
assert.match(live, /rootMargin: SHOP_LIVE_CENTER_BAND/, 'on touch the center card plays with IntersectionObserver')
assert.match(live, /if \(entry && !entry\.isIntersecting\) releaseShopLive\(id\)/, 'an active card leaving the screen is released (video stops)')
assert.match(live, /if \(event\.pointerType === 'touch' \|\| !autoplay\) return\s+activateWithIntent\(\)/, 'mouse comes alive with hover intent; touch hover is not used')
assert.match(live, /onFocus: \(event\) => \{[\s\S]{0,200}activateWithIntent\(\)/, 'keyboard focus acts like hover')
assert.match(live, /manual: reducedMotion \|\| touchOnly/, 'a preview button on touch / reduced motion')
assert.match(tile, /useShopLiveCard<HTMLElement>\(`\$\{card\.id\}:\$\{instanceId\}`\)/, 'one active card even if the same product is on two shelves (instance id)')
assert.match(tile, /\{control\.manual && \(\s*<button[\s\S]{0,120}control\.toggle\(\)/, 'dokununca oynat / durdur')
assert.match(tile, /data-live=\{live \? 'true' : 'false'\}/, 'tile live state is marked')
assert.match(tile, /after:absolute after:inset-0/, 'the whole tile is one link; buttons focus separately')

// --- Premium canli vitrin -----------------------------------------------------------------------
const premium = shop('ShopPremiumView.tsx')
assert.match(premium, /getPublicUnlockDelayHours\(\)/, 'early access time from the service')
assert.match(premium, /const card = data\?\.premium \?\? null/, 'price from the shop v3 premium product')
assert.match(premium, /role='radiogroup' aria-label=\{txa\('Karşılaştır'\)\}/, 'standart sen / premium sen anahtari')
assert.match(premium, /data-shop-premium-cta/, 'sticky price / duration CTA')
assert.match(premium, /campaign\?\.kind === 'premium_month'/, 'monthly premium set from the premium_month campaign')
// Product detail is not a separate page: a window via ?urun=.
assert.match(read('src/pages/ShopPage.tsx'), /<ShopProductModal \/>/, 'product detail opens as a window')
assert.match(read('src/pages/ShopPage.tsx'), /path='urun\/:slug' element=\{<ShopProductRedirect \/>\}/, 'the old product address redirects to the window')
assert.match(tile, /productLink\(card\.slug\)/, 'a tile opens detail in a window on the same page')
assert.match(shop('shopViewer.ts'), /if \(!currentUser\) return SHOP_DEMO_PERSONA/, 'demo persona if signed out')
const parts = shop('ShopPremiumParts.tsx')
// Premium: real parts (not a demo).
assert.match(parts, /<ProfileIdentityShowcase[\s\S]{0,600}profileHeaderNameClassName=\{name\.className\}[\s\S]{0,200}themeColors=\{look\?\.theme \?\? null\}/, 'the reader real profile showcase with the selected name style and theme')
assert.match(parts, /listLatestChaptersWithFansub\(4\)/, 'early access with the latest real chapters')
assert.match(parts, /<FansubSupporterAssetMedia/, 'fansub ifadeleri gercek varliklarla')
assert.match(premium, /fetchPremiumShowcaseExpressions\(12\)/, 'fansublarin gercek ifadeleri')
assert.match(premium, /HOVER_THEME_PRESETS/, 'hover theme with its real options')
assert.match(premium, /<PremiumEffectGallery effects=\{effects\}/, 'animated name effects with the reader name')
assert.doesNotMatch(premium, /amber-|violet-|rose-/, 'the premium page is neutral')
assert.match(shop('shopPremiumShowcase.ts'), /getNameTextEffectClassName\(preset\.effectId\)/, 'name effect with nameTextEffects')
assert.match(shop('shopPremiumShowcase.ts'), /buildNameTextStyleVars\(preset\.colorId, preset\.secondaryColorId\)/, 'name colors with nameTextEffects')

// --- Consistency: showcase, catalog, season, detail and similar products use the same tiles ----
const home = shop('ShopHome.tsx')
assert.match(home, /<ShopShelf[\s\S]{0,80}title=\{TYPE_PLURAL\[shelf\.type\]\}/, 'showcase shelves by type')
// User decision: no try-on booth.
assert.doesNotMatch(home, /Kabin|kabin/, 'no try-on booth in the showcase')
assert.ok(!existsSync(new URL('../../src/pages/shop/ShopKabin.tsx', import.meta.url)), 'no booth component')
assert.match(shop('ShopShelf.tsx'), /<ShopShowTile /, 'raflar vitrin karosuyla')
assert.match(catalog, /<ShopShowTile /, 'katalog vitrin karosuyla')
assert.match(shop('ShopSeasonView.tsx'), /<ShopShelf title='' cards=\{index === 0 \? \[\.\.\.data\.bundles, \.\.\.drop\.items\] : drop\.items\} wrap \/>/, 'season drops in a scrollless grid (bundle in the first batch)')
assert.match(shop('ShopProductView.tsx'), /<ShopShelf title=\{[\s\S]{0,140}cards=\{product\.related\} \/>/, 'similar products shelf')
assert.match(shop('ShopProductView.tsx'), /if \(card\.locked \|\| mode === 'profile'\) \{\s+return <LiveStage/, 'detail scene is the same live scene as tiles')
for (const name of ['ShopHome.tsx', 'ShopCatalogView.tsx', 'ShopSeasonView.tsx', 'ShopProductView.tsx', 'ShopPurchaseDialog.tsx', 'ShopPremiumView.tsx']) {
  assert.doesNotMatch(shop(name), /from '\.\/ShopPreview'/, `${name} genel onizlemeyi kullanmaz`)
}

console.log('PASS shop live tiles (neutral tile, type scenes, one active tile, hover / touch / reduced-motion, premium live showcase)')
