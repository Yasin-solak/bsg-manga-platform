-- ============================================
-- Web push RLS helper fix
-- Date: 2026-07-08
--
-- Root cause: migration 208 took EXECUTE on `public.current_public_user_id()`
-- back from anon/authenticated/public (only
-- service_role); RLS policies evaluated with client roles and column
-- defaults must use the `app_private.current_public_user_id()` wrapper
-- . Migration 267 came with a pattern written before this rule; a signed-in
-- user writing to push_subscriptions got "permission denied for
-- function current_public_user_id". This migration moves the default and four
-- policies to the wrapper.
-- ============================================

begin;

alter table public.push_subscriptions
  alter column user_id set default app_private.current_public_user_id();

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  using (user_id = app_private.current_public_user_id());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  with check (user_id = app_private.current_public_user_id());

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
  on public.push_subscriptions
  for update
  using (user_id = app_private.current_public_user_id())
  with check (user_id = app_private.current_public_user_id());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  using (user_id = app_private.current_public_user_id());

commit;
