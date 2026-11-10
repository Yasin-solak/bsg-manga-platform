begin;

create schema if not exists app_private;

grant usage on schema app_private to authenticated, service_role;

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.users(id) on delete restrict,
  recipient_kind text not null default 'self'
    check (recipient_kind in ('self', 'user', 'fansub')),
  recipient_user_id uuid references public.users(id) on delete set null,
  recipient_fansub_id uuid references public.fansubs(id) on delete set null,
  source_kind text not null
    check (source_kind in ('item_purchase_request', 'item_gift', 'package_event', 'admin_adjustment')),
  source_ref text not null,
  order_kind text not null
    check (order_kind in ('item_purchase', 'premium_purchase', 'item_gift', 'package_purchase', 'package_gift', 'admin_adjustment')),
  status text not null default 'completed'
    check (status in ('completed', 'refunded', 'revoked', 'void')),
  currency text not null default 'Coin'
    check (currency in ('Coin', 'TL')),
  total_amount integer not null default 0
    check (total_amount >= 0),
  balance_after integer,
  request_key uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_kind, source_ref),
  check (
    (recipient_kind = 'self' and recipient_user_id = actor_user_id and recipient_fansub_id is null)
    or (recipient_kind = 'user' and recipient_user_id is not null and recipient_fansub_id is null)
    or (recipient_kind = 'fansub' and recipient_user_id is null and recipient_fansub_id is not null)
  )
);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  store_item_id uuid references public.store_items(id) on delete set null,
  package_key text,
  line_kind text not null default 'item'
    check (line_kind in ('item', 'premium', 'package_grant')),
  item_type text,
  item_identifier text,
  quantity integer not null default 1
    check (quantity > 0),
  unit_amount integer not null default 0
    check (unit_amount >= 0),
  revenue_amount integer not null default 0
    check (revenue_amount >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (order_id, store_item_id, line_kind)
);

create table if not exists public.user_inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  store_item_id uuid not null references public.store_items(id) on delete restrict,
  item_type text not null,
  item_identifier text not null,
  acquired_via text not null
    check (acquired_via in ('purchase', 'gift', 'package_purchase', 'package_gift', 'premium_purchase', 'admin_grant')),
  order_id uuid references public.store_orders(id) on delete set null,
  source_kind text not null,
  source_ref text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  acquired_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.store_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  order_id uuid references public.store_orders(id) on delete set null,
  source_kind text not null,
  source_ref text not null,
  entry_type text not null
    check (entry_type in ('debit', 'credit', 'refund', 'adjustment')),
  currency text not null default 'Coin'
    check (currency in ('Coin', 'TL')),
  amount integer not null
    check (amount <> 0),
  balance_after integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_kind, source_ref, entry_type)
);

create table if not exists public.store_item_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  event_type text not null
    check (event_type in ('impression', 'click', 'preview', 'wishlist_add', 'wishlist_remove', 'equip', 'purchase_intent')),
  target_kind text not null
    check (target_kind in ('item', 'package')),
  target_id text not null,
  surface text not null default 'store',
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists store_orders_actor_created_idx
  on public.store_orders (actor_user_id, created_at desc);
create index if not exists store_orders_recipient_user_created_idx
  on public.store_orders (recipient_user_id, created_at desc)
  where recipient_user_id is not null;
create index if not exists store_orders_status_created_idx
  on public.store_orders (status, created_at desc);
create index if not exists store_orders_kind_created_idx
  on public.store_orders (order_kind, created_at desc);

create index if not exists store_order_items_item_created_idx
  on public.store_order_items (store_item_id, created_at desc)
  where store_item_id is not null;
create index if not exists store_order_items_order_idx
  on public.store_order_items (order_id);
create index if not exists store_order_items_package_key_idx
  on public.store_order_items (package_key)
  where package_key is not null;

create unique index if not exists user_inventory_items_active_user_item_key
  on public.user_inventory_items (user_id, store_item_id)
  where is_active;
create index if not exists user_inventory_items_user_acquired_idx
  on public.user_inventory_items (user_id, acquired_at desc);
create index if not exists user_inventory_items_source_idx
  on public.user_inventory_items (source_kind, source_ref);

create index if not exists store_wallet_ledger_user_created_idx
  on public.store_wallet_ledger (user_id, created_at desc);
create index if not exists store_wallet_ledger_order_idx
  on public.store_wallet_ledger (order_id)
  where order_id is not null;

create index if not exists store_item_analytics_events_target_created_idx
  on public.store_item_analytics_events (target_kind, target_id, created_at desc);
create index if not exists store_item_analytics_events_user_created_idx
  on public.store_item_analytics_events (user_id, created_at desc)
  where user_id is not null;

drop trigger if exists trg_store_orders_updated_at on public.store_orders;
create trigger trg_store_orders_updated_at
  before update on public.store_orders
  for each row
  execute function public.set_updated_at();

alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
alter table public.user_inventory_items enable row level security;
alter table public.store_wallet_ledger enable row level security;
alter table public.store_item_analytics_events enable row level security;

drop policy if exists store_orders_select_owner_or_admin on public.store_orders;
create policy store_orders_select_owner_or_admin
  on public.store_orders
  for select
  to authenticated
  using (
    (select public.is_admin())
    or actor_user_id = (select public.current_public_user_id())
    or recipient_user_id = (select public.current_public_user_id())
  );

drop policy if exists store_order_items_select_visible_order on public.store_order_items;
create policy store_order_items_select_visible_order
  on public.store_order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.store_orders o
      where o.id = store_order_items.order_id
        and (
          (select public.is_admin())
          or o.actor_user_id = (select public.current_public_user_id())
          or o.recipient_user_id = (select public.current_public_user_id())
        )
    )
  );

drop policy if exists user_inventory_items_select_owner_or_admin on public.user_inventory_items;
create policy user_inventory_items_select_owner_or_admin
  on public.user_inventory_items
  for select
  to authenticated
  using (
    (select public.is_admin())
    or user_id = (select public.current_public_user_id())
  );

drop policy if exists store_wallet_ledger_select_owner_or_admin on public.store_wallet_ledger;
create policy store_wallet_ledger_select_owner_or_admin
  on public.store_wallet_ledger
  for select
  to authenticated
  using (
    (select public.is_admin())
    or user_id = (select public.current_public_user_id())
  );

drop policy if exists store_item_analytics_events_insert_authenticated on public.store_item_analytics_events;
create policy store_item_analytics_events_insert_authenticated
  on public.store_item_analytics_events
  for insert
  to authenticated
  with check (
    user_id is null
    or user_id = (select public.current_public_user_id())
  );

drop policy if exists store_item_analytics_events_select_admin on public.store_item_analytics_events;
create policy store_item_analytics_events_select_admin
  on public.store_item_analytics_events
  for select
  to authenticated
  using ((select public.is_admin()));

revoke all on table public.store_orders from anon, authenticated;
revoke all on table public.store_order_items from anon, authenticated;
revoke all on table public.user_inventory_items from anon, authenticated;
revoke all on table public.store_wallet_ledger from anon, authenticated;
revoke all on table public.store_item_analytics_events from anon, authenticated;

grant select on table public.store_orders to authenticated;
grant select on table public.store_order_items to authenticated;
grant select on table public.user_inventory_items to authenticated;
grant select on table public.store_wallet_ledger to authenticated;
grant select, insert on table public.store_item_analytics_events to authenticated;

grant select, insert, update, delete on table public.store_orders to service_role;
grant select, insert, update, delete on table public.store_order_items to service_role;
grant select, insert, update, delete on table public.user_inventory_items to service_role;
grant select, insert, update, delete on table public.store_wallet_ledger to service_role;
grant select, insert, update, delete on table public.store_item_analytics_events to service_role;

create or replace function app_private.store_jsonb_integer(p_payload jsonb, p_key text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_payload->>p_key, '') ~ '^-?[0-9]+$' then (p_payload->>p_key)::integer
    else null
  end;
$$;

create or replace function app_private.store_record_wallet_debit_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_order public.store_orders%rowtype;
begin
  select *
  into v_order
  from public.store_orders
  where id = p_order_id;

  if not found or v_order.currency <> 'Coin' or v_order.total_amount <= 0 then
    return;
  end if;

  insert into public.store_wallet_ledger (
    user_id,
    order_id,
    source_kind,
    source_ref,
    entry_type,
    currency,
    amount,
    balance_after,
    metadata,
    created_at
  )
  values (
    v_order.actor_user_id,
    v_order.id,
    v_order.source_kind,
    v_order.source_ref,
    'debit',
    v_order.currency,
    -v_order.total_amount,
    v_order.balance_after,
    jsonb_build_object('orderKind', v_order.order_kind),
    coalesce(v_order.completed_at, v_order.created_at)
  )
  on conflict (source_kind, source_ref, entry_type) do nothing;
end;
$$;

create or replace function app_private.store_record_inventory_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  insert into public.user_inventory_items (
    user_id,
    store_item_id,
    item_type,
    item_identifier,
    acquired_via,
    order_id,
    source_kind,
    source_ref,
    metadata,
    acquired_at
  )
  select
    o.recipient_user_id,
    oi.store_item_id,
    coalesce(oi.item_type, si.type),
    coalesce(oi.item_identifier, si.identifier),
    case o.order_kind
      when 'premium_purchase' then 'premium_purchase'
      when 'item_purchase' then 'purchase'
      when 'item_gift' then 'gift'
      when 'package_purchase' then 'package_purchase'
      when 'package_gift' then 'package_gift'
      else 'admin_grant'
    end,
    o.id,
    o.source_kind,
    o.source_ref,
    jsonb_build_object(
      'orderKind', o.order_kind,
      'lineKind', oi.line_kind,
      'packageKey', oi.package_key
    ),
    coalesce(o.completed_at, o.created_at)
  from public.store_orders o
  join public.store_order_items oi on oi.order_id = o.id
  join public.store_items si on si.id = oi.store_item_id
  where o.id = p_order_id
    and o.status = 'completed'
    and o.recipient_user_id is not null
    and oi.store_item_id is not null
  on conflict (user_id, store_item_id) where is_active do nothing;
end;
$$;

create or replace function app_private.store_record_item_purchase_order_from_request()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_item public.store_items%rowtype;
  v_order_id uuid;
  v_balance_after integer;
begin
  if new.status <> 'completed' or new.response is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'completed' then
    return new;
  end if;

  select *
  into v_item
  from public.store_items
  where id = new.item_id;

  if not found then
    return new;
  end if;

  v_balance_after := app_private.store_jsonb_integer(new.response, 'stones');

  insert into public.store_orders (
    actor_user_id,
    recipient_kind,
    recipient_user_id,
    source_kind,
    source_ref,
    order_kind,
    status,
    currency,
    total_amount,
    balance_after,
    request_key,
    metadata,
    created_at,
    completed_at
  )
  values (
    new.user_id,
    'self',
    new.user_id,
    'item_purchase_request',
    new.id::text,
    case when v_item.type = 'premium' then 'premium_purchase' else 'item_purchase' end,
    'completed',
    v_item.currency,
    v_item.price,
    v_balance_after,
    new.request_key,
    jsonb_build_object('response', new.response),
    new.created_at,
    coalesce(new.completed_at, new.created_at, now())
  )
  on conflict (source_kind, source_ref) do update
  set status = excluded.status,
      balance_after = excluded.balance_after,
      metadata = public.store_orders.metadata || excluded.metadata,
      completed_at = excluded.completed_at
  returning id into v_order_id;

  insert into public.store_order_items (
    order_id,
    store_item_id,
    line_kind,
    item_type,
    item_identifier,
    quantity,
    unit_amount,
    revenue_amount,
    metadata,
    created_at
  )
  values (
    v_order_id,
    v_item.id,
    case when v_item.type = 'premium' then 'premium' else 'item' end,
    v_item.type,
    v_item.identifier,
    1,
    v_item.price,
    v_item.price,
    jsonb_build_object('source', 'store_purchase_requests'),
    coalesce(new.completed_at, new.created_at, now())
  )
  on conflict (order_id, store_item_id, line_kind) do nothing;

  perform app_private.store_record_wallet_debit_for_order(v_order_id);
  perform app_private.store_record_inventory_for_order(v_order_id);

  return new;
end;
$$;

create or replace function app_private.store_record_item_gift_order()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_item public.store_items%rowtype;
  v_order_id uuid;
  v_balance_after integer;
begin
  select *
  into v_item
  from public.store_items
  where id = new.store_item_id;

  if not found then
    return new;
  end if;

  select stones
  into v_balance_after
  from public.users
  where id = new.sender_user_id;

  insert into public.store_orders (
    actor_user_id,
    recipient_kind,
    recipient_user_id,
    recipient_fansub_id,
    source_kind,
    source_ref,
    order_kind,
    status,
    currency,
    total_amount,
    balance_after,
    metadata,
    created_at,
    completed_at
  )
  values (
    new.sender_user_id,
    new.recipient_kind,
    new.recipient_user_id,
    new.recipient_fansub_id,
    'item_gift',
    new.id::text,
    'item_gift',
    'completed',
    v_item.currency,
    new.price,
    v_balance_after,
    jsonb_build_object('recipientKind', new.recipient_kind),
    new.created_at,
    new.created_at
  )
  on conflict (source_kind, source_ref) do update
  set status = excluded.status,
      balance_after = excluded.balance_after,
      metadata = public.store_orders.metadata || excluded.metadata
  returning id into v_order_id;

  insert into public.store_order_items (
    order_id,
    store_item_id,
    line_kind,
    item_type,
    item_identifier,
    quantity,
    unit_amount,
    revenue_amount,
    metadata,
    created_at
  )
  values (
    v_order_id,
    v_item.id,
    'item',
    v_item.type,
    v_item.identifier,
    1,
    new.price,
    new.price,
    jsonb_build_object('source', 'store_item_gifts'),
    new.created_at
  )
  on conflict (order_id, store_item_id, line_kind) do nothing;

  perform app_private.store_record_wallet_debit_for_order(v_order_id);
  perform app_private.store_record_inventory_for_order(v_order_id);

  return new;
end;
$$;

create or replace function app_private.store_record_package_order()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_order_id uuid;
  v_balance_after integer;
begin
  select stones
  into v_balance_after
  from public.users
  where id = new.actor_user_id;

  insert into public.store_orders (
    actor_user_id,
    recipient_kind,
    recipient_user_id,
    recipient_fansub_id,
    source_kind,
    source_ref,
    order_kind,
    status,
    currency,
    total_amount,
    balance_after,
    metadata,
    created_at,
    completed_at
  )
  values (
    new.actor_user_id,
    case when new.event_type = 'purchase' then 'self' else new.recipient_kind end,
    case when new.event_type = 'purchase' then new.actor_user_id else new.recipient_user_id end,
    case when new.event_type = 'purchase' then null else new.recipient_fansub_id end,
    'package_event',
    new.id::text,
    case when new.event_type = 'purchase' then 'package_purchase' else 'package_gift' end,
    'completed',
    'Coin',
    new.total_price,
    v_balance_after,
    jsonb_build_object(
      'packageKey', new.package_key,
      'eventType', new.event_type,
      'grantedItemIds', to_jsonb(new.granted_item_ids)
    ),
    new.created_at,
    new.created_at
  )
  on conflict (source_kind, source_ref) do update
  set status = excluded.status,
      balance_after = excluded.balance_after,
      metadata = public.store_orders.metadata || excluded.metadata
  returning id into v_order_id;

  insert into public.store_order_items (
    order_id,
    store_item_id,
    package_key,
    line_kind,
    item_type,
    item_identifier,
    quantity,
    unit_amount,
    revenue_amount,
    metadata,
    created_at
  )
  select
    v_order_id,
    si.id,
    new.package_key,
    'package_grant',
    si.type,
    si.identifier,
    1,
    allocation.revenue_amount,
    allocation.revenue_amount,
    jsonb_build_object('source', 'store_package_events', 'packageKey', new.package_key),
    new.created_at
  from (
    select
      granted.item_id,
      granted.ordinality,
      count(*) over () as item_count,
      case
        when count(*) over () = 0 then 0
        else (new.total_price / (count(*) over ())::integer)
          + case when granted.ordinality = 1 then (new.total_price % (count(*) over ())::integer) else 0 end
      end as revenue_amount
    from unnest(coalesce(new.granted_item_ids, array[]::uuid[])) with ordinality as granted(item_id, ordinality)
  ) allocation
  join public.store_items si on si.id = allocation.item_id
  on conflict (order_id, store_item_id, line_kind) do nothing;

  perform app_private.store_record_wallet_debit_for_order(v_order_id);
  perform app_private.store_record_inventory_for_order(v_order_id);

  return new;
end;
$$;

drop trigger if exists trg_store_purchase_requests_record_order on public.store_purchase_requests;
create trigger trg_store_purchase_requests_record_order
  after insert or update of status, response, completed_at on public.store_purchase_requests
  for each row
  execute function app_private.store_record_item_purchase_order_from_request();

drop trigger if exists trg_store_item_gifts_record_order on public.store_item_gifts;
create trigger trg_store_item_gifts_record_order
  after insert on public.store_item_gifts
  for each row
  execute function app_private.store_record_item_gift_order();

drop trigger if exists trg_store_package_events_record_order on public.store_package_events;
create trigger trg_store_package_events_record_order
  after insert on public.store_package_events
  for each row
  execute function app_private.store_record_package_order();

insert into public.store_orders (
  actor_user_id,
  recipient_kind,
  recipient_user_id,
  source_kind,
  source_ref,
  order_kind,
  status,
  currency,
  total_amount,
  balance_after,
  request_key,
  metadata,
  created_at,
  completed_at
)
select
  spr.user_id,
  'self',
  spr.user_id,
  'item_purchase_request',
  spr.id::text,
  case when si.type = 'premium' then 'premium_purchase' else 'item_purchase' end,
  'completed',
  si.currency,
  si.price,
  app_private.store_jsonb_integer(spr.response, 'stones'),
  spr.request_key,
  jsonb_build_object('response', spr.response, 'backfilled', true),
  spr.created_at,
  coalesce(spr.completed_at, spr.created_at)
from public.store_purchase_requests spr
join public.store_items si on si.id = spr.item_id
where spr.status = 'completed'
  and spr.response is not null
on conflict (source_kind, source_ref) do nothing;

insert into public.store_orders (
  actor_user_id,
  recipient_kind,
  recipient_user_id,
  recipient_fansub_id,
  source_kind,
  source_ref,
  order_kind,
  status,
  currency,
  total_amount,
  balance_after,
  metadata,
  created_at,
  completed_at
)
select
  sig.sender_user_id,
  sig.recipient_kind,
  sig.recipient_user_id,
  sig.recipient_fansub_id,
  'item_gift',
  sig.id::text,
  'item_gift',
  'completed',
  si.currency,
  sig.price,
  null,
  jsonb_build_object('recipientKind', sig.recipient_kind, 'backfilled', true),
  sig.created_at,
  sig.created_at
from public.store_item_gifts sig
join public.store_items si on si.id = sig.store_item_id
on conflict (source_kind, source_ref) do nothing;

insert into public.store_orders (
  actor_user_id,
  recipient_kind,
  recipient_user_id,
  recipient_fansub_id,
  source_kind,
  source_ref,
  order_kind,
  status,
  currency,
  total_amount,
  balance_after,
  metadata,
  created_at,
  completed_at
)
select
  spe.actor_user_id,
  case when spe.event_type = 'purchase' then 'self' else spe.recipient_kind end,
  case when spe.event_type = 'purchase' then spe.actor_user_id else spe.recipient_user_id end,
  case when spe.event_type = 'purchase' then null else spe.recipient_fansub_id end,
  'package_event',
  spe.id::text,
  case when spe.event_type = 'purchase' then 'package_purchase' else 'package_gift' end,
  'completed',
  'Coin',
  spe.total_price,
  null,
  jsonb_build_object('packageKey', spe.package_key, 'eventType', spe.event_type, 'grantedItemIds', to_jsonb(spe.granted_item_ids), 'backfilled', true),
  spe.created_at,
  spe.created_at
from public.store_package_events spe
on conflict (source_kind, source_ref) do nothing;

insert into public.store_order_items (
  order_id,
  store_item_id,
  line_kind,
  item_type,
  item_identifier,
  quantity,
  unit_amount,
  revenue_amount,
  metadata,
  created_at
)
select
  so.id,
  si.id,
  case when si.type = 'premium' then 'premium' else 'item' end,
  si.type,
  si.identifier,
  1,
  si.price,
  si.price,
  jsonb_build_object('source', 'store_purchase_requests', 'backfilled', true),
  coalesce(so.completed_at, so.created_at)
from public.store_orders so
join public.store_purchase_requests spr
  on so.source_kind = 'item_purchase_request'
  and so.source_ref = spr.id::text
join public.store_items si on si.id = spr.item_id
on conflict (order_id, store_item_id, line_kind) do nothing;

insert into public.store_order_items (
  order_id,
  store_item_id,
  line_kind,
  item_type,
  item_identifier,
  quantity,
  unit_amount,
  revenue_amount,
  metadata,
  created_at
)
select
  so.id,
  si.id,
  'item',
  si.type,
  si.identifier,
  1,
  sig.price,
  sig.price,
  jsonb_build_object('source', 'store_item_gifts', 'backfilled', true),
  so.created_at
from public.store_orders so
join public.store_item_gifts sig
  on so.source_kind = 'item_gift'
  and so.source_ref = sig.id::text
join public.store_items si on si.id = sig.store_item_id
on conflict (order_id, store_item_id, line_kind) do nothing;

insert into public.store_order_items (
  order_id,
  store_item_id,
  package_key,
  line_kind,
  item_type,
  item_identifier,
  quantity,
  unit_amount,
  revenue_amount,
  metadata,
  created_at
)
select
  so.id,
  si.id,
  spe.package_key,
  'package_grant',
  si.type,
  si.identifier,
  1,
  allocation.revenue_amount,
  allocation.revenue_amount,
  jsonb_build_object('source', 'store_package_events', 'packageKey', spe.package_key, 'backfilled', true),
  so.created_at
from public.store_orders so
join public.store_package_events spe
  on so.source_kind = 'package_event'
  and so.source_ref = spe.id::text
cross join lateral (
  select
    granted.item_id,
    granted.ordinality,
    count(*) over () as item_count,
    case
      when count(*) over () = 0 then 0
      else (spe.total_price / (count(*) over ())::integer)
        + case when granted.ordinality = 1 then (spe.total_price % (count(*) over ())::integer) else 0 end
    end as revenue_amount
  from unnest(coalesce(spe.granted_item_ids, array[]::uuid[])) with ordinality as granted(item_id, ordinality)
) allocation
join public.store_items si on si.id = allocation.item_id
on conflict (order_id, store_item_id, line_kind) do nothing;

insert into public.store_wallet_ledger (
  user_id,
  order_id,
  source_kind,
  source_ref,
  entry_type,
  currency,
  amount,
  balance_after,
  metadata,
  created_at
)
select
  so.actor_user_id,
  so.id,
  so.source_kind,
  so.source_ref,
  'debit',
  so.currency,
  -so.total_amount,
  so.balance_after,
  jsonb_build_object('orderKind', so.order_kind, 'backfilled', true),
  coalesce(so.completed_at, so.created_at)
from public.store_orders so
where so.status = 'completed'
  and so.currency = 'Coin'
  and so.total_amount > 0
on conflict (source_kind, source_ref, entry_type) do nothing;

insert into public.user_inventory_items (
  user_id,
  store_item_id,
  item_type,
  item_identifier,
  acquired_via,
  order_id,
  source_kind,
  source_ref,
  metadata,
  acquired_at
)
select
  so.recipient_user_id,
  soi.store_item_id,
  coalesce(soi.item_type, si.type),
  coalesce(soi.item_identifier, si.identifier),
  case so.order_kind
    when 'premium_purchase' then 'premium_purchase'
    when 'item_purchase' then 'purchase'
    when 'item_gift' then 'gift'
    when 'package_purchase' then 'package_purchase'
    when 'package_gift' then 'package_gift'
    else 'admin_grant'
  end,
  so.id,
  so.source_kind,
  so.source_ref,
  jsonb_build_object('orderKind', so.order_kind, 'lineKind', soi.line_kind, 'backfilled', true),
  coalesce(so.completed_at, so.created_at)
from public.store_orders so
join public.store_order_items soi on soi.order_id = so.id
join public.store_items si on si.id = soi.store_item_id
where so.status = 'completed'
  and so.recipient_user_id is not null
on conflict (user_id, store_item_id) where is_active do nothing;

revoke execute on function app_private.store_jsonb_integer(jsonb, text) from public, anon, authenticated;
revoke execute on function app_private.store_record_wallet_debit_for_order(uuid) from public, anon, authenticated;
revoke execute on function app_private.store_record_inventory_for_order(uuid) from public, anon, authenticated;
revoke execute on function app_private.store_record_item_purchase_order_from_request() from public, anon, authenticated;
revoke execute on function app_private.store_record_item_gift_order() from public, anon, authenticated;
revoke execute on function app_private.store_record_package_order() from public, anon, authenticated;

comment on table public.store_orders
  is 'Magaza ekonomisinde her satin alma, hediye ve paket olayini tek karar defterinde toplar; purchase_count artik karar metrigi degildir.';
comment on table public.store_order_items
  is 'Order satirlarini urun tipine ve gelir payina ayirir; paket satislarinin urun analitigini bozmadan okunmasini saglar.';
comment on table public.user_inventory_items
  is 'users.owned_items JSONB alanini bozmadan kalici ve sorgulanabilir kullanici envanteri olusturur.';
comment on table public.store_wallet_ledger
  is 'Coin hareketlerini order kaydiyla eslestirir; iade ve manuel duzeltme icin muhasebe zemini saglar.';
comment on table public.store_item_analytics_events
  is 'Gosterim, tiklama, onizleme ve niyet olaylarini satin alma defterinden ayri tutar.';

notify pgrst, 'reload schema';

commit;
