-- Premium perks: each Premium perk turns on and off from Shop Control.
-- A disabled perk is not applied on the server (not just hidden from the UI):
-- early_access        off -> chapters open to everyone at once (delay 0)
-- name_style          off -> name style shows for nobody, is not saved
-- name_effects        off -> animated (fx-*) name effects do not show, are not saved
-- custom_background   off -> uploaded backgrounds do not show, cannot be uploaded
-- hover_theme         off -> the hover card theme does not show, is not saved
-- fansub_expressions  off -> fansub emoji/sticker tokens cannot be written
-- premium_badge       off -> the Premium badge does not show in the UI
-- premium_exclusives  off -> Premium-only products are not sold
-- member_pricing      on  -> percent member price in the shop for Premium members
-- coin_bonus          on  -> percent bonus on task/streak Coin rewards for Premium members
-- shop_early_access   on  -> Premium members buy new products N hours before sale opens

create table if not exists public.premium_perks (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  sort_weight integer not null default 0,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.premium_perks enable row level security;
revoke all on public.premium_perks from anon, authenticated;

insert into public.premium_perks (key, enabled, config, sort_weight) values
  ('early_access', true, '{}'::jsonb, 10),
  ('name_style', true, '{}'::jsonb, 20),
  ('name_effects', true, '{}'::jsonb, 30),
  ('custom_background', true, '{}'::jsonb, 40),
  ('hover_theme', true, '{}'::jsonb, 50),
  ('fansub_expressions', true, '{}'::jsonb, 60),
  ('premium_badge', true, '{}'::jsonb, 70),
  ('premium_exclusives', true, '{}'::jsonb, 80),
  ('member_pricing', false, '{"percent":15}'::jsonb, 90),
  ('coin_bonus', false, '{"percent":25}'::jsonb, 100),
  ('shop_early_access', false, '{"hours":24}'::jsonb, 110)
on conflict (key) do nothing;

-- An unknown key counts as off (a new perk is not born on by accident).
create or replace function app_private.premium_perk_enabled(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.enabled from public.premium_perks p where p.key = p_key), false)
$$;

create or replace function app_private.premium_perk_int(p_key text, p_field text, p_default integer, p_min integer, p_max integer)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(p_min, least(p_max, coalesce((
    select case when (p.config ->> p_field) ~ '^[0-9]{1,6}$' then (p.config ->> p_field)::integer end
    from public.premium_perks p
    where p.key = p_key
  ), p_default)))
$$;

create or replace function app_private.premium_perks_json()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', p.key,
    'enabled', p.enabled,
    'config', case p.key
      when 'early_access' then jsonb_build_object('hours', coalesce((
        select c.public_unlock_delay_hours from public.premium_runtime_config c where c.id
      ), 36))
      else p.config
    end,
    'updatedAt', p.updated_at
  ) order by p.sort_weight, p.key), '[]'::jsonb)
  from public.premium_perks p
$$;

create or replace function public.premium_perks_public()
returns jsonb language sql stable security definer set search_path = '' as $$
  select app_private.premium_perks_json()
$$;

create or replace function public.shop_admin_premium_perks()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.shop_assert_admin();
  return app_private.premium_perks_json();
end;
$$;

create or replace function public.shop_admin_save_premium_perk(p_key text, p_enabled boolean, p_config jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_config jsonb := coalesce(p_config, '{}'::jsonb);
  v_value integer;
begin
  perform app_private.shop_assert_admin();
  if p_enabled is null then
    raise exception 'Durum zorunludur.';
  end if;
  if not exists (select 1 from public.premium_perks p where p.key = p_key) then
    raise exception 'Bilinmeyen Premium ozelligi.';
  end if;
  if jsonb_typeof(v_config) <> 'object' then
    raise exception 'Ayar nesne olmalidir.';
  end if;

  if p_key in ('member_pricing', 'coin_bonus', 'shop_early_access', 'early_access') then
    v_value := case
      when (v_config ->> case when p_key in ('member_pricing', 'coin_bonus') then 'percent' else 'hours' end) ~ '^[0-9]{1,6}$'
        then (v_config ->> case when p_key in ('member_pricing', 'coin_bonus') then 'percent' else 'hours' end)::integer
    end;
    if p_key = 'member_pricing' and (v_value is null or v_value not between 1 and 90) then
      raise exception 'Uye fiyati indirimi 1-90 arasinda olmali.';
    elsif p_key = 'coin_bonus' and (v_value is null or v_value not between 1 and 300) then
      raise exception 'Coin bonusu 1-300 arasinda olmali.';
    elsif p_key = 'shop_early_access' and (v_value is null or v_value not between 1 and 168) then
      raise exception 'Magaza erken erisimi 1-168 saat olmali.';
    elsif p_key = 'early_access' and (v_value is null or v_value not between 1 and 168) then
      raise exception 'Erken erisim suresi 1-168 saat olmali.';
    end if;
  end if;

  -- Chapter early access duration is read platform wide from premium_runtime_config.
  if p_key = 'early_access' then
    update public.premium_runtime_config set
      public_unlock_delay_hours = v_value,
      updated_by = public.current_public_user_id(),
      updated_at = now()
    where id;
    v_config := '{}'::jsonb;
  elsif p_key = 'member_pricing' or p_key = 'coin_bonus' then
    v_config := jsonb_build_object('percent', v_value);
  elsif p_key = 'shop_early_access' then
    v_config := jsonb_build_object('hours', v_value);
  else
    v_config := '{}'::jsonb;
  end if;

  update public.premium_perks set
    enabled = p_enabled,
    config = v_config,
    updated_by = public.current_public_user_id(),
    updated_at = now()
  where key = p_key;
end;
$$;

-- Erken erisim -------------------------------------------------------------
create or replace function app_private.chapter_public_unlock_at(p_publish_at timestamp with time zone)
returns timestamp with time zone language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_delay_hours integer := 36;
begin
  if p_publish_at is null then
    return null;
  end if;

  if not app_private.premium_perk_enabled('early_access') then
    return p_publish_at;
  end if;

  select coalesce(cfg.public_unlock_delay_hours, 36)
  into v_delay_hours
  from public.premium_runtime_config cfg
  where cfg.id = true
  limit 1;

  return p_publish_at + make_interval(hours => greatest(coalesce(v_delay_hours, 36), 0));
end;
$$;

create or replace function public.chapter_public_unlock_at(p_publish_at timestamp with time zone)
returns timestamp with time zone language plpgsql stable security definer set search_path to 'public' as $$
begin
  return app_private.chapter_public_unlock_at(p_publish_at);
end;
$$;

-- The perk table reads only via RPC; so the offer function runs as definer.
create or replace function public.get_active_premium_offer()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'premium_item', jsonb_build_object(
      'id', item.id,
      'identifier', item.identifier,
      'name', item.name,
      'description', item.description,
      'price', item.price
    ),
    'duration_days', greatest(coalesce(cfg.premium_duration_days, 30), 1),
    'public_unlock_delay_hours', case
      when app_private.premium_perk_enabled('early_access') then greatest(coalesce(cfg.public_unlock_delay_hours, 36), 0)
      else 0
    end
  )
  from public.premium_runtime_config cfg
  join public.store_items item
    on item.id = cfg.premium_store_item_id
  where cfg.id = true
    and item.type = 'premium'
    and item.is_active = true
  limit 1
$$;

-- Profile visibility -------------------------------------------------------
create or replace function app_private.premium_visible_name_style(p_style jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when p_style is null or jsonb_typeof(p_style) <> 'object' then p_style
    when not app_private.premium_perk_enabled('name_style') then null
    when coalesce(p_style ->> 'effectId', '') like 'fx-%' and not app_private.premium_perk_enabled('name_effects')
      then p_style - 'effectId'
    else p_style
  end
$$;

create or replace function app_private.premium_visible_name_effect(p_effect text)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when nullif(pg_catalog.btrim(coalesce(p_effect, '')), '') is null then null
    when not app_private.premium_perk_enabled('name_style') then null
    when p_effect like 'fx-%' and not app_private.premium_perk_enabled('name_effects') then null
    else p_effect
  end
$$;

create or replace function app_private.visible_profile_background_type(p_background_type text, p_premium_expires_at timestamp with time zone)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when app_private.is_uploaded_profile_background_ref(p_background_type)
      and (
        p_premium_expires_at is null
        or p_premium_expires_at <= now()
        or not app_private.premium_perk_enabled('custom_background')
      )
      then null
    else nullif(btrim(coalesce(p_background_type, '')), '')
  end
$$;

-- Big profile functions are patched in place; each change is verified as applied.
create or replace function app_private.premium_perks_patch_function(p_fn regprocedure, p_pairs text[])
returns void language plpgsql set search_path = '' as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_new text;
  i integer;
begin
  for i in 1 .. coalesce(array_length(p_pairs, 1), 0) by 2 loop
    v_new := replace(v_def, p_pairs[i], p_pairs[i + 1]);
    if v_new = v_def then
      raise exception 'Premium ozellik yamasi uygulanamadi: % (%)', p_fn, left(p_pairs[i], 80);
    end if;
    v_def := v_new;
  end loop;
  execute v_def;
end;
$$;

do $$
declare
  v_profile_pairs text[] := array[
    $a$when v_is_premium_active then v_row.owned_items -> 'active_name_style'$a$,
    $b$when v_is_premium_active then app_private.premium_visible_name_style(v_row.owned_items -> 'active_name_style')$b$,
    $a$when v_is_premium_active then v_row.owned_items ->> 'active_name_effect'$a$,
    $b$when v_is_premium_active then app_private.premium_visible_name_effect(v_row.owned_items ->> 'active_name_effect')$b$,
    $a$when v_is_premium_active
        and app_private.is_valid_hover_theme(v_row.owned_items -> 'active_hover_theme')$a$,
    $b$when v_is_premium_active
        and app_private.premium_perk_enabled('hover_theme')
        and app_private.is_valid_hover_theme(v_row.owned_items -> 'active_hover_theme')$b$
  ];
  v_customization_pairs text[] := array[
    $a$if p_owned_items_patch ? 'uploaded_background_slots' then
      if not v_is_premium_active then$a$,
    $b$if p_owned_items_patch ? 'uploaded_background_slots' then
      if not v_is_premium_active or not app_private.premium_perk_enabled('custom_background') then$b$,
    $a$if v_is_premium_active and p_owned_items_patch ? 'active_name_style' then$a$,
    $b$if v_is_premium_active and app_private.premium_perk_enabled('name_style') and p_owned_items_patch ? 'active_name_style' then$b$,
    $a$v_owned := jsonb_set(v_owned, '{active_name_style}', v_patch_active_name_style, true);$a$,
    $b$v_owned := jsonb_set(v_owned, '{active_name_style}', app_private.premium_visible_name_style(v_patch_active_name_style), true);$b$,
    $a$if v_is_premium_active and p_owned_items_patch ? 'active_name_effect' then
      v_patch_active_name_effect := nullif(trim(coalesce(p_owned_items_patch ->> 'active_name_effect', '')), '');$a$,
    $b$if v_is_premium_active and app_private.premium_perk_enabled('name_style') and p_owned_items_patch ? 'active_name_effect' then
      v_patch_active_name_effect := app_private.premium_visible_name_effect(nullif(trim(coalesce(p_owned_items_patch ->> 'active_name_effect', '')), ''));$b$,
    $a$if v_has_uploaded_background and not v_is_premium_active then$a$,
    $b$if v_has_uploaded_background and (not v_is_premium_active or not app_private.premium_perk_enabled('custom_background')) then$b$
  ];
begin
  perform app_private.premium_perks_patch_function('app_private.get_public_user_profile_by_id(uuid,boolean)'::regprocedure, v_profile_pairs);
  perform app_private.premium_perks_patch_function('app_private.get_public_user_profile_by_username(text,boolean)'::regprocedure, v_profile_pairs);
  perform app_private.premium_perks_patch_function(
    'app_private.update_my_profile_customization(boolean,text,boolean,text,boolean,uuid,jsonb)'::regprocedure,
    v_customization_pairs
  );
  perform app_private.premium_perks_patch_function(
    'public.update_my_profile_customization(boolean,text,boolean,text,boolean,uuid,jsonb)'::regprocedure,
    v_customization_pairs || array[
      $a$if v_is_premium_active and p_owned_items_patch ? 'active_hover_theme' then$a$,
      $b$if v_is_premium_active and app_private.premium_perk_enabled('hover_theme') and p_owned_items_patch ? 'active_hover_theme' then$b$
    ]
  );
end;
$$;

drop function app_private.premium_perks_patch_function(regprocedure, text[]);

-- Fansub ifadeleri ---------------------------------------------------------
create or replace function app_private.enforce_premium_supporter_expression_usage()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_text_column text := tg_argv[0];
  v_author_column text := tg_argv[1];
  v_new_payload jsonb := to_jsonb(new);
  v_old_payload jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_body text := coalesce(v_new_payload ->> v_text_column, '');
  v_author_id uuid := nullif(v_new_payload ->> v_author_column, '')::uuid;
begin
  if tg_op = 'UPDATE'
    and coalesce(v_old_payload ->> v_text_column, '') is not distinct from v_body
    and coalesce(v_old_payload ->> v_author_column, '') is not distinct from coalesce(v_new_payload ->> v_author_column, '')
  then
    return new;
  end if;

  if app_private.text_has_fansub_supporter_asset_token(v_body) then
    if not app_private.premium_perk_enabled('fansub_expressions') then
      raise exception 'Fansub emoji ve cikartmalari su anda kapali.';
    end if;
    if not app_private.user_has_active_premium(v_author_id) then
      raise exception 'Fansub emoji ve cikartma tokenlarini kullanmak icin aktif premium gerekir.';
    end if;
  end if;

  return new;
end;
$$;

-- Shop: member price, Premium-only products, shop early access ---------
create or replace function app_private.shop_price_candidates(p_product_id uuid, p_at timestamp with time zone, p_is_premium boolean)
returns table(source text, discount_id uuid, label text, price integer)
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
  union all
  select 'member'::text, null::uuid, 'Premium fiyati'::text,
    app_private.shop_round_price(
      pr.base_price * (100 - app_private.premium_perk_int('member_pricing', 'percent', 15, 1, 90)) / 100.0,
      pr.base_price
    )
  from product pr
  where p_is_premium
    and pr.kind <> 'premium'
    and app_private.premium_perk_enabled('member_pricing')
$$;

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
  v_member_price integer;
  v_total integer := 0;
  v_owned_count integer := 0;
  v_partial boolean := false;
  v_purchasable boolean := true;
  v_reason text;
  v_early boolean := false;
begin
  select * into v_product from public.shop_products where id = p_product_id;
  if not found then
    return null;
  end if;

  v_state := app_private.shop_product_state(p_product_id, now());
  if p_buyer is not null then
    v_is_premium := app_private.user_has_active_premium(p_buyer);
  end if;

  -- Shop early access: a Premium member buys now a product opening for sale within N hours.
  if v_state = 'upcoming' and v_is_premium and app_private.premium_perk_enabled('shop_early_access')
     and app_private.shop_product_state(
       p_product_id,
       now() + make_interval(hours => app_private.premium_perk_int('shop_early_access', 'hours', 24, 1, 168))
     ) = 'live'
  then
    v_early := true;
  end if;

  select c.source, c.discount_id, c.label, c.price
  into v_source, v_discount_id, v_label, v_price
  from app_private.shop_price_candidates(p_product_id, now(), v_is_premium) c
  order by c.price asc, case c.source when 'list' then 0 else 1 end
  limit 1;

  -- Non-Premium users see "this price with Premium" (only if member price is on and cheaper).
  if not v_is_premium and v_product.kind <> 'premium' and app_private.premium_perk_enabled('member_pricing') then
    select min(c.price) into v_member_price
    from app_private.shop_price_candidates(p_product_id, now(), true) c;
    if v_member_price >= v_price then
      v_member_price := null;
    end if;
  end if;

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
    if v_member_price is not null then
      v_member_price := app_private.shop_round_price(v_member_price * (v_total - v_owned_count)::numeric / v_total, v_member_price);
    end if;
    v_partial := true;
  end if;

  if v_state <> 'live' and not v_early then
    v_purchasable := false; v_reason := v_state;
  elsif v_product.audience = 'reward_only' then
    v_purchasable := false; v_reason := 'reward_only';
  elsif v_product.audience = 'premium' and not app_private.premium_perk_enabled('premium_exclusives') then
    v_purchasable := false; v_reason := 'premium_paused';
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
    'memberPrice', v_member_price,
    'earlyAccess', v_early,
    'partial', v_partial,
    'ownedCount', v_owned_count,
    'grantCount', v_total,
    'purchasable', v_purchasable,
    'reason', v_reason,
    'state', v_state
  );
end;
$$;

-- Coin bonus --------------------------------------------------------------
-- On task / reading streak / quest reward writes a percent bonus for a Premium member.
-- Idempotent: store_wallet_ledger (source_kind, source_ref, entry_type) is unique.
create or replace function app_private.premium_grant_coin_bonus(p_user_id uuid, p_source text, p_ref text, p_base integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_bonus integer;
  v_balance integer;
  v_ref text := p_source || ':' || p_ref;
begin
  if p_user_id is null or coalesce(p_base, 0) <= 0 then
    return 0;
  end if;
  if not app_private.premium_perk_enabled('coin_bonus') or not app_private.user_has_active_premium(p_user_id) then
    return 0;
  end if;
  if exists (
    select 1 from public.store_wallet_ledger l
    where l.source_kind = 'premium_coin_bonus' and l.source_ref = v_ref and l.entry_type = 'credit'
  ) then
    return 0;
  end if;

  v_bonus := ceil(p_base * app_private.premium_perk_int('coin_bonus', 'percent', 25, 1, 300) / 100.0)::integer;
  if v_bonus <= 0 then
    return 0;
  end if;

  perform set_config('app.store_purchase_user_update', 'true', true);
  update public.users set stones = coalesce(stones, 0) + v_bonus where id = p_user_id returning stones into v_balance;
  perform set_config('app.store_purchase_user_update', '', true);
  if v_balance is null then
    return 0;
  end if;

  insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
  values (p_user_id, null, 'premium_coin_bonus', v_ref, 'credit', 'Coin', v_bonus, v_balance,
    jsonb_build_object('source', p_source, 'base_amount', p_base));

  perform public.push_notification(
    p_user_id,
    'system',
    'Premium Coin bonusu',
    format('Premium bonusu olarak +%s coin kazandin.', v_bonus),
    jsonb_build_object('event', 'premium_coin_bonus', 'source', p_source, 'coin_bonus', v_bonus,
      'route_hint', '/magaza/premium', 'event_key', format('premium-coin-bonus:%s', v_ref)),
    null::text
  );
  return v_bonus;
end;
$$;

create or replace function app_private.premium_coin_bonus_on_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'reading_streak_reward_claims' then
    perform app_private.premium_grant_coin_bonus(new.user_id, 'reading_streak', new.id::text, new.credited_coin);
  elsif tg_table_name = 'user_reward_task_claims' then
    perform app_private.premium_grant_coin_bonus(new.user_id, 'reward_task', new.id::text, new.credited_coin);
  elsif tg_table_name = 'quest_progress' then
    if new.subject_type = 'user' and new.claimed_at is not null
       and (tg_op = 'INSERT' or old.claimed_at is null) then
      perform app_private.premium_grant_coin_bonus(new.subject_id, 'quest', new.id::text || ':' || new.period_key, new.credited_coin);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_premium_coin_bonus on public.reading_streak_reward_claims;
create trigger trg_premium_coin_bonus after insert on public.reading_streak_reward_claims
  for each row execute function app_private.premium_coin_bonus_on_claim();

drop trigger if exists trg_premium_coin_bonus on public.user_reward_task_claims;
create trigger trg_premium_coin_bonus after insert on public.user_reward_task_claims
  for each row execute function app_private.premium_coin_bonus_on_claim();

drop trigger if exists trg_premium_coin_bonus on public.quest_progress;
create trigger trg_premium_coin_bonus after insert or update of claimed_at on public.quest_progress
  for each row execute function app_private.premium_coin_bonus_on_claim();

revoke all on function app_private.premium_perk_enabled(text) from public;
revoke all on function app_private.premium_perk_int(text, text, integer, integer, integer) from public;
revoke all on function app_private.premium_perks_json() from public;
revoke all on function app_private.premium_visible_name_style(jsonb) from public;
revoke all on function app_private.premium_visible_name_effect(text) from public;
revoke all on function app_private.premium_grant_coin_bonus(uuid, text, text, integer) from public;
revoke all on function app_private.premium_coin_bonus_on_claim() from public;
revoke all on function public.premium_perks_public() from public;
revoke all on function public.shop_admin_premium_perks() from public;
revoke all on function public.shop_admin_save_premium_perk(text, boolean, jsonb) from public;
grant execute on function public.premium_perks_public() to anon, authenticated;
grant execute on function public.shop_admin_premium_perks() to authenticated;
grant execute on function public.shop_admin_save_premium_perk(text, boolean, jsonb) to authenticated;
