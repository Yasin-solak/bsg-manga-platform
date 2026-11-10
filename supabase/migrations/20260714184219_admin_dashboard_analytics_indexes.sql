-- Supports period and open queue queries of the dashboard read model.
-- CONCURRENTLY is not used for Supabase migration and SQL Editor transaction compatibility.
-- On live apply in a low traffic window.

create index if not exists users_admin_dashboard_created_at_idx
  on public.users (created_at desc);

create index if not exists fansubs_admin_dashboard_created_at_idx
  on public.fansubs (created_at desc);

create index if not exists mangas_admin_dashboard_created_at_idx
  on public.mangas (created_at desc);

create index if not exists reports_admin_dashboard_created_at_idx
  on public.reports (created_at desc);

create index if not exists fansub_requests_admin_dashboard_created_at_idx
  on public.fansub_requests (created_at desc);

create index if not exists pending_content_revisions_admin_dashboard_created_at_idx
  on public.pending_content_revisions (created_at desc);

create index if not exists mangas_admin_dashboard_pending_created_at_idx
  on public.mangas (created_at desc)
  where is_approved = false;

create index if not exists chapters_admin_dashboard_pending_created_at_idx
  on public.chapters (created_at desc)
  where is_approved = false;

create index if not exists community_posts_admin_dashboard_pending_created_at_idx
  on public.community_posts (created_at desc)
  where status = 'pending';

create index if not exists reports_admin_dashboard_pending_created_at_idx
  on public.reports (created_at desc)
  where status = 'pending';

create index if not exists legal_requests_admin_dashboard_open_created_at_idx
  on public.legal_requests (created_at desc)
  where status in ('new', 'needs_info', 'under_review');
