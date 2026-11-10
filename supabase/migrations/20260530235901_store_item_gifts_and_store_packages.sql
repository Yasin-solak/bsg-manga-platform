begin;

create table if not exists public.store_cosmetic_packages (
  package_key text primary key,
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  original_price integer check (original_price is null or original_price >= 0),
  currency text not null default 'Coin' check (currency in ('TL', 'Coin')),
  frame_store_item_id uuid not null references public.store_items(id) on delete restrict,
  profile_effect_store_item_id uuid not null references public.store_items(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_cosmetic_packages_is_active_idx
  on public.store_cosmetic_packages (is_active);

create index if not exists store_cosmetic_packages_frame_store_item_id_idx
  on public.store_cosmetic_packages (frame_store_item_id);

create index if not exists store_cosmetic_packages_profile_effect_store_item_id_idx
  on public.store_cosmetic_packages (profile_effect_store_item_id);

drop trigger if exists set_store_cosmetic_packages_updated_at on public.store_cosmetic_packages;
create trigger set_store_cosmetic_packages_updated_at
  before update on public.store_cosmetic_packages
  for each row
  execute function public.set_updated_at();

create table if not exists public.store_item_gifts (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references public.users(id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('user', 'fansub')),
  recipient_user_id uuid references public.users(id) on delete cascade,
  recipient_fansub_id uuid references public.fansubs(id) on delete cascade,
  store_item_id uuid not null references public.store_items(id) on delete cascade,
  price integer not null check (price >= 0),
  created_at timestamptz not null default now(),
  constraint store_item_gifts_recipient_check check (
    (recipient_kind = 'user' and recipient_user_id is not null and recipient_fansub_id is null)
    or (recipient_kind = 'fansub' and recipient_fansub_id is not null and recipient_user_id is null)
  )
);

create index if not exists store_item_gifts_sender_user_id_idx
  on public.store_item_gifts (sender_user_id, created_at desc);

create index if not exists store_item_gifts_recipient_user_id_idx
  on public.store_item_gifts (recipient_user_id, created_at desc)
  where recipient_user_id is not null;

create index if not exists store_item_gifts_recipient_fansub_id_idx
  on public.store_item_gifts (recipient_fansub_id, created_at desc)
  where recipient_fansub_id is not null;

create index if not exists store_item_gifts_store_item_id_idx
  on public.store_item_gifts (store_item_id, created_at desc);

create table if not exists public.store_package_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('purchase', 'gift')),
  actor_user_id uuid not null references public.users(id) on delete cascade,
  package_key text not null references public.store_cosmetic_packages(package_key) on delete cascade,
  recipient_kind text check (recipient_kind in ('user', 'fansub')),
  recipient_user_id uuid references public.users(id) on delete cascade,
  recipient_fansub_id uuid references public.fansubs(id) on delete cascade,
  total_price integer not null check (total_price >= 0),
  granted_item_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  constraint store_package_events_recipient_check check (
    (event_type = 'purchase' and recipient_kind is null and recipient_user_id is null and recipient_fansub_id is null)
    or (
      event_type = 'gift'
      and (
        (recipient_kind = 'user' and recipient_user_id is not null and recipient_fansub_id is null)
        or (recipient_kind = 'fansub' and recipient_fansub_id is not null and recipient_user_id is null)
      )
    )
  )
);

create index if not exists store_package_events_actor_user_id_idx
  on public.store_package_events (actor_user_id, created_at desc);

create index if not exists store_package_events_package_key_idx
  on public.store_package_events (package_key, created_at desc);

create index if not exists store_package_events_recipient_user_id_idx
  on public.store_package_events (recipient_user_id, created_at desc)
  where recipient_user_id is not null;

create index if not exists store_package_events_recipient_fansub_id_idx
  on public.store_package_events (recipient_fansub_id, created_at desc)
  where recipient_fansub_id is not null;

do $$
declare
  v_frame_shadow_id uuid;
  v_frame_gold_id uuid;
  v_frame_orbit_id uuid;
  v_effect_shadow_id uuid;
  v_effect_gold_id uuid;
  v_effect_orbit_id uuid;
begin
  insert into public.store_items (
    name,
    description,
    identifier,
    type,
    price,
    original_price,
    currency,
    poster_asset_url,
    theme_name,
    is_active
  )
  values (
    'Golge Muhru',
    'Koyu profil yuzeylerinde avatar cevresinde oynayan premium cerceve.',
    'avatarframe1',
    'frame',
    420,
    520,
    'Coin',
    null,
    'Nocturne',
    true
  )
  on conflict (type, identifier) do update
  set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    original_price = excluded.original_price,
    currency = excluded.currency,
    poster_asset_url = excluded.poster_asset_url,
    theme_name = excluded.theme_name,
    is_active = excluded.is_active
  returning id into v_frame_shadow_id;

  insert into public.store_items (
    name,
    description,
    identifier,
    type,
    price,
    original_price,
    currency,
    poster_asset_url,
    theme_name,
    is_active
  )
  values (
    'Altin Hukum',
    'Vitrin yuzeylerinde dikkat ceken parlak avatar cercevesi.',
    'avatarframe3',
    'frame',
    510,
    640,
    'Coin',
    null,
    'Royal',
    true
  )
  on conflict (type, identifier) do update
  set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    original_price = excluded.original_price,
    currency = excluded.currency,
    poster_asset_url = excluded.poster_asset_url,
    theme_name = excluded.theme_name,
    is_active = excluded.is_active
  returning id into v_frame_gold_id;

  insert into public.store_items (
    name,
    description,
    identifier,
    type,
    price,
    original_price,
    currency,
    poster_asset_url,
    theme_name,
    is_active
  )
  values (
    'Neon Orbit',
    'Turuncu isik halkasi ile avatar cevresinde teknoloji hissi verir.',
    'avatarframe4',
    'frame',
    460,
    560,
    'Coin',
    null,
    'Orbit',
    true
  )
  on conflict (type, identifier) do update
  set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    original_price = excluded.original_price,
    currency = excluded.currency,
    poster_asset_url = excluded.poster_asset_url,
    theme_name = excluded.theme_name,
    is_active = excluded.is_active
  returning id into v_frame_orbit_id;

  insert into public.store_items (
    name,
    description,
    identifier,
    type,
    price,
    original_price,
    currency,
    poster_asset_url,
    theme_name,
    is_active
  )
  values (
    'Karanlik Guller',
    'Premium poster ile acilan ve hover aninda canlanan gul agirlikli profil efekti.',
    'mart-deneme-premiumdd',
    'profile_effect',
    520,
    650,
    'Coin',
    '/assets/promo/premium-card.png',
    'Premium Lab',
    true
  )
  on conflict (type, identifier) do update
  set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    original_price = excluded.original_price,
    currency = excluded.currency,
    poster_asset_url = excluded.poster_asset_url,
    theme_name = excluded.theme_name,
    is_active = excluded.is_active
  returning id into v_effect_shadow_id;

  insert into public.store_items (
    name,
    description,
    identifier,
    type,
    price,
    original_price,
    currency,
    poster_asset_url,
    theme_name,
    is_active
  )
  values (
    'Altin Tozu',
    'Profil yuzeyinde altin tanecikler ve luks isik dagilimi olusturur.',
    'golddust',
    'profile_effect',
    600,
    740,
    'Coin',
    '/backgrounds/optimized/bg-dragon-hall.webp',
    'Royal',
    true
  )
  on conflict (type, identifier) do update
  set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    original_price = excluded.original_price,
    currency = excluded.currency,
    poster_asset_url = excluded.poster_asset_url,
    theme_name = excluded.theme_name,
    is_active = excluded.is_active
  returning id into v_effect_gold_id;

  insert into public.store_items (
    name,
    description,
    identifier,
    type,
    price,
    original_price,
    currency,
    poster_asset_url,
    theme_name,
    is_active
  )
  values (
    'Neon Orbit Efekti',
    'Koyu zeminlerde daha net okunan poster ve hover loop kombinasyonu.',
    'neon-orbit',
    'profile_effect',
    540,
    680,
    'Coin',
    '/backgrounds/optimized/bg-city-glow.webp',
    'Orbit',
    true
  )
  on conflict (type, identifier) do update
  set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    original_price = excluded.original_price,
    currency = excluded.currency,
    poster_asset_url = excluded.poster_asset_url,
    theme_name = excluded.theme_name,
    is_active = excluded.is_active
  returning id into v_effect_orbit_id;

  insert into public.store_profile_effect_assets (
    item_id,
    poster_asset_url,
    profile_intro_asset_url,
    profile_loop_asset_url,
    hover_intro_asset_url,
    hover_loop_asset_url,
    card_intro_asset_url,
    card_loop_asset_url,
    profile_asset_url,
    hover_asset_url,
    modal_backdrop_asset_url,
    effect_manifest,
    is_active
  )
  values (
    v_effect_shadow_id,
    '/assets/promo/premium-card.png',
    null,
    '/backgrounds/anime-neon-loop.webm',
    null,
    '/backgrounds/anime-neon-loop.webm',
    null,
    '/backgrounds/anime-neon-loop.webm',
    '/assets/promo/premium-card.png',
    '/backgrounds/anime-neon-loop.webm',
    '/assets/promo/premium-card.png',
    '{}'::jsonb,
    true
  )
  on conflict (item_id) do update
  set
    poster_asset_url = excluded.poster_asset_url,
    profile_intro_asset_url = excluded.profile_intro_asset_url,
    profile_loop_asset_url = excluded.profile_loop_asset_url,
    hover_intro_asset_url = excluded.hover_intro_asset_url,
    hover_loop_asset_url = excluded.hover_loop_asset_url,
    card_intro_asset_url = excluded.card_intro_asset_url,
    card_loop_asset_url = excluded.card_loop_asset_url,
    profile_asset_url = excluded.profile_asset_url,
    hover_asset_url = excluded.hover_asset_url,
    modal_backdrop_asset_url = excluded.modal_backdrop_asset_url,
    effect_manifest = excluded.effect_manifest,
    is_active = excluded.is_active;

  insert into public.store_profile_effect_assets (
    item_id,
    poster_asset_url,
    profile_intro_asset_url,
    profile_loop_asset_url,
    hover_intro_asset_url,
    hover_loop_asset_url,
    card_intro_asset_url,
    card_loop_asset_url,
    profile_asset_url,
    hover_asset_url,
    modal_backdrop_asset_url,
    effect_manifest,
    is_active
  )
  values (
    v_effect_gold_id,
    '/backgrounds/optimized/bg-dragon-hall.webp',
    null,
    '/backgrounds/optimized/bg-dragon-hall.webp',
    null,
    '/backgrounds/optimized/bg-dragon-hall.webp',
    null,
    '/backgrounds/optimized/bg-dragon-hall.webp',
    '/backgrounds/optimized/bg-dragon-hall.webp',
    '/backgrounds/optimized/bg-dragon-hall.webp',
    '/backgrounds/optimized/bg-dragon-hall.webp',
    '{}'::jsonb,
    true
  )
  on conflict (item_id) do update
  set
    poster_asset_url = excluded.poster_asset_url,
    profile_intro_asset_url = excluded.profile_intro_asset_url,
    profile_loop_asset_url = excluded.profile_loop_asset_url,
    hover_intro_asset_url = excluded.hover_intro_asset_url,
    hover_loop_asset_url = excluded.hover_loop_asset_url,
    card_intro_asset_url = excluded.card_intro_asset_url,
    card_loop_asset_url = excluded.card_loop_asset_url,
    profile_asset_url = excluded.profile_asset_url,
    hover_asset_url = excluded.hover_asset_url,
    modal_backdrop_asset_url = excluded.modal_backdrop_asset_url,
    effect_manifest = excluded.effect_manifest,
    is_active = excluded.is_active;

  insert into public.store_profile_effect_assets (
    item_id,
    poster_asset_url,
    profile_intro_asset_url,
    profile_loop_asset_url,
    hover_intro_asset_url,
    hover_loop_asset_url,
    card_intro_asset_url,
    card_loop_asset_url,
    profile_asset_url,
    hover_asset_url,
    modal_backdrop_asset_url,
    effect_manifest,
    is_active
  )
  values (
    v_effect_orbit_id,
    '/backgrounds/optimized/bg-city-glow.webp',
    null,
    '/backgrounds/anime-neon-loop.webm',
    null,
    '/backgrounds/anime-neon-loop.webm',
    null,
    '/backgrounds/anime-neon-loop.webm',
    '/backgrounds/optimized/bg-city-glow.webp',
    '/backgrounds/anime-neon-loop.webm',
    '/backgrounds/optimized/bg-city-glow.webp',
    '{}'::jsonb,
    true
  )
  on conflict (item_id) do update
  set
    poster_asset_url = excluded.poster_asset_url,
    profile_intro_asset_url = excluded.profile_intro_asset_url,
    profile_loop_asset_url = excluded.profile_loop_asset_url,
    hover_intro_asset_url = excluded.hover_intro_asset_url,
    hover_loop_asset_url = excluded.hover_loop_asset_url,
    card_intro_asset_url = excluded.card_intro_asset_url,
    card_loop_asset_url = excluded.card_loop_asset_url,
    profile_asset_url = excluded.profile_asset_url,
    hover_asset_url = excluded.hover_asset_url,
    modal_backdrop_asset_url = excluded.modal_backdrop_asset_url,
    effect_manifest = excluded.effect_manifest,
    is_active = excluded.is_active;

  insert into public.store_cosmetic_packages (
    package_key,
    name,
    description,
    price,
    original_price,
    currency,
    frame_store_item_id,
    profile_effect_store_item_id,
    is_active
  )
  values
    (
      'pkg-shadow-rose',
      'Golge Gulu Paketi',
      'Karanlik gul ritmi ile Golge Muhru cercevesini tek satin alma akisinda birlestirir.',
      680,
      850,
      'Coin',
      v_frame_shadow_id,
      v_effect_shadow_id,
      true
    ),
    (
      'pkg-royal-gold',
      'Kraliyet Altini Paketi',
      'Altin hukum cercevesini ve gold dust efektini indirimli set halinde toplar.',
      890,
      1100,
      'Coin',
      v_frame_gold_id,
      v_effect_gold_id,
      true
    ),
    (
      'pkg-neon-orbit',
      'Neon Orbit Paketi',
      'Canli ring cercevesini ve gece parlamasi hissi veren efekt katmanini birlikte sunar.',
      760,
      940,
      'Coin',
      v_frame_orbit_id,
      v_effect_orbit_id,
      true
    )
  on conflict (package_key) do update
  set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    original_price = excluded.original_price,
    currency = excluded.currency,
    frame_store_item_id = excluded.frame_store_item_id,
    profile_effect_store_item_id = excluded.profile_effect_store_item_id,
    is_active = excluded.is_active;
end;
$$;

create or replace function public.gift_store_item(
  p_item_id uuid,
  p_recipient_kind text,
  p_recipient_user_id uuid default null,
  p_recipient_fansub_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sender_id uuid;
  v_sender public.users%rowtype;
  v_recipient_kind text := lower(trim(coalesce(p_recipient_kind, '')));
  v_item public.store_items%rowtype;
  v_recipient_user public.users%rowtype;
  v_recipient_fansub public.fansubs%rowtype;
  v_target_key text;
  v_target_value text;
  v_recipient_owned jsonb;
  v_target_array jsonb;
  v_sender_new_stones integer;
  v_next_active_profile_effect_id uuid;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza hediye gonderimi su anda gecici olarak kapali.';
  end if;

  if v_recipient_kind not in ('user', 'fansub') then
    raise exception 'Gecersiz hediye hedefi.';
  end if;

  if v_recipient_kind = 'user' and p_recipient_user_id is null then
    raise exception 'Kullanici hedefi eksik.';
  end if;

  if v_recipient_kind = 'fansub' and p_recipient_fansub_id is null then
    raise exception 'Fansub hedefi eksik.';
  end if;

  v_sender_id := public.current_public_user_id();
  if v_sender_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_sender
  from public.users
  where id = v_sender_id
  for update;

  if not found then
    raise exception 'Gonderen public profil bulunamadi.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
    and type in ('frame', 'background', 'pattern', 'profile_effect')
  for update;

  if not found then
    raise exception 'Hediye edilecek urun bulunamadi veya desteklenmiyor.';
  end if;

  if v_item.currency <> 'Coin' then
    raise exception 'Bu urun Coin ile hediye gonderilemiyor.';
  end if;

  if v_sender.stones < v_item.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  v_target_key := case v_item.type
    when 'frame' then 'frames'
    when 'background' then 'backgrounds'
    when 'pattern' then 'patterns'
    else 'profile_effects'
  end;
  v_target_value := coalesce(v_item.identifier, v_item.id::text);

  if v_recipient_kind = 'user' then
    select *
    into v_recipient_user
    from public.users
    where id = p_recipient_user_id
      and is_active = true
      and is_banned = false
    for update;

    if not found then
      raise exception 'Hediye gonderilecek kullanici bulunamadi.';
    end if;

    v_recipient_owned := coalesce(v_recipient_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb);
    v_target_array := coalesce(v_recipient_owned -> v_target_key, '[]'::jsonb);

    if exists (
      select 1
      from jsonb_array_elements_text(v_target_array) as owned_value(value)
      where owned_value.value = v_target_value
    ) then
      raise exception 'Alici bu urune zaten sahip.';
    end if;

    v_target_array := v_target_array || to_jsonb(v_target_value);
    v_recipient_owned := jsonb_set(v_recipient_owned, array[v_target_key], v_target_array, true);
    v_next_active_profile_effect_id := v_recipient_user.active_profile_effect_id;

    if v_item.type = 'profile_effect' and v_next_active_profile_effect_id is null then
      v_next_active_profile_effect_id := v_item.id;
    end if;

    perform set_config('app.store_purchase_user_update', 'true', true);

    update public.users
    set
      owned_items = v_recipient_owned,
      active_profile_effect_id = v_next_active_profile_effect_id
    where id = v_recipient_user.id;

    perform set_config('app.store_purchase_user_update', '', true);
  else
    select *
    into v_recipient_fansub
    from public.fansubs
    where id = p_recipient_fansub_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Hediye gonderilecek fansub bulunamadi.';
    end if;

    if exists (
      select 1
      from public.fansub_inventory fi
      where fi.fansub_id = v_recipient_fansub.id
        and fi.store_item_id = v_item.id
    ) then
      raise exception 'Hedef fansub bu urune zaten sahip.';
    end if;

    insert into public.fansub_inventory (
      fansub_id,
      store_item_id,
      acquired_by
    )
    values (
      v_recipient_fansub.id,
      v_item.id,
      v_sender_id
    );
  end if;

  v_sender_new_stones := v_sender.stones - v_item.price;

  perform set_config('app.store_purchase_user_update', 'true', true);

  update public.users
  set stones = v_sender_new_stones
  where id = v_sender_id;

  perform set_config('app.store_purchase_user_update', '', true);

  update public.store_items
  set purchase_count = purchase_count + 1
  where id = v_item.id;

  insert into public.store_item_gifts (
    sender_user_id,
    recipient_kind,
    recipient_user_id,
    recipient_fansub_id,
    store_item_id,
    price
  )
  values (
    v_sender_id,
    v_recipient_kind,
    case when v_recipient_kind = 'user' then p_recipient_user_id else null end,
    case when v_recipient_kind = 'fansub' then p_recipient_fansub_id else null end,
    v_item.id,
    v_item.price
  );

  return jsonb_build_object(
    'sender_user_id', v_sender_id,
    'sender_stones', v_sender_new_stones,
    'recipient_kind', v_recipient_kind,
    'recipient_user_id', case when v_recipient_kind = 'user' then p_recipient_user_id else null end,
    'recipient_fansub_id', case when v_recipient_kind = 'fansub' then p_recipient_fansub_id else null end,
    'item_id', v_item.id,
    'item_identifier', v_target_value,
    'granted_item_ids', jsonb_build_array(v_item.id)
  );
end;
$function$;

create or replace function public.purchase_store_package(
  p_package_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_user public.users%rowtype;
  v_package public.store_cosmetic_packages%rowtype;
  v_frame_item public.store_items%rowtype;
  v_effect_item public.store_items%rowtype;
  v_owned jsonb;
  v_frames jsonb;
  v_effects jsonb;
  v_frame_identifier text;
  v_effect_identifier text;
  v_new_stones integer;
  v_next_active_profile_effect_id uuid;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza paket satin alma su anda gecici olarak kapali.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Public profil bulunamadi.';
  end if;

  select *
  into v_package
  from public.store_cosmetic_packages
  where package_key = trim(coalesce(p_package_key, ''))
    and is_active = true
  for update;

  if not found then
    raise exception 'Paket bulunamadi veya aktif degil.';
  end if;

  if v_package.currency <> 'Coin' then
    raise exception 'Bu paket Coin ile satin alinmiyor.';
  end if;

  if v_user.stones < v_package.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  select *
  into v_frame_item
  from public.store_items
  where id = v_package.frame_store_item_id
    and is_active = true
    and type = 'frame'
  for update;

  if not found then
    raise exception 'Paket cerceve urunu bulunamadi.';
  end if;

  select *
  into v_effect_item
  from public.store_items
  where id = v_package.profile_effect_store_item_id
    and is_active = true
    and type = 'profile_effect'
  for update;

  if not found then
    raise exception 'Paket profil efekti urunu bulunamadi.';
  end if;

  v_owned := coalesce(v_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb);
  v_frames := coalesce(v_owned -> 'frames', '[]'::jsonb);
  v_effects := coalesce(v_owned -> 'profile_effects', '[]'::jsonb);
  v_frame_identifier := coalesce(v_frame_item.identifier, v_frame_item.id::text);
  v_effect_identifier := coalesce(v_effect_item.identifier, v_effect_item.id::text);

  if exists (
    select 1
    from jsonb_array_elements_text(v_frames) as owned_value(value)
    where owned_value.value = v_frame_identifier
  ) then
    raise exception 'Bu paketin cercevesi zaten envanterinizde bulunuyor.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_effects) as owned_value(value)
    where owned_value.value = v_effect_identifier
  ) then
    raise exception 'Bu paketin profil efekti zaten envanterinizde bulunuyor.';
  end if;

  v_frames := v_frames || to_jsonb(v_frame_identifier);
  v_effects := v_effects || to_jsonb(v_effect_identifier);
  v_owned := jsonb_set(v_owned, '{frames}', v_frames, true);
  v_owned := jsonb_set(v_owned, '{profile_effects}', v_effects, true);
  v_new_stones := v_user.stones - v_package.price;
  v_next_active_profile_effect_id := coalesce(v_user.active_profile_effect_id, v_effect_item.id);

  perform set_config('app.store_purchase_user_update', 'true', true);

  update public.users
  set
    stones = v_new_stones,
    owned_items = v_owned,
    active_profile_effect_id = v_next_active_profile_effect_id
  where id = v_user_id;

  perform set_config('app.store_purchase_user_update', '', true);

  update public.store_items
  set purchase_count = purchase_count + 1
  where id in (v_frame_item.id, v_effect_item.id);

  insert into public.store_package_events (
    event_type,
    actor_user_id,
    package_key,
    total_price,
    granted_item_ids
  )
  values (
    'purchase',
    v_user_id,
    v_package.package_key,
    v_package.price,
    array[v_frame_item.id, v_effect_item.id]::uuid[]
  );

  return jsonb_build_object(
    'user_id', v_user_id,
    'package_key', v_package.package_key,
    'stones', v_new_stones,
    'owned_items', v_owned,
    'active_profile_effect_id', v_next_active_profile_effect_id,
    'granted_item_ids', jsonb_build_array(v_frame_item.id, v_effect_item.id)
  );
end;
$function$;

create or replace function public.gift_store_package(
  p_package_key text,
  p_recipient_kind text,
  p_recipient_user_id uuid default null,
  p_recipient_fansub_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sender_id uuid;
  v_sender public.users%rowtype;
  v_recipient_kind text := lower(trim(coalesce(p_recipient_kind, '')));
  v_package public.store_cosmetic_packages%rowtype;
  v_frame_item public.store_items%rowtype;
  v_effect_item public.store_items%rowtype;
  v_sender_new_stones integer;
  v_recipient_user public.users%rowtype;
  v_recipient_fansub public.fansubs%rowtype;
  v_recipient_owned jsonb;
  v_frames jsonb;
  v_effects jsonb;
  v_frame_identifier text;
  v_effect_identifier text;
  v_next_active_profile_effect_id uuid;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza paket hediyesi su anda gecici olarak kapali.';
  end if;

  if v_recipient_kind not in ('user', 'fansub') then
    raise exception 'Gecersiz paket hediye hedefi.';
  end if;

  if v_recipient_kind = 'user' and p_recipient_user_id is null then
    raise exception 'Kullanici hedefi eksik.';
  end if;

  if v_recipient_kind = 'fansub' and p_recipient_fansub_id is null then
    raise exception 'Fansub hedefi eksik.';
  end if;

  v_sender_id := public.current_public_user_id();
  if v_sender_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_sender
  from public.users
  where id = v_sender_id
  for update;

  if not found then
    raise exception 'Gonderen public profil bulunamadi.';
  end if;

  select *
  into v_package
  from public.store_cosmetic_packages
  where package_key = trim(coalesce(p_package_key, ''))
    and is_active = true
  for update;

  if not found then
    raise exception 'Paket bulunamadi veya aktif degil.';
  end if;

  if v_package.currency <> 'Coin' then
    raise exception 'Bu paket Coin ile hediye gonderilemiyor.';
  end if;

  if v_sender.stones < v_package.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  select *
  into v_frame_item
  from public.store_items
  where id = v_package.frame_store_item_id
    and is_active = true
    and type = 'frame'
  for update;

  if not found then
    raise exception 'Paket cerceve urunu bulunamadi.';
  end if;

  select *
  into v_effect_item
  from public.store_items
  where id = v_package.profile_effect_store_item_id
    and is_active = true
    and type = 'profile_effect'
  for update;

  if not found then
    raise exception 'Paket profil efekti urunu bulunamadi.';
  end if;

  v_frame_identifier := coalesce(v_frame_item.identifier, v_frame_item.id::text);
  v_effect_identifier := coalesce(v_effect_item.identifier, v_effect_item.id::text);

  if v_recipient_kind = 'user' then
    select *
    into v_recipient_user
    from public.users
    where id = p_recipient_user_id
      and is_active = true
      and is_banned = false
    for update;

    if not found then
      raise exception 'Hediye gonderilecek kullanici bulunamadi.';
    end if;

    v_recipient_owned := coalesce(v_recipient_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb);
    v_frames := coalesce(v_recipient_owned -> 'frames', '[]'::jsonb);
    v_effects := coalesce(v_recipient_owned -> 'profile_effects', '[]'::jsonb);

    if exists (
      select 1
      from jsonb_array_elements_text(v_frames) as owned_value(value)
      where owned_value.value = v_frame_identifier
    ) then
      raise exception 'Alici bu paketin cercevesine zaten sahip.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(v_effects) as owned_value(value)
      where owned_value.value = v_effect_identifier
    ) then
      raise exception 'Alici bu paketin profil efektine zaten sahip.';
    end if;

    v_frames := v_frames || to_jsonb(v_frame_identifier);
    v_effects := v_effects || to_jsonb(v_effect_identifier);
    v_recipient_owned := jsonb_set(v_recipient_owned, '{frames}', v_frames, true);
    v_recipient_owned := jsonb_set(v_recipient_owned, '{profile_effects}', v_effects, true);
    v_next_active_profile_effect_id := coalesce(v_recipient_user.active_profile_effect_id, v_effect_item.id);

    perform set_config('app.store_purchase_user_update', 'true', true);

    update public.users
    set
      owned_items = v_recipient_owned,
      active_profile_effect_id = v_next_active_profile_effect_id
    where id = v_recipient_user.id;

    perform set_config('app.store_purchase_user_update', '', true);
  else
    select *
    into v_recipient_fansub
    from public.fansubs
    where id = p_recipient_fansub_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Hediye gonderilecek fansub bulunamadi.';
    end if;

    if exists (
      select 1
      from public.fansub_inventory fi
      where fi.fansub_id = v_recipient_fansub.id
        and fi.store_item_id in (v_frame_item.id, v_effect_item.id)
    ) then
      raise exception 'Hedef fansub paket icerigindeki urunlerden en az birine zaten sahip.';
    end if;

    insert into public.fansub_inventory (
      fansub_id,
      store_item_id,
      acquired_by
    )
    values
      (v_recipient_fansub.id, v_frame_item.id, v_sender_id),
      (v_recipient_fansub.id, v_effect_item.id, v_sender_id);
  end if;

  v_sender_new_stones := v_sender.stones - v_package.price;

  perform set_config('app.store_purchase_user_update', 'true', true);

  update public.users
  set stones = v_sender_new_stones
  where id = v_sender_id;

  perform set_config('app.store_purchase_user_update', '', true);

  update public.store_items
  set purchase_count = purchase_count + 1
  where id in (v_frame_item.id, v_effect_item.id);

  insert into public.store_package_events (
    event_type,
    actor_user_id,
    package_key,
    recipient_kind,
    recipient_user_id,
    recipient_fansub_id,
    total_price,
    granted_item_ids
  )
  values (
    'gift',
    v_sender_id,
    v_package.package_key,
    v_recipient_kind,
    case when v_recipient_kind = 'user' then p_recipient_user_id else null end,
    case when v_recipient_kind = 'fansub' then p_recipient_fansub_id else null end,
    v_package.price,
    array[v_frame_item.id, v_effect_item.id]::uuid[]
  );

  return jsonb_build_object(
    'sender_user_id', v_sender_id,
    'sender_stones', v_sender_new_stones,
    'package_key', v_package.package_key,
    'recipient_kind', v_recipient_kind,
    'recipient_user_id', case when v_recipient_kind = 'user' then p_recipient_user_id else null end,
    'recipient_fansub_id', case when v_recipient_kind = 'fansub' then p_recipient_fansub_id else null end,
    'granted_item_ids', jsonb_build_array(v_frame_item.id, v_effect_item.id)
  );
end;
$function$;

grant execute on function public.gift_store_item(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.purchase_store_package(text) to authenticated;
grant execute on function public.gift_store_package(text, text, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
