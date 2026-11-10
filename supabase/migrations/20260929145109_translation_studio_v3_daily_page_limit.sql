-- Translation Studio pilot: per-fansub daily AI page limit.
-- * A page counts once a day (scan + translate + re-read on one page is one credit).
-- * The day turns on the Europe/Istanbul calendar.
-- * The default limit is metadata.daily_page_limit of the translation.studio_v3 flag (60 if absent);
-- per fansub it can change with translation_fansub_quotas (0 = AI off).
-- * The site admin is unlimited (usage is still recorded).

create table if not exists public.translation_ai_usage (
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  usage_day date not null,
  page_id uuid not null references public.translation_pages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fansub_id, usage_day, page_id)
);
alter table public.translation_ai_usage enable row level security;
create policy translation_ai_usage_select on public.translation_ai_usage for select to authenticated
  using (app_private.tl_can_fansub(fansub_id));

create table if not exists public.translation_fansub_quotas (
  fansub_id uuid primary key references public.fansubs(id) on delete cascade,
  daily_page_limit integer not null check (daily_page_limit between 0 and 10000),
  updated_at timestamptz not null default now()
);
alter table public.translation_fansub_quotas enable row level security;
create policy translation_fansub_quotas_select on public.translation_fansub_quotas for select to authenticated
  using (app_private.is_admin() or app_private.tl_can_fansub(fansub_id));

create or replace function app_private.tl_today()
returns date language sql stable set search_path = '' as $function$
  select (now() at time zone 'Europe/Istanbul')::date;
$function$;

create or replace function app_private.tl_daily_page_limit(p_fansub_id uuid)
returns integer language sql stable security definer set search_path = '' as $function$
  select coalesce(
    (select q.daily_page_limit from public.translation_fansub_quotas q where q.fansub_id = p_fansub_id),
    (select case when f.metadata ? 'daily_page_limit' then (f.metadata->>'daily_page_limit')::integer end
       from public.feature_flags f where f.key = 'translation.studio_v3'),
    60);
$function$;

-- Ekranda gosterilen durum: bugun kullanilan / limit / sinirsiz mi.
create or replace function public.tl_ai_usage_today(p_fansub_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not app_private.tl_can_fansub(p_fansub_id) then
    raise exception 'Bu ekibin stüdyosunu görme iznin yok.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'used', (select count(*) from public.translation_ai_usage u where u.fansub_id = p_fansub_id and u.usage_day = app_private.tl_today()),
    'limit', app_private.tl_daily_page_limit(p_fansub_id),
    'unlimited', app_private.is_admin());
end;
$function$;
revoke all on function public.tl_ai_usage_today(uuid) from public;
grant execute on function public.tl_ai_usage_today(uuid) to authenticated;

-- Workers (with the user JWT) ask for credit before going to AI. If the same page was already
-- counted that day no credit is used. Returns: {allowed, used, limit}.
create or replace function public.tl_claim_ai_page(p_page_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_fansub uuid := app_private.tl_page_fansub(p_page_id);
  v_day date := app_private.tl_today();
  v_limit integer;
  v_used integer;
begin
  if v_fansub is null or not app_private.tl_can_fansub(v_fansub) then
    raise exception 'Bu sayfaya erişimin yok.' using errcode = '42501';
  end if;
  v_limit := app_private.tl_daily_page_limit(v_fansub);
  -- Concurrent requests of the same fansub queue up (no limit overrun race).
  perform pg_advisory_xact_lock(hashtext('tl_ai_usage:' || v_fansub::text));
  if exists (select 1 from public.translation_ai_usage u where u.fansub_id = v_fansub and u.usage_day = v_day and u.page_id = p_page_id) then
    select count(*) into v_used from public.translation_ai_usage u where u.fansub_id = v_fansub and u.usage_day = v_day;
    return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
  end if;
  select count(*) into v_used from public.translation_ai_usage u where u.fansub_id = v_fansub and u.usage_day = v_day;
  if v_used >= v_limit and not app_private.is_admin() then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  end if;
  insert into public.translation_ai_usage (fansub_id, usage_day, page_id) values (v_fansub, v_day, p_page_id)
    on conflict do nothing;
  return jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', v_limit);
end;
$function$;
revoke all on function public.tl_claim_ai_page(uuid) from public;
grant execute on function public.tl_claim_ai_page(uuid) to authenticated;

-- Site admini fansub limitini ayarlar (null = varsayilana don).
create or replace function public.tl_set_fansub_daily_limit(p_fansub_id uuid, p_limit integer)
returns void language plpgsql volatile security definer set search_path = '' as $function$
begin
  if not app_private.is_admin() then
    raise exception 'Yalnızca site yöneticisi limit ayarlayabilir.' using errcode = '42501';
  end if;
  if p_limit is null then
    delete from public.translation_fansub_quotas where fansub_id = p_fansub_id;
  else
    insert into public.translation_fansub_quotas (fansub_id, daily_page_limit) values (p_fansub_id, p_limit)
      on conflict (fansub_id) do update set daily_page_limit = excluded.daily_page_limit, updated_at = now();
  end if;
end;
$function$;
revoke all on function public.tl_set_fansub_daily_limit(uuid, integer) from public;
grant execute on function public.tl_set_fansub_daily_limit(uuid, integer) to authenticated;

update public.feature_flags set metadata = coalesce(metadata, '{}'::jsonb) || '{"daily_page_limit": 60}'::jsonb
where key = 'translation.studio_v3' and not (coalesce(metadata, '{}'::jsonb) ? 'daily_page_limit');
