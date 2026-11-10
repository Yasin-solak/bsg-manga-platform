begin;

alter table public.users
  add column if not exists onboarding_completed_at timestamptz;

-- SQL Editor oturumunda auth baglami olmadigi icin users koruma trigger'i
-- toplu backfill update'ini engelleyebilir. Varsa gecici kapatip sonra geri ac.
do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_users_prevent_non_admin_sensitive_updates'
      and tgrelid = 'public.users'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.users disable trigger trg_users_prevent_non_admin_sensitive_updates';
  end if;
end;
$$;

update public.users
set onboarding_completed_at = coalesce(onboarding_completed_at, created_at)
where onboarding_completed_at is null;

do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_users_prevent_non_admin_sensitive_updates'
      and tgrelid = 'public.users'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.users enable trigger trg_users_prevent_non_admin_sensitive_updates';
  end if;
end;
$$;

commit;
