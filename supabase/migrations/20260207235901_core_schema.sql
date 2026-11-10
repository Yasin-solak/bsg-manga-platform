-- ============================================
-- MangaZone | Supabase Core Schema (V2)
-- Date: 2026-02-07
-- ============================================
-- This migration gathers all core tables used in the application code
-- into one consistent data model.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================
-- Users
-- ============================================
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  username text not null,
  username_slug text not null,
  avatar_url text,
  bio text not null default '',
  level text not null default 'Yeni Uye',
  social_links jsonb not null default '[]'::jsonb,
  role text not null default 'user'
    check (role in ('user', 'admin', 'moderator')),
  stones integer not null default 0
    check (stones >= 0),
  owned_items jsonb not null default '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[]}'::jsonb,
  frame_type text not null default 'default',
  active_badge_id uuid,
  is_banned boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_username_slug_key on public.users (username_slug);
create unique index if not exists users_username_lower_key on public.users ((lower(username)));
create index if not exists users_role_idx on public.users (role);
create index if not exists users_is_active_idx on public.users (is_active);

-- ============================================
-- Fansubs
-- ============================================
create table if not exists public.fansubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  avatar_url text,
  description text,
  frame_type text not null default 'default',
  primary_color text,
  secondary_color text,
  coin_balance integer not null default 0
    check (coin_balance >= 0),
  manga_count bigint not null default 0,
  follower_count bigint not null default 0,
  active_frame_id uuid,
  active_background_id uuid,
  active_pattern_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fansubs_name_idx on public.fansubs (name);
create index if not exists fansubs_is_active_idx on public.fansubs (is_active);

-- ============================================
-- Store Items
-- ============================================
create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  identifier text not null,
  type text not null
    check (type in ('frame', 'badge', 'premium', 'pattern', 'background')),
  price integer not null
    check (price >= 0),
  original_price integer
    check (original_price is null or original_price >= 0),
  currency text not null default 'Coin'
    check (currency in ('TL', 'Coin')),
  image_key text,
  custom_asset_url text,
  is_active boolean not null default true,
  purchase_count integer not null default 0
    check (purchase_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, identifier)
);

create index if not exists store_items_type_idx on public.store_items (type);
create index if not exists store_items_is_active_idx on public.store_items (is_active);
create index if not exists store_items_purchase_count_idx on public.store_items (purchase_count desc);

-- ============================================
-- Badges
-- ============================================
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  image_url text not null,
  category text not null
    check (category in ('purchasable', 'achievement', 'event')),
  subcategory text
    check (
      subcategory is null
      or subcategory in ('vip', 'supporter', 'artist', 'reader', 'user_achievement', 'fansub_achievement', 'event')
    ),
  price integer
    check (price is null or price >= 0),
  rarity text not null default 'common'
    check (rarity in ('common', 'rare', 'epic', 'legendary')),
  is_active boolean not null default true,
  target_type text not null default 'user'
    check (target_type in ('user', 'fansub', 'both')),
  requirements jsonb,
  available_from timestamptz,
  available_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists badges_category_idx on public.badges (category);
create index if not exists badges_target_type_idx on public.badges (target_type);
create index if not exists badges_is_active_idx on public.badges (is_active);

-- users.active_badge_id -> badges.id
alter table public.users
  add constraint users_active_badge_id_fkey
  foreign key (active_badge_id) references public.badges(id) on delete set null;

-- fansubs active item refs -> store_items.id
alter table public.fansubs
  add constraint fansubs_active_frame_id_fkey
  foreign key (active_frame_id) references public.store_items(id) on delete set null;

alter table public.fansubs
  add constraint fansubs_active_background_id_fkey
  foreign key (active_background_id) references public.store_items(id) on delete set null;

alter table public.fansubs
  add constraint fansubs_active_pattern_id_fkey
  foreign key (active_pattern_id) references public.store_items(id) on delete set null;

-- ============================================
-- Manga / Chapter
-- ============================================
create table if not exists public.mangas (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid references public.fansubs(id) on delete set null,
  title text not null,
  slug text not null unique,
  cover_image_url text,
  description text,
  author text,
  artist text,
  status text not null default 'ongoing'
    check (status in ('ongoing', 'completed', 'hiatus')),
  rating numeric(3,2)
    check (rating is null or (rating >= 0 and rating <= 5)),
  total_ratings integer not null default 0
    check (total_ratings >= 0),
  total_views bigint not null default 0
    check (total_views >= 0),
  is_new boolean not null default false,
  is_approved boolean not null default false,
  is_active boolean not null default true,
  last_chapter_number numeric(8,2),
  genres text[] not null default '{}'::text[],
  original_lang text,
  release_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mangas_fansub_id_idx on public.mangas (fansub_id);
create index if not exists mangas_is_approved_idx on public.mangas (is_approved);
create index if not exists mangas_is_active_idx on public.mangas (is_active);
create index if not exists mangas_updated_at_idx on public.mangas (updated_at desc);
create index if not exists mangas_genres_gin_idx on public.mangas using gin (genres);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  manga_id uuid not null references public.mangas(id) on delete cascade,
  fansub_id uuid references public.fansubs(id) on delete set null,
  chapter_number numeric(8,2) not null
    check (chapter_number > 0),
  title text,
  pages jsonb not null default '[]'::jsonb,
  is_approved boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manga_id, chapter_number, fansub_id)
);

create index if not exists chapters_manga_id_idx on public.chapters (manga_id);
create index if not exists chapters_fansub_id_idx on public.chapters (fansub_id);
create index if not exists chapters_is_approved_idx on public.chapters (is_approved);
create index if not exists chapters_created_at_idx on public.chapters (created_at desc);

-- ============================================
-- Community
-- ============================================
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  category text,
  title text,
  body text,
  related_manga_id uuid references public.mangas(id) on delete set null,
  related_fansub_id uuid references public.fansubs(id) on delete set null,
  chapter_number integer,
  frame_type text,
  primary_color text,
  secondary_color text,
  is_verified boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  reject_reason text,
  likes_count bigint not null default 0,
  comments_count bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_author_id_idx on public.community_posts (author_id);
create index if not exists community_posts_status_idx on public.community_posts (status);
create index if not exists community_posts_category_idx on public.community_posts (category);
create index if not exists community_posts_is_active_idx on public.community_posts (is_active);
create index if not exists community_posts_created_at_idx on public.community_posts (created_at desc);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  parent_id uuid references public.community_comments(id) on delete cascade,
  body text not null,
  likes_count integer not null default 0,
  dislikes_count integer not null default 0,
  is_pinned boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_comments_post_id_idx on public.community_comments (post_id);
create index if not exists community_comments_author_id_idx on public.community_comments (author_id);
create index if not exists community_comments_parent_id_idx on public.community_comments (parent_id);
create index if not exists community_comments_is_active_idx on public.community_comments (is_active);

create table if not exists public.manga_comments (
  id uuid primary key default gen_random_uuid(),
  manga_id uuid not null references public.mangas(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  parent_id uuid references public.manga_comments(id) on delete cascade,
  content text not null,
  likes integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manga_comments_manga_id_idx on public.manga_comments (manga_id);
create index if not exists manga_comments_user_id_idx on public.manga_comments (user_id);
create index if not exists manga_comments_parent_id_idx on public.manga_comments (parent_id);
create index if not exists manga_comments_is_active_idx on public.manga_comments (is_active);

-- ============================================
-- Fansub relations and economy
-- ============================================
create table if not exists public.fansub_members (
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'moderator', 'member')),
  created_at timestamptz not null default now(),
  primary key (fansub_id, user_id)
);

create unique index if not exists fansub_members_single_admin_idx
  on public.fansub_members (fansub_id)
  where role = 'admin';
create index if not exists fansub_members_user_id_idx on public.fansub_members (user_id);

create table if not exists public.fansub_inventory (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  store_item_id uuid not null references public.store_items(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  acquired_by uuid references public.users(id) on delete set null,
  unique (fansub_id, store_item_id)
);

create index if not exists fansub_inventory_store_item_id_idx on public.fansub_inventory (store_item_id);

create table if not exists public.fansub_transactions (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  amount integer not null,
  type text not null
    check (type in ('redeem', 'purchase', 'reward_view', 'reward_rank', 'system')),
  description text not null,
  related_item_id uuid references public.store_items(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fansub_transactions_fansub_id_idx on public.fansub_transactions (fansub_id);
create index if not exists fansub_transactions_created_at_idx on public.fansub_transactions (created_at desc);

create table if not exists public.redeem_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  value integer not null
    check (value > 0),
  max_uses integer not null default 1
    check (max_uses > 0),
  used_count integer not null default 0
    check (used_count >= 0),
  expires_at timestamptz not null,
  target_type text not null default 'both'
    check (target_type in ('user', 'fansub', 'both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists redeem_codes_is_active_idx on public.redeem_codes (is_active);
create index if not exists redeem_codes_expires_at_idx on public.redeem_codes (expires_at);

create table if not exists public.user_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_id uuid not null references public.redeem_codes(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (user_id, code_id)
);

create index if not exists user_code_redemptions_code_id_idx on public.user_code_redemptions (code_id);

create table if not exists public.fansub_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  code_id uuid not null references public.redeem_codes(id) on delete cascade,
  redeemed_by uuid,
  redeemed_at timestamptz not null default now(),
  unique (fansub_id, code_id)
);

create index if not exists fansub_code_redemptions_code_id_idx on public.fansub_code_redemptions (code_id);

-- ============================================
-- Notifications and moderation
-- ============================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null
    check (type in ('badge_earned', 'badge_purchased', 'level_up', 'follow', 'comment', 'mention', 'system')),
  title text not null,
  message text,
  icon text,
  data jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where is_read = false;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null,
  target_type text not null
    check (target_type in ('post', 'comment', 'manga_comment')),
  reason text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  unique (reporter_id, target_id, target_type)
);

create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_target_idx on public.reports (target_type, target_id);

-- ============================================
-- Badge ownership
-- ============================================
create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  obtained_at timestamptz not null default now(),
  is_displayed boolean not null default false,
  display_order integer not null default 0
    check (display_order >= 0 and display_order <= 3),
  unique (user_id, badge_id)
);

create index if not exists user_badges_user_display_idx on public.user_badges (user_id, is_displayed, display_order);

create table if not exists public.fansub_badges (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  obtained_at timestamptz not null default now(),
  is_displayed boolean not null default false,
  display_order integer not null default 0
    check (display_order >= 0 and display_order <= 3),
  unique (fansub_id, badge_id)
);

create index if not exists fansub_badges_fansub_display_idx on public.fansub_badges (fansub_id, is_displayed, display_order);

-- ============================================
-- Follow and history tables
-- ============================================
create table if not exists public.reading_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  manga_id uuid not null references public.mangas(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  chapter_number numeric(8,2),
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, manga_id)
);

create index if not exists reading_history_user_read_at_idx on public.reading_history (user_id, read_at desc);
create index if not exists reading_history_manga_idx on public.reading_history (manga_id);

create table if not exists public.manga_follows (
  user_id uuid not null references public.users(id) on delete cascade,
  manga_id uuid not null references public.mangas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, manga_id)
);

create index if not exists manga_follows_manga_id_idx on public.manga_follows (manga_id);

create table if not exists public.fansub_follows (
  user_id uuid not null references public.users(id) on delete cascade,
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, fansub_id)
);

create index if not exists fansub_follows_fansub_id_idx on public.fansub_follows (fansub_id);

create table if not exists public.user_follows (
  follower_id uuid not null references public.users(id) on delete cascade,
  following_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists user_follows_following_idx on public.user_follows (following_id);

-- ============================================
-- updated_at triggers
-- ============================================
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users',
    'fansubs',
    'store_items',
    'badges',
    'mangas',
    'chapters',
    'community_posts',
    'community_comments',
    'manga_comments'
  ]
  loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%s', table_name, table_name);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%s for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;
