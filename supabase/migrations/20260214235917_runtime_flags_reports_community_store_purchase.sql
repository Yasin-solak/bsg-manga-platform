-- ============================================
-- MangaZone | Runtime flags: reports/community/store purchase
-- Date: 2026-02-14
-- ============================================

begin;

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values
  ('moderation.reports', 'Rapor Moderasyonu', 'Rapor olusturma ve admin rapor yonetimi akislarini ac/kapat.', true, 100, true, '{}'::jsonb),
  ('community.posting', 'Topluluk Paylasim/Yorum', 'Toplulukta yeni paylasim ve yorum olusturma akislarini ac/kapat.', true, 100, true, '{}'::jsonb),
  ('economy.store_purchase', 'Magaza Satin Alma', 'Tum magaza satin alma akislarini tek flag ile ac/kapat.', true, 100, true, '{}'::jsonb)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_public = excluded.is_public;

update public.feature_flags
set is_public = true
where key in (
  'moderation.reports',
  'community.posting',
  'economy.store_purchase'
);

create or replace function public.enforce_reports_feature_flag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_feature_enabled('moderation.reports', true) then
    raise exception 'Raporlama sistemi su anda gecici olarak kapali.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_reports_feature_flag on public.reports;
create trigger trg_enforce_reports_feature_flag
  before insert on public.reports
  for each row
  execute function public.enforce_reports_feature_flag();

create or replace function public.enforce_community_posting_feature_flag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_feature_enabled('community.posting', true) then
    raise exception 'Topluluk paylasim ve yorum olusturma su anda gecici olarak kapali.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_community_posting_feature_flag_posts on public.community_posts;
create trigger trg_enforce_community_posting_feature_flag_posts
  before insert on public.community_posts
  for each row
  execute function public.enforce_community_posting_feature_flag();

drop trigger if exists trg_enforce_community_posting_feature_flag_comments on public.community_comments;
create trigger trg_enforce_community_posting_feature_flag_comments
  before insert on public.community_comments
  for each row
  execute function public.enforce_community_posting_feature_flag();

create or replace function public.purchase_store_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user public.users%rowtype;
  v_item public.store_items%rowtype;
  v_target_key text;
  v_target_value text;
  v_owned jsonb;
  v_target_array jsonb;
  v_already_owned boolean;
  v_new_stones integer;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
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
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Urun bulunamadi veya aktif degil.';
  end if;

  if v_item.currency <> 'Coin' then
    raise exception 'Bu urun Coin ile satin alinmiyor.';
  end if;

  if v_user.stones < v_item.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  v_target_key := case v_item.type
    when 'frame' then 'frames'
    when 'background' then 'backgrounds'
    when 'pattern' then 'patterns'
    when 'badge' then 'badges'
    else 'premium'
  end;

  v_target_value := coalesce(v_item.identifier, v_item.id::text);
  v_owned := coalesce(v_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[]}'::jsonb);
  v_target_array := coalesce(v_owned -> v_target_key, '[]'::jsonb);

  select exists (
    select 1
    from jsonb_array_elements_text(v_target_array) as t(value)
    where t.value = v_target_value
  )
  into v_already_owned;

  if v_already_owned then
    raise exception 'Bu urun zaten envanterinizde bulunuyor.';
  end if;

  v_target_array := v_target_array || to_jsonb(v_target_value);
  v_owned := jsonb_set(v_owned, array[v_target_key], v_target_array, true);
  v_new_stones := v_user.stones - v_item.price;

  update public.users
  set stones = v_new_stones,
      owned_items = v_owned
  where id = v_user_id;

  update public.store_items
  set purchase_count = purchase_count + 1
  where id = v_item.id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'item_id', v_item.id,
    'item_type', v_item.type,
    'item_identifier', v_item.identifier,
    'stones', v_new_stones,
    'owned_items', v_owned
  );
end;
$$;

grant execute on function public.purchase_store_item(uuid) to authenticated;

create or replace function public.purchase_user_badge(p_badge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_badge public.badges%rowtype;
  v_user public.users%rowtype;
  v_new_stones integer;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;

  v_caller_id := public.current_public_user_id();
  if v_caller_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_badge
  from public.badges
  where id = p_badge_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Rozet bulunamadi veya aktif degil.';
  end if;

  if v_badge.category <> 'purchasable' then
    raise exception 'Bu rozet satin alinamaz.';
  end if;

  if v_badge.target_type not in ('user', 'both') then
    raise exception 'Bu rozet kullanici icin satin alinamaz.';
  end if;

  if v_badge.price is null or v_badge.price <= 0 then
    raise exception 'Rozet fiyati gecersiz.';
  end if;

  if exists (
    select 1
    from public.user_badges ub
    where ub.user_id = v_caller_id
      and ub.badge_id = p_badge_id
  ) then
    raise exception 'Bu rozete zaten sahipsiniz.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_caller_id
  for update;

  if not found then
    raise exception 'Kullanici profili bulunamadi.';
  end if;

  if v_user.stones < v_badge.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  v_new_stones := v_user.stones - v_badge.price;

  update public.users
  set stones = v_new_stones
  where id = v_caller_id;

  insert into public.user_badges (
    user_id,
    badge_id,
    is_displayed,
    display_order
  )
  values (
    v_caller_id,
    p_badge_id,
    false,
    0
  );

  return jsonb_build_object(
    'target', 'user',
    'user_id', v_caller_id,
    'badge_id', p_badge_id,
    'price', v_badge.price,
    'new_user_stones', v_new_stones
  );
end;
$$;

revoke all on function public.purchase_user_badge(uuid) from public;
grant execute on function public.purchase_user_badge(uuid) to authenticated;

create or replace function public.purchase_fansub_badge(
  p_fansub_id uuid,
  p_badge_id uuid,
  p_payment_source text default 'fansub'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_badge public.badges%rowtype;
  v_fansub public.fansubs%rowtype;
  v_user public.users%rowtype;
  v_new_fansub_balance integer;
  v_new_user_stones integer;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;

  v_caller_id := public.current_public_user_id();
  if v_caller_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_payment_source not in ('user', 'fansub') then
    raise exception 'Gecersiz odeme kaynagi.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;

  select *
  into v_badge
  from public.badges
  where id = p_badge_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Rozet bulunamadi veya aktif degil.';
  end if;

  if v_badge.category <> 'purchasable' then
    raise exception 'Bu rozet satin alinamaz.';
  end if;

  if v_badge.target_type not in ('fansub', 'both') then
    raise exception 'Bu rozet fansub icin satin alinamaz.';
  end if;

  if v_badge.price is null or v_badge.price <= 0 then
    raise exception 'Rozet fiyati gecersiz.';
  end if;

  if exists (
    select 1
    from public.fansub_badges fb
    where fb.fansub_id = p_fansub_id
      and fb.badge_id = p_badge_id
  ) then
    raise exception 'Fansub bu rozete zaten sahip.';
  end if;

  select *
  into v_fansub
  from public.fansubs
  where id = p_fansub_id
  for update;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  if p_payment_source = 'user' then
    select *
    into v_user
    from public.users
    where id = v_caller_id
    for update;

    if not found then
      raise exception 'Kullanici profili bulunamadi.';
    end if;

    if v_user.stones < v_badge.price then
      raise exception 'Yetersiz bakiye.';
    end if;

    v_new_user_stones := v_user.stones - v_badge.price;

    update public.users
    set stones = v_new_user_stones
    where id = v_caller_id;
  else
    if coalesce(v_fansub.coin_balance, 0) < v_badge.price then
      raise exception 'Fansub bakiyesi yetersiz.';
    end if;

    v_new_fansub_balance := coalesce(v_fansub.coin_balance, 0) - v_badge.price;

    update public.fansubs
    set coin_balance = v_new_fansub_balance
    where id = p_fansub_id;
  end if;

  insert into public.fansub_badges (
    fansub_id,
    badge_id,
    is_displayed,
    display_order
  )
  values (
    p_fansub_id,
    p_badge_id,
    false,
    0
  );

  return jsonb_build_object(
    'target', 'fansub',
    'fansub_id', p_fansub_id,
    'badge_id', p_badge_id,
    'price', v_badge.price,
    'payment_source', p_payment_source,
    'new_user_stones', v_new_user_stones,
    'new_fansub_coin_balance', v_new_fansub_balance
  );
end;
$$;

revoke all on function public.purchase_fansub_badge(uuid, uuid, text) from public;
grant execute on function public.purchase_fansub_badge(uuid, uuid, text) to authenticated;

create or replace function public.purchase_fansub_store_item(
  p_fansub_id uuid,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_fansub public.fansubs%rowtype;
  v_item public.store_items%rowtype;
  v_new_balance integer;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;

  if not public.is_feature_enabled('economy.fansub_wallet_purchase', true) then
    raise exception 'Fansub kasasi ile satin alma su anda gecici olarak kapali.';
  end if;

  v_caller_id := public.current_public_user_id();
  if v_caller_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null or p_item_id is null then
    raise exception 'Fansub ve urun secimi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansub icin satin alma yetkiniz yok.';
  end if;

  select *
  into v_fansub
  from public.fansubs
  where id = p_fansub_id
  for update;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  if coalesce(v_fansub.is_active, true) = false then
    raise exception 'Fansub aktif degil.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Urun bulunamadi veya aktif degil.';
  end if;

  if v_item.currency <> 'Coin' then
    raise exception 'Bu urun Coin ile satin alinmiyor.';
  end if;

  if coalesce(v_fansub.coin_balance, 0) < v_item.price then
    raise exception 'Fansub bakiyesi yetersiz.';
  end if;

  if exists (
    select 1
    from public.fansub_inventory fi
    where fi.fansub_id = p_fansub_id
      and fi.store_item_id = p_item_id
  ) then
    raise exception 'Bu urun zaten fansub envanterinde bulunuyor.';
  end if;

  insert into public.fansub_inventory (
    fansub_id,
    store_item_id,
    acquired_by
  )
  values (
    p_fansub_id,
    p_item_id,
    v_caller_id
  );

  v_new_balance := coalesce(v_fansub.coin_balance, 0) - v_item.price;

  update public.fansubs
  set coin_balance = v_new_balance
  where id = p_fansub_id;

  update public.store_items
  set purchase_count = coalesce(purchase_count, 0) + 1
  where id = p_item_id;

  insert into public.fansub_transactions (
    fansub_id,
    amount,
    type,
    description,
    related_item_id,
    created_by
  )
  values (
    p_fansub_id,
    -v_item.price,
    'purchase',
    format('Fansub kasasi ile satin alim (urun: %s)', coalesce(v_item.name, p_item_id::text)),
    p_item_id,
    v_caller_id
  );

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'item_id', p_item_id,
    'price', v_item.price,
    'new_fansub_balance', v_new_balance
  );
exception
  when unique_violation then
    raise exception 'Bu urun zaten fansub envanterinde bulunuyor.';
end;
$$;

revoke all on function public.purchase_fansub_store_item(uuid, uuid) from public;
grant execute on function public.purchase_fansub_store_item(uuid, uuid) to authenticated;

create or replace function public.purchase_fansub_store_item_with_user_wallet(
  p_fansub_id uuid,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_user public.users%rowtype;
  v_fansub public.fansubs%rowtype;
  v_item public.store_items%rowtype;
  v_new_stones integer;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;

  if not public.is_feature_enabled('economy.fansub_wallet_purchase', true) then
    raise exception 'Fansub icin satin alma su anda gecici olarak kapali.';
  end if;

  v_caller_id := public.current_public_user_id();
  if v_caller_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null or p_item_id is null then
    raise exception 'Fansub ve urun secimi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansub icin satin alma yetkiniz yok.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_caller_id
  for update;

  if not found then
    raise exception 'Kullanici profili bulunamadi.';
  end if;

  select *
  into v_fansub
  from public.fansubs
  where id = p_fansub_id
  for update;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  if coalesce(v_fansub.is_active, true) = false then
    raise exception 'Fansub aktif degil.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Urun bulunamadi veya aktif degil.';
  end if;

  if v_item.currency <> 'Coin' then
    raise exception 'Bu urun Coin ile satin alinmiyor.';
  end if;

  if v_user.stones < v_item.price then
    raise exception 'Yetersiz kullanici bakiyesi.';
  end if;

  if exists (
    select 1
    from public.fansub_inventory fi
    where fi.fansub_id = p_fansub_id
      and fi.store_item_id = p_item_id
  ) then
    raise exception 'Bu urun zaten fansub envanterinde bulunuyor.';
  end if;

  insert into public.fansub_inventory (
    fansub_id,
    store_item_id
  )
  values (
    p_fansub_id,
    p_item_id
  );

  v_new_stones := v_user.stones - v_item.price;

  update public.users
  set stones = v_new_stones
  where id = v_caller_id;

  update public.store_items
  set purchase_count = purchase_count + 1
  where id = p_item_id;

  insert into public.fansub_transactions (
    fansub_id,
    amount,
    type,
    description,
    related_item_id,
    created_by
  )
  values (
    p_fansub_id,
    0,
    'purchase',
    format('Uye tarafindan satin alim (deger: %s)', v_item.price),
    p_item_id,
    v_caller_id
  );

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'item_id', p_item_id,
    'price', v_item.price,
    'new_user_stones', v_new_stones
  );
exception
  when unique_violation then
    raise exception 'Bu urun zaten fansub envanterinde bulunuyor.';
end;
$$;

revoke all on function public.purchase_fansub_store_item_with_user_wallet(uuid, uuid) from public;
grant execute on function public.purchase_fansub_store_item_with_user_wallet(uuid, uuid) to authenticated;

commit;
