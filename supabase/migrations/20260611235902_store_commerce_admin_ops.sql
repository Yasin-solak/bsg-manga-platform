begin;

create or replace function app_private.is_uuid_text(p_value text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_value, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

create or replace function app_private.validate_store_studio_snapshot_references(p_document jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if p_document is null or not (p_document ? 'studioDraft') then
    return true;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_document->'studioDraft'->'components', '[]'::jsonb)) as component(value)
    cross join jsonb_array_elements(coalesce(component.value->'productOptionIds', '[]'::jsonb)) as option_id(value)
    cross join lateral (
      select option_id.value #>> '{}' as option_text
    ) option_value
    left join lateral (
      select (component.value->'productOptionSnapshots'->option_value.option_text) as snapshot
    ) snapshot_value on true
    where (
      option_value.option_text like 'package:%'
      and exists (
        select 1
        from public.store_cosmetic_packages p
        where p.package_key = replace(option_value.option_text, 'package:', '')
          and p.is_active = false
      )
    )
    or (
      app_private.is_uuid_text(snapshot_value.snapshot->>'selectedItemId')
      and exists (
        select 1
        from public.store_items si
        where si.id = (snapshot_value.snapshot->>'selectedItemId')::uuid
          and si.is_active = false
      )
    )
  ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function app_private.enforce_store_studio_snapshot_references()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.validate_store_studio_snapshot_references(new.document) then
    raise exception 'Magaza Studio yayini pasif urun veya paket referansi iceremez.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_storefront_homepage_snapshots_studio_guard on public.storefront_homepage_snapshots;
create trigger trg_storefront_homepage_snapshots_studio_guard
  before insert or update of document on public.storefront_homepage_snapshots
  for each row
  execute function app_private.enforce_store_studio_snapshot_references();

create or replace function public.track_store_item_analytics_event(
  p_event_type text,
  p_target_kind text,
  p_target_id text,
  p_surface text default 'store',
  p_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_event_id uuid;
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_target_kind text := lower(trim(coalesce(p_target_kind, '')));
begin
  if v_user_id is null then
    raise exception 'Magaza analitik olayi icin giris yapmalisiniz.';
  end if;

  if v_event_type not in ('impression', 'click', 'preview', 'wishlist_add', 'wishlist_remove', 'equip', 'purchase_intent') then
    raise exception 'Gecersiz magaza analitik olayi.';
  end if;

  if v_target_kind not in ('item', 'package') then
    raise exception 'Gecersiz magaza analitik hedefi.';
  end if;

  insert into public.store_item_analytics_events (
    user_id,
    event_type,
    target_kind,
    target_id,
    surface,
    session_id,
    metadata
  )
  values (
    v_user_id,
    v_event_type,
    v_target_kind,
    left(trim(coalesce(p_target_id, '')), 160),
    left(trim(coalesce(p_surface, 'store')), 120),
    nullif(left(trim(coalesce(p_session_id, '')), 120), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.get_admin_store_sales_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_metrics jsonb;
  v_type_distribution jsonb;
  v_top_items jsonb;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  select jsonb_build_object(
    'totalProducts', (select count(*) from public.store_items),
    'activeProducts', (select count(*) from public.store_items where is_active = true),
    'inactiveProducts', (select count(*) from public.store_items where is_active = false),
    'totalOrders', count(*),
    'totalSales', coalesce((
      select sum(soi.quantity)
      from public.store_order_items soi
      join public.store_orders order_rows on order_rows.id = soi.order_id
      where order_rows.status = 'completed'
    ), 0),
    'soldItems', coalesce((
      select count(distinct soi.store_item_id)
      from public.store_order_items soi
      join public.store_orders order_rows on order_rows.id = soi.order_id
      where order_rows.status = 'completed'
        and soi.store_item_id is not null
    ), 0),
    'coinRevenue', coalesce(sum(total_amount) filter (where status = 'completed' and currency = 'Coin'), 0),
    'tlRevenue', coalesce(sum(total_amount) filter (where status = 'completed' and currency = 'TL'), 0),
    'directPurchaseCount', count(*) filter (where status = 'completed' and order_kind in ('item_purchase', 'premium_purchase')),
    'giftOrderCount', count(*) filter (where status = 'completed' and order_kind in ('item_gift', 'package_gift')),
    'packageOrderCount', count(*) filter (where status = 'completed' and order_kind in ('package_purchase', 'package_gift')),
    'refundCount', count(*) filter (where status in ('refunded', 'revoked')),
    'analyticsEventCount', (select count(*) from public.store_item_analytics_events),
    'source', 'store_orders'
  )
  into v_metrics
  from public.store_orders;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'type', type_rows.item_type,
      'count', type_rows.product_count,
      'sales', type_rows.sales,
      'revenue', type_rows.revenue
    )
    order by type_rows.sales desc, type_rows.item_type
  ), '[]'::jsonb)
  into v_type_distribution
  from (
    select
      coalesce(soi.item_type, si.type, 'unknown') as item_type,
      count(distinct soi.store_item_id) as product_count,
      coalesce(sum(soi.quantity), 0) as sales,
      coalesce(sum(soi.revenue_amount), 0) as revenue
    from public.store_order_items soi
    join public.store_orders so on so.id = soi.order_id and so.status = 'completed'
    left join public.store_items si on si.id = soi.store_item_id
    group by coalesce(soi.item_type, si.type, 'unknown')
  ) type_rows;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', top_rows.store_item_id,
      'name', top_rows.name,
      'identifier', top_rows.identifier,
      'type', top_rows.item_type,
      'currency', top_rows.currency,
      'price', top_rows.price,
      'sales', top_rows.sales,
      'revenue', top_rows.revenue,
      'lastSoldAt', top_rows.last_sold_at
    )
    order by top_rows.sales desc, top_rows.revenue desc, top_rows.last_sold_at desc
  ), '[]'::jsonb)
  into v_top_items
  from (
    select
      si.id as store_item_id,
      si.name,
      si.identifier,
      si.type as item_type,
      si.currency,
      si.price,
      coalesce(sum(soi.quantity), 0) as sales,
      coalesce(sum(soi.revenue_amount), 0) as revenue,
      max(so.completed_at) as last_sold_at
    from public.store_order_items soi
    join public.store_orders so on so.id = soi.order_id and so.status = 'completed'
    join public.store_items si on si.id = soi.store_item_id
    group by si.id, si.name, si.identifier, si.type, si.currency, si.price
    having coalesce(sum(soi.quantity), 0) > 0
    order by sales desc, revenue desc, last_sold_at desc
    limit 12
  ) top_rows;

  return jsonb_build_object(
    'generatedAt', now(),
    'metrics', v_metrics,
    'typeDistribution', v_type_distribution,
    'topItems', v_top_items
  );
end;
$$;

revoke execute on function app_private.is_uuid_text(text) from public, anon, authenticated;
revoke execute on function app_private.validate_store_studio_snapshot_references(jsonb) from public, anon, authenticated;
revoke execute on function app_private.enforce_store_studio_snapshot_references() from public, anon, authenticated;

revoke execute on function public.track_store_item_analytics_event(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.track_store_item_analytics_event(text, text, text, text, text, jsonb) to authenticated, service_role;

revoke execute on function public.get_admin_store_sales_summary() from public, anon;
grant execute on function public.get_admin_store_sales_summary() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
