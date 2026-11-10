-- Stores the user's active background preference.
-- Applied to the live project outside the repo; restored here so a fresh install matches.
alter table public.users
  add column if not exists background_type text default null;
