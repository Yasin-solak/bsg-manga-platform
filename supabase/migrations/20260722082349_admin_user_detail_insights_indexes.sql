-- Speeds up the user-targeted moderation timeline in the detail window.
-- CONCURRENTLY is deliberately not used for SQL Editor transaction compatibility.

create index if not exists audit_logs_admin_user_target_created_idx
  on public.audit_logs (resource_id, created_at desc)
  where resource_type = 'user' and resource_id is not null;

create index if not exists reports_admin_user_target_created_idx
  on public.reports (target_id, created_at desc)
  where target_type = 'user';
