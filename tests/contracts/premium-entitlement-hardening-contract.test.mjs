import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260608235901_premium_entitlement_only_hardening.sql',
  'utf8',
)
const publicOfferSource = readFileSync('src/services/premiumPackagePublicService.ts', 'utf8')
const shopCoreMigration = readFileSync('supabase/migrations/20260930170000_shop_v3_core.sql', 'utf8')
const shopRetireMigration = readFileSync('supabase/migrations/20260930180000_shop_v3_retire_legacy_purchase.sql', 'utf8')
const communityUnlockSource = readFileSync('src/components/community/useCommunityPremiumUnlock.ts', 'utf8')
const profileLoaderSource = readFileSync('src/pages/profile/profilePageLoader.ts', 'utf8')
const nameTextEffectsSource = readFileSync('src/data/nameTextEffects.ts', 'utf8')
const sidebarDataSource = readFileSync('src/components/layout/appSidebar/useAppSidebarData.ts', 'utf8')
const sidebarQuickPanelsSource = readFileSync('src/components/layout/appSidebar/AppSidebarQuickPanels.tsx', 'utf8')

assert.match(migration, /public_unlock_delay_hours = 36/i)
assert.match(migration, /create table if not exists public\.store_purchase_requests/i)
assert.match(migration, /unique \(user_id, request_key\)/i)
assert.match(migration, /create or replace function public\.purchase_store_item\(p_item_id uuid, p_request_key uuid\)/i)
assert.match(migration, /revoke execute on function public\.purchase_store_item\(uuid\) from anon, authenticated, public/i)
assert.match(migration, /when p_publish_at > now\(\) then false/i)
assert.doesNotMatch(migration, /insert into public\.user_premium_reward_events/i)
assert.doesNotMatch(migration, /insert into public\.user_badges/i)
assert.doesNotMatch(migration, /premium_compensation_coins/i)
assert.doesNotMatch(migration, /premium_reward/i)

assert.match(migration, /visible_profile_background_type/i)
assert.match(migration, /cleanup_my_expired_premium_profile_state/i)
assert.match(migration, /public\.update_my_profile_customization\(false, null, true, null, false, null, null\)/i)
assert.match(profileLoaderSource, /isUploadedProfileBackgroundRef/)
assert.match(profileLoaderSource, /&& !baseProfileUser\.isPremiumActive/)

assert.match(migration, /text_has_fansub_supporter_asset_token/i)
assert.match(migration, /enforce_premium_supporter_expression_usage/i)
assert.match(migration, /trg_community_posts_premium_supporter_expression/i)
assert.match(migration, /trg_community_comments_premium_supporter_expression/i)
assert.match(migration, /trg_manga_comments_premium_supporter_expression/i)
assert.match(migration, /trg_user_manga_list_comments_premium_supporter_expression/i)

assert.match(publicOfferSource, /publicUnlockDelayHours: number/)
assert.doesNotMatch(publicOfferSource, /premiumBadge/)
assert.doesNotMatch(publicOfferSource, /randomRewardPoolTypes/)
assert.doesNotMatch(publicOfferSource, /compensationCoins/)

// Shop v3: premium only extends time (no cosmetic / badge / Coin compensation); purchase is idempotent.
assert.match(shopCoreMigration, /v_premium_start := greatest\(now\(\), coalesce\(v_recipient\.premium_expires_at, now\(\)\)\)/)
assert.match(shopCoreMigration, /v_premium_end := v_premium_start \+ make_interval\(days => v_product\.premium_days\);\s+else\s+for v_grant in/)
assert.match(shopCoreMigration, /unique \(buyer_user_id, request_key\)/)
// The path selling at the old store_items price is closed; the premium unlock also uses the v3 purchase.
assert.match(shopRetireMigration, /'purchase_store_item',[\s\S]*'gift_premium'/)
assert.match(shopRetireMigration, /revoke execute on function %s from public, anon, authenticated/)
assert.match(communityUnlockSource, /purchaseShopProduct\(\{/)
assert.match(communityUnlockSource, /requestKey: requestKeyRef\.current \|\| newRequestKey\(\)/)
assert.doesNotMatch(communityUnlockSource, /purchaseItem/)
assert.match(nameTextEffectsSource, /parsePremiumExpiryAccess\(/)
assert.doesNotMatch(nameTextEffectsSource, /parseStringList\(payload\.premium\)/)
assert.doesNotMatch(nameTextEffectsSource, /ownedPremium\.length/)
assert.doesNotMatch(sidebarDataSource, /ownedPremium/)
assert.doesNotMatch(sidebarQuickPanelsSource, /ownedPremium/)
assert.doesNotMatch(sidebarQuickPanelsSource, /Rozet \+ Premium/)

console.log('PASS premium entitlement-only hardening contract kept')
