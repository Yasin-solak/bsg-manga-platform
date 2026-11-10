-- Coin code security fix (1/2): table access.
--
-- THE HOLE: redeem_codes_select_active let EVERY signed-in user read all active
-- unexpired codes (REST listing redeem_codes?select=code let all
-- be used). Code read
-- is now admin only; user-side redeem runs through security definer
-- app_private.redeem_coin_code and needs no table
-- read.
--
-- Also direct INSERT policies are removed: user_code_redemptions /
-- fansub_code_redemptions rows are written only in the redeem function;
-- anyone could add fake attempts to redeem_code_attempts (even as another user)
-- (polluting anomaly tracking). All functions writing to these tables
-- are security definer.

drop policy if exists redeem_codes_select_active on public.redeem_codes;
drop policy if exists redeem_codes_select_admin on public.redeem_codes;
create policy redeem_codes_select_admin on public.redeem_codes
  for select to authenticated
  using ((select app_private.is_admin()));

drop policy if exists user_code_redemptions_insert_rule on public.user_code_redemptions;
drop policy if exists fansub_code_redemptions_insert_rule on public.fansub_code_redemptions;
drop policy if exists redeem_code_attempts_insert_authenticated on public.redeem_code_attempts;

revoke insert on public.user_code_redemptions, public.fansub_code_redemptions, public.redeem_code_attempts from anon, authenticated;
revoke all on public.redeem_codes from anon;
