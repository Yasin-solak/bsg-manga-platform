-- Completes keyset and trust access paths for admin user management queries.
-- Supabase migrations run in a transaction so CONCURRENTLY is deliberately not used.

create index if not exists security_events_trust_ban_target_created_idx
  on public.security_events (target_user_id, created_at desc)
  where target_user_id is not null
    and event_type = 'user_banned';

create index if not exists users_admin_management_created_id_idx
  on public.users (created_at desc, id desc);

create index if not exists users_admin_management_role_created_id_idx
  on public.users (role, created_at desc, id desc);
