-- ============================================
-- MangaZone | Functions + RLS Policies (V2)
-- Date: 2026-02-07
-- ============================================

-- ============================================
-- Helper functions
-- ============================================
create or replace function public.current_public_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_app_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return 'anon';
  end if;

  select u.role
  into v_role
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  return coalesce(v_role, 'user');
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin';
$$;

create or replace function public.is_fansub_admin(p_fansub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and fm.user_id = public.current_public_user_id()
      and fm.role = 'admin'
  );
$$;

-- ============================================
-- Public functions used by application code
-- ============================================
create or replace function public.get_fansubs_with_stats()
returns table (
  id uuid,
  name text,
  slug text,
  avatar_url text,
  description text,
  frame_type text,
  primary_color text,
  secondary_color text,
  manga_count bigint,
  follower_count bigint,
  active_frame_id uuid,
  active_background_id uuid,
  active_pattern_id uuid,
  coin_balance integer
)
language sql
stable
set search_path = public
as $$
  select
    f.id,
    f.name,
    f.slug,
    f.avatar_url,
    f.description,
    f.frame_type,
    f.primary_color,
    f.secondary_color,
    coalesce((
      select count(*)
      from public.mangas m
      where m.fansub_id = f.id
        and m.is_active = true
    ), 0)::bigint as manga_count,
    coalesce((
      select count(*)
      from public.fansub_follows ff
      where ff.fansub_id = f.id
    ), 0)::bigint as follower_count,
    f.active_frame_id,
    f.active_background_id,
    f.active_pattern_id,
    f.coin_balance
  from public.fansubs f
  where f.is_active = true
  order by f.name asc;
$$;

create or replace function public.get_genre_counts()
returns table (
  genre text,
  count bigint
)
language sql
stable
set search_path = public
as $$
  select
    g.genre,
    count(*)::bigint as count
  from public.mangas m
  cross join lateral unnest(coalesce(m.genres, '{}'::text[])) as g(genre)
  where m.is_active = true
    and m.is_approved = true
  group by g.genre
  order by count desc, g.genre asc;
$$;

create or replace function public.update_user_displayed_badges(
  p_user_id uuid,
  p_badge_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := public.current_public_user_id();
  if v_caller_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if v_caller_id <> p_user_id and not public.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;

  update public.user_badges
  set is_displayed = false,
      display_order = 0
  where user_id = p_user_id;

  with selected as (
    select badge_id, ord
    from unnest(coalesce(p_badge_ids, '{}'::uuid[])) with ordinality as t(badge_id, ord)
    where ord <= 3
  )
  update public.user_badges ub
  set is_displayed = true,
      display_order = selected.ord
  from selected
  where ub.user_id = p_user_id
    and ub.badge_id = selected.badge_id;
end;
$$;

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

-- ============================================
-- View for admin dashboard
-- ============================================
create or replace view public.admin_stats as
select
  (select count(*) from public.users where is_active = true) as users,
  (select count(*) from public.community_posts where status = 'approved' and is_active = true) as posts,
  (select count(*) from public.fansubs where is_active = true) as fansubs,
  (select count(*) from public.community_posts where status = 'pending' and is_active = true) as pending_posts,
  (select count(*) from public.mangas where is_active = true) as mangas;

-- ============================================
-- Enable RLS
-- ============================================
alter table public.users enable row level security;
alter table public.fansubs enable row level security;
alter table public.store_items enable row level security;
alter table public.badges enable row level security;
alter table public.mangas enable row level security;
alter table public.chapters enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.manga_comments enable row level security;
alter table public.fansub_members enable row level security;
alter table public.fansub_inventory enable row level security;
alter table public.fansub_transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.user_badges enable row level security;
alter table public.fansub_badges enable row level security;
alter table public.redeem_codes enable row level security;
alter table public.user_code_redemptions enable row level security;
alter table public.fansub_code_redemptions enable row level security;
alter table public.reading_history enable row level security;
alter table public.manga_follows enable row level security;
alter table public.fansub_follows enable row level security;
alter table public.user_follows enable row level security;

-- ============================================
-- Policies
-- ============================================

-- users
drop policy if exists users_select_active on public.users;
create policy users_select_active
  on public.users
  for select
  using (is_active = true);

drop policy if exists users_insert_self on public.users;
create policy users_insert_self
  on public.users
  for insert
  with check (auth.uid() is not null and auth.uid() = auth_user_id);

drop policy if exists users_update_self_or_admin on public.users;
create policy users_update_self_or_admin
  on public.users
  for update
  using (id = public.current_public_user_id() or public.is_admin())
  with check (id = public.current_public_user_id() or public.is_admin());

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin
  on public.users
  for delete
  using (public.is_admin());

-- fansubs
drop policy if exists fansubs_select_public on public.fansubs;
create policy fansubs_select_public
  on public.fansubs
  for select
  using (is_active = true or public.is_admin());

drop policy if exists fansubs_insert_admin on public.fansubs;
create policy fansubs_insert_admin
  on public.fansubs
  for insert
  with check (public.is_admin());

drop policy if exists fansubs_update_admin_or_owner on public.fansubs;
create policy fansubs_update_admin_or_owner
  on public.fansubs
  for update
  using (public.is_admin() or public.is_fansub_admin(id))
  with check (public.is_admin() or public.is_fansub_admin(id));

drop policy if exists fansubs_delete_admin on public.fansubs;
create policy fansubs_delete_admin
  on public.fansubs
  for delete
  using (public.is_admin());

-- store_items
drop policy if exists store_items_select_public on public.store_items;
create policy store_items_select_public
  on public.store_items
  for select
  using (is_active = true or public.is_admin());

drop policy if exists store_items_admin_write on public.store_items;
create policy store_items_admin_write
  on public.store_items
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- badges
drop policy if exists badges_select_public on public.badges;
create policy badges_select_public
  on public.badges
  for select
  using (is_active = true or public.is_admin());

drop policy if exists badges_admin_write on public.badges;
create policy badges_admin_write
  on public.badges
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- mangas
drop policy if exists mangas_select_public on public.mangas;
create policy mangas_select_public
  on public.mangas
  for select
  using (
    (is_active = true and is_approved = true)
    or public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

drop policy if exists mangas_insert_admin_or_fansub_admin on public.mangas;
create policy mangas_insert_admin_or_fansub_admin
  on public.mangas
  for insert
  with check (
    public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

drop policy if exists mangas_update_admin_or_fansub_admin on public.mangas;
create policy mangas_update_admin_or_fansub_admin
  on public.mangas
  for update
  using (
    public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  )
  with check (
    public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

drop policy if exists mangas_delete_admin_or_fansub_admin on public.mangas;
create policy mangas_delete_admin_or_fansub_admin
  on public.mangas
  for delete
  using (
    public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

-- chapters
drop policy if exists chapters_select_public on public.chapters;
create policy chapters_select_public
  on public.chapters
  for select
  using (
    (is_active = true and is_approved = true)
    or public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

drop policy if exists chapters_insert_admin_or_fansub_admin on public.chapters;
create policy chapters_insert_admin_or_fansub_admin
  on public.chapters
  for insert
  with check (
    public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

drop policy if exists chapters_update_admin_or_fansub_admin on public.chapters;
create policy chapters_update_admin_or_fansub_admin
  on public.chapters
  for update
  using (
    public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  )
  with check (
    public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

drop policy if exists chapters_delete_admin_or_fansub_admin on public.chapters;
create policy chapters_delete_admin_or_fansub_admin
  on public.chapters
  for delete
  using (
    public.is_admin()
    or (fansub_id is not null and public.is_fansub_admin(fansub_id))
  );

-- community_posts
drop policy if exists community_posts_select_rule on public.community_posts;
create policy community_posts_select_rule
  on public.community_posts
  for select
  using (
    (status = 'approved' and is_active = true)
    or author_id = public.current_public_user_id()
    or public.is_admin()
  );

drop policy if exists community_posts_insert_self on public.community_posts;
create policy community_posts_insert_self
  on public.community_posts
  for insert
  with check (author_id = public.current_public_user_id());

drop policy if exists community_posts_update_self_or_admin on public.community_posts;
create policy community_posts_update_self_or_admin
  on public.community_posts
  for update
  using (author_id = public.current_public_user_id() or public.is_admin())
  with check (author_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_posts_delete_self_or_admin on public.community_posts;
create policy community_posts_delete_self_or_admin
  on public.community_posts
  for delete
  using (author_id = public.current_public_user_id() or public.is_admin());

-- community_comments
drop policy if exists community_comments_select_rule on public.community_comments;
create policy community_comments_select_rule
  on public.community_comments
  for select
  using (is_active = true or public.is_admin());

drop policy if exists community_comments_insert_self on public.community_comments;
create policy community_comments_insert_self
  on public.community_comments
  for insert
  with check (author_id = public.current_public_user_id());

drop policy if exists community_comments_update_self_or_admin on public.community_comments;
create policy community_comments_update_self_or_admin
  on public.community_comments
  for update
  using (author_id = public.current_public_user_id() or public.is_admin())
  with check (author_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_comments_delete_self_or_admin on public.community_comments;
create policy community_comments_delete_self_or_admin
  on public.community_comments
  for delete
  using (author_id = public.current_public_user_id() or public.is_admin());

-- manga_comments
drop policy if exists manga_comments_select_rule on public.manga_comments;
create policy manga_comments_select_rule
  on public.manga_comments
  for select
  using (is_active = true or public.is_admin());

drop policy if exists manga_comments_insert_self on public.manga_comments;
create policy manga_comments_insert_self
  on public.manga_comments
  for insert
  with check (user_id = public.current_public_user_id());

drop policy if exists manga_comments_update_self_or_admin on public.manga_comments;
create policy manga_comments_update_self_or_admin
  on public.manga_comments
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists manga_comments_delete_self_or_admin on public.manga_comments;
create policy manga_comments_delete_self_or_admin
  on public.manga_comments
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

-- fansub_members
drop policy if exists fansub_members_select_public on public.fansub_members;
create policy fansub_members_select_public
  on public.fansub_members
  for select
  using (true);

drop policy if exists fansub_members_write_admin_or_fansub_admin on public.fansub_members;
create policy fansub_members_write_admin_or_fansub_admin
  on public.fansub_members
  for all
  using (public.is_admin() or public.is_fansub_admin(fansub_id))
  with check (public.is_admin() or public.is_fansub_admin(fansub_id));

-- fansub_inventory
drop policy if exists fansub_inventory_select_public on public.fansub_inventory;
create policy fansub_inventory_select_public
  on public.fansub_inventory
  for select
  using (true);

drop policy if exists fansub_inventory_write_admin_or_fansub_admin on public.fansub_inventory;
create policy fansub_inventory_write_admin_or_fansub_admin
  on public.fansub_inventory
  for all
  using (public.is_admin() or public.is_fansub_admin(fansub_id))
  with check (public.is_admin() or public.is_fansub_admin(fansub_id));

-- fansub_transactions
drop policy if exists fansub_transactions_select_public on public.fansub_transactions;
create policy fansub_transactions_select_public
  on public.fansub_transactions
  for select
  using (true);

drop policy if exists fansub_transactions_insert_admin_or_fansub_admin on public.fansub_transactions;
create policy fansub_transactions_insert_admin_or_fansub_admin
  on public.fansub_transactions
  for insert
  with check (public.is_admin() or public.is_fansub_admin(fansub_id));

drop policy if exists fansub_transactions_update_delete_admin on public.fansub_transactions;
create policy fansub_transactions_update_delete_admin
  on public.fansub_transactions
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- notifications
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists notifications_insert_own_or_admin on public.notifications;
create policy notifications_insert_own_or_admin
  on public.notifications
  for insert
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists notifications_update_own_or_admin on public.notifications;
create policy notifications_update_own_or_admin
  on public.notifications
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists notifications_delete_own_or_admin on public.notifications;
create policy notifications_delete_own_or_admin
  on public.notifications
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

-- reports
drop policy if exists reports_select_admin on public.reports;
create policy reports_select_admin
  on public.reports
  for select
  using (public.is_admin());

drop policy if exists reports_insert_self on public.reports;
create policy reports_insert_self
  on public.reports
  for insert
  with check (reporter_id = public.current_public_user_id());

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin
  on public.reports
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists reports_delete_admin on public.reports;
create policy reports_delete_admin
  on public.reports
  for delete
  using (public.is_admin());

-- user_badges
drop policy if exists user_badges_select_own_or_admin on public.user_badges;
create policy user_badges_select_own_or_admin
  on public.user_badges
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_badges_insert_admin on public.user_badges;
create policy user_badges_insert_admin
  on public.user_badges
  for insert
  with check (public.is_admin());

drop policy if exists user_badges_update_admin on public.user_badges;
create policy user_badges_update_admin
  on public.user_badges
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists user_badges_delete_admin on public.user_badges;
create policy user_badges_delete_admin
  on public.user_badges
  for delete
  using (public.is_admin());

-- fansub_badges
drop policy if exists fansub_badges_select_public on public.fansub_badges;
create policy fansub_badges_select_public
  on public.fansub_badges
  for select
  using (true);

drop policy if exists fansub_badges_insert_admin_or_fansub_admin on public.fansub_badges;
create policy fansub_badges_insert_admin_or_fansub_admin
  on public.fansub_badges
  for insert
  with check (public.is_admin() or public.is_fansub_admin(fansub_id));

drop policy if exists fansub_badges_update_admin_or_fansub_admin on public.fansub_badges;
create policy fansub_badges_update_admin_or_fansub_admin
  on public.fansub_badges
  for update
  using (public.is_admin() or public.is_fansub_admin(fansub_id))
  with check (public.is_admin() or public.is_fansub_admin(fansub_id));

drop policy if exists fansub_badges_delete_admin_or_fansub_admin on public.fansub_badges;
create policy fansub_badges_delete_admin_or_fansub_admin
  on public.fansub_badges
  for delete
  using (public.is_admin() or public.is_fansub_admin(fansub_id));

-- redeem_codes
drop policy if exists redeem_codes_select_active on public.redeem_codes;
create policy redeem_codes_select_active
  on public.redeem_codes
  for select
  using (
    (auth.role() = 'authenticated' and is_active = true and expires_at > now())
    or public.is_admin()
  );

drop policy if exists redeem_codes_admin_write on public.redeem_codes;
create policy redeem_codes_admin_write
  on public.redeem_codes
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- user_code_redemptions
drop policy if exists user_code_redemptions_select_rule on public.user_code_redemptions;
create policy user_code_redemptions_select_rule
  on public.user_code_redemptions
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_code_redemptions_insert_rule on public.user_code_redemptions;
create policy user_code_redemptions_insert_rule
  on public.user_code_redemptions
  for insert
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_code_redemptions_delete_admin on public.user_code_redemptions;
create policy user_code_redemptions_delete_admin
  on public.user_code_redemptions
  for delete
  using (public.is_admin());

-- fansub_code_redemptions
drop policy if exists fansub_code_redemptions_select_rule on public.fansub_code_redemptions;
create policy fansub_code_redemptions_select_rule
  on public.fansub_code_redemptions
  for select
  using (public.is_admin() or public.is_fansub_admin(fansub_id));

drop policy if exists fansub_code_redemptions_insert_rule on public.fansub_code_redemptions;
create policy fansub_code_redemptions_insert_rule
  on public.fansub_code_redemptions
  for insert
  with check (public.is_admin() or public.is_fansub_admin(fansub_id));

drop policy if exists fansub_code_redemptions_delete_admin on public.fansub_code_redemptions;
create policy fansub_code_redemptions_delete_admin
  on public.fansub_code_redemptions
  for delete
  using (public.is_admin());

-- reading_history
drop policy if exists reading_history_select_own_or_admin on public.reading_history;
create policy reading_history_select_own_or_admin
  on public.reading_history
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists reading_history_insert_own_or_admin on public.reading_history;
create policy reading_history_insert_own_or_admin
  on public.reading_history
  for insert
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists reading_history_update_own_or_admin on public.reading_history;
create policy reading_history_update_own_or_admin
  on public.reading_history
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists reading_history_delete_own_or_admin on public.reading_history;
create policy reading_history_delete_own_or_admin
  on public.reading_history
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

-- manga_follows
drop policy if exists manga_follows_select_public on public.manga_follows;
create policy manga_follows_select_public
  on public.manga_follows
  for select
  using (true);

drop policy if exists manga_follows_insert_own_or_admin on public.manga_follows;
create policy manga_follows_insert_own_or_admin
  on public.manga_follows
  for insert
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists manga_follows_delete_own_or_admin on public.manga_follows;
create policy manga_follows_delete_own_or_admin
  on public.manga_follows
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

-- fansub_follows
drop policy if exists fansub_follows_select_public on public.fansub_follows;
create policy fansub_follows_select_public
  on public.fansub_follows
  for select
  using (true);

drop policy if exists fansub_follows_insert_own_or_admin on public.fansub_follows;
create policy fansub_follows_insert_own_or_admin
  on public.fansub_follows
  for insert
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists fansub_follows_delete_own_or_admin on public.fansub_follows;
create policy fansub_follows_delete_own_or_admin
  on public.fansub_follows
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

-- user_follows
drop policy if exists user_follows_select_public on public.user_follows;
create policy user_follows_select_public
  on public.user_follows
  for select
  using (true);

drop policy if exists user_follows_insert_own on public.user_follows;
create policy user_follows_insert_own
  on public.user_follows
  for insert
  with check (
    follower_id = public.current_public_user_id()
    and follower_id <> following_id
  );

drop policy if exists user_follows_delete_own_or_admin on public.user_follows;
create policy user_follows_delete_own_or_admin
  on public.user_follows
  for delete
  using (follower_id = public.current_public_user_id() or public.is_admin());

-- ============================================
-- Function grants
-- ============================================
grant execute on function public.get_fansubs_with_stats() to anon, authenticated;
grant execute on function public.get_genre_counts() to anon, authenticated;
grant execute on function public.update_user_displayed_badges(uuid, uuid[]) to authenticated;
grant execute on function public.purchase_store_item(uuid) to authenticated;
