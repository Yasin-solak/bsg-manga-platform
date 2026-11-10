-- Supabase Advisor 0003: updates policy expressions, with equivalent behavior,
-- to compute auth.* and row-independent helper calls once as an initPlan.

alter policy "auth_session_events_select_own"
on public.auth_session_events
using ((select auth.uid()) = auth_user_id);

alter policy "fansub_reward_rank_rules_select_authenticated"
on public.fansub_reward_rank_rules
using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));

alter policy "fansub_reward_tasks_select_authenticated"
on public.fansub_reward_tasks
using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));

alter policy "fansub_reward_view_tiers_select_authenticated"
on public.fansub_reward_view_tiers
using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));

alter policy "reading_streak_reward_rules_select_authenticated"
on public.reading_streak_reward_rules
using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));

alter policy "redeem_code_attempts_insert_authenticated"
on public.redeem_code_attempts
with check ((select auth.uid()) is not null);

alter policy "redeem_codes_select_active"
on public.redeem_codes
using (
  (
    ((select auth.role()) = 'authenticated'::text)
    and (is_active = true)
    and (expires_at > now())
  )
  or (select is_admin())
);

alter policy "user_reward_tasks_select_authenticated"
on public.user_reward_tasks
using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));

alter policy "users_insert_self"
on public.users
with check (((select auth.uid()) is not null) and ((select auth.uid()) = auth_user_id));
