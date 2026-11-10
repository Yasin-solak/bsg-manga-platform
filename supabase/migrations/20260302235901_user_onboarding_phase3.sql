alter table public.users
  add column if not exists onboarding_completed_at timestamptz;

-- The SQL Editor and migration session may have no auth context.
-- Apply the backfill step once without tripping the guarding users trigger.
alter table public.users
  disable trigger trg_users_prevent_non_admin_sensitive_updates;

update public.users
set onboarding_completed_at = coalesce(onboarding_completed_at, created_at)
where onboarding_completed_at is null;

alter table public.users
  enable trigger trg_users_prevent_non_admin_sensitive_updates;
