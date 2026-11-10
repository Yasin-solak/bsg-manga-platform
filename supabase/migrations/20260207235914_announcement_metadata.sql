-- Announcement metadata fields: category, text color, text animation and action link.

alter table public.community_posts
  add column if not exists announcement_category text,
  add column if not exists announcement_text_color text,
  add column if not exists announcement_text_animation text,
  add column if not exists announcement_action_label text,
  add column if not exists announcement_action_url text;

alter table public.community_posts
  alter column announcement_category set default 'Genel',
  alter column announcement_text_color set default '#FFF8E1',
  alter column announcement_text_animation set default 'marquee';

update public.community_posts
set
  announcement_category = coalesce(announcement_category, 'Genel'),
  announcement_text_color = coalesce(announcement_text_color, '#FFF8E1'),
  announcement_text_animation = coalesce(announcement_text_animation, 'marquee')
where category = 'Duyuru';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_posts_announcement_text_animation_check'
  ) then
    alter table public.community_posts
      add constraint community_posts_announcement_text_animation_check
      check (
        announcement_text_animation is null
        or announcement_text_animation in ('marquee', 'pulse', 'blink', 'slide', 'none')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_posts_announcement_text_color_check'
  ) then
    alter table public.community_posts
      add constraint community_posts_announcement_text_color_check
      check (
        announcement_text_color is null
        or announcement_text_color ~ '^#[0-9A-Fa-f]{6}$'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_posts_announcement_action_url_check'
  ) then
    alter table public.community_posts
      add constraint community_posts_announcement_action_url_check
      check (
        announcement_action_url is null
        or announcement_action_url ~ '^(https?://|/).+'
      );
  end if;
end $$;

create index if not exists community_posts_announcement_category_idx
  on public.community_posts (announcement_category)
  where category = 'Duyuru';
