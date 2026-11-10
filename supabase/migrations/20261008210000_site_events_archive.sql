-- Event archive + automatic close.
--
-- site_events: a durable record of each event (what happened, when, rules, rewards, results,
-- winners). A scheduled job (pg_cron, 10 min) sets an event 'active' at start, closes it at end:
-- computes results and writes to the archive, distributes rewards, notifies winners. Nobody does anything
-- by hand. The close is idempotent: however many times it runs the reward is given once (order
-- request key derives from event + user; the row locks with FOR UPDATE SKIP LOCKED).
--
-- Murek Invasion close: the top 3 hunters (catch count; first to reach on a tie) get the All Cousins
-- Bundle as a gift. The reward produces the same records as a real purchase (owned_items,
-- shop_orders paid=0 price_source='event_reward', user_inventory_items quest_reward, notification).
-- A winner already owning all bundle parts gets fallbackCoin (3000) Coins instead; unique in the ledger
-- by event + user key (once).

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null default 'other' check (kind in ('collect', 'sale', 'contest', 'other')),
  summary text check (summary is null or char_length(summary) <= 1200),
  season_slug text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  rules jsonb not null default '{}'::jsonb,
  prizes jsonb not null default '[]'::jsonb,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'finalized', 'cancelled')),
  results jsonb,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);
alter table public.site_events enable row level security;
revoke all on table public.site_events from public, anon, authenticated;

insert into public.site_events (slug, name, kind, summary, season_slug, starts_at, ends_at, rules, prizes, status)
values (
  'murek-istilasi',
  'Mürek İstilası',
  'collect',
  'Cadılar Bayramı etkinliği: sitede gezinirken ekranın kenarından çıkan Mürek kuzenlerini (Vampir, Cadı, Hayalet, Balkabağı, Mumya) yakalama. Mağazada aynı sezonda kuzen paketleri satıldı.',
  'murek-istilasi',
  '2026-10-08T00:00:00+03:00', '2026-11-02T23:59:00+03:00',
  '{"rewardCoin": 5, "rareKind": "vampir", "rareRewardCoin": 25, "dailyLimit": 10, "cooldownSeconds": 75, "spawnChance": 0.35, "ttlSeconds": 8, "kindWeights": {"vampir": 0.06, "cadi": 0.18, "mumya": 0.18, "hayalet": 0.29, "balkabagi": 0.29}, "badge": "İstila Avcısı (5 kuzenin hepsi)"}'::jsonb,
  '[{"rank": [1, 3], "productSlug": "tum-kuzenler-paketi", "label": "Tüm Kuzenler Paketi", "fallbackCoin": 3000}]'::jsonb,
  'active'
)
on conflict (slug) do nothing;

-- Gives a product's content to a user as an event reward (same records as purchase).
-- A second call for the same event + user does nothing (request key).
create or replace function app_private.site_event_grant_product(p_event public.site_events, p_user_id uuid, p_product_slug text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_product public.shop_products;
  v_user public.users;
  v_owned jsonb;
  v_next_effect uuid;
  v_grant record;
  v_key text;
  v_granted jsonb := '[]'::jsonb;
  v_request uuid := md5('site-event:' || p_event.slug || ':' || p_user_id::text)::uuid;
  v_order_id uuid := gen_random_uuid();
  v_code text;
begin
  if exists (select 1 from public.shop_orders o where o.buyer_user_id = p_user_id and o.request_key = v_request) then
    return jsonb_build_object('status', 'already_granted');
  end if;
  select * into v_product from public.shop_products where slug = p_product_slug;
  if v_product.id is null then
    return jsonb_build_object('status', 'product_missing');
  end if;
  perform 1 from public.users u where u.id = p_user_id for update;
  select * into v_user from public.users where id = p_user_id;
  if v_user.id is null or coalesce(v_user.is_banned, false) then
    return jsonb_build_object('status', 'user_unavailable');
  end if;

  v_owned := coalesce(v_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb);
  v_next_effect := v_user.active_profile_effect_id;
  for v_grant in
    select si.id, si.type, coalesce(si.identifier, si.id::text) as identifier
    from public.shop_product_grants g join public.store_items si on si.id = g.store_item_id
    where g.product_id = v_product.id order by g.sort
  loop
    if app_private.shop_owns_item(v_owned, v_grant.type, v_grant.identifier) then
      continue;
    end if;
    v_key := app_private.store_owned_items_key_for_type(v_grant.type);
    if v_key is null then
      continue;
    end if;
    v_owned := jsonb_set(v_owned, array[v_key], coalesce(v_owned -> v_key, '[]'::jsonb) || to_jsonb(v_grant.identifier), true);
    if v_grant.type = 'profile_effect' and v_next_effect is null then
      v_next_effect := v_grant.id;
    end if;
    v_granted := v_granted || jsonb_build_object('id', v_grant.id, 'type', v_grant.type, 'identifier', v_grant.identifier);
  end loop;

  perform set_config('app.store_purchase_user_update', 'true', true);
  update public.users set owned_items = v_owned, active_profile_effect_id = v_next_effect where id = p_user_id;
  perform set_config('app.store_purchase_user_update', '', true);

  v_code := 'E' || upper(substr(md5(v_order_id::text || clock_timestamp()::text), 1, 7));
  insert into public.shop_orders (id, code, buyer_user_id, recipient_user_id, is_gift, gift_message, product_id, product_title, product_kind,
    list_price, paid, price_source, granted, request_key)
  values (v_order_id, v_code, p_user_id, p_user_id, false, left(p_note, 200), v_product.id, v_product.title, v_product.kind,
    v_product.base_price, 0, 'event_reward', v_granted, v_request);

  insert into public.user_inventory_items (user_id, store_item_id, item_type, item_identifier, acquired_via, order_id, source_kind, source_ref, metadata)
  select p_user_id, (g ->> 'id')::uuid, g ->> 'type', g ->> 'identifier', 'quest_reward', null, 'site_event', p_event.slug,
    jsonb_build_object('product_id', v_product.id, 'order_code', v_code, 'event', p_event.slug)
  from jsonb_array_elements(v_granted) g;

  return jsonb_build_object('status', 'granted', 'orderCode', v_code, 'granted', jsonb_array_length(v_granted));
end;
$$;

-- Murek Invasion close: results + reward to the top 3 + notification. Results go to the archive.
create or replace function app_private.site_event_finalize_istila(p_event public.site_events)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_results jsonb;
  v_winner record;
  v_winners jsonb := '[]'::jsonb;
  v_grant jsonb;
  v_prize text := coalesce(p_event.prizes -> 0 ->> 'productSlug', 'tum-kuzenler-paketi');
  v_label text := coalesce(p_event.prizes -> 0 ->> 'label', 'Tüm Kuzenler Paketi');
  v_fallback integer := coalesce((p_event.prizes -> 0 ->> 'fallbackCoin')::integer, 0);
  v_balance integer;
  v_message text;
begin
  for v_winner in
    select s.user_id, count(*)::integer as total, max(s.caught_at) as last_catch, u.username, coalesce(nullif(u.display_name, ''), u.username) as display_name
    from public.istila_spawns s join public.users u on u.id = s.user_id
    where s.caught_at is not null and s.caught_at <= p_event.ends_at and coalesce(u.is_banned, false) = false
    group by s.user_id, u.username, u.display_name
    order by count(*) desc, max(s.caught_at) asc
    limit 3
  loop
    v_grant := app_private.site_event_grant_product(p_event, v_winner.user_id, v_prize, format('%s odulu: %s. sira', p_event.name, jsonb_array_length(v_winners) + 1));
    if v_grant ->> 'status' = 'granted' then
      v_message := format('%s yakalamayla ilk 3''e girdin. Ödülün "%s" envanterine eklendi.', v_winner.total, v_label);
      -- If they own all of the bundle: Coins instead (unique in the ledger, once).
      if (v_grant ->> 'granted')::integer = 0 and v_fallback > 0
        and not exists (select 1 from public.store_wallet_ledger l where l.source_kind = 'site_event_prize' and l.source_ref = p_event.slug || ':' || v_winner.user_id::text) then
        perform set_config('app.store_purchase_user_update', 'true', true);
        update public.users set stones = coalesce(stones, 0) + v_fallback where id = v_winner.user_id returning stones into v_balance;
        perform set_config('app.store_purchase_user_update', '', true);
        insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
        values (v_winner.user_id, null, 'site_event_prize', p_event.slug || ':' || v_winner.user_id::text, 'credit', 'Coin', v_fallback, v_balance,
          jsonb_build_object('event', p_event.slug, 'reason', 'prize_already_owned'));
        v_grant := v_grant || jsonb_build_object('fallbackCoin', v_fallback);
        v_message := format('%s yakalamayla ilk 3''e girdin. "%s" zaten sende olduğu için ödülün olarak %s Coin hesabına eklendi.', v_winner.total, v_label, v_fallback);
      end if;
      perform public.push_notification(
        v_winner.user_id, 'system',
        format('%s: %s. oldun!', p_event.name, jsonb_array_length(v_winners) + 1),
        v_message,
        jsonb_build_object('event', 'site_event_prize', 'event_slug', p_event.slug, 'rank', jsonb_array_length(v_winners) + 1, 'order_code', v_grant ->> 'orderCode'),
        null::text
      );
    end if;
    v_winners := v_winners || jsonb_build_object(
      'rank', jsonb_array_length(v_winners) + 1, 'userId', v_winner.user_id, 'username', v_winner.username,
      'displayName', v_winner.display_name, 'total', v_winner.total, 'prize', v_label, 'grant', v_grant
    );
  end loop;

  select jsonb_build_object(
    'participants', (select count(distinct s.user_id) from public.istila_spawns s where s.caught_at is not null and s.caught_at <= p_event.ends_at),
    'spawns', (select count(*) from public.istila_spawns s where s.created_at <= p_event.ends_at),
    'catches', (select count(*) from public.istila_spawns s where s.caught_at is not null and s.caught_at <= p_event.ends_at),
    'coinsAwarded', (select coalesce(sum(s.reward), 0) from public.istila_spawns s where s.caught_at is not null and s.caught_at <= p_event.ends_at),
    'byKind', (select coalesce(jsonb_object_agg(k.kind, k.n), '{}'::jsonb) from (
      select s.kind, count(*) as n from public.istila_spawns s where s.caught_at is not null and s.caught_at <= p_event.ends_at group by s.kind) k),
    'badgeHolders', (select count(*) from public.user_badges ub join public.badges b on b.id = ub.badge_id where b.name = 'İstila Avcısı'),
    'top10', (select coalesce(jsonb_agg(t order by t.rank), '[]'::jsonb) from (
      select row_number() over (order by count(*) desc, max(s.caught_at) asc)::integer as rank, u.username,
        coalesce(nullif(u.display_name, ''), u.username) as "displayName", count(*)::integer as total
      from public.istila_spawns s join public.users u on u.id = s.user_id
      where s.caught_at is not null and s.caught_at <= p_event.ends_at and coalesce(u.is_banned, false) = false
      group by u.id, u.username, u.display_name
      order by count(*) desc, max(s.caught_at) asc limit 10) t),
    'winners', v_winners,
    'finalizedBy', 'site-events-tick'
  ) into v_results;
  return v_results;
end;
$$;

-- Scheduled job: activates a started event, closes and archives an ended event.
create or replace function app_private.site_events_tick()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_event public.site_events;
  v_results jsonb;
  v_done integer := 0;
begin
  update public.site_events set status = 'active', updated_at = now()
  where status = 'scheduled' and starts_at <= now() and ends_at > now();

  for v_event in
    select * from public.site_events where status in ('scheduled', 'active') and ends_at <= now()
    order by ends_at for update skip locked
  loop
    v_results := case v_event.slug
      when 'murek-istilasi' then app_private.site_event_finalize_istila(v_event)
      else jsonb_build_object('note', 'Bu etkinlik icin ozel kapanis yok; yalniz arsivlendi.')
    end;
    update public.site_events set status = 'finalized', results = v_results, finalized_at = now(), updated_at = now()
    where id = v_event.id;
    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;

-- Admin panel: event archive (admin only).
create or replace function public.admin_site_events()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', e.slug, 'name', e.name, 'kind', e.kind, 'summary', e.summary, 'seasonSlug', e.season_slug,
      'startsAt', e.starts_at, 'endsAt', e.ends_at, 'status', e.status, 'rules', e.rules, 'prizes', e.prizes,
      'results', e.results, 'finalizedAt', e.finalized_at
    ) order by e.starts_at desc)
    from public.site_events e
  ), '[]'::jsonb);
end;
$$;

revoke all on function app_private.site_event_grant_product(public.site_events, uuid, text, text) from public;
revoke all on function app_private.site_event_finalize_istila(public.site_events) from public;
revoke all on function app_private.site_events_tick() from public;
revoke all on function public.admin_site_events() from public, anon;
grant execute on function public.admin_site_events() to authenticated;

-- Every 10 minutes: start / close / archive (idempotent).
select cron.unschedule(jobid) from cron.job where jobname = 'site-events-tick';
select cron.schedule('site-events-tick', '*/10 * * * *', 'select app_private.site_events_tick();');
