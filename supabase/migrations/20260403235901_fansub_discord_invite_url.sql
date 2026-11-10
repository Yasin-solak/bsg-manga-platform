alter table public.fansubs
  add column if not exists discord_invite_url text;
