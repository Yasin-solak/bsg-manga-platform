begin;

create or replace function public.push_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text default null,
  p_data jsonb default '{}'::jsonb,
  p_icon text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_type, 'system')));
  v_payload jsonb := coalesce(p_data, '{}'::jsonb);
  v_event_key text := nullif(trim(coalesce(v_payload ->> 'event_key', '')), '');
begin
  if p_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
  ) then
    return;
  end if;

  if v_type not in ('badge_earned', 'badge_purchased', 'level_up', 'follow', 'comment', 'mention', 'system') then
    v_type := 'system';
  end if;

  if not public.is_notification_type_enabled(p_user_id, v_type) then
    return;
  end if;

  if v_event_key is not null
    and exists (
      select 1
      from public.notifications n
      where n.user_id = p_user_id
        and n.data ->> 'event_key' = v_event_key
    )
  then
    return;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    icon,
    data
  )
  values (
    p_user_id,
    v_type,
    coalesce(nullif(trim(coalesce(p_title, '')), ''), 'Bildirim'),
    nullif(trim(coalesce(p_message, '')), ''),
    nullif(trim(coalesce(p_icon, '')), ''),
    v_payload
  );
exception
  when others then
    raise notice 'push_notification failed: %', sqlerrm;
end;
$$;

create or replace function public.enforce_notification_preferences_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  if not public.is_notification_type_enabled(new.user_id, new.type) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notifications_preference_guard on public.notifications;
create trigger trg_notifications_preference_guard
  before insert on public.notifications
  for each row
  execute function public.enforce_notification_preferences_before_insert();

create or replace function public.notify_community_post_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_username text := 'Bir kullanici';
  v_post_title text := coalesce(nullif(trim(coalesce(new.title, '')), ''), 'Topluluk gonderisi');
  v_target_user_id uuid;
  v_is_visible boolean := new.status = 'approved' and coalesce(new.is_active, false) = true;
  v_was_visible boolean := false;
  v_mentions_to_notify uuid[] := '{}'::uuid[];
begin
  if new.author_id is null then
    return new;
  end if;

  if not v_is_visible then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_was_visible := old.status = 'approved' and coalesce(old.is_active, false) = true;

    if v_was_visible then
      select coalesce(array_agg(entry), '{}'::uuid[])
      into v_mentions_to_notify
      from unnest(coalesce(new.mentioned_user_ids, '{}'::uuid[])) as entry
      where entry is not null
        and entry <> new.author_id
        and not (entry = any(coalesce(old.mentioned_user_ids, '{}'::uuid[])));
    else
      select coalesce(array_agg(entry), '{}'::uuid[])
      into v_mentions_to_notify
      from unnest(coalesce(new.mentioned_user_ids, '{}'::uuid[])) as entry
      where entry is not null
        and entry <> new.author_id;
    end if;
  else
    select coalesce(array_agg(entry), '{}'::uuid[])
    into v_mentions_to_notify
    from unnest(coalesce(new.mentioned_user_ids, '{}'::uuid[])) as entry
    where entry is not null
      and entry <> new.author_id;
  end if;

  if coalesce(cardinality(v_mentions_to_notify), 0) = 0 then
    return new;
  end if;

  select coalesce(u.username, v_actor_username)
  into v_actor_username
  from public.users u
  where u.id = new.author_id;

  foreach v_target_user_id in array v_mentions_to_notify
  loop
    perform public.push_notification(
      v_target_user_id,
      'mention',
      'Bir gonderide senden bahsedildi',
      format('%s, "%s" gonderisinde senden bahsetti.', v_actor_username, v_post_title),
      jsonb_build_object(
        'event', 'community_post_mention',
        'post_id', new.id,
        'post_title', v_post_title,
        'actor_user_id', new.author_id,
        'actor_username', v_actor_username,
        'route_hint', format('/discussion/%s', new.id::text),
        'event_key', format('community-post-mention:%s:%s', new.id::text, v_target_user_id::text)
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_community_post_mentions on public.community_posts;
create trigger trg_notify_community_post_mentions
  after insert or update of status, is_active, mentioned_user_ids on public.community_posts
  for each row
  execute function public.notify_community_post_mentions();

comment on function public.enforce_notification_preferences_before_insert()
  is 'Notification insertlerini tablo seviyesinde kullanici tercihlerine gore filtreler.';

comment on function public.notify_community_post_mentions()
  is 'Onaylanan veya yeni mention alan topluluk gonderilerinde etiketlenen kullanicilara mention bildirimi yollar.';

commit;
