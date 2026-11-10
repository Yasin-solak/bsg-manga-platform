-- Bulk discount made atomic.
-- Previously: runBulkStoreDiscount called a separate admin_set_store_item_pricing RPC
-- per product on the client; an error midway left the discount
-- half applied with no rollback.
-- This RPC applies the same business rule (apply: base = original_price>0 ? original : price,
-- new price = base * (100-p)/100, min 1; clear: return price to base,
-- reset original) in one transaction and writes one audit record.

begin;

create or replace function public.admin_bulk_set_store_item_pricing(
  p_action text,
  p_item_ids uuid[],
  p_percent integer default null
)
returns table (updated_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_updated integer := 0;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if v_action not in ('apply', 'clear') then
    raise exception 'Gecersiz toplu fiyat islemi.';
  end if;

  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    raise exception 'Toplu islem icin hedef urun bulunamadi.';
  end if;

  if v_action = 'apply' and (p_percent is null or p_percent < 1 or p_percent > 95) then
    raise exception 'Indirim yuzdesi 1 ile 95 arasinda olmalidir.';
  end if;

  if v_action = 'apply' then
    with targets as (
      select
        si.id,
        case
          when si.original_price is not null and si.original_price > 0 then si.original_price
          else si.price
        end as base_price
      from public.store_items si
      where si.id = any(p_item_ids)
      for update
    )
    update public.store_items si
    set
      price = greatest(1, round(t.base_price * (100 - p_percent) / 100.0)::integer),
      original_price = t.base_price
    from targets t
    where si.id = t.id
      and (
        si.price <> greatest(1, round(t.base_price * (100 - p_percent) / 100.0)::integer)
        or si.original_price is distinct from t.base_price
      );
  else
    with targets as (
      select
        si.id,
        case
          when si.original_price is not null and si.original_price > 0 then si.original_price
          else si.price
        end as base_price
      from public.store_items si
      where si.id = any(p_item_ids)
        and si.original_price is not null
      for update
    )
    update public.store_items si
    set
      price = t.base_price,
      original_price = null
    from targets t
    where si.id = t.id;
  end if;

  get diagnostics v_updated = row_count;

  perform public.create_admin_audit_log(
    'store_item.bulk_pricing',
    'store_item',
    null,
    case
      when v_action = 'apply' then format('%s urune toplu %%%s indirim uygulandi.', v_updated, p_percent)
      else format('%s urunde toplu indirim temizlendi.', v_updated)
    end,
    jsonb_build_object(
      'action', v_action,
      'percent', p_percent,
      'targetCount', coalesce(array_length(p_item_ids, 1), 0),
      'updatedCount', v_updated
    )
  );

  return query select v_updated;
end;
$$;

revoke all on function public.admin_bulk_set_store_item_pricing(text, uuid[], integer) from public;
grant execute on function public.admin_bulk_set_store_item_pricing(text, uuid[], integer) to authenticated;

notify pgrst, 'reload schema';

commit;
