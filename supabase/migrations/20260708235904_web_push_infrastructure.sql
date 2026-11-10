-- ============================================
-- Web Push infrastructure (based on RFC 8291/8292)
-- Date: 2026-07-08
--
-- Parts:
-- 1) public.push_subscriptions: browser push subscriptions (owner-only RLS)
-- 2) private.web_push_config:   dispatch URL + secret + event allowlist
-- (single row; only definer functions read it)
-- 3) notifications insert trigger: passes allowlisted events with pg_net to
-- the Cloudflare /api/push/dispatch endpoint (subscriptions travel in the payload;
-- no service-role needed on the CF side)
-- 4) 'notifications.web_push' feature flag (default OFF)
--
-- Setup (go-live) steps: the migration alone does NOT turn push on:
-- a) Cloudflare Pages secrets: PUSH_DISPATCH_SECRET, PUSH_VAPID_PUBLIC_KEY,
-- PUSH_VAPID_PRIVATE_KEY, PUSH_VAPID_SUBJECT (npm run cf:sync-secrets)
-- + VITE_WEB_PUSH_VAPID_PUBLIC_KEY in the build environment.
-- Key generation: node scripts/generate-vapid-keys.mjs
-- b) Config row in the SQL editor:
-- insert into private.web_push_config (id, dispatch_url, dispatch_secret, is_enabled)
-- values (true, 'https://<site>/api/push/dispatch', '<secret>', true)
-- on conflict (id) do update set dispatch_url = excluded.dispatch_url,
-- dispatch_secret = excluded.dispatch_secret, is_enabled = excluded.is_enabled;
-- c) Turn on the 'notifications.web_push' flag from the admin panel.
-- ============================================

begin;

-- ---------- 1) Subscription table ----------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade
    default public.current_public_user_id(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  using (user_id = public.current_public_user_id());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  with check (user_id = public.current_public_user_id());

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
  on public.push_subscriptions
  for update
  using (user_id = public.current_public_user_id())
  with check (user_id = public.current_public_user_id());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  using (user_id = public.current_public_user_id());

-- ---------- 2) Dispatch konfigurasyonu (private) ----------

create schema if not exists private;

create table if not exists private.web_push_config (
  id boolean primary key default true check (id),
  dispatch_url text,
  dispatch_secret text,
  -- Which notification events become push: coalesce(data->>'event', type)
  event_allowlist text[] not null default array['fansub_new_chapter', 'store_gift_received'],
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- private semaya API rolleri erisemez; secret yalnizca definer trigger okur.
revoke all on private.web_push_config from anon, authenticated;

-- ---------- 3) pg_net + dispatch trigger'i ----------

-- pg_net exists on hosted Supabase; on a permission problem continue without breaking the migration
-- (the trigger tolerates a missing extension at runtime).
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net kurulamadi (%), push dispatch pasif kalir.', sqlerrm;
end $$;

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
begin
  select * into cfg
  from private.web_push_config
  where id is true and is_enabled
    and dispatch_url is not null and dispatch_secret is not null;
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

  -- pg_net writes to an async queue; no waiting for a response, the notification insert is never blocked.
  perform net.http_post(
    url := cfg.dispatch_url,
    body := jsonb_build_object(
      'title', new.title,
      'body', coalesce(new.message, ''),
      'url', coalesce(new.data ->> 'url', '/'),
      'tag', event_key,
      'subscriptions', subs
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Dispatch-Secret', cfg.dispatch_secret
    )
  );

  return new;
exception when others then
  -- Push delivery must never block notification creation.
  return new;
end $$;

drop trigger if exists trg_notifications_web_push_dispatch on public.notifications;
create trigger trg_notifications_web_push_dispatch
  after insert on public.notifications
  for each row
  execute function private.dispatch_web_push_notification();

-- ---------- 4) Feature flag ----------

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values (
  'notifications.web_push',
  'Tarayici Push Bildirimleri',
  'Web push aboneligi (istemci opt-in UI) ve DB dispatch trigger''ini acar.',
  false,
  100,
  true,
  '{}'::jsonb
)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    rollout_percent = excluded.rollout_percent,
    is_public = excluded.is_public,
    metadata = excluded.metadata;

commit;
