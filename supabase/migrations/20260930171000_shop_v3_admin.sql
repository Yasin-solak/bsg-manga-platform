-- Shop v3 admin (Shop Control): product, season, campaign, discount, bundle, deal of the day,
-- order / refund, wallet and coin economy. All functions admin only.

create or replace function app_private.shop_assert_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;
end;
$$;

-- Urun sorunlari: level 'error' yayini engellemese de listede kirmizi; 'warn' uyari.
create or replace function app_private.shop_product_issues(p_product_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with p as (
    select * from public.shop_products where id = p_product_id
  ), g as (
    select si.* from public.shop_product_grants pg join public.store_items si on si.id = pg.store_item_id where pg.product_id = p_product_id
  ), band as (
    select (st.rarity_bands -> (select rarity from p) ->> 0)::integer as lo,
           (st.rarity_bands -> (select rarity from p) ->> 1)::integer as hi
    from public.shop_settings st where st.id
  )
  select coalesce(jsonb_agg(i.issue), '[]'::jsonb) from (
    select jsonb_build_object('code', 'no_grants', 'level', 'error') as issue
    from p where p.kind <> 'premium' and not exists (select 1 from g)
    union all
    select jsonb_build_object('code', 'bundle_small', 'level', 'error')
    from p where p.kind = 'bundle' and (select count(*) from g) between 1 and 1
    union all
    select jsonb_build_object('code', 'free', 'level', 'error')
    from p where p.base_price = 0 and p.audience = 'everyone' and p.status = 'published'
    union all
    select jsonb_build_object('code', 'no_image', 'level', 'error')
    from p where p.kind = 'cosmetic' and p.cover_url is null
      and exists (select 1 from g where coalesce(g.image_key, g.custom_asset_url, g.poster_asset_url) is null)
    union all
    select jsonb_build_object('code', 'band', 'level', 'warn', 'lo', b.lo, 'hi', b.hi)
    from p, band b where p.kind = 'cosmetic' and b.lo is not null and (p.base_price < b.lo or p.base_price > b.hi)
    union all
    select jsonb_build_object('code', 'short_description', 'level', 'warn')
    from p where p.status = 'published' and p.kind <> 'premium' and char_length(coalesce(p.description, '')) < 40
  ) i
$$;

create or replace function app_private.shop_admin_product_row(p_product_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'kind', p.kind, 'type', p.display_type, 'title', p.title,
    'subtitle', p.subtitle, 'description', p.description, 'rarity', p.rarity, 'basePrice', p.base_price,
    'status', p.status, 'state', app_private.shop_product_state(p.id, now()),
    'availableFrom', p.available_from, 'availableUntil', p.available_until,
    'audience', p.audience, 'stockLimit', p.stock_limit, 'soldCount', p.sold_count,
    'seasonId', p.season_id, 'seasonName', s.name, 'cover', p.cover_url, 'hero', p.hero_url,
    'premiumDays', p.premium_days, 'bundleMode', p.bundle_mode, 'giftable', p.giftable,
    'hideUntilLaunch', p.hide_until_launch, 'tags', to_jsonb(p.tags), 'sortWeight', p.sort_weight,
    'updatedAt', p.updated_at, 'createdAt', p.created_at,
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', si.id, 'type', si.type, 'identifier', coalesce(si.identifier, si.id::text), 'name', si.name,
        'imageKey', si.image_key, 'assetUrl', si.custom_asset_url, 'posterUrl', si.poster_asset_url
      ) order by g.sort, si.name)
      from public.shop_product_grants g join public.store_items si on si.id = g.store_item_id
      where g.product_id = p.id
    ), '[]'::jsonb),
    'orders', (select count(*) from public.shop_orders o where o.product_id = p.id and o.status = 'completed'),
    'revenue', (select coalesce(sum(o.paid), 0) from public.shop_orders o where o.product_id = p.id and o.status = 'completed'),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status))
      from public.shop_campaign_products cp join public.shop_campaigns c on c.id = cp.campaign_id
      where cp.product_id = p.id and c.status <> 'archived'
    ), '[]'::jsonb),
    'issues', app_private.shop_product_issues(p.id)
  )
  from public.shop_products p
  left join public.shop_seasons s on s.id = p.season_id
  where p.id = p_product_id
$$;

-- === Genel bakis ===============================================================================
create or replace function public.shop_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
begin
  perform app_private.shop_assert_admin();
  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'products', (select count(*) from public.shop_products where status <> 'archived'),
      'live', (select count(*) from public.shop_products p where app_private.shop_product_state(p.id, v_now) = 'live'),
      'upcoming', (select count(*) from public.shop_products p where app_private.shop_product_state(p.id, v_now) = 'upcoming'),
      'drafts', (select count(*) from public.shop_products where status = 'draft'),
      'archived', (select count(*) from public.shop_products where status = 'archived'),
      'orders7d', (select count(*) from public.shop_orders where status = 'completed' and created_at > v_now - interval '7 days'),
      'coins7d', (select coalesce(sum(paid), 0) from public.shop_orders where status = 'completed' and created_at > v_now - interval '7 days'),
      'buyers7d', (select count(distinct buyer_user_id) from public.shop_orders where status = 'completed' and created_at > v_now - interval '7 days'),
      'ordersTotal', (select count(*) from public.shop_orders where status = 'completed'),
      'coinsAllTime', (select coalesce(-sum(amount), 0) from public.store_wallet_ledger where entry_type = 'debit'),
      'activePremium', (select count(*) from public.users where premium_expires_at > v_now)
    ),
    'productIssues', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'state', app_private.shop_product_state(p.id, v_now), 'issues', i.issues))
      from public.shop_products p
      cross join lateral (select app_private.shop_product_issues(p.id) as issues) i
      where p.status <> 'archived' and jsonb_array_length(i.issues) > 0
        and exists (select 1 from jsonb_array_elements(i.issues) e where e ->> 'level' = 'error')
    ), '[]'::jsonb),
    'warnings', jsonb_build_object(
      'noHero', not exists (
        select 1 from public.shop_campaigns c
        where c.status = 'published' and 'hero' = any(c.placements) and c.starts_at <= v_now and c.ends_at > v_now
      ),
      'heroConflicts', coalesce((
        select jsonb_agg(jsonb_build_object('a', a.name, 'b', b.name))
        from public.shop_campaigns a join public.shop_campaigns b
          on a.id < b.id and a.status = 'published' and b.status = 'published'
         and 'hero' = any(a.placements) and 'hero' = any(b.placements)
         and a.starts_at < b.ends_at and b.starts_at < a.ends_at and b.ends_at > v_now
      ), '[]'::jsonb),
      'bandWarnings', (
        select count(*) from public.shop_products p
        where p.status = 'published'
          and exists (select 1 from jsonb_array_elements(app_private.shop_product_issues(p.id)) e where e ->> 'code' = 'band')
      )
    ),
    'upcoming', coalesce((
      select jsonb_agg(u.item order by u.at) from (
        select c.starts_at as at, jsonb_build_object('kind', 'campaign', 'id', c.id, 'title', c.name, 'at', c.starts_at, 'type', c.kind) as item
        from public.shop_campaigns c where c.status = 'published' and c.starts_at between v_now and v_now + interval '14 days'
        union all
        select s.starts_at, jsonb_build_object('kind', 'season', 'id', s.id, 'title', s.name, 'at', s.starts_at, 'type', 'season')
        from public.shop_seasons s where s.status = 'published' and s.starts_at between v_now and v_now + interval '14 days'
        union all
        select d.starts_at, jsonb_build_object('kind', 'discount', 'id', d.id, 'title', d.name, 'at', d.starts_at, 'type', 'discount')
        from public.shop_discounts d where d.status = 'published' and d.starts_at between v_now and v_now + interval '14 days'
        union all
        select p.available_from, jsonb_build_object('kind', 'product', 'id', p.id, 'title', p.title, 'at', p.available_from, 'type', p.display_type)
        from public.shop_products p where p.status = 'published' and p.available_from between v_now and v_now + interval '14 days'
      ) u
    ), '[]'::jsonb),
    'recentOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'code', o.code, 'title', o.product_title, 'paid', o.paid, 'status', o.status, 'isGift', o.is_gift,
        'createdAt', o.created_at, 'buyer', b.username, 'buyerAvatar', b.avatar_url, 'recipient', r.username
      ) order by o.created_at desc)
      from (select * from public.shop_orders order by created_at desc limit 8) o
      join public.users b on b.id = o.buyer_user_id
      join public.users r on r.id = o.recipient_user_id
    ), '[]'::jsonb),
    'dailyCoins', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'coins', coalesce(x.coins, 0), 'orders', coalesce(x.orders, 0)) order by d.day)
      from generate_series(((v_now at time zone 'Europe/Istanbul')::date - 13)::timestamp, (v_now at time zone 'Europe/Istanbul')::date::timestamp, interval '1 day') d(day)
      left join (
        select (o.created_at at time zone 'Europe/Istanbul')::date as day, sum(o.paid) as coins, count(*) as orders
        from public.shop_orders o where o.status = 'completed' and o.created_at > v_now - interval '15 days'
        group by 1
      ) x on x.day = d.day::date
    ), '[]'::jsonb),
    'spendMix', coalesce((
      select jsonb_agg(jsonb_build_object('source', l.source_kind, 'coins', l.coins) order by l.coins desc)
      from (
        select source_kind, -sum(amount) as coins from public.store_wallet_ledger
        where entry_type = 'debit' and created_at > v_now - interval '30 days' group by source_kind
      ) l
    ), '[]'::jsonb)
  );
end;
$$;

-- === Urunler ===================================================================================
create or replace function public.shop_admin_products(p_filter text default 'all', p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  return coalesce((
    select jsonb_agg(r.row order by r.sort_key desc, r.updated desc)
    from (
      select app_private.shop_admin_product_row(p.id) as row,
             case app_private.shop_product_state(p.id, now()) when 'live' then 3 when 'upcoming' then 2 when 'draft' then 1 else 0 end as sort_key,
             p.updated_at as updated
      from public.shop_products p
      where (nullif(btrim(coalesce(p_search, '')), '') is null or p.title ilike '%' || btrim(p_search) || '%' or p.slug ilike '%' || btrim(p_search) || '%')
        and case coalesce(p_filter, 'all')
          when 'all' then p.status <> 'archived'
          when 'archived' then p.status = 'archived'
          when 'draft' then p.status = 'draft'
          when 'issues' then p.status <> 'archived' and exists (
            select 1 from jsonb_array_elements(app_private.shop_product_issues(p.id)) e where e ->> 'level' = 'error')
          else app_private.shop_product_state(p.id, now()) = p_filter
        end
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.shop_admin_product(p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  return app_private.shop_admin_product_row(p_product_id);
end;
$$;

create or replace function public.shop_admin_save_product(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_kind text := coalesce(p ->> 'kind', 'cosmetic');
  v_grants uuid[];
  v_type text;
  v_bad integer;
begin
  perform app_private.shop_assert_admin();

  select coalesce(array_agg(x.value::uuid order by x.ordinality), '{}')
  into v_grants
  from jsonb_array_elements_text(coalesce(p -> 'grants', '[]'::jsonb)) with ordinality x(value, ordinality);

  if v_kind not in ('cosmetic', 'bundle', 'premium') then
    raise exception 'Gecersiz urun turu.';
  end if;
  if v_kind = 'cosmetic' and cardinality(v_grants) <> 1 then
    raise exception 'Tek urun tam olarak bir kozmetik icermeli.';
  end if;
  if v_kind = 'bundle' and cardinality(v_grants) < 2 then
    raise exception 'Paket en az iki kozmetik icermeli.';
  end if;
  if v_kind = 'premium' and cardinality(v_grants) <> 1 then
    raise exception 'Premium urunu bir premium kaydina baglanmali.';
  end if;

  select count(*) into v_bad
  from public.store_items si
  where si.id = any(v_grants)
    and case v_kind
      when 'premium' then si.type <> 'premium'
      else si.type not in ('frame', 'background', 'profile_effect')
    end;
  if v_bad > 0 or (select count(*) from public.store_items si where si.id = any(v_grants)) <> cardinality(v_grants) then
    raise exception 'Urun icerigi gecersiz: yalniz cerceve, arka plan ve profil efekti (premium icin premium kaydi).';
  end if;

  v_type := case v_kind
    when 'bundle' then 'bundle'
    when 'premium' then 'premium'
    else (select si.type from public.store_items si where si.id = v_grants[1])
  end;

  if v_id is null then
    insert into public.shop_products (
      slug, kind, display_type, title, subtitle, description, rarity, base_price, status,
      available_from, available_until, audience, stock_limit, season_id, cover_url, hero_url,
      premium_days, bundle_mode, giftable, hide_until_launch, tags, sort_weight, created_by
    ) values (
      p ->> 'slug', v_kind, v_type, btrim(p ->> 'title'), nullif(btrim(coalesce(p ->> 'subtitle', '')), ''),
      nullif(btrim(coalesce(p ->> 'description', '')), ''), coalesce(p ->> 'rarity', 'rare'),
      coalesce((p ->> 'basePrice')::integer, 0), coalesce(p ->> 'status', 'draft'),
      nullif(p ->> 'availableFrom', '')::timestamptz, nullif(p ->> 'availableUntil', '')::timestamptz,
      coalesce(p ->> 'audience', 'everyone'), nullif(p ->> 'stockLimit', '')::integer,
      nullif(p ->> 'seasonId', '')::uuid, nullif(p ->> 'cover', ''), nullif(p ->> 'hero', ''),
      nullif(p ->> 'premiumDays', '')::integer, coalesce(p ->> 'bundleMode', 'proportional'),
      coalesce((p ->> 'giftable')::boolean, true), coalesce((p ->> 'hideUntilLaunch')::boolean, true),
      coalesce((select array_agg(t) from jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb)) t), '{}'),
      coalesce((p ->> 'sortWeight')::integer, 0), public.current_public_user_id()
    ) returning id into v_id;
  else
    update public.shop_products set
      slug = p ->> 'slug',
      kind = v_kind,
      display_type = v_type,
      title = btrim(p ->> 'title'),
      subtitle = nullif(btrim(coalesce(p ->> 'subtitle', '')), ''),
      description = nullif(btrim(coalesce(p ->> 'description', '')), ''),
      rarity = coalesce(p ->> 'rarity', 'rare'),
      base_price = coalesce((p ->> 'basePrice')::integer, 0),
      status = coalesce(p ->> 'status', 'draft'),
      available_from = nullif(p ->> 'availableFrom', '')::timestamptz,
      available_until = nullif(p ->> 'availableUntil', '')::timestamptz,
      audience = coalesce(p ->> 'audience', 'everyone'),
      stock_limit = nullif(p ->> 'stockLimit', '')::integer,
      season_id = nullif(p ->> 'seasonId', '')::uuid,
      cover_url = nullif(p ->> 'cover', ''),
      hero_url = nullif(p ->> 'hero', ''),
      premium_days = nullif(p ->> 'premiumDays', '')::integer,
      bundle_mode = coalesce(p ->> 'bundleMode', 'proportional'),
      giftable = coalesce((p ->> 'giftable')::boolean, true),
      hide_until_launch = coalesce((p ->> 'hideUntilLaunch')::boolean, true),
      tags = coalesce((select array_agg(t) from jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb)) t), '{}'),
      sort_weight = coalesce((p ->> 'sortWeight')::integer, 0),
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'Urun bulunamadi.';
    end if;
  end if;

  delete from public.shop_product_grants where product_id = v_id and not (store_item_id = any(v_grants));
  insert into public.shop_product_grants (product_id, store_item_id, sort)
  select v_id, g.item, g.ord::integer
  from unnest(v_grants) with ordinality g(item, ord)
  on conflict (product_id, store_item_id) do update set sort = excluded.sort;

  return v_id;
end;
$$;

create or replace function public.shop_admin_bulk_products(p_ids uuid[], p_action text, p_value jsonb default '{}'::jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  perform app_private.shop_assert_admin();
  case p_action
    when 'publish' then update public.shop_products set status = 'published', updated_at = now() where id = any(p_ids);
    when 'draft' then update public.shop_products set status = 'draft', updated_at = now() where id = any(p_ids);
    when 'archive' then update public.shop_products set status = 'archived', updated_at = now() where id = any(p_ids);
    when 'set_season' then update public.shop_products set season_id = nullif(p_value ->> 'seasonId', '')::uuid, updated_at = now() where id = any(p_ids);
    when 'set_window' then update public.shop_products set
        available_from = nullif(p_value ->> 'availableFrom', '')::timestamptz,
        available_until = nullif(p_value ->> 'availableUntil', '')::timestamptz,
        updated_at = now()
      where id = any(p_ids);
    when 'set_rarity' then update public.shop_products set rarity = p_value ->> 'rarity', updated_at = now() where id = any(p_ids);
    else raise exception 'Gecersiz toplu islem.';
  end case;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Cosmetic records for the product picker / new product (including those off sale).
create or replace function public.shop_admin_cosmetics(p_search text default null, p_type text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', si.id, 'type', si.type, 'identifier', coalesce(si.identifier, si.id::text), 'name', si.name,
      'imageKey', si.image_key, 'assetUrl', si.custom_asset_url, 'posterUrl', si.poster_asset_url,
      'legacyPrice', si.price, 'createdAt', si.created_at,
      'owners', (select count(*) from public.users u where app_private.shop_owns_item(u.owned_items, si.type, coalesce(si.identifier, si.id::text))),
      'products', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'kind', p.kind, 'status', p.status))
        from public.shop_product_grants g join public.shop_products p on p.id = g.product_id
        where g.store_item_id = si.id
      ), '[]'::jsonb)
    ) order by si.created_at desc)
    from public.store_items si
    where si.type in ('frame', 'background', 'profile_effect', 'premium')
      and (p_type is null or si.type = p_type)
      and (nullif(btrim(coalesce(p_search, '')), '') is null or si.name ilike '%' || btrim(p_search) || '%' or si.identifier ilike '%' || btrim(p_search) || '%')
  ), '[]'::jsonb);
end;
$$;

-- === Sezon / kampanya / indirim =================================================================
create or replace function public.shop_admin_merch()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  perform app_private.shop_assert_admin();
  return jsonb_build_object(
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'slug', s.slug, 'name', s.name, 'tagline', s.tagline, 'description', s.description,
        'accent', s.accent, 'banner', s.banner_url, 'bannerMobile', s.banner_mobile_url,
        'startsAt', s.starts_at, 'endsAt', s.ends_at, 'status', s.status,
        'state', case when s.status <> 'published' then s.status when s.starts_at > v_now then 'scheduled' when s.ends_at <= v_now then 'ended' else 'live' end,
        'productCount', (select count(*) from public.shop_products p where p.season_id = s.id and p.status <> 'archived')
      ) order by s.starts_at desc)
      from public.shop_seasons s where s.status <> 'archived'
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'name', c.name, 'kind', c.kind, 'headline', c.headline, 'body', c.body,
        'banner', c.banner_url, 'bannerMobile', c.banner_mobile_url, 'focus', c.focus, 'seasonId', c.season_id,
        'startsAt', c.starts_at, 'endsAt', c.ends_at, 'placements', to_jsonb(c.placements),
        'notifyOnStart', c.notify_on_start, 'status', c.status,
        'state', case when c.status <> 'published' then c.status when c.starts_at > v_now then 'scheduled' when c.ends_at <= v_now then 'ended' else 'live' end,
        'products', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'type', p.display_type, 'cover', p.cover_url,
            'price', p.base_price, 'state', app_private.shop_product_state(p.id, v_now)) order by cp.sort)
          from public.shop_campaign_products cp join public.shop_products p on p.id = cp.product_id
          where cp.campaign_id = c.id
        ), '[]'::jsonb)
      ) order by c.starts_at desc)
      from public.shop_campaigns c where c.status <> 'archived'
    ), '[]'::jsonb),
    'discounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'scope', d.scope, 'productIds', to_jsonb(d.product_ids), 'targetType', d.target_type,
        'targetRarity', d.target_rarity, 'seasonId', d.season_id, 'excludeSeasonal', d.exclude_seasonal,
        'discountType', d.discount_type, 'value', d.value, 'audience', d.audience,
        'startsAt', d.starts_at, 'endsAt', d.ends_at, 'status', d.status,
        'state', case when d.status <> 'published' then d.status
                      when d.starts_at is not null and d.starts_at > v_now then 'scheduled'
                      when d.ends_at is not null and d.ends_at <= v_now then 'ended' else 'live' end
      ) order by d.created_at desc)
      from public.shop_discounts d where d.status <> 'archived'
    ), '[]'::jsonb),
    'dailyDeals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', g.day::date, 'productId', dd.product_id, 'percent', dd.percent,
        'title', (select p.title from public.shop_products p where p.id = dd.product_id),
        'override', exists (select 1 from public.shop_daily_deal_overrides o where o.day = g.day::date)
      ) order by g.day)
      from generate_series(v_today::timestamp, (v_today + 13)::timestamp, interval '1 day') g(day)
      left join lateral app_private.shop_daily_deal(g.day::date) dd on true
    ), '[]'::jsonb),
    'settings', (select to_jsonb(s) - 'id' from public.shop_settings s where s.id)
  );
end;
$$;

create or replace function public.shop_admin_save_season(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform app_private.shop_assert_admin();
  if v_id is null then
    insert into public.shop_seasons (slug, name, tagline, description, accent, banner_url, banner_mobile_url, starts_at, ends_at, status, created_by)
    values (p ->> 'slug', btrim(p ->> 'name'), nullif(btrim(coalesce(p ->> 'tagline', '')), ''), nullif(btrim(coalesce(p ->> 'description', '')), ''),
      nullif(p ->> 'accent', ''), nullif(p ->> 'banner', ''), nullif(p ->> 'bannerMobile', ''),
      (p ->> 'startsAt')::timestamptz, (p ->> 'endsAt')::timestamptz, coalesce(p ->> 'status', 'draft'), public.current_public_user_id())
    returning id into v_id;
  else
    update public.shop_seasons set
      slug = p ->> 'slug', name = btrim(p ->> 'name'),
      tagline = nullif(btrim(coalesce(p ->> 'tagline', '')), ''), description = nullif(btrim(coalesce(p ->> 'description', '')), ''),
      accent = nullif(p ->> 'accent', ''), banner_url = nullif(p ->> 'banner', ''), banner_mobile_url = nullif(p ->> 'bannerMobile', ''),
      starts_at = (p ->> 'startsAt')::timestamptz, ends_at = (p ->> 'endsAt')::timestamptz,
      status = coalesce(p ->> 'status', 'draft'), updated_at = now()
    where id = v_id;
    if not found then raise exception 'Sezon bulunamadi.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.shop_admin_save_campaign(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_products uuid[];
  v_placements text[];
begin
  perform app_private.shop_assert_admin();
  select coalesce(array_agg(x.value::uuid order by x.ordinality), '{}') into v_products
  from jsonb_array_elements_text(coalesce(p -> 'productIds', '[]'::jsonb)) with ordinality x(value, ordinality);
  select coalesce(array_agg(x.value), array['hero']::text[]) into v_placements
  from jsonb_array_elements_text(coalesce(p -> 'placements', '["hero"]'::jsonb)) x(value);

  if v_id is null then
    insert into public.shop_campaigns (slug, name, kind, headline, body, banner_url, banner_mobile_url, focus, season_id,
      starts_at, ends_at, placements, notify_on_start, status, created_by)
    values (p ->> 'slug', btrim(p ->> 'name'), coalesce(p ->> 'kind', 'launch'), nullif(btrim(coalesce(p ->> 'headline', '')), ''),
      nullif(btrim(coalesce(p ->> 'body', '')), ''), nullif(p ->> 'banner', ''), nullif(p ->> 'bannerMobile', ''),
      coalesce(p ->> 'focus', 'center'), nullif(p ->> 'seasonId', '')::uuid,
      (p ->> 'startsAt')::timestamptz, (p ->> 'endsAt')::timestamptz, v_placements,
      coalesce((p ->> 'notifyOnStart')::boolean, false), coalesce(p ->> 'status', 'draft'), public.current_public_user_id())
    returning id into v_id;
  else
    update public.shop_campaigns set
      slug = p ->> 'slug', name = btrim(p ->> 'name'), kind = coalesce(p ->> 'kind', 'launch'),
      headline = nullif(btrim(coalesce(p ->> 'headline', '')), ''), body = nullif(btrim(coalesce(p ->> 'body', '')), ''),
      banner_url = nullif(p ->> 'banner', ''), banner_mobile_url = nullif(p ->> 'bannerMobile', ''),
      focus = coalesce(p ->> 'focus', 'center'), season_id = nullif(p ->> 'seasonId', '')::uuid,
      starts_at = (p ->> 'startsAt')::timestamptz, ends_at = (p ->> 'endsAt')::timestamptz,
      placements = v_placements, notify_on_start = coalesce((p ->> 'notifyOnStart')::boolean, false),
      status = coalesce(p ->> 'status', 'draft'), updated_at = now()
    where id = v_id;
    if not found then raise exception 'Kampanya bulunamadi.'; end if;
  end if;

  delete from public.shop_campaign_products where campaign_id = v_id and not (product_id = any(v_products));
  insert into public.shop_campaign_products (campaign_id, product_id, sort)
  select v_id, x.item, x.ord::integer from unnest(v_products) with ordinality x(item, ord)
  on conflict (campaign_id, product_id) do update set sort = excluded.sort;
  return v_id;
end;
$$;

create or replace function public.shop_admin_save_discount(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_products uuid[];
begin
  perform app_private.shop_assert_admin();
  select coalesce(array_agg(x.value::uuid), '{}') into v_products
  from jsonb_array_elements_text(coalesce(p -> 'productIds', '[]'::jsonb)) x(value);

  if v_id is null then
    insert into public.shop_discounts (name, scope, product_ids, target_type, target_rarity, season_id, exclude_seasonal,
      discount_type, value, audience, starts_at, ends_at, status, created_by)
    values (btrim(p ->> 'name'), p ->> 'scope', v_products, nullif(p ->> 'targetType', ''), nullif(p ->> 'targetRarity', ''),
      nullif(p ->> 'seasonId', '')::uuid, coalesce((p ->> 'excludeSeasonal')::boolean, false),
      coalesce(p ->> 'discountType', 'percent'), (p ->> 'value')::integer, coalesce(p ->> 'audience', 'everyone'),
      nullif(p ->> 'startsAt', '')::timestamptz, nullif(p ->> 'endsAt', '')::timestamptz, coalesce(p ->> 'status', 'draft'),
      public.current_public_user_id())
    returning id into v_id;
  else
    update public.shop_discounts set
      name = btrim(p ->> 'name'), scope = p ->> 'scope', product_ids = v_products,
      target_type = nullif(p ->> 'targetType', ''), target_rarity = nullif(p ->> 'targetRarity', ''),
      season_id = nullif(p ->> 'seasonId', '')::uuid, exclude_seasonal = coalesce((p ->> 'excludeSeasonal')::boolean, false),
      discount_type = coalesce(p ->> 'discountType', 'percent'), value = (p ->> 'value')::integer,
      audience = coalesce(p ->> 'audience', 'everyone'),
      starts_at = nullif(p ->> 'startsAt', '')::timestamptz, ends_at = nullif(p ->> 'endsAt', '')::timestamptz,
      status = coalesce(p ->> 'status', 'draft'), updated_at = now()
    where id = v_id;
    if not found then raise exception 'Indirim bulunamadi.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.shop_admin_set_status(p_kind text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Gecersiz durum.';
  end if;
  case p_kind
    when 'product' then update public.shop_products set status = p_status, updated_at = now() where id = p_id;
    when 'season' then update public.shop_seasons set status = p_status, updated_at = now() where id = p_id;
    when 'campaign' then update public.shop_campaigns set status = p_status, updated_at = now() where id = p_id;
    when 'discount' then update public.shop_discounts set status = p_status, updated_at = now() where id = p_id;
    else raise exception 'Gecersiz tur.';
  end case;
end;
$$;

-- Only drafts are deleted (a sold product is never deleted, it is archived).
create or replace function public.shop_admin_delete(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  case p_kind
    when 'product' then
      if exists (select 1 from public.shop_orders o where o.product_id = p_id) then
        raise exception 'Satilmis urun silinemez; arsivleyin.';
      end if;
      delete from public.shop_products where id = p_id and status = 'draft';
    when 'season' then delete from public.shop_seasons where id = p_id and status = 'draft';
    when 'campaign' then delete from public.shop_campaigns where id = p_id and status = 'draft';
    when 'discount' then delete from public.shop_discounts where id = p_id and status = 'draft';
    else raise exception 'Gecersiz tur.';
  end case;
  if not found then
    raise exception 'Yalniz taslaklar silinebilir.';
  end if;
end;
$$;

-- Price simulator: all candidates for a chosen moment and reader type; the lowest applies.
create or replace function public.shop_admin_simulate(p_product_id uuid, p_at timestamptz default now(), p_premium boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_min integer;
begin
  perform app_private.shop_assert_admin();
  select min(c.price) into v_min from app_private.shop_price_candidates(p_product_id, p_at, p_premium) c;
  return jsonb_build_object(
    'final', v_min,
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object('source', c.source, 'discountId', c.discount_id, 'label', c.label, 'price', c.price,
        'applied', c.price = v_min) order by c.price, c.source)
      from app_private.shop_price_candidates(p_product_id, p_at, p_premium) c
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.shop_admin_set_daily_deal(p_day date, p_product_id uuid, p_percent integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  if p_product_id is null then
    delete from public.shop_daily_deal_overrides where day = p_day;
    return;
  end if;
  insert into public.shop_daily_deal_overrides (day, product_id, percent, created_by)
  values (p_day, p_product_id, p_percent, public.current_public_user_id())
  on conflict (day) do update set product_id = excluded.product_id, percent = excluded.percent, created_by = excluded.created_by, created_at = now();
end;
$$;

create or replace function public.shop_admin_save_settings(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  update public.shop_settings set
    purchases_enabled = coalesce((p ->> 'purchases_enabled')::boolean, purchases_enabled),
    daily_deal_enabled = coalesce((p ->> 'daily_deal_enabled')::boolean, daily_deal_enabled),
    daily_deal_percent = coalesce((p ->> 'daily_deal_percent')::integer, daily_deal_percent),
    daily_deal_min_rarity = coalesce(p ->> 'daily_deal_min_rarity', daily_deal_min_rarity),
    rarity_bands = coalesce(p -> 'rarity_bands', rarity_bands),
    refund_window_hours = coalesce((p ->> 'refund_window_hours')::integer, refund_window_hours),
    updated_by = public.current_public_user_id(),
    updated_at = now()
  where id;
end;
$$;

-- === Siparisler / iade ==========================================================================
create or replace function public.shop_admin_orders(p_search text default null, p_status text default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'code', o.code, 'title', o.product_title, 'kind', o.product_kind, 'productId', o.product_id,
      'listPrice', o.list_price, 'paid', o.paid, 'source', o.price_source, 'isGift', o.is_gift, 'message', o.gift_message,
      'status', o.status, 'createdAt', o.created_at, 'refundedAt', o.refunded_at, 'refundReason', o.refund_reason,
      'granted', o.granted, 'premiumDays', o.premium_days,
      'buyer', jsonb_build_object('id', b.id, 'username', b.username, 'avatar', b.avatar_url),
      'recipient', jsonb_build_object('id', r.id, 'username', r.username, 'avatar', r.avatar_url)
    ) order by o.created_at desc)
    from (
      select o2.* from public.shop_orders o2
      join public.users b2 on b2.id = o2.buyer_user_id
      join public.users r2 on r2.id = o2.recipient_user_id
      where (p_status is null or o2.status = p_status)
        and (nullif(btrim(coalesce(p_search, '')), '') is null
             or o2.code ilike '%' || btrim(p_search) || '%'
             or o2.product_title ilike '%' || btrim(p_search) || '%'
             or b2.username ilike '%' || btrim(p_search) || '%'
             or r2.username ilike '%' || btrim(p_search) || '%')
      order by o2.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
    ) o
    join public.users b on b.id = o.buyer_user_id
    join public.users r on r.id = o.recipient_user_id
  ), '[]'::jsonb);
end;
$$;

-- Iade: coin aliciya (satin alana) doner; verilen kozmetikler alicinin envanterinden cikar
-- (kusanmissa cikarilir), premium suresi geri alinir.
create or replace function public.shop_admin_refund_order(p_order_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.shop_orders%rowtype;
  v_recipient public.users%rowtype;
  v_owned jsonb;
  v_item jsonb;
  v_key text;
  v_effect uuid;
  v_frame text;
  v_background text;
  v_balance integer;
begin
  perform app_private.shop_assert_admin();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Iade nedeni zorunludur.';
  end if;

  select * into v_order from public.shop_orders where id = p_order_id for update;
  if not found then raise exception 'Siparis bulunamadi.'; end if;
  if v_order.status <> 'completed' then raise exception 'Bu siparis zaten iade edilmis.'; end if;

  perform 1 from public.users u where u.id in (v_order.buyer_user_id, v_order.recipient_user_id) order by u.id for update;
  select * into v_recipient from public.users where id = v_order.recipient_user_id;
  v_owned := coalesce(v_recipient.owned_items, '{}'::jsonb);
  v_effect := v_recipient.active_profile_effect_id;
  v_frame := v_recipient.frame_type;
  v_background := v_recipient.background_type;

  for v_item in select * from jsonb_array_elements(v_order.granted) loop
    v_key := app_private.store_owned_items_key_for_type(v_item ->> 'type');
    if v_key is null then continue; end if;
    v_owned := jsonb_set(v_owned, array[v_key], coalesce((
      select jsonb_agg(e) from jsonb_array_elements(coalesce(v_owned -> v_key, '[]'::jsonb)) e where e <> to_jsonb(v_item ->> 'identifier')
    ), '[]'::jsonb), true);
    if v_effect = (v_item ->> 'id')::uuid then v_effect := null; end if;
    if v_frame = v_item ->> 'identifier' then v_frame := 'default'; end if;
    if v_background = v_item ->> 'identifier' then v_background := null; end if;
  end loop;

  update public.users set stones = stones + v_order.paid where id = v_order.buyer_user_id returning stones into v_balance;
  update public.users set
    owned_items = v_owned,
    active_profile_effect_id = v_effect,
    frame_type = v_frame,
    background_type = v_background,
    premium_expires_at = case when v_order.premium_days is not null and premium_expires_at is not null
      then greatest(now(), premium_expires_at - make_interval(days => v_order.premium_days)) else premium_expires_at end
  where id = v_order.recipient_user_id;

  update public.user_inventory_items set is_active = false where source_kind = 'shop_order' and source_ref = v_order.id::text;

  if v_order.paid > 0 then
    insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
    values (v_order.buyer_user_id, null, 'shop_order', v_order.id::text, 'refund', 'Coin', v_order.paid, v_balance,
      jsonb_build_object('order_code', v_order.code, 'reason', p_reason));
  end if;

  update public.shop_orders set status = 'refunded', refunded_at = now(), refunded_by = public.current_public_user_id(), refund_reason = btrim(p_reason)
  where id = v_order.id;
  update public.shop_products set sold_count = greatest(sold_count - 1, 0) where id = v_order.product_id;

  perform public.push_notification(
    v_order.buyer_user_id, 'system', 'Siparisin iade edildi',
    format('"%s" siparisin iade edildi; %s Coin bakiyene eklendi.', v_order.product_title, v_order.paid),
    jsonb_build_object('event', 'shop_order_refunded', 'order_code', v_order.code), null::text
  );

  return jsonb_build_object('orderCode', v_order.code, 'refunded', v_order.paid, 'buyerBalance', v_balance);
end;
$$;

-- === Cuzdan / ekonomi ===========================================================================
create or replace function public.shop_admin_wallet(p_query text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user public.users%rowtype;
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform app_private.shop_assert_admin();
  if v_q is null then
    return jsonb_build_object('matches', '[]'::jsonb, 'user', null);
  end if;
  select * into v_user from public.users u where lower(u.username) = lower(v_q) limit 1;
  return jsonb_build_object(
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'username', u.username, 'avatar', u.avatar_url, 'balance', u.stones))
      from (select * from public.users u2 where u2.username ilike '%' || v_q || '%' order by char_length(u2.username) limit 8) u
    ), '[]'::jsonb),
    'user', case when v_user.id is null then null else jsonb_build_object(
      'id', v_user.id, 'username', v_user.username, 'displayName', v_user.display_name, 'avatar', v_user.avatar_url,
      'balance', v_user.stones, 'premiumExpiresAt', v_user.premium_expires_at,
      'orders', (select count(*) from public.shop_orders o where o.buyer_user_id = v_user.id),
      'refunds', (select count(*) from public.shop_orders o where o.buyer_user_id = v_user.id and o.status = 'refunded'),
      'history', coalesce((
        select jsonb_agg(h.row order by h.at desc) from (
          select l.created_at as at, jsonb_build_object('at', l.created_at, 'kind', l.source_kind, 'entry', l.entry_type, 'amount', l.amount,
            'balanceAfter', l.balance_after, 'note', coalesce(l.metadata ->> 'order_code', l.metadata ->> 'reason')) as row
          from public.store_wallet_ledger l where l.user_id = v_user.id
          union all
          select c.redeemed_at, jsonb_build_object('at', c.redeemed_at, 'kind', 'coin_code', 'entry', 'credit', 'amount', rc.value, 'balanceAfter', null, 'note', rc.code)
          from public.user_code_redemptions c join public.redeem_codes rc on rc.id = c.code_id where c.user_id = v_user.id
          union all
          select t.claimed_at, jsonb_build_object('at', t.claimed_at, 'kind', 'reward_task', 'entry', 'credit', 'amount', t.credited_coin, 'balanceAfter', null, 'note', null)
          from public.user_reward_task_claims t where t.user_id = v_user.id and t.credited_coin > 0
          union all
          select s.claimed_at, jsonb_build_object('at', s.claimed_at, 'kind', 'reading_streak', 'entry', 'credit', 'amount', s.credited_coin, 'balanceAfter', null, 'note', null)
          from public.reading_streak_reward_claims s where s.user_id = v_user.id and s.credited_coin > 0
          order by 1 desc
          limit 40
        ) h
      ), '[]'::jsonb)
    ) end
  );
end;
$$;

create or replace function public.shop_admin_adjust_balance(p_user_id uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_balance integer;
begin
  perform app_private.shop_assert_admin();
  if coalesce(p_amount, 0) = 0 then raise exception 'Tutar sifir olamaz.'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Neden zorunludur.'; end if;
  update public.users set stones = stones + p_amount where id = p_user_id returning stones into v_balance;
  if not found then raise exception 'Kullanici bulunamadi.'; end if;
  if v_balance < 0 then raise exception 'Bakiye eksiye dusemez.'; end if;
  insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
  values (p_user_id, null, 'admin_adjustment', gen_random_uuid()::text, 'adjustment', 'Coin', p_amount, v_balance,
    jsonb_build_object('reason', btrim(p_reason), 'admin_user_id', public.current_public_user_id()));
  return v_balance;
end;
$$;

create or replace function public.shop_admin_economy(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  v_sources jsonb;
  v_total_in bigint;
  v_earners bigint;
begin
  perform app_private.shop_assert_admin();
  with s as (
    select 'coin_code' as key, coalesce(sum(rc.value), 0)::bigint as amount, count(distinct c.user_id) as users
    from public.user_code_redemptions c join public.redeem_codes rc on rc.id = c.code_id where c.redeemed_at > v_since
    union all
    select 'reward_task', coalesce(sum(t.credited_coin), 0), count(distinct t.user_id) from public.user_reward_task_claims t where t.claimed_at > v_since
    union all
    select 'reading_streak', coalesce(sum(r.credited_coin), 0), count(distinct r.user_id) from public.reading_streak_reward_claims r where r.claimed_at > v_since
    union all
    select 'premium_compensation', coalesce(sum(e.compensation_coins), 0), count(distinct e.user_id) from public.user_premium_reward_events e where e.created_at > v_since
    union all
    select 'admin_and_refund', coalesce(sum(l.amount), 0), count(distinct l.user_id) from public.store_wallet_ledger l where l.amount > 0 and l.created_at > v_since
  )
  select jsonb_agg(jsonb_build_object('key', s.key, 'amount', s.amount) order by s.amount desc), sum(s.amount)
  into v_sources, v_total_in
  from s;

  select count(distinct x.user_id) into v_earners from (
    select c.user_id from public.user_code_redemptions c where c.redeemed_at > v_since
    union select t.user_id from public.user_reward_task_claims t where t.claimed_at > v_since and t.credited_coin > 0
    union select r.user_id from public.reading_streak_reward_claims r where r.claimed_at > v_since and r.credited_coin > 0
  ) x;

  return jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 30), 1), 365),
    'sources', coalesce(v_sources, '[]'::jsonb),
    'totalIn', coalesce(v_total_in, 0),
    'sinks', coalesce((
      select jsonb_agg(jsonb_build_object('key', l.source_kind, 'amount', l.amount) order by l.amount desc)
      from (select source_kind, -sum(amount) as amount from public.store_wallet_ledger where amount < 0 and created_at > v_since group by source_kind) l
    ), '[]'::jsonb),
    'totalOut', (select coalesce(-sum(amount), 0) from public.store_wallet_ledger where amount < 0 and created_at > v_since),
    'circulation', (select coalesce(sum(stones), 0) from public.users where coalesce(is_active, true)),
    'holders', (select count(*) from public.users where stones > 0),
    'median', (select coalesce(percentile_cont(0.5) within group (order by stones), 0)::integer from public.users where stones > 0),
    'earners', v_earners,
    'dailyEarnPerEarner', case when coalesce(v_earners, 0) = 0 then 0
      else round(coalesce(v_total_in, 0)::numeric / v_earners / least(greatest(coalesce(p_days, 30), 1), 365))::integer end,
    'bands', (select s.rarity_bands from public.shop_settings s where s.id),
    'outOfBand', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'rarity', p.rarity, 'price', p.base_price))
      from public.shop_products p
      where p.status = 'published' and p.kind = 'cosmetic'
        and exists (select 1 from jsonb_array_elements(app_private.shop_product_issues(p.id)) e where e ->> 'code' = 'band')
    ), '[]'::jsonb)
  );
end;
$$;

-- === Permissions ==================================================================================
revoke all on function app_private.shop_assert_admin() from public;
revoke all on function app_private.shop_product_issues(uuid) from public;
revoke all on function app_private.shop_admin_product_row(uuid) from public;

do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public.shop_admin_overview()',
    'public.shop_admin_products(text, text)',
    'public.shop_admin_product(uuid)',
    'public.shop_admin_save_product(jsonb)',
    'public.shop_admin_bulk_products(uuid[], text, jsonb)',
    'public.shop_admin_cosmetics(text, text)',
    'public.shop_admin_merch()',
    'public.shop_admin_save_season(jsonb)',
    'public.shop_admin_save_campaign(jsonb)',
    'public.shop_admin_save_discount(jsonb)',
    'public.shop_admin_set_status(text, uuid, text)',
    'public.shop_admin_delete(text, uuid)',
    'public.shop_admin_simulate(uuid, timestamptz, boolean)',
    'public.shop_admin_set_daily_deal(date, uuid, integer)',
    'public.shop_admin_save_settings(jsonb)',
    'public.shop_admin_orders(text, text, integer)',
    'public.shop_admin_refund_order(uuid, text)',
    'public.shop_admin_wallet(text)',
    'public.shop_admin_adjust_balance(uuid, integer, text)',
    'public.shop_admin_economy(integer)'
  ] loop
    execute format('revoke all on function %s from public', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end $$;
