-- A readable order code (order_code) is added to the shop account activity RPC.
-- Activity rows come from old per-type tables (purchase_requests / item_gifts /
-- package_events); order_code is kept in the merged store_orders ledger
-- and tied there by (source_kind, source_ref). The RPC LEFT JOINs this ledger and
-- returns the code of each action.
--
-- Note: returns table output columns change, so CREATE OR REPLACE is not enough;
-- DROP is needed first (Postgres does not change an existing function return type).

begin;

drop function if exists public.get_my_store_activity(integer);
drop function if exists app_private.get_my_store_activity(integer);

create or replace function app_private.get_my_store_activity(
  p_limit integer default 50
)
returns table (
  id text,
  activity_kind text,
  target_kind text,
  target_id text,
  amount integer,
  counterparty_label text,
  order_code text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := app_private.current_public_user_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if v_user_id is null then
    raise exception 'Magaza hareketleri icin giris yapmalisiniz.';
  end if;

  return query
  select
    activity_rows.id,
    activity_rows.activity_kind,
    activity_rows.target_kind,
    activity_rows.target_id,
    activity_rows.amount,
    activity_rows.counterparty_label,
    so.order_code,
    activity_rows.created_at
  from (
    select
      'item-purchase:' || spr.id::text as id,
      'purchase'::text as activity_kind,
      'item'::text as target_kind,
      spr.item_id::text as target_id,
      null::integer as amount,
      null::text as counterparty_label,
      'item_purchase_request'::text as source_kind,
      spr.id::text as source_ref,
      coalesce(spr.completed_at, spr.created_at) as created_at
    from public.store_purchase_requests as spr
    where spr.user_id = v_user_id
      and spr.status = 'completed'

    union all

    select
      'item-gift:' || sig.id::text as id,
      case when sig.sender_user_id = v_user_id then 'gift_sent' else 'gift_received' end::text as activity_kind,
      'item'::text as target_kind,
      sig.store_item_id::text as target_id,
      sig.price as amount,
      case
        when sig.sender_user_id = v_user_id and sig.recipient_kind = 'fansub' then 'Fansub'
        else 'Kullanici'
      end::text as counterparty_label,
      'item_gift'::text as source_kind,
      sig.id::text as source_ref,
      sig.created_at as created_at
    from public.store_item_gifts as sig
    where sig.sender_user_id = v_user_id
      or sig.recipient_user_id = v_user_id

    union all

    select
      'package-event:' || spe.id::text as id,
      case
        when spe.event_type = 'purchase' then 'purchase'
        when spe.actor_user_id = v_user_id then 'gift_sent'
        else 'gift_received'
      end::text as activity_kind,
      'package'::text as target_kind,
      spe.package_key as target_id,
      spe.total_price as amount,
      case
        when spe.event_type = 'purchase' then null
        when spe.actor_user_id = v_user_id and spe.recipient_kind = 'fansub' then 'Fansub'
        else 'Kullanici'
      end::text as counterparty_label,
      'package_event'::text as source_kind,
      spe.id::text as source_ref,
      spe.created_at as created_at
    from public.store_package_events as spe
    where spe.actor_user_id = v_user_id
      or spe.recipient_user_id = v_user_id
  ) as activity_rows
  left join public.store_orders as so
    on so.source_kind = activity_rows.source_kind
   and so.source_ref = activity_rows.source_ref
  order by activity_rows.created_at desc
  limit v_limit;
end;
$function$;

revoke execute on function app_private.get_my_store_activity(integer)
  from public, anon, authenticated;
grant execute on function app_private.get_my_store_activity(integer)
  to authenticated, service_role;

create or replace function public.get_my_store_activity(
  p_limit integer default 50
)
returns table (
  id text,
  activity_kind text,
  target_kind text,
  target_id text,
  amount integer,
  counterparty_label text,
  order_code text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $wrapper$
  select *
  from app_private.get_my_store_activity(p_limit);
$wrapper$;

revoke execute on function public.get_my_store_activity(integer)
  from public, anon;
grant execute on function public.get_my_store_activity(integer)
  to authenticated, service_role;

comment on function public.get_my_store_activity(integer)
  is 'Aktif kullanicinin satin alma ve hediye hareketlerini, store_orders defterindeki okunabilir order_code ile birlikte listeler.';

notify pgrst, 'reload schema';

commit;
