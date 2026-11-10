-- Onboarding genre selection: stores favorite genres the user picks during onboarding
-- in the users table. Foundation for Explore/feed personalization and the profile
-- view. Additive + idempotent; existing rows get
-- an empty array ('{}'), so it is backward compatible.

alter table public.users
  add column if not exists preferred_genres text[] not null default '{}';

comment on column public.users.preferred_genres is
  'Onboarding sirasinda secilen favori tur slug listesi (bkz. QUICK_GENRES).';
