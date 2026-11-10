import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (relativePath) => readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

const lockdown = read('supabase/migrations/20261103160000_coin_codes_rls_lockdown.sql')
const redeemSql = read('supabase/migrations/20261103161000_coin_codes_redeem_v3.sql')
const client = read('src/services/redeemCodeService/redeem.ts')

// Codes are read only by admins (the old policy opened active codes to every user).
assert.match(lockdown, /drop policy if exists redeem_codes_select_active on public\.redeem_codes;/)
assert.match(lockdown, /create policy redeem_codes_select_admin on public\.redeem_codes\s+for select to authenticated\s+using \(\(select app_private\.is_admin\(\)\)\);/)
for (const policy of ['user_code_redemptions_insert_rule', 'fansub_code_redemptions_insert_rule', 'redeem_code_attempts_insert_authenticated']) {
  assert.match(lockdown, new RegExp(`drop policy if exists ${policy}`), `${policy} direct writes closed`)
}
assert.match(lockdown, /revoke insert on public\.user_code_redemptions, public\.fansub_code_redemptions, public\.redeem_code_attempts from anon, authenticated;/)

// A failed attempt is saved permanently: a rejected attempt is not rolled back by an exception, success=false returns.
assert.doesNotMatch(redeemSql, /^\s*raise;\s*$/m, 'catching an error and rethrowing rolls back the attempt record')
assert.match(redeemSql, /return jsonb_build_object\('success', false, 'error', v_error, 'error_code', 'rejected'\);/)
assert.match(redeemSql, /insert into public\.redeem_code_attempts \(user_id, code_id, code_key, target_type, fansub_id, is_success, error_message\)/)
// Rate limit and inactive fansub protection.
assert.match(redeemSql, /a\.is_success = false\s+and a\.created_at >= now\(\) - interval '10 minutes';\s+if v_count >= 10 then/)
assert.match(redeemSql, /'rate_limited'/)
assert.match(redeemSql, /f\.id = p_fansub_id and coalesce\(f\.is_active, true\)/)
// A code not found and an inactive code get the same message.
assert.match(redeemSql, /if not found or v_code\.is_active is distinct from true then\s+v_error := 'Geçersiz kod\. Yazımı kontrol et\.';/)
assert.match(redeemSql, /security definer/)

// A person uses a code only once (balance and fansub vaults together).
const onePerPerson = read('supabase/migrations/20261103170000_coin_codes_one_use_per_person.sql')
assert.match(onePerPerson, /r\.redeemed_by = v_user and r\.code_id = v_code\.id/)
assert.match(onePerPerson, /Bir kod kişi başına bir kez kullanılır\./)

// The client treats a rejection as an error (0 coins is not shown as "success").
assert.match(client, /if \(payload\.success === false\) throw new RedeemRejectedError/)

console.log('PASS coin code security (admin read only, durable attempt record, rate limit)')
