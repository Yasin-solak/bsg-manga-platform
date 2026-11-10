begin;

create schema if not exists app_private;

grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.store_owned_items_key_for_type(p_item_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_item_type
    when 'frame' then 'frames'
    when 'background' then 'backgrounds'
    when 'pattern' then 'patterns'
    when 'badge' then 'badges'
    when 'profile_effect' then 'profile_effects'
    else null
  end;
$$;

create or replace function app_private.store_remove_text_from_jsonb_array(
  p_items jsonb,
  p_value text
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_agg(to_jsonb(item.value) order by item.ordinality)
      from jsonb_array_elements_text(coalesce(p_items, '[]'::jsonb)) with ordinality as item(value, ordinality)
      where p_value is null or item.value <> p_value
    ),
    '[]'::jsonb
  );
$$;

create or replace function app_private.store_revoke_user_order_entitlements(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_item record;
  v_owned jsonb;
  v_owned_key text;
  v_item_ref text;
  v_has_other_active boolean;
  v_revoked_count integer := 0;
begin
  for v_item in
    select
      uii.id as inventory_id,
      uii.user_id,
      uii.store_item_id,
      si.type as item_type,
      coalesce(nullif(trim(si.identifier), ''), si.id::text) as item_ref
    from public.user_inventory_items uii
    join public.store_items si on si.id = uii.store_item_id
    where uii.order_id = p_order_id
      and uii.is_active = true
  loop
    update public.user_inventory_items
    set
      is_active = false,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'revokedAt', now(),
        'revokedByAdminOperation', true
      )
    where id = v_item.inventory_id;

    v_revoked_count := v_revoked_count + 1;

    select exists (
      select 1
      from public.user_inventory_items active_inventory
      where active_inventory.user_id = v_item.user_id
        and active_inventory.store_item_id = v_item.store_item_id
        and active_inventory.is_active = true
    )
    into v_has_other_active;

    if not v_has_other_active then
      select coalesce(u.owned_items, '{}'::jsonb)
      into v_owned
      from public.users u
      where u.id = v_item.user_id
      for update;

      if found then
        v_owned_key := app_private.store_owned_items_key_for_type(v_item.item_type);
        v_item_ref := v_item.item_ref;

        if v_owned_key is not null then
          v_owned := jsonb_set(
            v_owned,
            array[v_owned_key],
            app_private.store_remove_text_from_jsonb_array(v_owned -> v_owned_key, v_item_ref),
            true
          );

          if v_item_ref <> v_item.store_item_id::text then
            v_owned := jsonb_set(
              v_owned,
              array[v_owned_key],
              app_private.store_remove_text_from_jsonb_array(v_owned -> v_owned_key, v_item.store_item_id::text),
              true
            );
          end if;
        end if;

        update public.users u
        set
          owned_items = v_owned,
          frame_type = case
            when v_item.item_type = 'frame'
              and u.frame_type in (v_item_ref, v_item.store_item_id::text)
              then 'default'
            else u.frame_type
          end,
          background_type = case
            when v_item.item_type = 'background'
              and u.background_type in (v_item_ref, v_item.store_item_id::text)
              then null
            else u.background_type
          end,
          active_profile_effect_id = case
            when v_item.item_type = 'profile_effect'
              and u.active_profile_effect_id = v_item.store_item_id
              then null
            else u.active_profile_effect_id
          end
        where u.id = v_item.user_id;
      end if;
    end if;
  end loop;

  return v_revoked_count;
end;
$$;

create or replace function app_private.store_revoke_fansub_order_entitlements(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_item record;
  v_deleted_count integer := 0;
  v_revoked_count integer := 0;
begin
  for v_item in
    select
      o.recipient_fansub_id as fansub_id,
      oi.store_item_id,
      si.type as item_type,
      coalesce(nullif(trim(si.identifier), ''), si.id::text) as item_ref
    from public.store_orders o
    join public.store_order_items oi on oi.order_id = o.id
    join public.store_items si on si.id = oi.store_item_id
    where o.id = p_order_id
      and o.recipient_fansub_id is not null
      and oi.store_item_id is not null
  loop
    delete from public.fansub_inventory fi
    where fi.fansub_id = v_item.fansub_id
      and fi.store_item_id = v_item.store_item_id;

    get diagnostics v_deleted_count = row_count;
    v_revoked_count := v_revoked_count + v_deleted_count;

    if v_deleted_count > 0 then
      update public.fansubs f
      set
        frame_type = case
          when v_item.item_type = 'frame'
            and (f.active_frame_id = v_item.store_item_id or f.frame_type = v_item.item_ref)
            then 'default'
          else f.frame_type
        end,
        active_frame_id = case
          when v_item.item_type = 'frame' and f.active_frame_id = v_item.store_item_id then null
          else f.active_frame_id
        end,
        active_background_id = case
          when v_item.item_type = 'background' and f.active_background_id = v_item.store_item_id then null
          else f.active_background_id
        end,
        active_pattern_id = case
          when v_item.item_type = 'pattern' and f.active_pattern_id = v_item.store_item_id then null
          else f.active_pattern_id
        end,
        active_profile_effect_id = case
          when v_item.item_type = 'profile_effect' and f.active_profile_effect_id = v_item.store_item_id then null
          else f.active_profile_effect_id
        end
      where f.id = v_item.fansub_id;
    end if;
  end loop;

  return v_revoked_count;
end;
$$;

create or replace function app_private.admin_apply_store_commerce_operation_impl(
  p_order_id uuid,
  p_operation text,
  p_reason text,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_admin_id uuid := public.current_public_user_id();
  v_order public.store_orders%rowtype;
  v_operation text := lower(trim(coalesce(p_operation, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_request_key uuid := p_request_key;
  v_next_status text;
  v_refund_amount integer := 0;
  v_balance_after integer := null;
  v_user_inventory_count integer := 0;
  v_fansub_inventory_count integer := 0;
  v_source_ref text;
  v_result jsonb;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if p_order_id is null then
    raise exception 'Order secimi zorunludur.';
  end if;

  if v_operation not in ('refund', 'revoke') then
    raise exception 'Desteklenmeyen magaza operasyonu.';
  end if;

  if v_request_key is null then
    raise exception 'Operasyon idempotency anahtari zorunludur.';
  end if;

  if char_length(v_reason) < 10 then
    raise exception 'Operasyon sebebi en az 10 karakter olmalidir.';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'Operasyon sebebi 500 karakteri asamaz.';
  end if;

  select *
  into v_order
  from public.store_orders so
  where so.id = p_order_id
  for update;

  if not found then
    raise exception 'Order bulunamadi.';
  end if;

  v_next_status := case when v_operation = 'refund' then 'refunded' else 'revoked' end;

  if v_order.status <> 'completed' then
    if coalesce(v_order.metadata -> 'lastAdminOperation' ->> 'requestKey', '') = v_request_key::text then
      return jsonb_build_object(
        'orderId', v_order.id,
        'operation', v_operation,
        'status', v_order.status,
        'requestKey', v_request_key,
        'idempotentReplay', true
      );
    end if;

    raise exception 'Sadece tamamlanmis order uzerinde iade veya geri alma uygulanabilir.';
  end if;

  if v_order.order_kind = 'premium_purchase' then
    raise exception 'Premium order iadesi bu operasyon ekraninda kapali. Premium entitlement icin ayri inceleme gerekir.';
  end if;

  v_user_inventory_count := app_private.store_revoke_user_order_entitlements(v_order.id);
  v_fansub_inventory_count := app_private.store_revoke_fansub_order_entitlements(v_order.id);

  if v_operation = 'refund' and v_order.currency = 'Coin' and v_order.total_amount > 0 then
    v_refund_amount := v_order.total_amount;

    update public.users u
    set stones = coalesce(u.stones, 0) + v_refund_amount
    where u.id = v_order.actor_user_id
    returning u.stones into v_balance_after;

    if not found then
      raise exception 'Iade yapilacak kullanici bulunamadi.';
    end if;

    v_source_ref := format('%s:%s:%s', v_order.id, v_operation, v_request_key);

    insert into public.store_wallet_ledger (
      user_id,
      order_id,
      source_kind,
      source_ref,
      entry_type,
      currency,
      amount,
      balance_after,
      metadata
    )
    values (
      v_order.actor_user_id,
      v_order.id,
      'admin_adjustment',
      v_source_ref,
      'refund',
      v_order.currency,
      v_refund_amount,
      v_balance_after,
      jsonb_build_object(
        'operation', v_operation,
        'reason', v_reason,
        'adminUserId', v_admin_id,
        'requestKey', v_request_key,
        'previousStatus', v_order.status,
        'nextStatus', v_next_status
      )
    )
    on conflict (source_kind, source_ref, entry_type) do nothing;
  end if;

  update public.store_orders so
  set
    status = v_next_status,
    balance_after = coalesce(v_balance_after, so.balance_after),
    metadata = coalesce(so.metadata, '{}'::jsonb) || jsonb_build_object(
      'lastAdminOperation',
      jsonb_build_object(
        'operation', v_operation,
        'reason', v_reason,
        'adminUserId', v_admin_id,
        'requestKey', v_request_key,
        'previousStatus', v_order.status,
        'nextStatus', v_next_status,
        'refundAmount', v_refund_amount,
        'revokedUserInventoryCount', v_user_inventory_count,
        'revokedFansubInventoryCount', v_fansub_inventory_count,
        'createdAt', now()
      )
    ),
    updated_at = now()
  where so.id = v_order.id
  returning * into v_order;

  perform public.create_admin_audit_log(
    case when v_operation = 'refund' then 'store_order.refund' else 'store_order.revoke' end,
    'store_order',
    v_order.id::text,
    case
      when v_operation = 'refund' then format('Magaza order %s icin iade uygulandi.', v_order.id)
      else format('Magaza order %s icin envanter geri alindi.', v_order.id)
    end,
    jsonb_build_object(
      'operation', v_operation,
      'reason', v_reason,
      'requestKey', v_request_key,
      'actorUserId', v_order.actor_user_id,
      'recipientKind', v_order.recipient_kind,
      'recipientUserId', v_order.recipient_user_id,
      'recipientFansubId', v_order.recipient_fansub_id,
      'orderKind', v_order.order_kind,
      'currency', v_order.currency,
      'refundAmount', v_refund_amount,
      'balanceAfter', v_balance_after,
      'revokedUserInventoryCount', v_user_inventory_count,
      'revokedFansubInventoryCount', v_fansub_inventory_count
    )
  );

  v_result := jsonb_build_object(
    'orderId', v_order.id,
    'operation', v_operation,
    'status', v_order.status,
    'requestKey', v_request_key,
    'refundAmount', v_refund_amount,
    'balanceAfter', v_balance_after,
    'revokedUserInventoryCount', v_user_inventory_count,
    'revokedFansubInventoryCount', v_fansub_inventory_count,
    'idempotentReplay', false
  );

  return v_result;
end;
$$;

create or replace function public.admin_apply_store_commerce_operation(
  p_order_id uuid,
  p_operation text,
  p_reason text,
  p_request_key uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_apply_store_commerce_operation_impl(p_order_id, p_operation, p_reason, p_request_key);
$$;

revoke execute on function app_private.store_owned_items_key_for_type(text) from public;
grant execute on function app_private.store_owned_items_key_for_type(text) to authenticated, service_role;

revoke execute on function app_private.store_remove_text_from_jsonb_array(jsonb, text) from public;
grant execute on function app_private.store_remove_text_from_jsonb_array(jsonb, text) to authenticated, service_role;

revoke execute on function app_private.store_revoke_user_order_entitlements(uuid) from public, anon;
grant execute on function app_private.store_revoke_user_order_entitlements(uuid) to authenticated, service_role;

revoke execute on function app_private.store_revoke_fansub_order_entitlements(uuid) from public, anon;
grant execute on function app_private.store_revoke_fansub_order_entitlements(uuid) to authenticated, service_role;

revoke execute on function app_private.admin_apply_store_commerce_operation_impl(uuid, text, text, uuid) from public, anon;
grant execute on function app_private.admin_apply_store_commerce_operation_impl(uuid, text, text, uuid) to authenticated, service_role;

revoke execute on function public.admin_apply_store_commerce_operation(uuid, text, text, uuid) from public, anon;
grant execute on function public.admin_apply_store_commerce_operation(uuid, text, text, uuid) to authenticated, service_role;

comment on function public.admin_apply_store_commerce_operation(uuid, text, text, uuid)
  is 'Admin operasyon merkezi icin reason zorunlu, idempotent iade ve envanter geri alma RPC katmani.';

notify pgrst, 'reload schema';

commit;
