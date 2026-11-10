begin;

create schema if not exists app_private;

grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.get_admin_store_commerce_operations(
  p_search text default null,
  p_status text default 'all',
  p_order_kind text default 'all',
  p_risk_only boolean default false,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_status text := lower(btrim(coalesce(p_status, 'all')));
  v_order_kind text := lower(btrim(coalesce(p_order_kind, 'all')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 10), 100);
  v_metrics jsonb;
  v_orders jsonb;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if v_status not in ('all', 'completed', 'refunded', 'revoked', 'void') then
    v_status := 'all';
  end if;

  if v_order_kind not in ('all', 'item_purchase', 'premium_purchase', 'item_gift', 'package_purchase', 'package_gift', 'admin_adjustment') then
    v_order_kind := 'all';
  end if;

  with order_base as (
    select
      so.*,
      actor.username as actor_username,
      actor.avatar_url as actor_avatar_url,
      recipient_user.username as recipient_username,
      recipient_user.avatar_url as recipient_avatar_url,
      recipient_fansub.name as recipient_fansub_name,
      recipient_fansub.avatar_url as recipient_fansub_avatar_url
    from public.store_orders so
    left join public.public_user_directory actor on actor.id = so.actor_user_id
    left join public.public_user_directory recipient_user on recipient_user.id = so.recipient_user_id
    left join public.fansubs recipient_fansub on recipient_fansub.id = so.recipient_fansub_id
    where (v_status = 'all' or so.status = v_status)
      and (v_order_kind = 'all' or so.order_kind = v_order_kind)
      and (
        v_search is null
        or lower(so.id::text) like '%' || v_search || '%'
        or lower(so.source_ref) like '%' || v_search || '%'
        or lower(coalesce(actor.username, '')) like '%' || v_search || '%'
        or lower(coalesce(recipient_user.username, '')) like '%' || v_search || '%'
        or lower(coalesce(recipient_fansub.name, '')) like '%' || v_search || '%'
        or exists (
          select 1
          from public.store_order_items search_item
          left join public.store_items si on si.id = search_item.store_item_id
          where search_item.order_id = so.id
            and (
              lower(coalesce(si.name, '')) like '%' || v_search || '%'
              or lower(coalesce(search_item.item_identifier, '')) like '%' || v_search || '%'
              or lower(coalesce(search_item.package_key, '')) like '%' || v_search || '%'
            )
        )
      )
  ),
  wallet_rollup as (
    select
      wl.order_id,
      count(*) as wallet_entry_count,
      coalesce(sum(wl.amount) filter (where wl.entry_type = 'debit'), 0) as debit_amount,
      coalesce(sum(wl.amount) filter (where wl.entry_type = 'credit'), 0) as credit_amount,
      coalesce(sum(wl.amount) filter (where wl.entry_type = 'refund'), 0) as refund_amount
    from public.store_wallet_ledger wl
    where wl.order_id in (select id from order_base)
    group by wl.order_id
  ),
  item_rollup as (
    select
      soi.order_id,
      count(*) as item_count,
      coalesce(sum(soi.quantity), 0) as total_quantity,
      coalesce(sum(soi.revenue_amount), 0) as item_revenue,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'storeItemId', soi.store_item_id,
          'packageKey', soi.package_key,
          'lineKind', soi.line_kind,
          'itemType', coalesce(soi.item_type, si.type),
          'itemIdentifier', coalesce(soi.item_identifier, si.identifier),
          'name', coalesce(si.name, soi.package_key, soi.item_identifier, 'Bilinmeyen satir'),
          'quantity', soi.quantity,
          'unitAmount', soi.unit_amount,
          'revenueAmount', soi.revenue_amount
        )
        order by soi.created_at asc, soi.id asc
      ), '[]'::jsonb) as items
    from public.store_order_items soi
    left join public.store_items si on si.id = soi.store_item_id
    where soi.order_id in (select id from order_base)
    group by soi.order_id
  ),
  inventory_rollup as (
    select
      uii.order_id,
      count(*) as inventory_count
    from public.user_inventory_items uii
    where uii.order_id in (select id from order_base)
    group by uii.order_id
  ),
  rapid_actor_rollup as (
    select
      candidate.id as order_id,
      count(peer.id) as nearby_actor_order_count
    from order_base candidate
    join public.store_orders peer
      on peer.actor_user_id = candidate.actor_user_id
     and peer.created_at between candidate.created_at - interval '5 minutes' and candidate.created_at + interval '5 minutes'
    group by candidate.id
  ),
  enriched as (
    select
      ob.*,
      coalesce(wr.wallet_entry_count, 0) as wallet_entry_count,
      coalesce(wr.debit_amount, 0) as wallet_debit_amount,
      coalesce(wr.credit_amount, 0) as wallet_credit_amount,
      coalesce(wr.refund_amount, 0) as wallet_refund_amount,
      coalesce(ir.item_count, 0) as item_count,
      coalesce(ir.total_quantity, 0) as total_quantity,
      coalesce(ir.item_revenue, 0) as item_revenue,
      coalesce(ir.items, '[]'::jsonb) as items,
      coalesce(inv.inventory_count, 0) as inventory_count,
      coalesce(rapid.nearby_actor_order_count, 0) as nearby_actor_order_count,
      (
        ob.order_kind in ('item_gift', 'package_gift')
        and ob.recipient_user_id is not null
        and ob.actor_user_id = ob.recipient_user_id
      ) as is_self_gift,
      (ob.total_amount >= 10000) as is_high_value,
      (coalesce(rapid.nearby_actor_order_count, 0) >= 3) as is_rapid_actor,
      (
        ob.status = 'completed'
        and ob.currency = 'Coin'
        and ob.total_amount > 0
        and coalesce(wr.debit_amount, 0) = 0
      ) as is_missing_wallet,
      (
        ob.status = 'completed'
        and ob.currency = 'Coin'
        and ob.total_amount > 0
        and coalesce(wr.debit_amount, 0) <> 0
        and abs(coalesce(wr.debit_amount, 0)) <> ob.total_amount
      ) as is_wallet_mismatch,
      (coalesce(ir.item_count, 0) = 0) as is_missing_items,
      (
        ob.status = 'completed'
        and ob.order_kind in ('item_purchase', 'premium_purchase', 'item_gift', 'package_purchase', 'package_gift')
        and coalesce(inv.inventory_count, 0) = 0
      ) as is_missing_inventory
    from order_base ob
    left join wallet_rollup wr on wr.order_id = ob.id
    left join item_rollup ir on ir.order_id = ob.id
    left join inventory_rollup inv on inv.order_id = ob.id
    left join rapid_actor_rollup rapid on rapid.order_id = ob.id
  ),
  scored as (
    select
      enriched.*,
      array_remove(array[
        case when is_self_gift then 'self_gift' end,
        case when is_high_value then 'high_value' end,
        case when is_rapid_actor then 'rapid_actor' end,
        case when is_missing_wallet then 'missing_wallet' end,
        case when is_wallet_mismatch then 'wallet_mismatch' end,
        case when is_missing_items then 'missing_items' end,
        case when is_missing_inventory then 'missing_inventory' end
      ]::text[], null) as risk_flags,
      case
        when is_missing_wallet or is_wallet_mismatch or is_missing_items or is_missing_inventory then 'critical'
        when is_self_gift or is_high_value or is_rapid_actor then 'warning'
        else 'stable'
      end as risk_severity
    from enriched
  )
  select jsonb_build_object(
    'totalOrders', count(*),
    'completedOrders', count(*) filter (where status = 'completed'),
    'refundLikeOrders', count(*) filter (where status in ('refunded', 'revoked')),
    'riskOrders', count(*) filter (where risk_severity <> 'stable'),
    'criticalRiskOrders', count(*) filter (where risk_severity = 'critical'),
    'selfGiftOrders', count(*) filter (where is_self_gift),
    'rapidActorOrders', count(*) filter (where is_rapid_actor),
    'missingWalletOrders', count(*) filter (where is_missing_wallet or is_wallet_mismatch),
    'coinDebitTotal', abs(coalesce(sum(wallet_debit_amount) filter (where currency = 'Coin'), 0)),
    'last24hOrders', count(*) filter (where created_at >= now() - interval '24 hours'),
    'last24hCoinRevenue', coalesce(sum(total_amount) filter (where created_at >= now() - interval '24 hours' and status = 'completed' and currency = 'Coin'), 0),
    'latestOrderAt', max(created_at)
  )
  into v_metrics
  from scored;

  with order_base as (
    select
      so.*,
      actor.username as actor_username,
      actor.avatar_url as actor_avatar_url,
      recipient_user.username as recipient_username,
      recipient_user.avatar_url as recipient_avatar_url,
      recipient_fansub.name as recipient_fansub_name,
      recipient_fansub.avatar_url as recipient_fansub_avatar_url
    from public.store_orders so
    left join public.public_user_directory actor on actor.id = so.actor_user_id
    left join public.public_user_directory recipient_user on recipient_user.id = so.recipient_user_id
    left join public.fansubs recipient_fansub on recipient_fansub.id = so.recipient_fansub_id
    where (v_status = 'all' or so.status = v_status)
      and (v_order_kind = 'all' or so.order_kind = v_order_kind)
      and (
        v_search is null
        or lower(so.id::text) like '%' || v_search || '%'
        or lower(so.source_ref) like '%' || v_search || '%'
        or lower(coalesce(actor.username, '')) like '%' || v_search || '%'
        or lower(coalesce(recipient_user.username, '')) like '%' || v_search || '%'
        or lower(coalesce(recipient_fansub.name, '')) like '%' || v_search || '%'
        or exists (
          select 1
          from public.store_order_items search_item
          left join public.store_items si on si.id = search_item.store_item_id
          where search_item.order_id = so.id
            and (
              lower(coalesce(si.name, '')) like '%' || v_search || '%'
              or lower(coalesce(search_item.item_identifier, '')) like '%' || v_search || '%'
              or lower(coalesce(search_item.package_key, '')) like '%' || v_search || '%'
            )
        )
      )
  ),
  wallet_rollup as (
    select
      wl.order_id,
      count(*) as wallet_entry_count,
      coalesce(sum(wl.amount) filter (where wl.entry_type = 'debit'), 0) as debit_amount,
      coalesce(sum(wl.amount) filter (where wl.entry_type = 'credit'), 0) as credit_amount,
      coalesce(sum(wl.amount) filter (where wl.entry_type = 'refund'), 0) as refund_amount
    from public.store_wallet_ledger wl
    where wl.order_id in (select id from order_base)
    group by wl.order_id
  ),
  item_rollup as (
    select
      soi.order_id,
      count(*) as item_count,
      coalesce(sum(soi.quantity), 0) as total_quantity,
      coalesce(sum(soi.revenue_amount), 0) as item_revenue,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'storeItemId', soi.store_item_id,
          'packageKey', soi.package_key,
          'lineKind', soi.line_kind,
          'itemType', coalesce(soi.item_type, si.type),
          'itemIdentifier', coalesce(soi.item_identifier, si.identifier),
          'name', coalesce(si.name, soi.package_key, soi.item_identifier, 'Bilinmeyen satir'),
          'quantity', soi.quantity,
          'unitAmount', soi.unit_amount,
          'revenueAmount', soi.revenue_amount
        )
        order by soi.created_at asc, soi.id asc
      ), '[]'::jsonb) as items
    from public.store_order_items soi
    left join public.store_items si on si.id = soi.store_item_id
    where soi.order_id in (select id from order_base)
    group by soi.order_id
  ),
  inventory_rollup as (
    select
      uii.order_id,
      count(*) as inventory_count
    from public.user_inventory_items uii
    where uii.order_id in (select id from order_base)
    group by uii.order_id
  ),
  rapid_actor_rollup as (
    select
      candidate.id as order_id,
      count(peer.id) as nearby_actor_order_count
    from order_base candidate
    join public.store_orders peer
      on peer.actor_user_id = candidate.actor_user_id
     and peer.created_at between candidate.created_at - interval '5 minutes' and candidate.created_at + interval '5 minutes'
    group by candidate.id
  ),
  scored as (
    select
      ob.*,
      coalesce(wr.wallet_entry_count, 0) as wallet_entry_count,
      coalesce(wr.debit_amount, 0) as wallet_debit_amount,
      coalesce(wr.credit_amount, 0) as wallet_credit_amount,
      coalesce(wr.refund_amount, 0) as wallet_refund_amount,
      coalesce(ir.item_count, 0) as item_count,
      coalesce(ir.total_quantity, 0) as total_quantity,
      coalesce(ir.item_revenue, 0) as item_revenue,
      coalesce(ir.items, '[]'::jsonb) as items,
      coalesce(inv.inventory_count, 0) as inventory_count,
      coalesce(rapid.nearby_actor_order_count, 0) as nearby_actor_order_count,
      array_remove(array[
        case when ob.order_kind in ('item_gift', 'package_gift') and ob.recipient_user_id is not null and ob.actor_user_id = ob.recipient_user_id then 'self_gift' end,
        case when ob.total_amount >= 10000 then 'high_value' end,
        case when coalesce(rapid.nearby_actor_order_count, 0) >= 3 then 'rapid_actor' end,
        case when ob.status = 'completed' and ob.currency = 'Coin' and ob.total_amount > 0 and coalesce(wr.debit_amount, 0) = 0 then 'missing_wallet' end,
        case when ob.status = 'completed' and ob.currency = 'Coin' and ob.total_amount > 0 and coalesce(wr.debit_amount, 0) <> 0 and abs(coalesce(wr.debit_amount, 0)) <> ob.total_amount then 'wallet_mismatch' end,
        case when coalesce(ir.item_count, 0) = 0 then 'missing_items' end,
        case when ob.status = 'completed' and ob.order_kind in ('item_purchase', 'premium_purchase', 'item_gift', 'package_purchase', 'package_gift') and coalesce(inv.inventory_count, 0) = 0 then 'missing_inventory' end
      ]::text[], null) as risk_flags
    from order_base ob
    left join wallet_rollup wr on wr.order_id = ob.id
    left join item_rollup ir on ir.order_id = ob.id
    left join inventory_rollup inv on inv.order_id = ob.id
    left join rapid_actor_rollup rapid on rapid.order_id = ob.id
  ),
  rows as (
    select
      *,
      case
        when 'missing_wallet' = any(risk_flags) or 'wallet_mismatch' = any(risk_flags) or 'missing_items' = any(risk_flags) or 'missing_inventory' = any(risk_flags) then 'critical'
        when array_length(risk_flags, 1) > 0 then 'warning'
        else 'stable'
      end as risk_severity
    from scored
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'orderKind', order_kind,
      'status', status,
      'currency', currency,
      'totalAmount', total_amount,
      'balanceAfter', balance_after,
      'requestKey', request_key,
      'sourceKind', source_kind,
      'sourceRef', source_ref,
      'createdAt', created_at,
      'completedAt', completed_at,
      'actor', jsonb_build_object('id', actor_user_id, 'username', actor_username, 'avatarUrl', actor_avatar_url),
      'recipient', jsonb_build_object('kind', recipient_kind, 'userId', recipient_user_id, 'username', recipient_username, 'avatarUrl', recipient_avatar_url, 'fansubId', recipient_fansub_id, 'fansubName', recipient_fansub_name, 'fansubAvatarUrl', recipient_fansub_avatar_url),
      'items', items,
      'wallet', jsonb_build_object('entryCount', wallet_entry_count, 'debitAmount', wallet_debit_amount, 'creditAmount', wallet_credit_amount, 'refundAmount', wallet_refund_amount),
      'itemCount', item_count,
      'inventoryCount', inventory_count,
      'nearbyActorOrderCount', nearby_actor_order_count,
      'riskFlags', to_jsonb(risk_flags),
      'riskSeverity', risk_severity
    )
    order by created_at desc, id desc
  ), '[]'::jsonb)
  into v_orders
  from (
    select *
    from rows
    where (not coalesce(p_risk_only, false) or risk_severity <> 'stable')
    order by created_at desc, id desc
    limit v_limit
  ) limited_rows;

  return jsonb_build_object(
    'generatedAt', now(),
    'filters', jsonb_build_object(
      'search', v_search,
      'status', v_status,
      'orderKind', v_order_kind,
      'riskOnly', coalesce(p_risk_only, false),
      'limit', v_limit
    ),
    'metrics', coalesce(v_metrics, '{}'::jsonb),
    'orders', coalesce(v_orders, '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_admin_store_commerce_operations(
  p_search text default null,
  p_status text default 'all',
  p_order_kind text default 'all',
  p_risk_only boolean default false,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.get_admin_store_commerce_operations(p_search, p_status, p_order_kind, p_risk_only, p_limit);
$$;

revoke execute on function app_private.get_admin_store_commerce_operations(text, text, text, boolean, integer) from public, anon;
grant execute on function app_private.get_admin_store_commerce_operations(text, text, text, boolean, integer) to authenticated, service_role;

revoke execute on function public.get_admin_store_commerce_operations(text, text, text, boolean, integer) from public, anon;
grant execute on function public.get_admin_store_commerce_operations(text, text, text, boolean, integer) to authenticated, service_role;

comment on function public.get_admin_store_commerce_operations(text, text, text, boolean, integer)
  is 'Admin magaza operasyon merkezi icin order, wallet, inventory ve risk sinyallerini tek RPC uzerinden dondurur.';

notify pgrst, 'reload schema';

commit;
