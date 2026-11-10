import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { untranslate } from './i18n-source.mjs'

// Premium perks: each perk turns on/off from Shop Control and a disabled perk is not applied
// on the server (not just hidden from the UI).
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))

const migration = read('supabase/migrations/20261001140000_premium_perks.sql')
assert.match(migration, /create table if not exists public\.premium_perks/, 'ayricalik tablosu')
assert.match(migration, /revoke all on public\.premium_perks from anon, authenticated/, 'no direct table access')
assert.match(migration, /where p\.key = p_key\), false\)/, 'an unknown perk counts as off')
for (const key of ['early_access', 'name_style', 'name_effects', 'custom_background', 'hover_theme', 'fansub_expressions', 'premium_badge', 'premium_exclusives', 'member_pricing', 'coin_bonus', 'shop_early_access']) {
  assert.match(migration, new RegExp(`\\('${key}', (true|false), `), `${key} tohumlanir`)
}
assert.match(migration, /\('member_pricing', false, /, 'member price off by default (admin turns it on)')
for (const fn of ['shop_admin_premium_perks', 'shop_admin_save_premium_perk']) {
  const body = migration.slice(migration.indexOf(`function public.${fn}`))
  assert.match(body.slice(0, 600), /perform app_private\.shop_assert_admin\(\)/, `${fn} admin only`)
}
assert.match(migration, /grant execute on function public\.premium_perks_public\(\) to anon, authenticated/, 'state is public')

// Sunucu uygulamasi
assert.match(migration, /if not app_private\.premium_perk_enabled\('early_access'\) then\s+return p_publish_at;/, 'early access off: no delay')
assert.match(migration, /or not app_private\.premium_perk_enabled\('custom_background'\)\s+\)\s+then null/, 'background off: an uploaded background does not show')
assert.match(migration, /when not app_private\.premium_perk_enabled\('name_style'\) then null/, 'name style off: the style does not show')
assert.match(migration, /like 'fx-%' and not app_private\.premium_perk_enabled\('name_effects'\)/, 'animasyonlu efekt ayri kapatilir')
assert.match(migration, /app_private\.premium_perk_enabled\('hover_theme'\)\s+and app_private\.is_valid_hover_theme/, 'theme off: the hover theme does not show')
assert.match(migration, /if not app_private\.premium_perk_enabled\('fansub_expressions'\) then\s+raise exception/, 'expressions off: tokens cannot be written')
assert.match(migration, /raise exception 'Premium ozellik yamasi uygulanamadi/, 'an in-place patch is validated (no silent empty patch)')
assert.match(migration, /drop function app_private\.premium_perks_patch_function/, 'the patch helper is not durable')
assert.match(migration, /select 'member'::text[\s\S]{0,400}where p_is_premium\s+and pr\.kind <> 'premium'\s+and app_private\.premium_perk_enabled\('member_pricing'\)/, 'member price is a candidate only for Premium and when on')
assert.match(migration, /'memberPrice', v_member_price/, 'a "with Premium" price for non-Premium users')
assert.match(migration, /audience = 'premium' and not app_private\.premium_perk_enabled\('premium_exclusives'\)/, 'Premium-only products can be closed')
assert.match(migration, /if v_state <> 'live' and not v_early then/, 'shop early access is Premium only')
assert.match(migration, /source_kind = 'premium_coin_bonus' and l\.source_ref = v_ref/, 'coin bonusu idempotent')
for (const table of ['reading_streak_reward_claims', 'user_reward_task_claims', 'quest_progress']) {
  assert.match(migration, new RegExp(`create trigger trg_premium_coin_bonus after insert[a-z_ ]* on public\\.${table}`), `bonus on the ${table} reward`)
}

// Istemci
const catalog = read('src/data/premiumPerks.ts')
assert.match(catalog, /whenOff: string/, 'the admin sees what happens when each perk is off')
const perks = read('src/lib/premiumPerks.ts')
assert.match(perks, /supabase\.rpc\('premium_perks_public'\)/, 'state via RPC')
assert.match(read('src/components/admin/shop/AdminShopSection.tsx'), /id: 'premium', label: 'Premium'/, 'Shop Control > Premium tab')
assert.match(read('src/components/admin/shop/ShopAdminPremiumPerks.tsx'), /setPremiumPerks\(data\)/, 'UI state refreshes after saving')
const editDialog = read('src/pages/profile/ProfileEditDialog.tsx')
for (const key of ['hover_theme', 'name_style', 'custom_background']) {
  assert.match(editDialog, new RegExp(`premiumPerks\\.isEnabled\\('${key}'\\)`), `profile edit follows the ${key} state`)
}
assert.match(read('src/components/common/PremiumCrownBadge.tsx'), /usePremiumPerk\('premium_badge'\)/, 'the badge can be turned off')
assert.match(read('src/components/common/NameStylePickerPanel.tsx'), /assetEffectsEnabled && assetEffects\.length > 0/, 'the animated effect section is tied to the perk')
assert.match(read('src/components/community/CommunityExpressionPicker.tsx'), /fansubExpressionsEnabled \? fansubSources : \[\]/, 'ifade secici ayricaliga bagli')
assert.match(read('src/pages/shop/ShopPrice.tsx'), /data-shop-member-price/, 'a "with Premium" price on the card')

console.log('PASS premium perks (admin managed, enforced on the server, UI aligned)')
