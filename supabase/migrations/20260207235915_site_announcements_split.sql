-- Announcement and community split: site announcements moved to a separate table.

create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 3000),
  category text not null default 'Genel',
  primary_color text not null default '#FFD600' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#C62828' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color text not null default '#FFF8E1' check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_animation text not null default 'marquee' check (text_animation in ('marquee', 'pulse', 'blink', 'slide', 'none')),
  action_label text check (action_label is null or char_length(action_label) <= 30),
  action_url text check (action_url is null or action_url ~ '^(https?://|/).+'),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_announcements_active_idx
  on public.site_announcements (is_active, published_at desc, created_at desc);

create index if not exists site_announcements_category_idx
  on public.site_announcements (category, is_active, published_at desc);

drop trigger if exists trg_site_announcements_updated_at on public.site_announcements;
create trigger trg_site_announcements_updated_at
  before update on public.site_announcements
  for each row
  execute function public.set_updated_at();

alter table public.site_announcements enable row level security;

drop policy if exists site_announcements_select_public on public.site_announcements;
create policy site_announcements_select_public
  on public.site_announcements
  for select
  using (is_active = true or public.is_admin());

drop policy if exists site_announcements_admin_write on public.site_announcements;
create policy site_announcements_admin_write
  on public.site_announcements
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.site_announcements to anon, authenticated;
grant insert, update, delete on public.site_announcements to authenticated;

-- Moves existing announcement records to the new table once.
insert into public.site_announcements (
  title,
  body,
  category,
  primary_color,
  secondary_color,
  text_color,
  text_animation,
  action_label,
  action_url,
  is_active,
  created_by,
  updated_by,
  published_at,
  created_at,
  updated_at
)
select
  n.title,
  n.body,
  n.category,
  n.primary_color,
  n.secondary_color,
  n.text_color,
  n.text_animation,
  n.action_label,
  n.action_url,
  n.is_active,
  n.created_by,
  n.updated_by,
  n.published_at,
  n.created_at,
  n.updated_at
from public.community_posts cp
cross join lateral (
  select
    case
      when char_length(trim(coalesce(cp.title, ''))) >= 2 then left(trim(cp.title), 120)
      when char_length(trim(coalesce(cp.title, ''))) = 1 then left(trim(cp.title) || ' ', 120)
      else 'Duyuru'
    end as title,
    case
      when char_length(trim(coalesce(cp.body, ''))) >= 2 then left(trim(cp.body), 3000)
      when char_length(trim(coalesce(cp.body, ''))) = 1 then left(trim(cp.body) || ' ', 3000)
      when char_length(trim(coalesce(cp.title, ''))) >= 2 then left(trim(cp.title), 3000)
      when char_length(trim(coalesce(cp.title, ''))) = 1 then left(trim(cp.title) || ' duyurusu', 3000)
      else 'Duyuru metni'
    end as body,
    left(coalesce(nullif(trim(cp.announcement_category), ''), 'Genel'), 32) as category,
    case
      when coalesce(cp.primary_color, '') ~ '^#[0-9A-Fa-f]{6}$' then cp.primary_color
      else '#FFD600'
    end as primary_color,
    case
      when coalesce(cp.secondary_color, '') ~ '^#[0-9A-Fa-f]{6}$' then cp.secondary_color
      else '#C62828'
    end as secondary_color,
    case
      when coalesce(cp.announcement_text_color, '') ~ '^#[0-9A-Fa-f]{6}$' then cp.announcement_text_color
      else '#FFF8E1'
    end as text_color,
    case
      when cp.announcement_text_animation in ('marquee', 'pulse', 'blink', 'slide', 'none') then cp.announcement_text_animation
      else 'marquee'
    end as text_animation,
    case
      when cp.announcement_action_label is null then null
      when trim(cp.announcement_action_label) = '' then null
      else left(trim(cp.announcement_action_label), 30)
    end as action_label,
    case
      when cp.announcement_action_url is null then null
      when trim(cp.announcement_action_url) ~ '^(https?://|/).+' then trim(cp.announcement_action_url)
      else null
    end as action_url,
    cp.is_active,
    coalesce(cp.approved_by, cp.author_id) as created_by,
    coalesce(cp.approved_by, cp.author_id) as updated_by,
    coalesce(cp.approved_at, cp.created_at) as published_at,
    cp.created_at,
    cp.updated_at
) as n
where cp.category = 'Duyuru'
  and cp.status = 'approved'
  and cp.is_active = true
  and not exists (
    select 1
    from public.site_announcements sa
    where sa.title = n.title
      and sa.body = n.body
      and sa.published_at = n.published_at
  );
