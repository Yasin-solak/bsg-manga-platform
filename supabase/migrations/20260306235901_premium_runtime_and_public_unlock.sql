-- ============================================
-- Premium runtime config + chapter public unlock
-- Date: 2026-03-06
-- ============================================

begin;

create table if not exists public.premium_runtime_config (
  id boolean primary key default true
    check (id = true),
  premium_store_item_id uuid not null references public.store_items(id) on delete restrict,
  premium_badge_id uuid not null references public.badges(id) on delete restrict,
  premium_duration_days integer not null default 30
    check (premium_duration_days > 0 and premium_duration_days <= 365),
  public_unlock_delay_hours integer not null default 24
    check (public_unlock_delay_hours >= 0 and public_unlock_delay_hours <= 168),
  compensation_coins integer not null default 300
    check (compensation_coins >= 0 and compensation_coins <= 1000000),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_premium_reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  runtime_config_id boolean references public.premium_runtime_config(id) on delete set null,
  premium_store_item_id uuid not null references public.store_items(id) on delete restrict,
  rewarded_store_item_id uuid references public.store_items(id) on delete set null,
  rewarded_store_item_type text
    check (
      rewarded_store_item_type is null
      or rewarded_store_item_type in ('frame', 'background', 'pattern')
    ),
  rewarded_store_item_identifier text,
  premium_badge_id uuid references public.badges(id) on delete set null,
  compensation_coins integer not null default 0
    check (compensation_coins >= 0),
  premium_started_at timestamptz not null,
  premium_expires_at timestamptz not null,
  source text not null default 'store_purchase',
  created_at timestamptz not null default now(),
  check (premium_expires_at > premium_started_at)
);

create index if not exists user_premium_reward_events_user_idx
  on public.user_premium_reward_events (user_id, created_at desc);

create index if not exists user_premium_reward_events_reward_idx
  on public.user_premium_reward_events (rewarded_store_item_type, rewarded_store_item_id);

alter table public.user_premium_subscriptions
  alter column package_id drop not null;

alter table public.user_premium_subscriptions
  add column if not exists runtime_config_id boolean references public.premium_runtime_config(id) on delete set null;

create index if not exists user_premium_subscriptions_runtime_config_idx
  on public.user_premium_subscriptions (runtime_config_id, created_at desc);

drop trigger if exists trg_premium_runtime_config_set_updated_at on public.premium_runtime_config;
create trigger trg_premium_runtime_config_set_updated_at
  before update on public.premium_runtime_config
  for each row
  execute function public.set_updated_at();

create or replace function public.validate_premium_runtime_config_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.store_items si
    where si.id = new.premium_store_item_id
      and si.type = 'premium'
      and si.is_active = true
  ) then
    raise exception 'Premium runtime icin secilen premium urun gecersiz veya pasif.';
  end if;

  if not exists (
    select 1
    from public.badges b
    where b.id = new.premium_badge_id
      and b.is_active = true
      and b.target_type in ('user', 'both')
  ) then
    raise exception 'Premium runtime icin secilen rozet gecersiz veya kullaniciya atanamaz.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_premium_runtime_config_refs on public.premium_runtime_config;
create trigger trg_validate_premium_runtime_config_refs
  before insert or update on public.premium_runtime_config
  for each row
  execute function public.validate_premium_runtime_config_refs();

alter table public.premium_runtime_config enable row level security;
alter table public.user_premium_reward_events enable row level security;

drop policy if exists premium_runtime_config_select_public on public.premium_runtime_config;
create policy premium_runtime_config_select_public
  on public.premium_runtime_config
  for select
  using (true);

drop policy if exists premium_runtime_config_admin_write on public.premium_runtime_config;
create policy premium_runtime_config_admin_write
  on public.premium_runtime_config
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists user_premium_reward_events_select_own_or_admin on public.user_premium_reward_events;
create policy user_premium_reward_events_select_own_or_admin
  on public.user_premium_reward_events
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_premium_reward_events_admin_write on public.user_premium_reward_events;
create policy user_premium_reward_events_admin_write
  on public.user_premium_reward_events
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.premium_runtime_config to anon, authenticated;
grant select on table public.user_premium_reward_events to authenticated;

with preferred_premium_item as (
  select si.id
  from public.store_items si
  where si.type = 'premium'
    and si.identifier = 'namefx-pass'
  order by si.is_active desc, si.created_at asc
  limit 1
),
ensured_premium_item as (
  insert into public.store_items (
    name,
    description,
    identifier,
    type,
    price,
    currency,
    image_key,
    custom_asset_url,
    is_active
  )
  select
    'Premium Uyelik',
    'Premium satin aliminda 30 gun erken erisim, 1 rastgele kozmetik ve premium rozeti verir.',
    'namefx-pass',
    'premium',
    3000,
    'Coin',
    null,
    null,
    true
  where not exists (select 1 from preferred_premium_item)
  returning id
),
resolved_premium_item as (
  select id from preferred_premium_item
  union all
  select id from ensured_premium_item
  limit 1
),
upserted_premium_badge as (
  insert into public.badges (
    name,
    description,
    image_url,
    category,
    subcategory,
    price,
    rarity,
    is_active,
    target_type,
    requirements
  )
  values (
    'Premium Uye',
    'Aktif premium uyelik suresince kullanici adinin yaninda gorunen premium rozeti.',
    '/badges/vip_gold.png',
    'event',
    'vip',
    null,
    'legendary',
    true,
    'user',
    jsonb_build_object('source', 'premium_runtime')
  )
  on conflict (name) do update
  set
    description = excluded.description,
    image_url = excluded.image_url,
    category = excluded.category,
    subcategory = excluded.subcategory,
    price = excluded.price,
    rarity = excluded.rarity,
    is_active = excluded.is_active,
    target_type = excluded.target_type,
    requirements = excluded.requirements
  returning id
)
insert into public.premium_runtime_config (
  id,
  premium_store_item_id,
  premium_badge_id,
  premium_duration_days,
  public_unlock_delay_hours,
  compensation_coins
)
select
  true,
  resolved_premium_item.id,
  upserted_premium_badge.id,
  30,
  24,
  300
from resolved_premium_item
cross join upserted_premium_badge
on conflict (id) do nothing;

update public.user_premium_subscriptions
set runtime_config_id = true
where runtime_config_id is null;

insert into public.user_badges (
  user_id,
  badge_id,
  is_displayed,
  display_order
)
select
  u.id,
  cfg.premium_badge_id,
  false,
  0
from public.users u
cross join public.premium_runtime_config cfg
where cfg.id = true
  and u.premium_expires_at is not null
  and u.premium_expires_at > now()
on conflict (user_id, badge_id) do nothing;

create or replace function public.current_user_has_active_premium()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_active boolean := false;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    return false;
  end if;

  select coalesce(u.premium_expires_at > now(), false)
  into v_active
  from public.users u
  where u.id = v_user_id
    and u.is_active = true
  limit 1;

  return coalesce(v_active, false);
end;
$$;

grant execute on function public.current_user_has_active_premium() to anon, authenticated;

create or replace function public.chapter_public_unlock_at(p_publish_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_delay_hours integer := 24;
begin
  if p_publish_at is null then
    return null;
  end if;

  select coalesce(cfg.public_unlock_delay_hours, 24)
  into v_delay_hours
  from public.premium_runtime_config cfg
  where cfg.id = true
  limit 1;

  return p_publish_at + make_interval(hours => greatest(coalesce(v_delay_hours, 24), 0));
end;
$$;

grant execute on function public.chapter_public_unlock_at(timestamptz) to anon, authenticated;

create or replace function public.is_chapter_publicly_unlocked(p_publish_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_publish_at is null then true
      else public.chapter_public_unlock_at(p_publish_at) <= now()
    end
$$;

grant execute on function public.is_chapter_publicly_unlocked(timestamptz) to anon, authenticated;

create or replace function public.can_current_user_access_chapter(p_publish_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_publish_at is null then true
      when public.current_user_has_active_premium() then true
      else public.is_chapter_publicly_unlocked(p_publish_at)
    end
$$;

grant execute on function public.can_current_user_access_chapter(timestamptz) to anon, authenticated;

drop policy if exists chapters_select_public on public.chapters;
create policy chapters_select_public
  on public.chapters
  for select
  using (
    (
      is_active = true
      and is_approved = true
      and public.can_current_user_access_chapter(publish_at)
    )
    or public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

create or replace function public.get_active_premium_offer()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config record;
begin
  select
    cfg.id,
    cfg.premium_store_item_id,
    cfg.premium_badge_id,
    cfg.premium_duration_days,
    cfg.public_unlock_delay_hours,
    cfg.compensation_coins,
    si.identifier as premium_identifier,
    si.name as premium_name,
    si.description as premium_description,
    si.price as premium_price,
    b.name as premium_badge_name,
    b.image_url as premium_badge_image_url
  into v_config
  from public.premium_runtime_config cfg
  join public.store_items si on si.id = cfg.premium_store_item_id
  join public.badges b on b.id = cfg.premium_badge_id
  where cfg.id = true
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'premium_item', jsonb_build_object(
      'id', v_config.premium_store_item_id,
      'identifier', v_config.premium_identifier,
      'name', v_config.premium_name,
      'description', v_config.premium_description,
      'price', v_config.premium_price
    ),
    'premium_badge', jsonb_build_object(
      'id', v_config.premium_badge_id,
      'name', v_config.premium_badge_name,
      'image_url', v_config.premium_badge_image_url
    ),
    'duration_days', v_config.premium_duration_days,
    'public_unlock_delay_hours', v_config.public_unlock_delay_hours,
    'random_reward_pool_types', jsonb_build_array('frame', 'background', 'pattern'),
    'compensation_coins', v_config.compensation_coins
  );
end;
$$;

grant execute on function public.get_active_premium_offer() to anon, authenticated;

create or replace function public.purchase_store_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_user_id uuid;
  v_user public.users%rowtype;
  v_item public.store_items%rowtype;
  v_target_key text;
  v_target_value text;
  v_owned jsonb;
  v_target_array jsonb;
  v_already_owned boolean;
  v_new_stones integer;
  v_config public.premium_runtime_config%rowtype;
  v_premium_started_at timestamptz;
  v_premium_expires_at timestamptz;
  v_reward_item public.store_items%rowtype;
  v_reward_identifier text;
  v_reward_type text;
  v_compensation_coins integer := 0;
  v_premium_identifier text;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Public profil bulunamadi.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Urun bulunamadi veya aktif degil.';
  end if;

  if v_item.currency <> 'Coin' then
    raise exception 'Bu urun Coin ile satin alinmiyor.';
  end if;

  if v_user.stones < v_item.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  v_owned := coalesce(v_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[]}'::jsonb);
  v_new_stones := v_user.stones - v_item.price;

  if v_item.type <> 'premium' then
    v_target_key := case v_item.type
      when 'frame' then 'frames'
      when 'background' then 'backgrounds'
      when 'pattern' then 'patterns'
      when 'badge' then 'badges'
      else 'premium'
    end;

    v_target_value := coalesce(v_item.identifier, v_item.id::text);
    v_target_array := coalesce(v_owned -> v_target_key, '[]'::jsonb);

    select exists (
      select 1
      from jsonb_array_elements_text(v_target_array) as t(value)
      where t.value = v_target_value
    )
    into v_already_owned;

    if v_already_owned then
      raise exception 'Bu urun zaten envanterinizde bulunuyor.';
    end if;

    v_target_array := v_target_array || to_jsonb(v_target_value);
    v_owned := jsonb_set(v_owned, array[v_target_key], v_target_array, true);

    update public.users
    set stones = v_new_stones,
        owned_items = v_owned
    where id = v_user_id;

    update public.store_items
    set purchase_count = purchase_count + 1
    where id = v_item.id;

    return jsonb_build_object(
      'user_id', v_user_id,
      'item_id', v_item.id,
      'item_type', v_item.type,
      'item_identifier', v_item.identifier,
      'stones', v_new_stones,
      'owned_items', v_owned,
      'premium_expires_at', v_user.premium_expires_at
    );
  end if;

  select *
  into v_config
  from public.premium_runtime_config cfg
  where cfg.id = true
  for update;

  if not found then
    raise exception 'Premium runtime ayari bulunamadi.';
  end if;

  if v_config.premium_store_item_id <> v_item.id then
    raise exception 'Secilen premium urun aktif premium ayariyla uyusmuyor.';
  end if;

  v_premium_identifier := coalesce(v_item.identifier, v_item.id::text);
  v_target_array := coalesce(v_owned -> 'premium', '[]'::jsonb);
  if not exists (
    select 1
    from jsonb_array_elements_text(v_target_array) as t(value)
    where t.value = v_premium_identifier
  ) then
    v_target_array := v_target_array || to_jsonb(v_premium_identifier);
    v_owned := jsonb_set(v_owned, '{premium}', v_target_array, true);
  end if;

  select si.*
  into v_reward_item
  from public.store_items si
  where si.type in ('frame', 'background', 'pattern')
    and si.is_active = true
    and not exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(
          v_owned -> case si.type
            when 'frame' then 'frames'
            when 'background' then 'backgrounds'
            else 'patterns'
          end,
          '[]'::jsonb
        )
      ) as owned_value(value)
      where owned_value.value = coalesce(si.identifier, si.id::text)
    )
  order by random()
  limit 1;

  if found then
    v_reward_type := v_reward_item.type;
    v_reward_identifier := coalesce(v_reward_item.identifier, v_reward_item.id::text);
    v_target_key := case v_reward_type
      when 'frame' then 'frames'
      when 'background' then 'backgrounds'
      else 'patterns'
    end;
    v_target_array := coalesce(v_owned -> v_target_key, '[]'::jsonb) || to_jsonb(v_reward_identifier);
    v_owned := jsonb_set(v_owned, array[v_target_key], v_target_array, true);
  else
    v_compensation_coins := coalesce(v_config.compensation_coins, 0);
    v_new_stones := v_new_stones + v_compensation_coins;
  end if;

  insert into public.user_badges (
    user_id,
    badge_id,
    is_displayed,
    display_order
  )
  values (
    v_user_id,
    v_config.premium_badge_id,
    false,
    0
  )
  on conflict (user_id, badge_id) do nothing;

  v_premium_started_at := greatest(v_now, coalesce(v_user.premium_expires_at, v_now));
  v_premium_expires_at := v_premium_started_at + make_interval(days => v_config.premium_duration_days);

  insert into public.user_premium_subscriptions (
    user_id,
    package_id,
    runtime_config_id,
    premium_store_item_id,
    purchased_at,
    extension_started_at,
    extension_expires_at,
    extension_days,
    source
  )
  values (
    v_user_id,
    null,
    v_config.id,
    v_item.id,
    v_now,
    v_premium_started_at,
    v_premium_expires_at,
    v_config.premium_duration_days,
    'store_purchase'
  );

  insert into public.user_premium_reward_events (
    user_id,
    runtime_config_id,
    premium_store_item_id,
    rewarded_store_item_id,
    rewarded_store_item_type,
    rewarded_store_item_identifier,
    premium_badge_id,
    compensation_coins,
    premium_started_at,
    premium_expires_at,
    source
  )
  values (
    v_user_id,
    v_config.id,
    v_item.id,
    v_reward_item.id,
    v_reward_type,
    v_reward_identifier,
    v_config.premium_badge_id,
    v_compensation_coins,
    v_premium_started_at,
    v_premium_expires_at,
    'store_purchase'
  );

  update public.users
  set stones = v_new_stones,
      owned_items = v_owned,
      premium_expires_at = v_premium_expires_at
  where id = v_user_id;

  update public.store_items
  set purchase_count = purchase_count + 1
  where id = v_item.id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'item_id', v_item.id,
    'item_type', v_item.type,
    'item_identifier', v_item.identifier,
    'stones', v_new_stones,
    'owned_items', v_owned,
    'premium_expires_at', v_premium_expires_at,
    'premium_duration_days', v_config.premium_duration_days,
    'premium_badge_id', v_config.premium_badge_id,
    'premium_compensation_coins', v_compensation_coins,
    'premium_reward',
      case
        when v_reward_item.id is null then null
        else jsonb_build_object(
          'id', v_reward_item.id,
          'identifier', coalesce(v_reward_item.identifier, v_reward_item.id::text),
          'name', v_reward_item.name,
          'type', v_reward_item.type,
          'custom_asset_url', v_reward_item.custom_asset_url
        )
      end
  );
end;
$$;

grant execute on function public.purchase_store_item(uuid) to authenticated;

create or replace function public.track_manga_read(
  p_manga_id uuid,
  p_chapter_id uuid default null,
  p_chapter_number numeric default null,
  p_client_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_should_increment boolean := true;
  v_total_views bigint;
  v_fansub_id uuid;
  v_month_start date;
  v_chapter_ref text;
  v_reader_key text;
  v_client_key text;
  v_last_read_at timestamptz;
  v_last_manga_read_at timestamptz;
  v_target_chapter_id uuid;
  v_target_chapter_number numeric;
begin
  if p_manga_id is null then
    raise exception 'Manga id zorunludur.';
  end if;

  v_user_id := public.current_public_user_id();

  if auth.uid() is not null and v_user_id is null then
    select m.total_views into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
    return coalesce(v_total_views, 0);
  end if;

  if p_chapter_id is not null then
    select c.id, c.chapter_number
    into v_target_chapter_id, v_target_chapter_number
    from public.chapters c
    where c.id = p_chapter_id
      and c.manga_id = p_manga_id
      and c.is_approved = true
      and c.is_active = true
      and public.can_current_user_access_chapter(c.publish_at)
    limit 1;

    if not found then
      select m.total_views into v_total_views
      from public.mangas m
      where m.id = p_manga_id;
      return coalesce(v_total_views, 0);
    end if;
  elsif p_chapter_number is not null then
    select c.id, c.chapter_number
    into v_target_chapter_id, v_target_chapter_number
    from public.chapters c
    where c.manga_id = p_manga_id
      and c.chapter_number = p_chapter_number
      and c.is_approved = true
      and c.is_active = true
      and public.can_current_user_access_chapter(c.publish_at)
    order by c.created_at desc
    limit 1;

    if not found then
      select m.total_views into v_total_views
      from public.mangas m
      where m.id = p_manga_id;
      return coalesce(v_total_views, 0);
    end if;
  end if;

  if v_target_chapter_id is not null then
    v_chapter_ref := 'chapter:' || v_target_chapter_id::text;
  elsif p_chapter_number is not null then
    v_chapter_ref := 'chapter-number:' || p_chapter_number::text;
  else
    v_chapter_ref := 'manga:' || p_manga_id::text;
  end if;

  if v_user_id is not null then
    v_reader_key := 'user:' || v_user_id::text;
  else
    v_client_key := lower(regexp_replace(coalesce(p_client_key, ''), '[^a-z0-9_-]', '', 'g'));
    if length(v_client_key) between 16 and 96 then
      v_reader_key := 'anon:' || v_client_key;
    end if;
  end if;

  if coalesce(v_reader_key, '') = '' then
    select m.total_views into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
    return coalesce(v_total_views, 0);
  end if;

  select t.last_read_at
  into v_last_read_at
  from public.manga_read_trackers t
  where t.reader_key = v_reader_key
    and t.manga_id = p_manga_id
    and t.chapter_ref = v_chapter_ref
  for update;

  if found and v_last_read_at >= v_now - interval '5 minutes' then
    v_should_increment := false;
  end if;

  select t.last_read_at
  into v_last_manga_read_at
  from public.manga_read_trackers t
  where t.reader_key = v_reader_key
    and t.manga_id = p_manga_id
  order by t.last_read_at desc
  limit 1;

  if v_last_manga_read_at is not null and v_last_manga_read_at >= v_now - interval '45 seconds' then
    v_should_increment := false;
  end if;

  insert into public.manga_read_trackers (
    reader_key,
    manga_id,
    chapter_ref,
    last_read_at,
    created_at,
    updated_at
  )
  values (
    v_reader_key,
    p_manga_id,
    v_chapter_ref,
    v_now,
    v_now,
    v_now
  )
  on conflict (reader_key, manga_id, chapter_ref)
  do update
  set last_read_at = excluded.last_read_at,
      updated_at = excluded.updated_at;

  if v_user_id is not null then
    insert into public.reading_history (
      user_id,
      manga_id,
      chapter_id,
      chapter_number,
      read_at,
      created_at
    )
    values (
      v_user_id,
      p_manga_id,
      v_target_chapter_id,
      coalesce(v_target_chapter_number, p_chapter_number),
      v_now,
      v_now
    )
    on conflict (user_id, manga_id)
    do update
    set chapter_id = excluded.chapter_id,
        chapter_number = excluded.chapter_number,
        read_at = excluded.read_at;
  end if;

  if v_should_increment then
    update public.mangas
    set total_views = total_views + 1
    where id = p_manga_id
      and is_active = true
      and is_approved = true
    returning total_views, fansub_id into v_total_views, v_fansub_id;

    if found then
      v_month_start := date_trunc('month', v_now)::date;

      insert into public.manga_monthly_views (
        month_start,
        manga_id,
        fansub_id,
        views,
        created_at,
        updated_at
      )
      values (
        v_month_start,
        p_manga_id,
        v_fansub_id,
        1,
        v_now,
        v_now
      )
      on conflict (month_start, manga_id)
      do update
      set views = public.manga_monthly_views.views + 1,
          fansub_id = excluded.fansub_id,
          updated_at = excluded.updated_at;
    else
      select m.total_views
      into v_total_views
      from public.mangas m
      where m.id = p_manga_id;
    end if;
  else
    select m.total_views
    into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
  end if;

  return coalesce(v_total_views, 0);
end;
$$;

grant execute on function public.track_manga_read(uuid, uuid, numeric, text) to anon, authenticated;

create or replace function public.list_public_release_schedule(
  p_fansub_id uuid default null,
  p_from timestamptz default null,
  p_days_ahead integer default 30,
  p_limit integer default 200
)
returns table (
  chapter_id uuid,
  manga_id uuid,
  manga_title text,
  manga_slug text,
  manga_cover_image_url text,
  fansub_id uuid,
  fansub_name text,
  fansub_slug text,
  chapter_number numeric,
  chapter_title text,
  publish_at timestamptz,
  is_upcoming boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('day', now()));
  v_days_ahead integer := least(greatest(coalesce(p_days_ahead, 30), 1), 120);
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_to timestamptz := v_from + make_interval(days => v_days_ahead);
begin
  return query
  select
    c.id as chapter_id,
    m.id as manga_id,
    m.title as manga_title,
    m.slug as manga_slug,
    m.cover_image_url as manga_cover_image_url,
    coalesce(c.fansub_id, m.fansub_id) as fansub_id,
    f.name as fansub_name,
    f.slug as fansub_slug,
    c.chapter_number,
    c.title as chapter_title,
    public.chapter_public_unlock_at(c.publish_at) as publish_at,
    (public.chapter_public_unlock_at(c.publish_at) > now()) as is_upcoming
  from public.chapters c
  join public.mangas m on m.id = c.manga_id
  left join public.fansubs f on f.id = coalesce(c.fansub_id, m.fansub_id)
  where c.is_active = true
    and c.is_approved = true
    and m.is_active = true
    and m.is_approved = true
    and coalesce(f.is_active, true) = true
    and c.publish_at is not null
    and public.chapter_public_unlock_at(c.publish_at) >= v_from
    and public.chapter_public_unlock_at(c.publish_at) < v_to
    and (
      p_fansub_id is null
      or coalesce(c.fansub_id, m.fansub_id) = p_fansub_id
    )
  order by public.chapter_public_unlock_at(c.publish_at) asc, m.title asc, c.chapter_number asc
  limit v_limit;
end;
$$;

revoke all on function public.list_public_release_schedule(uuid, timestamptz, integer, integer) from public;
grant execute on function public.list_public_release_schedule(uuid, timestamptz, integer, integer) to anon;
grant execute on function public.list_public_release_schedule(uuid, timestamptz, integer, integer) to authenticated;

commit;
