-- Since admin comment moderation scans recent comment windows,
-- only created_at and is_active focused indexes are added here.
-- The goal is to open the recent window fast without downloading all comments.

create index if not exists community_comments_admin_created_idx
  on public.community_comments (created_at desc);

create index if not exists community_comments_admin_active_created_idx
  on public.community_comments (is_active, created_at desc);

create index if not exists manga_comments_admin_created_idx
  on public.manga_comments (created_at desc);

create index if not exists manga_comments_admin_active_created_idx
  on public.manga_comments (is_active, created_at desc);

create index if not exists user_manga_list_comments_admin_created_idx
  on public.user_manga_list_comments (created_at desc);

create index if not exists user_manga_list_comments_admin_active_created_idx
  on public.user_manga_list_comments (is_active, created_at desc);
