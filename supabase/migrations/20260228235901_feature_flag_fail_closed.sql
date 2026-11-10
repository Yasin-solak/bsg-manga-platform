-- ============================================
-- MangaZone | Feature flag fail-closed hardening
-- Date: 2026-02-28
-- ============================================

begin;

create or replace function public.is_feature_enabled(
  p_key text,
  p_default boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_key, '')));
  v_enabled boolean;
  v_rollout integer;
  v_hash_input text;
  v_bucket integer;
  v_strict_fail_closed boolean := false;
begin
  if v_key = '' then
    return false;
  end if;

  -- These keys protect product flows; if the record is missing or unreadable they must act closed
  -- rather than stay open.
  v_strict_fail_closed := v_key = any (array[
    'home.follow_feed',
    'reader.comments',
    'notifications.center',
    'economy.coin_codes',
    'economy.fansub_wallet_purchase',
    'economy.store_purchase',
    'community.posting',
    'moderation.reports',
    'rewards.user_tasks',
    'admin.operations_center'
  ]);

  select ff.is_enabled, ff.rollout_percent
  into v_enabled, v_rollout
  from public.feature_flags ff
  where ff.key = v_key
    and (ff.is_public = true or public.is_admin())
  limit 1;

  if not found then
    if v_strict_fail_closed then
      return false;
    end if;
    return coalesce(p_default, false);
  end if;

  if v_enabled is not true then
    return false;
  end if;

  if coalesce(v_rollout, 0) >= 100 then
    return true;
  end if;

  if coalesce(v_rollout, 0) <= 0 then
    return false;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  v_hash_input := auth.uid()::text || ':' || v_key;
  v_bucket := (abs(('x' || substr(md5(v_hash_input), 1, 8))::bit(32)::bigint) % 100)::integer;
  return v_bucket < v_rollout;
end;
$$;

grant execute on function public.is_feature_enabled(text, boolean) to anon, authenticated;

commit;
