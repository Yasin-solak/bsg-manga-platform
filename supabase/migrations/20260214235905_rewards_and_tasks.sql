-- ============================================
-- MangaZone | Rewards and User Task System
-- Date: 2026-02-14
-- ============================================

begin;

-- ============================================
-- Monthly manga views (for fansub rewards)
-- ============================================
create table if not exists public.manga_monthly_views (
  month_start date not null,
  manga_id uuid not null references public.mangas(id) on delete cascade,
  fansub_id uuid references public.fansubs(id) on delete set null,
  views bigint not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (month_start, manga_id)
);

create index if not exists manga_monthly_views_month_fansub_idx
  on public.manga_monthly_views (month_start, fansub_id);

create index if not exists manga_monthly_views_fansub_month_idx
  on public.manga_monthly_views (fansub_id, month_start desc);

drop trigger if exists trg_manga_monthly_views_updated_at on public.manga_monthly_views;
create trigger trg_manga_monthly_views_updated_at
  before update on public.manga_monthly_views
  for each row
  execute function public.set_updated_at();

alter table public.manga_monthly_views enable row level security;

drop policy if exists manga_monthly_views_select_admin_or_fansub_staff on public.manga_monthly_views;
create policy manga_monthly_views_select_admin_or_fansub_staff
  on public.manga_monthly_views
  for select
  using (
    public.is_admin()
    or (fansub_id is not null and public.is_fansub_staff(fansub_id))
  );

drop policy if exists manga_monthly_views_admin_write on public.manga_monthly_views;
create policy manga_monthly_views_admin_write
  on public.manga_monthly_views
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.manga_monthly_views to authenticated;

-- ============================================
-- Fansub reward configuration
-- ============================================
create table if not exists public.fansub_reward_rank_rules (
  id uuid primary key default gen_random_uuid(),
  rank_position integer not null unique check (rank_position >= 1 and rank_position <= 20),
  coin_reward integer not null check (coin_reward >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fansub_reward_rank_rules_active_idx
  on public.fansub_reward_rank_rules (is_active, rank_position asc);

drop trigger if exists trg_fansub_reward_rank_rules_updated_at on public.fansub_reward_rank_rules;
create trigger trg_fansub_reward_rank_rules_updated_at
  before update on public.fansub_reward_rank_rules
  for each row
  execute function public.set_updated_at();

alter table public.fansub_reward_rank_rules enable row level security;

drop policy if exists fansub_reward_rank_rules_select_authenticated on public.fansub_reward_rank_rules;
create policy fansub_reward_rank_rules_select_authenticated
  on public.fansub_reward_rank_rules
  for select
  using (auth.role() = 'authenticated' or public.is_admin());

drop policy if exists fansub_reward_rank_rules_admin_write on public.fansub_reward_rank_rules;
create policy fansub_reward_rank_rules_admin_write
  on public.fansub_reward_rank_rules
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.fansub_reward_rank_rules to authenticated;

create table if not exists public.fansub_reward_view_tiers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  min_views bigint not null unique check (min_views > 0),
  coin_reward integer not null check (coin_reward >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fansub_reward_view_tiers_active_idx
  on public.fansub_reward_view_tiers (is_active, min_views asc);

drop trigger if exists trg_fansub_reward_view_tiers_updated_at on public.fansub_reward_view_tiers;
create trigger trg_fansub_reward_view_tiers_updated_at
  before update on public.fansub_reward_view_tiers
  for each row
  execute function public.set_updated_at();

alter table public.fansub_reward_view_tiers enable row level security;

drop policy if exists fansub_reward_view_tiers_select_authenticated on public.fansub_reward_view_tiers;
create policy fansub_reward_view_tiers_select_authenticated
  on public.fansub_reward_view_tiers
  for select
  using (auth.role() = 'authenticated' or public.is_admin());

drop policy if exists fansub_reward_view_tiers_admin_write on public.fansub_reward_view_tiers;
create policy fansub_reward_view_tiers_admin_write
  on public.fansub_reward_view_tiers
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.fansub_reward_view_tiers to authenticated;

-- ============================================
-- Fansub monthly reward runs/results
-- ============================================
create table if not exists public.fansub_monthly_reward_runs (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  run_by uuid references public.users(id) on delete set null,
  total_fansubs integer not null default 0,
  total_coin integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fansub_monthly_reward_runs_status_month_idx
  on public.fansub_monthly_reward_runs (status, month_start desc);

drop trigger if exists trg_fansub_monthly_reward_runs_updated_at on public.fansub_monthly_reward_runs;
create trigger trg_fansub_monthly_reward_runs_updated_at
  before update on public.fansub_monthly_reward_runs
  for each row
  execute function public.set_updated_at();

alter table public.fansub_monthly_reward_runs enable row level security;

drop policy if exists fansub_monthly_reward_runs_select_admin on public.fansub_monthly_reward_runs;
create policy fansub_monthly_reward_runs_select_admin
  on public.fansub_monthly_reward_runs
  for select
  using (public.is_admin());

drop policy if exists fansub_monthly_reward_runs_admin_write on public.fansub_monthly_reward_runs;
create policy fansub_monthly_reward_runs_admin_write
  on public.fansub_monthly_reward_runs
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.fansub_monthly_reward_runs to authenticated;
create table if not exists public.fansub_monthly_reward_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.fansub_monthly_reward_runs(id) on delete cascade,
  month_start date not null,
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  total_views bigint not null default 0,
  rank_position integer,
  rank_coin_reward integer not null default 0,
  tier_coin_reward integer not null default 0,
  total_coin_reward integer not null default 0,
  tier_labels text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique (run_id, fansub_id)
);

create index if not exists fansub_monthly_reward_results_run_idx
  on public.fansub_monthly_reward_results (run_id, total_coin_reward desc);

create index if not exists fansub_monthly_reward_results_fansub_month_idx
  on public.fansub_monthly_reward_results (fansub_id, month_start desc);

alter table public.fansub_monthly_reward_results enable row level security;

drop policy if exists fansub_monthly_reward_results_select_admin_or_own_staff on public.fansub_monthly_reward_results;
create policy fansub_monthly_reward_results_select_admin_or_own_staff
  on public.fansub_monthly_reward_results
  for select
  using (
    public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

drop policy if exists fansub_monthly_reward_results_admin_write on public.fansub_monthly_reward_results;
create policy fansub_monthly_reward_results_admin_write
  on public.fansub_monthly_reward_results
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.fansub_monthly_reward_results to authenticated;

-- ============================================
-- User reward tasks
-- ============================================
create table if not exists public.user_reward_tasks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  metric_key text not null
    check (
      metric_key in (
        'read_manga_count',
        'manga_follow_count',
        'fansub_follow_count',
        'rating_count',
        'manga_comment_count',
        'community_comment_count',
        'community_post_count',
        'total_comment_count'
      )
    ),
  target_value integer not null check (target_value > 0),
  coin_reward integer not null default 0 check (coin_reward >= 0),
  badge_id uuid references public.badges(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_reward_tasks_active_sort_idx
  on public.user_reward_tasks (is_active, sort_order asc, created_at asc);

drop trigger if exists trg_user_reward_tasks_updated_at on public.user_reward_tasks;
create trigger trg_user_reward_tasks_updated_at
  before update on public.user_reward_tasks
  for each row
  execute function public.set_updated_at();

alter table public.user_reward_tasks enable row level security;

drop policy if exists user_reward_tasks_select_authenticated on public.user_reward_tasks;
create policy user_reward_tasks_select_authenticated
  on public.user_reward_tasks
  for select
  using (auth.role() = 'authenticated' or public.is_admin());

drop policy if exists user_reward_tasks_admin_write on public.user_reward_tasks;
create policy user_reward_tasks_admin_write
  on public.user_reward_tasks
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.user_reward_tasks to authenticated;

create table if not exists public.user_reward_task_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  task_id uuid not null references public.user_reward_tasks(id) on delete cascade,
  credited_coin integer not null default 0,
  badge_id uuid references public.badges(id) on delete set null,
  claimed_at timestamptz not null default now(),
  unique (user_id, task_id)
);

create index if not exists user_reward_task_claims_user_claimed_idx
  on public.user_reward_task_claims (user_id, claimed_at desc);

alter table public.user_reward_task_claims enable row level security;

drop policy if exists user_reward_task_claims_select_own_or_admin on public.user_reward_task_claims;
create policy user_reward_task_claims_select_own_or_admin
  on public.user_reward_task_claims
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_reward_task_claims_insert_own_or_admin on public.user_reward_task_claims;
create policy user_reward_task_claims_insert_own_or_admin
  on public.user_reward_task_claims
  for insert
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_reward_task_claims_update_admin on public.user_reward_task_claims;
create policy user_reward_task_claims_update_admin
  on public.user_reward_task_claims
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists user_reward_task_claims_delete_admin on public.user_reward_task_claims;
create policy user_reward_task_claims_delete_admin
  on public.user_reward_task_claims
  for delete
  using (public.is_admin());

grant select, insert on table public.user_reward_task_claims to authenticated;

-- ============================================
-- Reward defaults
-- ============================================
insert into public.fansub_reward_rank_rules (rank_position, coin_reward, is_active)
values
  (1, 12000, true),
  (2, 9000, true),
  (3, 6500, true),
  (4, 4500, true),
  (5, 3000, true)
on conflict (rank_position)
do update set
  coin_reward = excluded.coin_reward,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.fansub_reward_view_tiers (label, min_views, coin_reward, is_active)
values
  ('10K Okunma', 10000, 1200, true),
  ('25K Okunma', 25000, 2500, true),
  ('50K Okunma', 50000, 6000, true),
  ('100K Okunma', 100000, 14000, true)
on conflict (min_views)
do update set
  label = excluded.label,
  coin_reward = excluded.coin_reward,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.badges (
  name,
  description,
  image_url,
  category,
  subcategory,
  price,
  rarity,
  is_active,
  target_type
)
values
  ('Gorev Avcisi I', 'Baslangic gorevlerini tamamlayan kullanicilar icin.', '/badges/reader_bronze.png', 'achievement', 'user_achievement', null, 'common', true, 'user'),
  ('Gorev Avcisi II', 'Orta seviye gorev ilerlemesi odulu.', '/badges/reader_silver.png', 'achievement', 'user_achievement', null, 'rare', true, 'user'),
  ('Gorev Avcisi III', 'Ileri seviye gorev tamamlayanlar icin.', '/badges/reader_gold.png', 'achievement', 'user_achievement', null, 'epic', true, 'user')
on conflict (name)
do update set
  description = excluded.description,
  image_url = excluded.image_url,
  category = excluded.category,
  subcategory = excluded.subcategory,
  price = excluded.price,
  rarity = excluded.rarity,
  is_active = excluded.is_active,
  target_type = excluded.target_type,
  updated_at = now();
insert into public.user_reward_tasks (
  slug,
  title,
  description,
  metric_key,
  target_value,
  coin_reward,
  badge_id,
  sort_order,
  is_active
)
values
  (
    'read-5-manga',
    '5 Manga Oku',
    'Farkli mangalardan en az 5 tanesini oku.',
    'read_manga_count',
    5,
    300,
    (select b.id from public.badges b where b.name = 'Gorev Avcisi I' limit 1),
    10,
    true
  ),
  (
    'follow-5-manga',
    '5 Manga Takip Et',
    'Takip listene 5 manga ekle.',
    'manga_follow_count',
    5,
    350,
    null,
    20,
    true
  ),
  (
    'write-10-comments',
    '10 Yorum Yap',
    'Manga ve toplulukta toplam 10 yorum yap.',
    'total_comment_count',
    10,
    550,
    (select b.id from public.badges b where b.name = 'Gorev Avcisi II' limit 1),
    30,
    true
  ),
  (
    'rate-5-manga',
    '5 Manga Degerlendir',
    'En az 5 manga puanla.',
    'rating_count',
    5,
    500,
    null,
    40,
    true
  ),
  (
    'post-3-community',
    '3 Topluluk Gonderisi',
    'Onaylanan en az 3 topluluk gonderisi paylas.',
    'community_post_count',
    3,
    900,
    (select b.id from public.badges b where b.name = 'Gorev Avcisi III' limit 1),
    50,
    true
  )
on conflict (slug)
do update set
  title = excluded.title,
  description = excluded.description,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  coin_reward = excluded.coin_reward,
  badge_id = excluded.badge_id,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

commit;
