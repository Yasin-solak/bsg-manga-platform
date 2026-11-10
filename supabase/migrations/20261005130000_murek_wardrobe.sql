-- Murek Wardrobe: cosmetic colors and accessories for the mascot Murek (with coins).
--
-- * Cosmetic only; no advantage in games. No random box, what you buy is clear.
-- * Kept separate from the Shop v3 product engine (shop_products/store_items): its type lists
-- are pinned for frame/background/effect; adding Murek there risks the purchase flow.
-- Coins still debit the same balance and write to store_wallet_ledger as 'murek_item'.
-- * Pixel drawings are on the client (murekSprite); here only catalog, ownership and equip.

create table if not exists public.murek_items (
  id text primary key check (id ~ '^[a-z0-9-]{2,32}$'),
  kind text not null check (kind in ('color', 'accessory')),
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '',
  price integer not null default 0 check (price between 0 and 100000),
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  data jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_murek (
  user_id uuid primary key references public.users(id) on delete cascade,
  owned text[] not null default '{}',
  color text references public.murek_items(id) on delete set null,
  accessory text references public.murek_items(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.murek_items enable row level security;
alter table public.user_murek enable row level security;
revoke all on table public.murek_items from public, anon, authenticated;
revoke all on table public.user_murek from public, anon, authenticated;

-- Ilk set: varsayilan mor ucretsiz (herkeste), 7 renk + 6 aksesuar.
insert into public.murek_items (id, kind, name, description, price, rarity, data, sort) values
  ('mor', 'color', 'Mürekkep Moru', 'Mürek''in doğuştan rengi.', 0, 'common', '{"hex":"#7c6cff"}', 0),
  ('gece', 'color', 'Gece Mavisi', 'Gece yarısı bölüm okuyanlara.', 150, 'common', '{"hex":"#3b5bdb"}', 10),
  ('zumrut', 'color', 'Zümrüt', 'Yeşilin en asili.', 150, 'common', '{"hex":"#12b886"}', 20),
  ('pembe', 'color', 'Sakura', 'Bahar gibi bir Mürek.', 150, 'common', '{"hex":"#f06595"}', 30),
  ('kizil', 'color', 'Kızıl Mürekkep', 'Düello kalemi.', 200, 'rare', '{"hex":"#e03131"}', 40),
  ('neon', 'color', 'Neon', 'Karanlıkta parlar gibi.', 300, 'rare', '{"hex":"#2fe07a"}', 50),
  ('altin', 'color', 'Altın', 'Efsanevi okurların rengi.', 500, 'epic', '{"hex":"#f5b83d"}', 60),
  ('gokkusagi', 'color', 'Gökkuşağı', 'Renkten renge akar.', 900, 'legendary', '{"hex":"#ff5a5a","animated":"rainbow"}', 70),
  ('bere', 'accessory', 'Bere', 'Ponponlu kışlık bere.', 150, 'common', '{}', 110),
  ('fiyonk', 'accessory', 'Fiyonk', 'Tepeye kocaman bir fiyonk.', 150, 'common', '{}', 120),
  ('atki', 'accessory', 'Atkı', 'Çizgili, sıcacık.', 200, 'common', '{}', 130),
  ('gozluk', 'accessory', 'Güneş Gözlüğü', 'Havalı Mürek.', 250, 'rare', '{}', 140),
  ('kulaklik', 'accessory', 'Kulaklık', 'Okurken müzik şart.', 300, 'rare', '{}', 150),
  ('tac', 'accessory', 'Taç', 'Okur kralı/kraliçesi.', 600, 'epic', '{}', 160)
on conflict (id) do nothing;

create or replace function app_private.murek_item_json(i public.murek_items)
returns jsonb language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', i.id, 'kind', i.kind, 'name', i.name, 'description', i.description, 'price', i.price,
    'rarity', i.rarity, 'data', i.data, 'sort', i.sort, 'isActive', i.is_active
  )
$$;

-- A user look: equipped color/accessory (otherwise default purple, no accessory).
create or replace function app_private.murek_look(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'color', coalesce(c.id, 'mor'),
    'colorHex', coalesce(c.data ->> 'hex', '#7c6cff'),
    'animated', c.data ->> 'animated',
    'accessory', a.id
  )
  from (select 1) one
  left join public.user_murek um on um.user_id = p_user_id
  left join public.murek_items c on c.id = um.color and c.kind = 'color'
  left join public.murek_items a on a.id = um.accessory and a.kind = 'accessory'
$$;

create or replace function app_private.murek_shop_snapshot(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'items', coalesce((
      select pg_catalog.jsonb_agg(app_private.murek_item_json(i) order by i.kind, i.sort, i.id)
      from public.murek_items i where i.is_active
    ), '[]'::jsonb),
    'owned', pg_catalog.to_jsonb(array['mor'] || coalesce((select um.owned from public.user_murek um where um.user_id = p_user_id), '{}'::text[])),
    'look', app_private.murek_look(p_user_id),
    'balance', (select coalesce(u.stones, 0) from public.users u where u.id = p_user_id)
  )
$$;

create or replace function app_private.get_murek_shop()
returns jsonb language sql stable security definer set search_path = '' as $$
  select app_private.murek_shop_snapshot(public.current_public_user_id())
$$;

create or replace function app_private.buy_murek_item(p_item_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_item public.murek_items;
  v_balance integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_item from public.murek_items where id = p_item_id and is_active;
  if not found then
    raise exception 'MUREK_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Concurrent purchases of one user go in order; the balance row is locked.
  perform 1 from public.users u where u.id = v_user_id for update;
  insert into public.user_murek (user_id) values (v_user_id) on conflict (user_id) do nothing;
  perform 1 from public.user_murek um where um.user_id = v_user_id for update;

  if v_item.id = 'mor' or exists (select 1 from public.user_murek um where um.user_id = v_user_id and v_item.id = any(um.owned)) then
    raise exception 'MUREK_ITEM_OWNED' using errcode = 'P0001';
  end if;

  select coalesce(u.stones, 0) into v_balance from public.users u where u.id = v_user_id;
  if v_balance < v_item.price then
    raise exception 'MUREK_INSUFFICIENT_COIN' using errcode = 'P0001';
  end if;

  if v_item.price > 0 then
    perform set_config('app.store_purchase_user_update', 'true', true);
    update public.users set stones = coalesce(stones, 0) - v_item.price where id = v_user_id returning stones into v_balance;
    perform set_config('app.store_purchase_user_update', '', true);

    insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
    values (v_user_id, null, 'murek_item', v_user_id::text || ':' || v_item.id, 'debit', 'Coin', -v_item.price, v_balance,
      pg_catalog.jsonb_build_object('item_id', v_item.id, 'kind', v_item.kind, 'price', v_item.price));
  end if;

  -- Alinan parca hemen kusanilir (renk ya da aksesuar).
  update public.user_murek um set
    owned = um.owned || v_item.id,
    color = case when v_item.kind = 'color' then v_item.id else um.color end,
    accessory = case when v_item.kind = 'accessory' then v_item.id else um.accessory end,
    updated_at = pg_catalog.now()
  where um.user_id = v_user_id;

  return app_private.murek_shop_snapshot(v_user_id);
end;
$$;

-- Equip: color not required (null -> default purple), accessory null -> remove. Must be owned.
create or replace function app_private.equip_murek(p_color text, p_accessory text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_owned text[];
  v_color text := nullif(pg_catalog.btrim(coalesce(p_color, '')), '');
  v_accessory text := nullif(pg_catalog.btrim(coalesce(p_accessory, '')), '');
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  insert into public.user_murek (user_id) values (v_user_id) on conflict (user_id) do nothing;
  select array['mor'] || um.owned into v_owned from public.user_murek um where um.user_id = v_user_id for update;

  if v_color is not null and (
    not (v_color = any(v_owned))
    or not exists (select 1 from public.murek_items i where i.id = v_color and i.kind = 'color')
  ) then
    raise exception 'MUREK_ITEM_NOT_OWNED' using errcode = 'P0001';
  end if;
  if v_accessory is not null and (
    not (v_accessory = any(v_owned))
    or not exists (select 1 from public.murek_items i where i.id = v_accessory and i.kind = 'accessory')
  ) then
    raise exception 'MUREK_ITEM_NOT_OWNED' using errcode = 'P0001';
  end if;

  update public.user_murek set
    color = case when v_color = 'mor' then null else v_color end,
    accessory = v_accessory,
    updated_at = pg_catalog.now()
  where user_id = v_user_id;

  return app_private.murek_shop_snapshot(v_user_id);
end;
$$;

-- Another user Murek look (for profile, comments etc.; cosmetic only).
create or replace function app_private.get_user_murek(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select app_private.murek_look(p_user_id)
$$;

-- --- Admin ------------------------------------------------------------------------------------

create or replace function public.admin_murek_items()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;
  return pg_catalog.jsonb_build_object(
    'items', coalesce((
      select pg_catalog.jsonb_agg(app_private.murek_item_json(i) || pg_catalog.jsonb_build_object(
        'owners', (select count(*) from public.user_murek um where i.id = any(um.owned)),
        'equipped', (select count(*) from public.user_murek um where um.color = i.id or um.accessory = i.id)
      ) order by i.kind, i.sort, i.id)
      from public.murek_items i
    ), '[]'::jsonb),
    'revenue', coalesce((
      select -sum(l.amount)::integer from public.store_wallet_ledger l where l.source_kind = 'murek_item' and l.entry_type = 'debit'
    ), 0)
  );
end;
$$;

create or replace function public.admin_save_murek_item(p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p ->> 'id';
begin
  if not app_private.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;
  if v_id = 'mor' and coalesce((p ->> 'isActive')::boolean, true) = false then
    raise exception 'Varsayilan renk kapatilamaz.';
  end if;
  update public.murek_items i set
    name = coalesce(nullif(pg_catalog.btrim(p ->> 'name'), ''), i.name),
    description = coalesce(p ->> 'description', i.description),
    price = case when v_id = 'mor' then 0 else coalesce((p ->> 'price')::integer, i.price) end,
    rarity = coalesce(p ->> 'rarity', i.rarity),
    sort = coalesce((p ->> 'sort')::integer, i.sort),
    is_active = coalesce((p ->> 'isActive')::boolean, i.is_active),
    updated_at = pg_catalog.now()
  where i.id = v_id;
  if not found then
    raise exception 'Parca bulunamadi.';
  end if;
  return public.admin_murek_items();
end;
$$;

revoke all on function app_private.murek_item_json(public.murek_items) from public;
revoke all on function app_private.murek_look(uuid) from public;
revoke all on function app_private.murek_shop_snapshot(uuid) from public;
revoke all on function app_private.get_murek_shop() from public;
revoke all on function app_private.buy_murek_item(text) from public;
revoke all on function app_private.equip_murek(text, text) from public;
revoke all on function app_private.get_user_murek(uuid) from public;
grant execute on function app_private.get_murek_shop() to anon, authenticated;
grant execute on function app_private.buy_murek_item(text) to authenticated;
grant execute on function app_private.equip_murek(text, text) to authenticated;
grant execute on function app_private.get_user_murek(uuid) to anon, authenticated;

create or replace function public.get_murek_shop()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.get_murek_shop()
$$;

create or replace function public.buy_murek_item(p_item_id text)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.buy_murek_item(p_item_id)
$$;

create or replace function public.equip_murek(p_color text, p_accessory text)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.equip_murek(p_color, p_accessory)
$$;

create or replace function public.get_user_murek(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.get_user_murek(p_user_id)
$$;

revoke all on function public.get_murek_shop() from public;
revoke all on function public.buy_murek_item(text) from public;
revoke all on function public.equip_murek(text, text) from public;
revoke all on function public.get_user_murek(uuid) from public;
revoke all on function public.admin_murek_items() from public, anon;
revoke all on function public.admin_save_murek_item(jsonb) from public, anon;
grant execute on function public.get_murek_shop() to anon, authenticated;
grant execute on function public.buy_murek_item(text) to authenticated;
grant execute on function public.equip_murek(text, text) to authenticated;
grant execute on function public.get_user_murek(uuid) to anon, authenticated;
grant execute on function public.admin_murek_items() to authenticated;
grant execute on function public.admin_save_murek_item(jsonb) to authenticated;
