-- Carries the same chapter/version target as the notification center to Web Push.
-- Does not change config, event list, subscription permissions or push activity.
-- Subscription keys and dispatch identity go only to our owner's exact HTTPS endpoint.

begin;

create or replace function private.dispatch_web_push_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
  subs jsonb;
  event_key text;
  routing_data jsonb;
begin
  select * into cfg
  from private.web_push_config
  where id is true and is_enabled
    and dispatch_url = 'https://example.com/api/push/dispatch'
    and dispatch_secret is not null;
  if cfg is null then
    return new;
  end if;

  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return new;
  end if;

  event_key := coalesce(new.data ->> 'event', new.type);
  if not (event_key = any (cfg.event_allowlist)) then
    return new;
  end if;

  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth
  ))
  into subs
  from public.push_subscriptions s
  where s.user_id = new.user_id;
  if subs is null then
    return new;
  end if;

  -- Only routing fields travel; chapter number is not forced to text or rounded.
  -- Values are not trusted: Cloudflare applies the existing safeNotificationPath limit.
  routing_data := jsonb_strip_nulls(jsonb_build_object(
    'event', new.data -> 'event',
    'route_hint', new.data -> 'route_hint',
    'url', new.data -> 'url',
    'manga_id', new.data -> 'manga_id',
    'manga_slug', new.data -> 'manga_slug',
    'chapter_number', new.data -> 'chapter_number',
    'chapter_id', new.data -> 'chapter_id',
    'fansub_id', new.data -> 'fansub_id',
    'fansub_slug', new.data -> 'fansub_slug'
  ));

  -- The URL is fixed; a changed config row cannot move delivery keys to another target.
  perform net.http_post(
    url := 'https://example.com/api/push/dispatch',
    body := jsonb_build_object(
      'title', new.title,
      'body', coalesce(new.message, ''),
      'url', coalesce(new.data ->> 'url', '/'),
      'tag', event_key,
      'data', routing_data,
      'subscriptions', subs
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Dispatch-Secret', cfg.dispatch_secret
    )
  );

  return new;
exception when others then
  -- Even if the push queue fails an in-app notification is created.
  return new;
end $$;

commit;
