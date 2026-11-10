begin;

-- ============================================================
-- 1) Readable order code (order_code), covers all order types
-- Assigned automatically on store_orders by a BEFORE INSERT trigger; all new orders
-- get a code with existing RPCs unchanged.
-- ============================================================
alter table public.store_orders
  add column if not exists order_code text;

create sequence if not exists public.store_order_code_seq;

create or replace function app_private.store_assign_order_code()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if new.order_code is null or btrim(new.order_code) = '' then
    new.order_code := 'ORD-'
      || to_char(coalesce(new.created_at, now()), 'YYYY')
      || '-'
      || lpad(nextval('public.store_order_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

revoke execute on function app_private.store_assign_order_code() from public, anon, authenticated;

drop trigger if exists trg_store_orders_assign_code on public.store_orders;
create trigger trg_store_orders_assign_code
  before insert on public.store_orders
  for each row
  execute function app_private.store_assign_order_code();

-- Code existing orders in created_at order (idempotent: only null ones)
with ordered as (
  select id, created_at,
         row_number() over (order by created_at, id) as rn
  from public.store_orders
  where order_code is null
)
update public.store_orders o
set order_code = 'ORD-' || to_char(o.created_at, 'YYYY') || '-' || lpad(ordered.rn::text, 6, '0')
from ordered
where o.id = ordered.id;

-- Sequence'i backfill sonrasi siradaki numaraya getir
select setval('public.store_order_code_seq', (select count(*) + 1 from public.store_orders), false);

create unique index if not exists store_orders_order_code_key
  on public.store_orders (order_code)
  where order_code is not null;

-- ============================================================
-- 2) Premium GIFT infrastructure
-- Extend order_kind/source_kind CHECKs for 'premium_gift',
-- then add the gift_premium RPC. Premium is a time-based entitlement,
-- so premium_expires_at extends for the recipient; no cosmetic inventory
-- row is created, only the order ledger + wallet debit are written.
-- ============================================================
alter table public.store_orders
  drop constraint if exists store_orders_order_kind_check;
alter table public.store_orders
  add constraint store_orders_order_kind_check
  check (order_kind in (
    'item_purchase', 'premium_purchase', 'item_gift',
    'package_purchase', 'package_gift', 'premium_gift', 'admin_adjustment'
  ));

alter table public.store_orders
  drop constraint if exists store_orders_source_kind_check;
alter table public.store_orders
  add constraint store_orders_source_kind_check
  check (source_kind in (
    'item_purchase_request', 'item_gift', 'package_event',
    'premium_gift', 'admin_adjustment'
  ));

create or replace function public.gift_premium(
  p_recipient_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_sender_id uuid;
  v_sender public.users%rowtype;
  v_recipient public.users%rowtype;
  v_premium_item_id uuid;
  v_price integer;
  v_duration_days integer;
  v_sender_new_stones integer;
  v_recipient_start timestamptz;
  v_recipient_expires timestamptz;
  v_order_id uuid;
  v_order_code text;
  v_source_ref text := gen_random_uuid()::text;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza hediye gonderimi su anda gecici olarak kapali.';
  end if;

  if p_recipient_user_id is null then
    raise exception 'Hediye edilecek kullanici eksik.';
  end if;

  v_sender_id := public.current_public_user_id();
  if v_sender_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_recipient_user_id = v_sender_id then
    raise exception 'Premiumu kendine hediye edemezsin.';
  end if;

  -- Aktif premium teklifi (premium_runtime_config singleton)
  select item.id, item.price, greatest(coalesce(cfg.premium_duration_days, 30), 1)
  into v_premium_item_id, v_price, v_duration_days
  from public.premium_runtime_config cfg
  join public.store_items item on item.id = cfg.premium_store_item_id
  where cfg.id = true
    and item.type = 'premium'
    and item.is_active = true
  limit 1;

  if v_premium_item_id is null then
    raise exception 'Aktif premium teklifi bulunamadi.';
  end if;

  select * into v_sender from public.users where id = v_sender_id for update;
  if not found then
    raise exception 'Gonderen public profil bulunamadi.';
  end if;

  if v_sender.stones < v_price then
    raise exception 'Yetersiz bakiye.';
  end if;

  select * into v_recipient
  from public.users
  where id = p_recipient_user_id
    and is_active = true
    and is_banned = false
  for update;
  if not found then
    raise exception 'Hediye gonderilecek kullanici bulunamadi.';
  end if;

  -- Add premium time for the recipient on top of the current time
  v_recipient_start := greatest(now(), coalesce(v_recipient.premium_expires_at, now()));
  v_recipient_expires := v_recipient_start + make_interval(days => v_duration_days);

  perform set_config('app.store_purchase_user_update', 'true', true);
  update public.users
  set premium_expires_at = v_recipient_expires
  where id = p_recipient_user_id;
  perform set_config('app.store_purchase_user_update', '', true);

  -- Gondereni borclandir
  v_sender_new_stones := v_sender.stones - v_price;
  perform set_config('app.store_purchase_user_update', 'true', true);
  update public.users
  set stones = v_sender_new_stones
  where id = v_sender_id;
  perform set_config('app.store_purchase_user_update', '', true);

  update public.store_items
  set purchase_count = purchase_count + 1
  where id = v_premium_item_id;

  -- Order ledger (order_code assigned by the BEFORE INSERT trigger)
  insert into public.store_orders (
    actor_user_id, recipient_kind, recipient_user_id,
    source_kind, source_ref, order_kind, status, currency,
    total_amount, balance_after, metadata, created_at, completed_at
  )
  values (
    v_sender_id, 'user', p_recipient_user_id,
    'premium_gift', v_source_ref, 'premium_gift', 'completed', 'Coin',
    v_price, v_sender_new_stones,
    jsonb_build_object('durationDays', v_duration_days, 'recipientUserId', p_recipient_user_id),
    now(), now()
  )
  returning id, order_code into v_order_id, v_order_code;

  insert into public.store_order_items (
    order_id, store_item_id, line_kind, item_type, item_identifier,
    quantity, unit_amount, revenue_amount, metadata, created_at
  )
  select v_order_id, si.id, 'premium', si.type, si.identifier,
         1, v_price, v_price,
         jsonb_build_object('source', 'gift_premium', 'durationDays', v_duration_days),
         now()
  from public.store_items si
  where si.id = v_premium_item_id
  on conflict (order_id, store_item_id, line_kind) do nothing;

  perform app_private.store_record_wallet_debit_for_order(v_order_id);

  return jsonb_build_object(
    'sender_user_id', v_sender_id,
    'sender_stones', v_sender_new_stones,
    'recipient_kind', 'user',
    'recipient_user_id', p_recipient_user_id,
    'order_id', v_order_id,
    'order_code', v_order_code,
    'premium_item_id', v_premium_item_id,
    'duration_days', v_duration_days,
    'recipient_premium_expires_at', v_recipient_expires
  );
end;
$function$;

revoke execute on function public.gift_premium(uuid) from anon;
grant execute on function public.gift_premium(uuid) to authenticated;

comment on column public.store_orders.order_code
  is 'Okunabilir siparis kodu (ORD-YYYY-NNNNNN); BEFORE INSERT trigger ile otomatik atanir.';
comment on function public.gift_premium(uuid)
  is 'Aktif premium teklifini baska bir kullaniciya hediye eder: gonderen Coin ile borclanir, alicinin premium_expires_at suresi uzatilir, premium_gift siparisi defterlenir.';

notify pgrst, 'reload schema';

commit;
