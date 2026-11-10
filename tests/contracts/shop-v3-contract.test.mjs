import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { untranslate } from './i18n-source.mjs'

// Shop v3: from-scratch product / season / campaign / discount / bundle model and Shop Control.
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))

// --- Data model and purchase safety ----------------------------------------------------------
const core = read('supabase/migrations/20260930170000_shop_v3_core.sql')
for (const table of ['shop_products', 'shop_product_grants', 'shop_seasons', 'shop_campaigns', 'shop_discounts', 'shop_orders', 'shop_wishlist', 'shop_reminders']) {
  assert.ok(core.includes(`create table public.${table}`), `the ${table} table exists`)
}
assert.match(core, /execute format\('revoke all on public\.%I from anon, authenticated', v_table\)/, 'no direct access to shop tables (RPC only)')
assert.match(core, /unique \(buyer_user_id, request_key\)/, 'purchase is idempotent (buyer + request key)')
assert.match(core, /perform 1 from public\.users u where u\.id in \(v_buyer_id, v_recipient_id\) order by u\.id for update/, 'gift lock order is fixed (no deadlock)')
assert.match(core, /set_config\('app\.store_purchase_user_update', 'true', true\)/, 'balance / inventory update through the path the user trigger allows')
assert.match(core, /v_quote := app_private\.shop_quote\(p_product_id, v_buyer_id, v_recipient_id\)/, 'price on the server, computed by recipient')
assert.match(core, /order by c\.price asc, case c\.source when 'list' then 0 else 1 end/, 'indirimler ust uste binmez: en dusuk aday uygulanir')
assert.match(core, /v_product\.bundle_mode = 'proportional'[\s\S]{0,120}v_total - v_owned_count/, 'pakette sahip olunan parcalar oranla dusulur')
assert.match(core, /if app_private\.shop_owns_item\(v_owned, v_grant\.type, v_grant\.identifier\) then\s+continue;/, 'an item the recipient holds is not given again')
assert.match(core, /when p\.season_id is not null and coalesce\(s\.status, 'draft'\) <> 'published' then 'draft'/, 'a product of an unpublished season is not sold')
assert.match(core, /case when x\.locked then null else p\.title end/, 'a hidden product name is not shown before release')

const admin = read('supabase/migrations/20260930171000_shop_v3_admin.sql')
assert.match(admin, /if not app_private\.is_admin\(\) then\s+raise exception/, 'Shop Control RPCs are admin only')
assert.match(admin, /raise exception 'Satilmis urun silinemez; arsivleyin\.'/, 'a sold product is not deleted')
assert.match(admin, /raise exception 'Iade nedeni zorunludur\.'/, 'iade nedeni zorunlu')
assert.match(admin, /if v_frame = v_item ->> 'identifier' then v_frame := 'default'; end if;/, 'iadede kusanilmis cerceve cikarilir')

const cosmetics = read('supabase/migrations/20260930172000_shop_v3_cosmetics.sql')
assert.match(cosmetics, /create policy store_items_select_public on public\.store_items\s+for select to anon, authenticated using \(true\)/, 'cosmetic definitions are public (a cosmetic off sale still shows for its owner)')
assert.match(cosmetics, /v_identifier, v_type, 0, 'Coin',[\s\S]{0,80}false/, 'a new cosmetic cannot sell through the old purchase path (is_active false)')
assert.match(read('supabase/migrations/20260930173000_shop_v3_reminders.sql'), /cron\.schedule\('shop-v3-reminders'/, 'reminders go out with a scheduled job')

// --- Okur arayuzu --------------------------------------------------------------------------
const app = read('src/App.tsx')
assert.match(app, /path='magaza\/\*' element=\{<ShopPage \/>\}/, 'shop v3 route')
const shopPage = read('src/pages/ShopPage.tsx')
for (const route of ["path='katalog'", "path='urun/:slug'", "path='sezon/:slug'", "path='premium'"]) {
  assert.ok(shopPage.includes(route), `the ${route} route exists`)
}
assert.match(shopPage, /path='goz-at\/cerceveler' element=\{<LegacyRedirect/, 'old shop links do not break')
assert.match(shopPage, /path='one-cikanlar' element=\{<LegacyRedirect to='\/magaza' \/>\}/, 'the old featured path redirects to the showcase')
assert.match(shopPage, /path='kesfet' element=\{<LegacyRedirect to='\/magaza\/katalog' \/>\}/, 'the old explore path redirects to the catalog')
// From-scratch shop: the old shop pages, studio and test prototypes are not in the app.
for (const legacy of ['StorePage', 'StoreComponentsLabPage', 'StoreComponentSandboxPage', 'StoreExploreSandboxPage', 'TestStorePage', "path='admin/studio'"]) {
  assert.ok(!app.includes(legacy), `${legacy} kaldirildi`)
}
// RPCs selling at the old store_items price are closed to clients; the only purchase door is shop_purchase.
const retire = read('supabase/migrations/20260930180000_shop_v3_retire_legacy_purchase.sql')
for (const fn of ['purchase_store_item', 'purchase_store_package', 'gift_store_item', 'gift_store_package', 'gift_premium']) {
  assert.ok(retire.includes(`'${fn}'`), `${fn} kapatildi`)
}
assert.match(read('src/components/community/useCommunityPremiumUnlock.ts'), /purchaseShopProduct\(\{/, 'community premium unlock buys through shop v3')
const dialog = read('src/pages/shop/ShopPurchaseDialog.tsx')
assert.match(dialog, /const requestKey = useMemo\(\(\) => \(open \? newRequestKey\(\) : ''\), \[open\]\)/, 'a double click makes one order (one key per window)')
assert.match(dialog, /quoteShopProduct\(card\.id, target\)/, 'gift price follows the recipient inventory')
// A frame is previewed with the reader's own avatar (live card scene and Shop Control preview).
assert.match(read('src/pages/shop/shopViewer.ts'), /avatar: currentUser\.avatar,/, 'the shop preview identity is the reader own avatar')
assert.match(read('src/pages/shop/ShopFrameStage.tsx'), /<AvatarFrame\s+key=\{`\$\{grant\.id\}-\$\{playSession\}`\}\s+src=\{viewer\.avatar\}/, 'a frame card replays with the reader own avatar while live')
assert.match(read('src/pages/shop/ShopPreview.tsx'), /src=\{currentUser\?\.avatar\}/, 'in the Shop Control preview the frame uses the reader own avatar')
// Reader-side purchase through one door: cards and premium open the same window.
for (const file of ['src/pages/shop/ShopShowTile.tsx', 'src/pages/shop/ShopPremiumView.tsx', 'src/pages/shop/ShopProductView.tsx']) {
  assert.match(read(file), /<ShopPurchaseDialog/, `${file} purchases through ShopPurchaseDialog`)
  assert.doesNotMatch(read(file), /purchaseShopProduct\(/, `${file} satin alma RPC'sini dogrudan cagirmaz`)
}

// --- Magaza Kontrol --------------------------------------------------------------------------
assert.match(read('src/pages/AdminPage.tsx'), /<AdminShopSection \/>/, 'admin shop section is Shop Control')
const section = read('src/components/admin/shop/AdminShopSection.tsx')
for (const tab of ['overview', 'products', 'merch', 'discounts', 'bundles', 'schedule', 'economy', 'orders']) {
  assert.ok(section.includes(`id: '${tab}'`), `the ${tab} tab exists`)
}
assert.doesNotMatch(read('src/pages/admin/adminNavigation.ts'), /id: 'studio'/, 'the old Studio menu is gone')
assert.match(dialog, /<Link to=\{STORE_RULES_PATH\}/, 'the purchase window is tied to shop rules')
const premiumSettings = read('supabase/migrations/20260930181000_shop_v3_premium_settings.sql')
assert.match(premiumSettings, /p_unlock_delay_hours not between 0 and 168/, 'premium early access duration is limited')
assert.match(read('src/components/admin/shop/AdminShopSection.tsx'), /\{tab === 'premium' && <ShopAdminPremiumPerks \/>\}/, 'premium perks (including early access) under Shop Control > Premium')

// New cosmetic record: no NULL into NOT NULL columns (description, card loop); the effect's media
// info and single-layer manifest are saved (with an empty manifest the old 'screen' template breaks transparent PNG).
const cosmeticFix = read('supabase/migrations/20261007182806_shop_create_cosmetic_fix.sql')
assert.match(cosmeticFix, /btrim\(coalesce\(p ->> 'description', ''\)\)/, 'description is empty text, not NULL')
assert.doesNotMatch(cosmeticFix, /nullif\(btrim\(coalesce\(p ->> 'description'/, 'no NULL into description')
assert.match(cosmeticFix, /item_id, poster_asset_url, card_loop_asset_url, profile_asset_url, profile_loop_asset_url,\s+hover_asset_url, hover_loop_asset_url, media_meta, effect_manifest/, 'efektin zorunlu kolonlari dolu')
assert.match(cosmeticFix, /jsonb_typeof\(p -> 'effectManifest'\) = 'object'/, 'manifest is an object only')
const creator = read('src/components/admin/shop/ShopAdminCosmeticCreator.tsx')
assert.match(creator, /effectManifest: buildSingleLayerEffectManifest\(/, 'the creator sends the manifest')
assert.match(creator, /mediaMeta = \{ \.\.\.mediaMeta, \.\.\.uploaded\.mediaMetaPatch \}/, 'the creator sends media info')
assert.match(creator, /value: 'normal', label: 'Şeffaf görsel \(normal\)'/, 'a transparent effect draws with normal blending')
for (const file of ['functions/_shared/storage-upload-r2.js', 'functions/_shared/storage-upload.js']) {
  assert.match(read(file), /\['video', 'animated-image', 'static-image'\]\.includes\(normalizedUpload\.mediaKind\)/, `${file}: a static transparent layer can load as an effect`)
}

// Discord-style intro: first an intro that plays once, then a loop. The intro timer starts when media loads.
const introSql = read('supabase/migrations/20261007190306_shop_cosmetic_effect_intro.sql')
assert.match(introSql, /v_intro text := nullif\(p ->> 'introUrl', ''\);/)
assert.match(introSql, /v_id, v_poster, v_intro, v_loop, v_poster, v_intro, v_profile, v_poster, v_intro, v_loop,/, 'intro writes to card / profile / hover intro columns')
assert.match(creator, /\{ key: 'intro', label: 'Giriş animasyonu'/, 'an intro slot in the creator')
assert.match(read('src/services/profileEffectManifest.ts'), /timeline\.push\(\{ id: 'intro', label: 'Giris', mode: 'once'/, 'the intro is a play-once block')
const effectRenderer = read('src/components/profileEffects/ProfileEffectManifestRenderer.tsx')
assert.match(effectRenderer, /if \(!active \|\| !visible \|\| !loaded \|\| preload \|\| block\.mode === 'loop'\) return undefined/, 'the intro layer does not hide before loading (the preloaded layer too)')
assert.match(effectRenderer, /if \(readyKey !== `\$\{blockIndex\}:\$\{cycleKey\}`\) return undefined/, 'block transition starts when media loads')

// Intro -> loop transition: the next block loads invisibly while the intro plays and the transition uses the same element
// (single list + cycleKey unchanged); a play-once layer leaves no empty frame before the transition.
assert.match(effectRenderer, /const nextBlock = currentBlock\?\.mode === 'once' \? timeline\[blockIndex \+ 1\] \?\? null : null/, 'the next block preloads')
assert.match(effectRenderer, /opacity: preload \? 0 : layer\.opacity/, 'the preloaded layer is invisible')
assert.doesNotMatch(effectRenderer, /setCycleKey\(\(current\) => current \+ 1\)\s*\n\s*setBlockIndex\(nextBlockIndex\)/, 'block transition does not recreate the element')
assert.match(effectRenderer, /getProfileEffectLayerDurationMs\(layer\) \+ ONCE_LAYER_GRACE_MS/, 'the intro layer does not hide before the transition')

// Shop v3 cosmetics open with is_active = false; profile effect equipping must not look for is_active
// (ownership only). Activating records would open the old fansub purchase path at 0 Coin.
const equipFix = read('supabase/migrations/20261008130000_profile_effect_equip_v3.sql')
assert.ok(equipFix.includes(String.raw`and type = ''profile_effect'')\s+and is_active = true'`), 'efekt sorgusundaki is_active cikarilir')
assert.match(equipFix, /raise exception 'update_my_profile_customization: efekt is_active deseni bulunamadi/, 'does not pass silently without the pattern')
assert.doesNotMatch(equipFix, /update public\.store_items set is_active/, 'cosmetics are not activated (old purchase path)')

// Eski fansub satin alma yollari v3 kozmetiklerini satamaz (store_items.price v3'te 0).
const legacyGuard = read('supabase/migrations/20261008190000_legacy_fansub_purchase_v3_guard.sql')
assert.match(legacyGuard, /array\['purchase_fansub_store_item', 'purchase_fansub_store_item_with_user_wallet'\]/, 'both old fansub paths too')
assert.ok(legacyGuard.includes('and not exists (select 1 from public.shop_product_grants g where g.store_item_id = p_item_id)'), 'v3 product content is not sold')
assert.match(legacyGuard, /urun sorgusu deseni bulunamadi, degisiklik yapilmadi/, 'does not pass silently without the pattern')

console.log('PASS shop v3 (model, purchase security, reader UI, Shop Control)')
