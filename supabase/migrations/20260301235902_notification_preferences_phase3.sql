begin;

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  follow_enabled boolean not null default true,
  comment_enabled boolean not null default true,
  mention_enabled boolean not null default true,
  badge_enabled boolean not null default true,
  level_up_enabled boolean not null default true,
  system_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.get_my_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  select jsonb_build_object(
    'follow_enabled', coalesce(p.follow_enabled, true),
    'comment_enabled', coalesce(p.comment_enabled, true),
    'mention_enabled', coalesce(p.mention_enabled, true),
    'badge_enabled', coalesce(p.badge_enabled, true),
    'level_up_enabled', coalesce(p.level_up_enabled, true),
    'system_enabled', coalesce(p.system_enabled, true)
  )
  into v_payload
  from public.users u
  left join public.user_notification_preferences p on p.user_id = u.id
  where u.id = v_user_id
  limit 1;

  if v_payload is null then
    raise exception 'Bildirim tercihleri okunamadi.';
  end if;

  return v_payload;
end;
$$;

create or replace function public.update_my_notification_preferences(
  p_follow_enabled boolean,
  p_comment_enabled boolean,
  p_mention_enabled boolean,
  p_badge_enabled boolean,
  p_level_up_enabled boolean,
  p_system_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
begin
  if v_user_id is null then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  insert into public.user_notification_preferences (
    user_id,
    follow_enabled,
    comment_enabled,
    mention_enabled,
    badge_enabled,
    level_up_enabled,
    system_enabled,
    updated_at
  )
  values (
    v_user_id,
    coalesce(p_follow_enabled, true),
    coalesce(p_comment_enabled, true),
    coalesce(p_mention_enabled, true),
    coalesce(p_badge_enabled, true),
    coalesce(p_level_up_enabled, true),
    coalesce(p_system_enabled, true),
    now()
  )
  on conflict (user_id) do update
  set follow_enabled = excluded.follow_enabled,
      comment_enabled = excluded.comment_enabled,
      mention_enabled = excluded.mention_enabled,
      badge_enabled = excluded.badge_enabled,
      level_up_enabled = excluded.level_up_enabled,
      system_enabled = excluded.system_enabled,
      updated_at = now();

  return public.get_my_notification_preferences();
end;
$$;

create or replace function public.is_notification_type_enabled(
  p_target_user_id uuid,
  p_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_type, '')));
  v_pref public.user_notification_preferences%rowtype;
begin
  if p_target_user_id is null then
    return false;
  end if;

  select *
  into v_pref
  from public.user_notification_preferences
  where user_id = p_target_user_id;

  if v_type = 'follow' then
    return coalesce(v_pref.follow_enabled, true);
  elsif v_type = 'comment' then
    return coalesce(v_pref.comment_enabled, true);
  elsif v_type = 'mention' then
    return coalesce(v_pref.mention_enabled, true);
  elsif v_type in ('badge_earned', 'badge_purchased') then
    return coalesce(v_pref.badge_enabled, true);
  elsif v_type = 'level_up' then
    return coalesce(v_pref.level_up_enabled, true);
  elsif v_type = 'system' then
    return coalesce(v_pref.system_enabled, true);
  end if;

  return true;
end;
$$;

grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.is_notification_type_enabled(uuid, text) to authenticated;

comment on function public.get_my_notification_preferences()
  is 'Aktif kullanicinin bildirim tercihlerini varsayilan degerlerle birlikte dondurur.';

comment on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean)
  is 'Aktif kullanicinin bildirim tercihlerini gunceller veya ilk kez olusturur.';

comment on function public.is_notification_type_enabled(uuid, text)
  is 'Hedef kullanici icin ilgili bildirim tipinin acik olup olmadigini kontrol eder.';

commit;
