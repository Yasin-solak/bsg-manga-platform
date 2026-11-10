-- Shop v3: from-scratch product, season, campaign, discount, bundle and order model.
--
-- Boundary: the cosmetic definition (image, identifier) stays in store_items; ownership in users.owned_items,
-- balance in users.stones (profile, fansub, reward and code flows rely on these). Everything about sale
-- (price, window, stock, audience, season, campaign, discount, bundle) only in shop_* tables.
-- The client does not access tables directly; all read / write with security definer RPCs.

-- === Ayarlar ===================================================================================
create table public.shop_settings (
  id boolean primary key default true check (id),
  purchases_enabled boolean not null default true,
  daily_deal_enabled boolean not null default true,
  daily_deal_percent integer not null default 25 check (daily_deal_percent between 5 and 80),
  daily_deal_min_rarity text not null default 'rare' check (daily_deal_min_rarity in ('common', 'rare', 'epic', 'legendary')),
  rarity_bands jsonb not null default '{"common":[300,800],"rare":[800,1500],"epic":[1500,2500],"legendary":[2500,5000]}'::jsonb,
  refund_window_hours integer not null default 24 check (refund_window_hours between 0 and 720),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.shop_settings (id) values (true);

-- === Sezonlar ==================================================================================
create table public.shop_seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  tagline text check (tagline is null or char_length(tagline) <= 160),
  description text check (description is null or char_length(description) <= 1200),
  accent text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$'),
  banner_url text,
  banner_mobile_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

-- === Products ===================================================================================
-- kind: cosmetic (single cosmetic), bundle (2+ cosmetics), premium (timed membership).
-- display_type: type for catalog / discount scope (frame, background, profile_effect, bundle, premium).
create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  kind text not null check (kind in ('cosmetic', 'bundle', 'premium')),
  display_type text not null check (display_type in ('frame', 'background', 'profile_effect', 'bundle', 'premium')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  subtitle text check (subtitle is null or char_length(subtitle) <= 120),
  description text check (description is null or char_length(description) <= 1200),
  rarity text not null default 'rare' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  base_price integer not null check (base_price between 0 and 1000000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  available_from timestamptz,
  available_until timestamptz,
  audience text not null default 'everyone' check (audience in ('everyone', 'premium', 'reward_only')),
  stock_limit integer check (stock_limit is null or stock_limit > 0),
  sold_count integer not null default 0 check (sold_count >= 0),
  season_id uuid references public.shop_seasons(id) on delete set null,
  cover_url text,
  hero_url text,
  premium_days integer check (premium_days is null or premium_days between 1 and 365),
  bundle_mode text not null default 'proportional' check (bundle_mode in ('proportional', 'fixed', 'exclusive')),
  giftable boolean not null default true,
  hide_until_launch boolean not null default true,
  tags text[] not null default '{}',
  sort_weight integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_from is null or available_until is null or available_from < available_until),
  check (kind <> 'premium' or premium_days is not null),
  check ((kind = 'bundle') = (display_type = 'bundle')),
  check ((kind = 'premium') = (display_type = 'premium'))
);
create index shop_products_status_idx on public.shop_products (status);
create index shop_products_season_idx on public.shop_products (season_id);

create table public.shop_product_grants (
  product_id uuid not null references public.shop_products(id) on delete cascade,
  store_item_id uuid not null references public.store_items(id) on delete restrict,
  sort integer not null default 0,
  primary key (product_id, store_item_id)
);
create index shop_product_grants_item_idx on public.shop_product_grants (store_item_id);

-- === Kampanyalar ===============================================================================
create table public.shop_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('launch', 'sale', 'limited', 'premium_month', 'event')),
  headline text check (headline is null or char_length(headline) <= 120),
  body text check (body is null or char_length(body) <= 600),
  banner_url text,
  banner_mobile_url text,
  focus text not null default 'center' check (focus in ('left', 'center', 'right')),
  season_id uuid references public.shop_seasons(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  placements text[] not null default array['hero']::text[] check (placements <@ array['hero', 'collection_row', 'coming_soon']::text[]),
  notify_on_start boolean not null default false,
  notified_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.shop_campaign_products (
  campaign_id uuid not null references public.shop_campaigns(id) on delete cascade,
  product_id uuid not null references public.shop_products(id) on delete cascade,
  sort integer not null default 0,
  primary key (campaign_id, product_id)
);

-- === Discounts ================================================================================
-- Discounts do not stack: of rules matching a product the lowest price for the reader applies.
-- Bundles get only a rule explicitly targeted with scope = 'product'.
create table public.shop_discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  scope text not null check (scope in ('product', 'type', 'rarity', 'season', 'all')),
  product_ids uuid[] not null default '{}',
  target_type text check (target_type is null or target_type in ('frame', 'background', 'profile_effect', 'premium')),
  target_rarity text check (target_rarity is null or target_rarity in ('common', 'rare', 'epic', 'legendary')),
  season_id uuid references public.shop_seasons(id) on delete cascade,
  exclude_seasonal boolean not null default false,
  discount_type text not null check (discount_type in ('percent', 'fixed_price')),
  value integer not null check (value >= 0),
  audience text not null default 'everyone' check (audience in ('everyone', 'premium')),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or starts_at < ends_at),
  check (discount_type <> 'percent' or value between 1 and 90),
  check (scope <> 'type' or target_type is not null),
  check (scope <> 'rarity' or target_rarity is not null),
  check (scope <> 'season' or season_id is not null),
  check (scope <> 'product' or cardinality(product_ids) > 0)
);

create table public.shop_daily_deal_overrides (
  day date primary key,
  product_id uuid not null references public.shop_products(id) on delete cascade,
  percent integer check (percent is null or percent between 5 and 80),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- === Siparisler ================================================================================
create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  buyer_user_id uuid not null references public.users(id) on delete restrict,
  recipient_user_id uuid not null references public.users(id) on delete restrict,
  is_gift boolean not null default false,
  gift_message text check (gift_message is null or char_length(gift_message) <= 200),
  product_id uuid references public.shop_products(id) on delete set null,
  product_title text not null,
  product_kind text not null,
  list_price integer not null check (list_price >= 0),
  paid integer not null check (paid >= 0),
  price_source text not null default 'list',
  discount_id uuid references public.shop_discounts(id) on delete set null,
  granted jsonb not null default '[]'::jsonb,
  premium_days integer,
  request_key uuid not null,
  status text not null default 'completed' check (status in ('completed', 'refunded')),
  refunded_at timestamptz,
  refunded_by uuid references public.users(id) on delete set null,
  refund_reason text,
  created_at timestamptz not null default now(),
  unique (buyer_user_id, request_key)
);
create index shop_orders_created_idx on public.shop_orders (created_at desc);
create index shop_orders_recipient_idx on public.shop_orders (recipient_user_id);
create index shop_orders_product_idx on public.shop_orders (product_id);

create table public.shop_wishlist (
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.shop_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.shop_reminders (
  user_id uuid not null references public.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('product', 'campaign')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (user_id, target_kind, target_id)
);

-- All shop tables via RPC only: no direct access.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'shop_settings', 'shop_seasons', 'shop_products', 'shop_product_grants', 'shop_campaigns',
    'shop_campaign_products', 'shop_discounts', 'shop_daily_deal_overrides', 'shop_orders',
    'shop_wishlist', 'shop_reminders'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon, authenticated', v_table);
  end loop;
end $$;

-- === Yardimcilar ===============================================================================
create or replace function app_private.shop_rarity_rank(p_rarity text)
returns integer language sql immutable set search_path = '' as $$
  select case p_rarity when 'common' then 1 when 'rare' then 2 when 'epic' then 3 when 'legendary' then 4 else 0 end
$$;

-- Discount price rounds to 10; a paid product never falls to 0.
create or replace function app_private.shop_round_price(p_value numeric, p_list integer)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_list <= 0 then 0
    else least(p_list, greatest(1, (round(p_value / 10.0) * 10)::integer))
  end
$$;

create or replace function app_private.shop_owns_item(p_owned jsonb, p_type text, p_identifier text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    (coalesce(p_owned, '{}'::jsonb) -> app_private.store_owned_items_key_for_type(p_type)) ? p_identifier,
    false
  )
$$;

-- Urunun anlik durumu. Sezona bagli urunde pencere bos ise sezonun penceresi gecerli; sezon
-- yayinda degilse urun de yayinda sayilmaz.
create or replace function app_private.shop_product_state(p_product_id uuid, p_at timestamptz)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p.status = 'draft' then 'draft'
    when p.status = 'archived' then 'archived'
    when p.season_id is not null and coalesce(s.status, 'draft') <> 'published' then 'draft'
    when coalesce(p.available_from, s.starts_at) > p_at then 'upcoming'
    when coalesce(p.available_until, s.ends_at) <= p_at then 'ended'
    when p.stock_limit is not null and p.sold_count >= p.stock_limit then 'sold_out'
    else 'live'
  end
  from public.shop_products p
  left join public.shop_seasons s on s.id = p.season_id
  where p.id = p_product_id
$$;

-- Deal of the day: a product hand-picked for that day, otherwise a date-based selection (same for everyone)
-- from live and rare enough cosmetics.
create or replace function app_private.shop_daily_deal(p_day date)
returns table (product_id uuid, percent integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_settings public.shop_settings%rowtype;
  v_override public.shop_daily_deal_overrides%rowtype;
begin
  select * into v_settings from public.shop_settings where id;
  if not found or not v_settings.daily_deal_enabled then
    return;
  end if;

  select * into v_override from public.shop_daily_deal_overrides o where o.day = p_day;
  if found then
    product_id := v_override.product_id;
    percent := coalesce(v_override.percent, v_settings.daily_deal_percent);
    return next;
    return;
  end if;

  return query
    select p.id, v_settings.daily_deal_percent
    from public.shop_products p
    where p.kind = 'cosmetic'
      and p.audience = 'everyone'
      and p.base_price > 0
      and app_private.shop_product_state(p.id, now()) = 'live'
      and app_private.shop_rarity_rank(p.rarity) >= app_private.shop_rarity_rank(v_settings.daily_deal_min_rarity)
    order by md5(p_day::text || p.id::text)
    limit 1;
end;
$$;

-- All valid price candidates for a product (list, matching discounts, deal of the day).
create or replace function app_private.shop_price_candidates(p_product_id uuid, p_at timestamptz, p_is_premium boolean)
returns table (source text, discount_id uuid, label text, price integer)
language sql stable security definer set search_path = '' as $$
  with product as (
    select * from public.shop_products where id = p_product_id
  ), deal as (
    select d.product_id, d.percent from app_private.shop_daily_deal((p_at at time zone 'Europe/Istanbul')::date) d
  )
  select 'list'::text, null::uuid, null::text, pr.base_price from product pr
  union all
  select 'discount'::text, d.id, d.name,
    case d.discount_type
      when 'percent' then app_private.shop_round_price(pr.base_price * (100 - d.value) / 100.0, pr.base_price)
      else least(pr.base_price, d.value)
    end
  from product pr
  join public.shop_discounts d
    on d.status = 'published'
   and (d.starts_at is null or d.starts_at <= p_at)
   and (d.ends_at is null or d.ends_at > p_at)
   and (d.audience = 'everyone' or p_is_premium)
   and (not d.exclude_seasonal or pr.season_id is null)
   and (
     (d.scope = 'product' and pr.id = any(d.product_ids))
     or (d.scope = 'type' and d.target_type = pr.display_type and pr.kind <> 'bundle')
     or (d.scope = 'rarity' and d.target_rarity = pr.rarity and pr.kind = 'cosmetic')
     or (d.scope = 'season' and d.season_id = pr.season_id and pr.kind = 'cosmetic')
     or (d.scope = 'all' and pr.kind = 'cosmetic')
   )
  union all
  select 'daily_deal'::text, null::uuid, null::text,
    app_private.shop_round_price(pr.base_price * (100 - deal.percent) / 100.0, pr.base_price)
  from product pr
  join deal on deal.product_id = pr.id
$$;

-- Price and purchasability for a buyer / gift recipient.
create or replace function app_private.shop_quote(p_product_id uuid, p_buyer uuid, p_recipient uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_product public.shop_products%rowtype;
  v_state text;
  v_is_premium boolean := false;
  v_owned jsonb := '{}'::jsonb;
  v_recipient uuid := coalesce(p_recipient, p_buyer);
  v_price integer;
  v_source text := 'list';
  v_discount_id uuid;
  v_label text;
  v_total integer := 0;
  v_owned_count integer := 0;
  v_partial boolean := false;
  v_purchasable boolean := true;
  v_reason text;
begin
  select * into v_product from public.shop_products where id = p_product_id;
  if not found then
    return null;
  end if;

  v_state := app_private.shop_product_state(p_product_id, now());
  if p_buyer is not null then
    v_is_premium := app_private.user_has_active_premium(p_buyer);
  end if;

  select c.source, c.discount_id, c.label, c.price
  into v_source, v_discount_id, v_label, v_price
  from app_private.shop_price_candidates(p_product_id, now(), v_is_premium) c
  order by c.price asc, case c.source when 'list' then 0 else 1 end
  limit 1;

  if v_recipient is not null then
    select coalesce(u.owned_items, '{}'::jsonb) into v_owned from public.users u where u.id = v_recipient;
  end if;

  if v_product.kind <> 'premium' then
    select count(*)::integer,
           count(*) filter (where app_private.shop_owns_item(v_owned, s.type, coalesce(s.identifier, s.id::text)))::integer
    into v_total, v_owned_count
    from public.shop_product_grants g
    join public.store_items s on s.id = g.store_item_id
    where g.product_id = p_product_id;
  end if;

  if v_product.kind = 'bundle' and v_product.bundle_mode = 'proportional'
     and v_owned_count > 0 and v_owned_count < v_total then
    v_price := app_private.shop_round_price(v_price * (v_total - v_owned_count)::numeric / v_total, v_price);
    v_partial := true;
  end if;

  if v_state <> 'live' then
    v_purchasable := false; v_reason := v_state;
  elsif v_product.audience = 'reward_only' then
    v_purchasable := false; v_reason := 'reward_only';
  elsif v_product.audience = 'premium' and not v_is_premium then
    v_purchasable := false; v_reason := 'premium_only';
  elsif v_product.kind <> 'premium' and v_total = 0 then
    v_purchasable := false; v_reason := 'empty';
  elsif v_product.kind <> 'premium' and v_owned_count = v_total then
    v_purchasable := false; v_reason := 'owned';
  elsif v_product.kind = 'bundle' and v_product.bundle_mode = 'exclusive' and v_owned_count > 0 then
    v_purchasable := false; v_reason := 'owned_part';
  end if;

  return jsonb_build_object(
    'listPrice', v_product.base_price,
    'price', v_price,
    'source', v_source,
    'discountId', v_discount_id,
    'discountLabel', v_label,
    'partial', v_partial,
    'ownedCount', v_owned_count,
    'grantCount', v_total,
    'purchasable', v_purchasable,
    'reason', v_reason,
    'state', v_state
  );
end;
$$;

-- Showcase / catalog card. Title and content do not show on pre-release hidden products.
create or replace function app_private.shop_card(p_product_id uuid, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'kind', p.kind,
    'type', p.display_type,
    'title', case when x.locked then null else p.title end,
    'subtitle', case when x.locked then null else p.subtitle end,
    'rarity', p.rarity,
    'cover', case when x.locked then null else p.cover_url end,
    'locked', x.locked,
    'seasonSlug', s.slug,
    'seasonName', s.name,
    'availableFrom', coalesce(p.available_from, s.starts_at),
    'availableUntil', coalesce(p.available_until, s.ends_at),
    'stockLeft', case when p.stock_limit is null then null else greatest(p.stock_limit - p.sold_count, 0) end,
    'premiumDays', p.premium_days,
    'tags', to_jsonb(p.tags),
    'wished', coalesce(p_viewer is not null and exists (
      select 1 from public.shop_wishlist w where w.user_id = p_viewer and w.product_id = p.id
    ), false),
    'quote', app_private.shop_quote(p.id, p_viewer, null),
    'grants', case when x.locked then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', si.id,
        'type', si.type,
        'identifier', coalesce(si.identifier, si.id::text),
        'name', si.name,
        'imageKey', si.image_key,
        'assetUrl', si.custom_asset_url,
        'posterUrl', si.poster_asset_url
      ) order by g.sort, si.name)
      from public.shop_product_grants g
      join public.store_items si on si.id = g.store_item_id
      where g.product_id = p.id
    ), '[]'::jsonb) end
  )
  from public.shop_products p
  left join public.shop_seasons s on s.id = p.season_id
  cross join lateral (
    select (app_private.shop_product_state(p.id, now()) = 'upcoming' and p.hide_until_launch) as locked
  ) x
  where p.id = p_product_id
$$;

create or replace function app_private.shop_season_summary(p_season_id uuid, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with owned as (
    select coalesce((select u.owned_items from public.users u where u.id = p_viewer), '{}'::jsonb) as items
  ), grants as (
    select distinct si.id, si.type, coalesce(si.identifier, si.id::text) as identifier
    from public.shop_products p
    join public.shop_product_grants g on g.product_id = p.id
    join public.store_items si on si.id = g.store_item_id
    where p.season_id = p_season_id and p.status = 'published' and p.kind = 'cosmetic'
  )
  select jsonb_build_object(
    'id', s.id,
    'slug', s.slug,
    'name', s.name,
    'tagline', s.tagline,
    'accent', s.accent,
    'banner', s.banner_url,
    'bannerMobile', s.banner_mobile_url,
    'startsAt', s.starts_at,
    'endsAt', s.ends_at,
    'live', s.starts_at <= now() and s.ends_at > now(),
    'productCount', (select count(*) from public.shop_products p where p.season_id = s.id and p.status = 'published'),
    'grantCount', (select count(*) from grants),
    'ownedCount', (select count(*) from grants g, owned o where app_private.shop_owns_item(o.items, g.type, g.identifier))
  )
  from public.shop_seasons s
  where s.id = p_season_id
$$;

create or replace function app_private.shop_campaign_json(p_campaign_id uuid, p_viewer uuid, p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'name', c.name,
    'kind', c.kind,
    'headline', c.headline,
    'body', c.body,
    'banner', c.banner_url,
    'bannerMobile', c.banner_mobile_url,
    'focus', c.focus,
    'startsAt', c.starts_at,
    'endsAt', c.ends_at,
    'reminded', coalesce(p_viewer is not null and exists (
      select 1 from public.shop_reminders r
      where r.user_id = p_viewer and r.target_kind = 'campaign' and r.target_id = c.id
    ), false),
    'season', case when s.id is null then null else jsonb_build_object('slug', s.slug, 'name', s.name, 'accent', s.accent) end,
    'products', coalesce((
      select jsonb_agg(app_private.shop_card(cp.product_id, p_viewer) order by cp.sort)
      from (
        select cp2.product_id, cp2.sort
        from public.shop_campaign_products cp2
        where cp2.campaign_id = c.id
          and app_private.shop_product_state(cp2.product_id, now()) in ('live', 'upcoming', 'sold_out')
        order by cp2.sort
        limit greatest(p_limit, 1)
      ) cp
    ), '[]'::jsonb)
  )
  from public.shop_campaigns c
  left join public.shop_seasons s on s.id = c.season_id
  where c.id = p_campaign_id
$$;

create or replace function app_private.shop_wallet(p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_viewer is null then null else (
    select jsonb_build_object(
      'balance', coalesce(u.stones, 0),
      'isPremium', coalesce(u.premium_expires_at > now(), false),
      'premiumExpiresAt', u.premium_expires_at
    )
    from public.users u where u.id = p_viewer
  ) end
$$;

-- === Okur RPC'leri =============================================================================
create or replace function public.shop_storefront()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := public.current_public_user_id();
  v_now timestamptz := now();
  v_day date := (now() at time zone 'Europe/Istanbul')::date;
  v_hero_id uuid;
  v_deal_id uuid;
  v_deal_percent integer;
begin
  select c.id into v_hero_id
  from public.shop_campaigns c
  where c.status = 'published' and 'hero' = any(c.placements) and c.starts_at <= v_now and c.ends_at > v_now
  order by c.starts_at desc
  limit 1;

  select d.product_id, d.percent into v_deal_id, v_deal_percent from app_private.shop_daily_deal(v_day) d;

  return jsonb_build_object(
    'hero', case when v_hero_id is null then null else app_private.shop_campaign_json(v_hero_id, v_viewer, 6) end,
    'rows', coalesce((
      select jsonb_agg(app_private.shop_campaign_json(c.id, v_viewer, 8) order by c.starts_at desc)
      from public.shop_campaigns c
      where c.status = 'published' and 'collection_row' = any(c.placements)
        and c.starts_at <= v_now and c.ends_at > v_now
    ), '[]'::jsonb),
    'comingSoon', coalesce((
      select jsonb_agg(app_private.shop_campaign_json(c.id, v_viewer, 0) - 'products' order by c.starts_at)
      from public.shop_campaigns c
      where c.status = 'published' and c.starts_at > v_now and c.starts_at < v_now + interval '14 days'
        and ('coming_soon' = any(c.placements) or 'hero' = any(c.placements))
    ), '[]'::jsonb),
    'dailyDeal', case when v_deal_id is null then null else jsonb_build_object(
      'percent', v_deal_percent,
      'endsAt', ((v_day + 1)::timestamp at time zone 'Europe/Istanbul'),
      'card', app_private.shop_card(v_deal_id, v_viewer)
    ) end,
    'newArrivals', coalesce((
      select jsonb_agg(app_private.shop_card(x.id, v_viewer) order by x.started desc)
      from (
        select p.id, coalesce(p.available_from, p.created_at) as started
        from public.shop_products p
        where p.kind <> 'premium' and app_private.shop_product_state(p.id, v_now) = 'live'
        order by 2 desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'topSellers', coalesce((
      select jsonb_agg(jsonb_build_object('rank', x.rn, 'card', app_private.shop_card(x.id, v_viewer)) order by x.rn)
      from (
        select p.id, row_number() over (order by coalesce(o.n, 0) desc, p.sold_count desc, p.title) as rn
        from public.shop_products p
        left join (
          select so.product_id, count(*) as n
          from public.shop_orders so
          where so.status = 'completed' and so.created_at > v_now - interval '7 days'
          group by so.product_id
        ) o on o.product_id = p.id
        where p.kind <> 'premium' and app_private.shop_product_state(p.id, v_now) = 'live'
        order by 2
        limit 5
      ) x
    ), '[]'::jsonb),
    'seasons', coalesce((
      select jsonb_agg(app_private.shop_season_summary(s.id, v_viewer) order by s.starts_at)
      from public.shop_seasons s
      where s.status = 'published' and s.ends_at > v_now and s.starts_at < v_now + interval '30 days'
    ), '[]'::jsonb),
    'premium', (
      select app_private.shop_card(p.id, v_viewer)
      from public.shop_products p
      where p.kind = 'premium' and app_private.shop_product_state(p.id, v_now) = 'live'
      order by p.sort_weight desc, p.created_at
      limit 1
    ),
    'wallet', app_private.shop_wallet(v_viewer)
  );
end;
$$;

create or replace function public.shop_catalog(
  p_type text default null,
  p_rarity text default null,
  p_season text default null,
  p_sort text default 'featured',
  p_filters text[] default '{}',
  p_max_price integer default null,
  p_search text default null,
  p_limit integer default 48,
  p_offset integer default 0
)
returns jsonb language sql stable security definer set search_path = '' as $$
  with viewer as (
    select public.current_public_user_id() as id
  ), live as (
    select p.*, s.slug as season_slug, s.name as season_name
    from public.shop_products p
    left join public.shop_seasons s on s.id = p.season_id
    where p.kind <> 'premium' and app_private.shop_product_state(p.id, now()) = 'live'
  ), base as (
    select l.id, l.title, l.sort_weight, l.sold_count, coalesce(l.available_from, l.created_at) as started,
           app_private.shop_card(l.id, (select id from viewer)) as card
    from live l
    where (p_type is null or l.display_type = p_type)
      and (p_rarity is null or l.rarity = p_rarity)
      and (p_season is null or l.season_slug = p_season)
      and (nullif(btrim(coalesce(p_search, '')), '') is null
           or l.title ilike '%' || btrim(p_search) || '%'
           or coalesce(l.season_name, '') ilike '%' || btrim(p_search) || '%'
           or exists (select 1 from unnest(l.tags) t where t ilike '%' || btrim(p_search) || '%'))
  ), filtered as (
    select b.*
    from base b
    where (not ('unowned' = any(p_filters)) or coalesce(b.card -> 'quote' ->> 'reason', '') <> 'owned')
      and (not ('sale' = any(p_filters)) or (b.card -> 'quote' ->> 'price')::integer < (b.card -> 'quote' ->> 'listPrice')::integer)
      and (not ('limited' = any(p_filters)) or b.card ->> 'availableUntil' is not null or b.card ->> 'stockLeft' is not null)
      and (not ('wishlist' = any(p_filters)) or coalesce((b.card ->> 'wished')::boolean, false))
      and (p_max_price is null or (b.card -> 'quote' ->> 'price')::integer <= p_max_price)
  ), ordered as (
    select f.card, row_number() over (order by
      case when p_sort = 'price_asc' then (f.card -> 'quote' ->> 'price')::integer end asc nulls last,
      case when p_sort = 'price_desc' then (f.card -> 'quote' ->> 'price')::integer end desc nulls last,
      case when p_sort = 'newest' then f.started end desc nulls last,
      case when p_sort = 'popular' then f.sold_count end desc nulls last,
      f.sort_weight desc, f.started desc, f.title
    ) as rn
    from filtered f
  )
  select jsonb_build_object(
    'total', (select count(*) from ordered),
    'items', coalesce((
      select jsonb_agg(o.card order by o.rn)
      from ordered o
      where o.rn > greatest(p_offset, 0) and o.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 96)
    ), '[]'::jsonb),
    'typeCounts', coalesce((select jsonb_object_agg(t.display_type, t.n) from (
      select l.display_type, count(*) as n from live l group by l.display_type
    ) t), '{}'::jsonb),
    'seasons', coalesce((select jsonb_agg(distinct jsonb_build_object('slug', l.season_slug, 'name', l.season_name))
      from live l where l.season_slug is not null), '[]'::jsonb),
    'wallet', app_private.shop_wallet((select id from viewer))
  )
$$;

create or replace function public.shop_product(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := public.current_public_user_id();
  v_product public.shop_products%rowtype;
  v_state text;
  v_locked boolean;
begin
  select * into v_product from public.shop_products where slug = p_slug;
  if not found then
    return null;
  end if;
  v_state := app_private.shop_product_state(v_product.id, now());
  if v_state in ('draft', 'archived') and not app_private.is_admin() then
    return null;
  end if;
  v_locked := v_state = 'upcoming' and v_product.hide_until_launch;

  return jsonb_build_object(
    'card', app_private.shop_card(v_product.id, v_viewer),
    'description', case when v_locked then null else v_product.description end,
    'hero', case when v_locked then null else v_product.hero_url end,
    'giftable', v_product.giftable,
    'bundleMode', v_product.bundle_mode,
    'audience', v_product.audience,
    'reminded', coalesce(v_viewer is not null and exists (
      select 1 from public.shop_reminders r
      where r.user_id = v_viewer and r.target_kind = 'product' and r.target_id = v_product.id
    ), false),
    'season', case when v_product.season_id is null then null else app_private.shop_season_summary(v_product.season_id, v_viewer) end,
    'owners', case when v_product.kind = 'cosmetic' and not v_locked then (
      select count(*) from public.users u, public.shop_product_grants g
      join public.store_items si on si.id = g.store_item_id
      where g.product_id = v_product.id
        and app_private.shop_owns_item(u.owned_items, si.type, coalesce(si.identifier, si.id::text))
    ) else null end,
    -- Bundle parts: for each part the live product selling it alone (if any).
    'parts', case when v_product.kind <> 'bundle' or v_locked then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'itemId', si.id,
        'owned', app_private.shop_owns_item(
          coalesce((select u.owned_items from public.users u where u.id = v_viewer), '{}'::jsonb),
          si.type, coalesce(si.identifier, si.id::text)),
        'product', (
          select app_private.shop_card(p2.id, v_viewer)
          from public.shop_products p2
          join public.shop_product_grants g2 on g2.product_id = p2.id
          where p2.kind = 'cosmetic' and g2.store_item_id = si.id
            and app_private.shop_product_state(p2.id, now()) in ('live', 'ended', 'sold_out')
          order by p2.status = 'published' desc, p2.created_at desc
          limit 1
        )
      ) order by g.sort, si.name)
      from public.shop_product_grants g
      join public.store_items si on si.id = g.store_item_id
      where g.product_id = v_product.id
    ), '[]'::jsonb) end,
    -- Live bundles containing this product.
    'bundles', coalesce((
      select jsonb_agg(app_private.shop_card(b.id, v_viewer))
      from public.shop_products b
      where b.kind = 'bundle' and b.id <> v_product.id
        and app_private.shop_product_state(b.id, now()) = 'live'
        and exists (
          select 1 from public.shop_product_grants bg
          join public.shop_product_grants pg on pg.store_item_id = bg.store_item_id
          where bg.product_id = b.id and pg.product_id = v_product.id
        )
    ), '[]'::jsonb),
    'related', coalesce((
      select jsonb_agg(app_private.shop_card(r.id, v_viewer))
      from (
        select p3.id
        from public.shop_products p3
        where p3.id <> v_product.id and p3.kind <> 'premium'
          and app_private.shop_product_state(p3.id, now()) = 'live'
          and (p3.season_id = v_product.season_id or p3.display_type = v_product.display_type)
        order by (p3.season_id is not distinct from v_product.season_id) desc, p3.sort_weight desc, p3.created_at desc
        limit 6
      ) r
    ), '[]'::jsonb),
    'wallet', app_private.shop_wallet(v_viewer)
  );
end;
$$;

create or replace function public.shop_season(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := public.current_public_user_id();
  v_season public.shop_seasons%rowtype;
begin
  select * into v_season from public.shop_seasons where slug = p_slug;
  if not found or (v_season.status <> 'published' and not app_private.is_admin()) then
    return null;
  end if;

  return jsonb_build_object(
    'season', app_private.shop_season_summary(v_season.id, v_viewer) || jsonb_build_object('description', v_season.description),
    -- Batch opening (drop): products opening the same day are a group.
    'drops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'startsAt', d.starts_at,
        'state', case when d.starts_at > now() then 'upcoming' else 'live' end,
        'items', d.items
      ) order by d.starts_at)
      from (
        select min(coalesce(p.available_from, v_season.starts_at)) as starts_at,
               jsonb_agg(app_private.shop_card(p.id, v_viewer) order by p.sort_weight desc, p.created_at) as items
        from public.shop_products p
        where p.season_id = v_season.id and p.status = 'published' and p.kind <> 'bundle'
        group by (coalesce(p.available_from, v_season.starts_at) at time zone 'Europe/Istanbul')::date
      ) d
    ), '[]'::jsonb),
    'bundles', coalesce((
      select jsonb_agg(app_private.shop_card(p.id, v_viewer) order by p.sort_weight desc, p.created_at)
      from public.shop_products p
      where p.season_id = v_season.id and p.status = 'published' and p.kind = 'bundle'
    ), '[]'::jsonb),
    'wallet', app_private.shop_wallet(v_viewer)
  );
end;
$$;

create or replace function public.shop_quote(p_product_id uuid, p_recipient_user_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select app_private.shop_quote(p_product_id, public.current_public_user_id(), p_recipient_user_id)
$$;

create or replace function public.shop_toggle_wishlist(p_product_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.current_public_user_id();
begin
  if v_user is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;
  delete from public.shop_wishlist where user_id = v_user and product_id = p_product_id;
  if found then
    return false;
  end if;
  insert into public.shop_wishlist (user_id, product_id) values (v_user, p_product_id);
  return true;
end;
$$;

create or replace function public.shop_toggle_reminder(p_target_kind text, p_target_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.current_public_user_id();
begin
  if v_user is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;
  if p_target_kind not in ('product', 'campaign') then
    raise exception 'Gecersiz hatirlatma hedefi.';
  end if;
  delete from public.shop_reminders where user_id = v_user and target_kind = p_target_kind and target_id = p_target_id;
  if found then
    return false;
  end if;
  insert into public.shop_reminders (user_id, target_kind, target_id) values (v_user, p_target_kind, p_target_id);
  return true;
end;
$$;

-- === Purchase ================================================================================
-- Single product, optional gift. Idempotent (buyer + request key). Balance is debited, cosmetics
-- go to the recipient inventory (users.owned_items), premium extends time; order, ledger and
-- inventory records are written. Bundle: parts the recipient holds are not given (prorated price).
create or replace function public.shop_purchase(
  p_product_id uuid,
  p_request_key uuid,
  p_recipient_user_id uuid default null,
  p_gift_message text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_buyer_id uuid := public.current_public_user_id();
  v_recipient_id uuid;
  v_is_gift boolean;
  v_existing public.shop_orders%rowtype;
  v_settings public.shop_settings%rowtype;
  v_product public.shop_products%rowtype;
  v_buyer public.users%rowtype;
  v_recipient public.users%rowtype;
  v_quote jsonb;
  v_price integer;
  v_owned jsonb;
  v_granted jsonb := '[]'::jsonb;
  v_grant record;
  v_key text;
  v_next_effect uuid;
  v_premium_start timestamptz;
  v_premium_end timestamptz;
  v_premium_item uuid;
  v_order_id uuid := gen_random_uuid();
  v_code text;
  v_message text := nullif(btrim(coalesce(p_gift_message, '')), '');
  v_buyer_balance integer;
begin
  if p_request_key is null then
    raise exception 'Satin alma istek anahtari zorunludur.';
  end if;
  if v_buyer_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;
  select * into v_settings from public.shop_settings where id;
  if not coalesce(v_settings.purchases_enabled, false) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;

  -- If the same request repeats return the first result.
  select * into v_existing from public.shop_orders where buyer_user_id = v_buyer_id and request_key = p_request_key;
  if found then
    if v_existing.product_id is distinct from p_product_id then
      raise exception 'Ayni istek anahtari farkli bir urun icin kullanilamaz.';
    end if;
    return jsonb_build_object(
      'orderId', v_existing.id, 'orderCode', v_existing.code, 'paid', v_existing.paid,
      'balance', (select u.stones from public.users u where u.id = v_buyer_id),
      'granted', v_existing.granted, 'idempotentReplay', true
    );
  end if;

  v_recipient_id := coalesce(p_recipient_user_id, v_buyer_id);
  v_is_gift := v_recipient_id <> v_buyer_id;
  if v_message is not null and char_length(v_message) > 200 then
    raise exception 'Hediye notu en fazla 200 karakter olabilir.';
  end if;

  -- Lock order is fixed (smaller id first): no deadlock on concurrent mutual gifts.
  perform 1 from public.users u where u.id in (v_buyer_id, v_recipient_id) order by u.id for update;
  select * into v_buyer from public.users where id = v_buyer_id;
  select * into v_recipient from public.users where id = v_recipient_id;
  if v_recipient.id is null or coalesce(v_recipient.is_active, true) = false or coalesce(v_recipient.is_banned, false) then
    raise exception 'Alici bulunamadi.';
  end if;

  select * into v_product from public.shop_products where id = p_product_id for update;
  if not found then
    raise exception 'Urun bulunamadi.';
  end if;
  if v_is_gift and not v_product.giftable then
    raise exception 'Bu urun hediye edilemez.';
  end if;

  v_quote := app_private.shop_quote(p_product_id, v_buyer_id, v_recipient_id);
  if not coalesce((v_quote ->> 'purchasable')::boolean, false) then
    raise exception '%', case v_quote ->> 'reason'
      when 'owned' then case when v_is_gift then 'Alici bu urune zaten sahip.' else 'Bu urun zaten envanterinizde.' end
      when 'owned_part' then 'Bu paketin bir parcasina zaten sahipsiniz.'
      when 'premium_only' then 'Bu urun yalniz Premium uyelere satiliyor.'
      when 'reward_only' then 'Bu urun satilmiyor, yalniz odul olarak veriliyor.'
      when 'upcoming' then 'Bu urun henuz satisa acilmadi.'
      when 'ended' then 'Bu urunun satis suresi doldu.'
      when 'sold_out' then 'Bu urunun stogu tukendi.'
      else 'Bu urun su anda satin alinamaz.'
    end;
  end if;

  v_price := (v_quote ->> 'price')::integer;
  if coalesce(v_buyer.stones, 0) < v_price then
    raise exception 'Yetersiz bakiye.';
  end if;

  v_owned := coalesce(v_recipient.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb);
  v_next_effect := v_recipient.active_profile_effect_id;

  if v_product.kind = 'premium' then
    select g.store_item_id into v_premium_item from public.shop_product_grants g where g.product_id = v_product.id limit 1;
    v_premium_start := greatest(now(), coalesce(v_recipient.premium_expires_at, now()));
    v_premium_end := v_premium_start + make_interval(days => v_product.premium_days);
  else
    for v_grant in
      select si.id, si.type, coalesce(si.identifier, si.id::text) as identifier
      from public.shop_product_grants g
      join public.store_items si on si.id = g.store_item_id
      where g.product_id = v_product.id
      order by g.sort
    loop
      if app_private.shop_owns_item(v_owned, v_grant.type, v_grant.identifier) then
        continue;
      end if;
      v_key := app_private.store_owned_items_key_for_type(v_grant.type);
      if v_key is null then
        continue;
      end if;
      v_owned := jsonb_set(v_owned, array[v_key], coalesce(v_owned -> v_key, '[]'::jsonb) || to_jsonb(v_grant.identifier), true);
      if v_grant.type = 'profile_effect' and v_next_effect is null then
        v_next_effect := v_grant.id;
      end if;
      v_granted := v_granted || jsonb_build_object('id', v_grant.id, 'type', v_grant.type, 'identifier', v_grant.identifier);
    end loop;
  end if;

  perform set_config('app.store_purchase_user_update', 'true', true);
  update public.users set stones = stones - v_price where id = v_buyer_id returning stones into v_buyer_balance;
  update public.users
  set owned_items = v_owned,
      active_profile_effect_id = v_next_effect,
      premium_expires_at = coalesce(v_premium_end, premium_expires_at)
  where id = v_recipient_id;
  perform set_config('app.store_purchase_user_update', '', true);

  if v_product.kind = 'premium' then
    insert into public.user_premium_subscriptions (
      user_id, package_id, runtime_config_id, premium_store_item_id, purchased_at,
      extension_started_at, extension_expires_at, extension_days, source
    ) values (
      v_recipient_id, null, null, v_premium_item, now(),
      v_premium_start, v_premium_end, v_product.premium_days, case when v_is_gift then 'shop_gift' else 'shop_purchase' end
    );
  end if;

  v_code := 'M' || upper(substr(md5(v_order_id::text || clock_timestamp()::text), 1, 7));
  insert into public.shop_orders (
    id, code, buyer_user_id, recipient_user_id, is_gift, gift_message, product_id, product_title, product_kind,
    list_price, paid, price_source, discount_id, granted, premium_days, request_key
  ) values (
    v_order_id, v_code, v_buyer_id, v_recipient_id, v_is_gift, v_message, v_product.id, v_product.title, v_product.kind,
    v_product.base_price, v_price, coalesce(v_quote ->> 'source', 'list'), nullif(v_quote ->> 'discountId', '')::uuid,
    v_granted, case when v_product.kind = 'premium' then v_product.premium_days end, p_request_key
  );

  if v_price > 0 then
    insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
    values (v_buyer_id, null, 'shop_order', v_order_id::text, 'debit', 'Coin', -v_price, v_buyer_balance,
      jsonb_build_object('product_id', v_product.id, 'order_code', v_code, 'is_gift', v_is_gift));
  end if;

  insert into public.user_inventory_items (user_id, store_item_id, item_type, item_identifier, acquired_via, order_id, source_kind, source_ref, metadata)
  select v_recipient_id, (g ->> 'id')::uuid, g ->> 'type', g ->> 'identifier',
    case when v_product.kind = 'bundle' then (case when v_is_gift then 'package_gift' else 'package_purchase' end)
         else (case when v_is_gift then 'gift' else 'purchase' end) end,
    null, 'shop_order', v_order_id::text, jsonb_build_object('product_id', v_product.id, 'order_code', v_code)
  from jsonb_array_elements(v_granted) g;

  update public.shop_products set sold_count = sold_count + 1 where id = v_product.id;

  if v_is_gift then
    perform public.push_notification(
      v_recipient_id,
      'system',
      'Sana bir hediye geldi!',
      format('%s sana "%s" hediye etti.', coalesce(v_buyer.display_name, v_buyer.username, 'Bir kullanici'), v_product.title)
        || case when v_message is not null then format(' Not: %s', v_message) else '' end,
      jsonb_build_object('event', 'shop_gift_received', 'product_slug', v_product.slug, 'order_code', v_code, 'sender_user_id', v_buyer_id),
      null::text
    );
  end if;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderCode', v_code,
    'paid', v_price,
    'balance', v_buyer_balance,
    'granted', v_granted,
    'premiumExpiresAt', v_premium_end,
    'idempotentReplay', false
  );
end;
$$;

-- === Permissions ==================================================================================
revoke all on function app_private.shop_rarity_rank(text) from public;
revoke all on function app_private.shop_round_price(numeric, integer) from public;
revoke all on function app_private.shop_owns_item(jsonb, text, text) from public;
revoke all on function app_private.shop_product_state(uuid, timestamptz) from public;
revoke all on function app_private.shop_daily_deal(date) from public;
revoke all on function app_private.shop_price_candidates(uuid, timestamptz, boolean) from public;
revoke all on function app_private.shop_quote(uuid, uuid, uuid) from public;
revoke all on function app_private.shop_card(uuid, uuid) from public;
revoke all on function app_private.shop_season_summary(uuid, uuid) from public;
revoke all on function app_private.shop_campaign_json(uuid, uuid, integer) from public;
revoke all on function app_private.shop_wallet(uuid) from public;

revoke all on function public.shop_storefront() from public;
revoke all on function public.shop_catalog(text, text, text, text, text[], integer, text, integer, integer) from public;
revoke all on function public.shop_product(text) from public;
revoke all on function public.shop_season(text) from public;
revoke all on function public.shop_quote(uuid, uuid) from public;
revoke all on function public.shop_toggle_wishlist(uuid) from public;
revoke all on function public.shop_toggle_reminder(text, uuid) from public;
revoke all on function public.shop_purchase(uuid, uuid, uuid, text) from public;

grant execute on function public.shop_storefront() to anon, authenticated;
grant execute on function public.shop_catalog(text, text, text, text, text[], integer, text, integer, integer) to anon, authenticated;
grant execute on function public.shop_product(text) to anon, authenticated;
grant execute on function public.shop_season(text) to anon, authenticated;
grant execute on function public.shop_quote(uuid, uuid) to authenticated;
grant execute on function public.shop_toggle_wishlist(uuid) to authenticated;
grant execute on function public.shop_toggle_reminder(text, uuid) to authenticated;
grant execute on function public.shop_purchase(uuid, uuid, uuid, text) to authenticated;

-- === Moving the existing catalog ================================================================
-- One product per cosmetic (frame, background, profile effect) and premium: those on sale are published,
-- others archived (can be republished from admin). Rarity is estimated from the price band.
insert into public.shop_products (slug, kind, display_type, title, description, rarity, base_price, status, cover_url, premium_days, created_at)
select
  left(regexp_replace(regexp_replace(lower(coalesce(si.identifier, si.id::text)), '[^a-z0-9-]+', '-', 'g'), '(^-+|-+$)', '', 'g'), 60)
    || '-' || substr(si.id::text, 1, 4),
  case si.type when 'premium' then 'premium' else 'cosmetic' end,
  si.type,
  left(btrim(si.name), 80),
  nullif(btrim(coalesce(si.description, '')), ''),
  case
    when si.type = 'premium' then 'legendary'
    when si.price >= 2500 then 'legendary'
    when si.price >= 1500 then 'epic'
    when si.price >= 800 then 'rare'
    else 'common'
  end,
  greatest(si.price, 0),
  case when si.is_active then 'published' else 'archived' end,
  coalesce(nullif(si.poster_asset_url, ''), nullif(si.custom_asset_url, '')),
  case when si.type = 'premium' then coalesce((select c.premium_duration_days from public.premium_runtime_config c where c.id), 30) end,
  si.created_at
from public.store_items si
where si.type in ('frame', 'background', 'profile_effect', 'premium');

insert into public.shop_product_grants (product_id, store_item_id, sort)
select p.id, si.id, 0
from public.store_items si
join public.shop_products p
  on p.slug = left(regexp_replace(regexp_replace(lower(coalesce(si.identifier, si.id::text)), '[^a-z0-9-]+', '-', 'g'), '(^-+|-+$)', '', 'g'), 60)
     || '-' || substr(si.id::text, 1, 4)
where si.type in ('frame', 'background', 'profile_effect', 'premium');
