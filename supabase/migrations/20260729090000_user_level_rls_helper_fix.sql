-- ============================================
-- Level engine RLS helper fix
-- Date: 2026-07-29
--
-- Root cause: three policies in 20260718062710 call public.is_admin() and
-- public.current_public_user_id() directly. Migration 208 took EXECUTE on these two functions
-- from anon/authenticated (only service_role left);
-- policy expressions evaluate with the CALLER permission, so as soon as a client role
-- touches these tables it gets "permission denied for function is_admin".
--
-- Live evidence (anon, before the fix):
-- user_level_rulesets   -> 42501 permission denied for function is_admin
-- user_level_thresholds -> 42501 permission denied for function is_admin
-- user_level_snapshots  -> 42501 permission denied for function current_public_user_id
--
-- It does not blow up today because all reads pass through SECURITY DEFINER RPCs
-- (get_public_user_progression / get_my_user_progression / get_admin_*).
-- But 20260718062710 gives `grant select ... to anon, authenticated` on the same tables:
-- these grants are effectively dead and the first direct client query errors
-- on live. The same class of bug happened twice in 267->270 (push_subscriptions) and 196->272
-- (legal_requests).
--
-- Fix: policies move to app_private wrappers (granted to anon+authenticated
-- +service_role, definer). Access semantics stay EXACTLY the same:
-- an inactive ruleset shows only to admins, a snapshot to its owner and admins.
-- ============================================

begin;

drop policy if exists user_level_rulesets_read on public.user_level_rulesets;
create policy user_level_rulesets_read
  on public.user_level_rulesets for select
  using (is_active = true or app_private.is_admin());

drop policy if exists user_level_thresholds_read on public.user_level_thresholds;
create policy user_level_thresholds_read
  on public.user_level_thresholds for select
  using (
    exists (
      select 1
      from public.user_level_rulesets as r
      where r.version = ruleset_version
        and (r.is_active = true or app_private.is_admin())
    )
  );

drop policy if exists user_level_snapshots_read_own_or_admin on public.user_level_snapshots;
create policy user_level_snapshots_read_own_or_admin
  on public.user_level_snapshots for select
  using (user_id = app_private.current_public_user_id() or app_private.is_admin());

commit;
