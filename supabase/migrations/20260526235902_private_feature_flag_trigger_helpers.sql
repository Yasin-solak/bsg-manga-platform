-- Runtime feature guard triggers must not depend on the public helper execute grant.
-- While the public helper RPC surface stays closed the trigger/RLS context uses the app_private helper.

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.is_feature_enabled(
  p_key text,
  p_default boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
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
    and (ff.is_public = true or app_private.is_admin())
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
$function$;

grant execute on function app_private.is_feature_enabled(text, boolean) to anon, authenticated, service_role;

create or replace function public.set_feature_flag_updated_by()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_actor_id uuid;
begin
  v_actor_id := app_private.current_public_user_id();
  if v_actor_id is not null then
    new.updated_by := v_actor_id;
  end if;

  return new;
end;
$function$;

create or replace function public.enforce_reports_feature_flag()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if not app_private.is_feature_enabled('moderation.reports', true) then
    raise exception 'Raporlama sistemi su anda gecici olarak kapali.';
  end if;

  return new;
end;
$function$;

create or replace function public.enforce_community_posting_feature_flag()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if not app_private.is_feature_enabled('community.posting', true) then
    raise exception 'Topluluk paylasim ve yorum olusturma su anda gecici olarak kapali.';
  end if;

  return new;
end;
$function$;

create or replace function public.enforce_reader_comments_feature_flag()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if not app_private.is_feature_enabled('reader.comments', true) then
    raise exception 'Manga ve bolum yorum gonderimi su anda gecici olarak kapali.';
  end if;

  return new;
end;
$function$;

-- 20260526_203 reopened public execute as an urgent patch. Since triggers now use the
-- app_private helper, the public RPC surface can be closed again.
revoke execute on function public.is_feature_enabled(text, boolean) from anon, authenticated, public;
grant execute on function public.is_feature_enabled(text, boolean) to service_role;

notify pgrst, 'reload schema';
