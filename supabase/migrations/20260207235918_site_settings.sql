-- Site ayarlari (genel + sidebar discord linki)

create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  site_title text not null default 'MangaZone'
    check (char_length(site_title) between 2 and 120),
  site_description text not null default 'Turkiyenin en iyi manga okuma platformu.'
    check (char_length(site_description) <= 300),
  contact_email text not null default 'iletisim@mangazone.com'
    check (contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  maintenance_mode boolean not null default false,
  registration_enabled boolean not null default true,
  discord_invite_url text not null default 'https://discord.gg/example'
    check (discord_invite_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at
  before update on public.site_settings
  for each row
  execute function public.set_updated_at();

alter table public.site_settings enable row level security;

drop policy if exists site_settings_select_public on public.site_settings;
create policy site_settings_select_public
  on public.site_settings
  for select
  using (true);

drop policy if exists site_settings_admin_write on public.site_settings;
create policy site_settings_admin_write
  on public.site_settings
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

insert into public.site_settings (
  id,
  site_title,
  site_description,
  contact_email,
  maintenance_mode,
  registration_enabled,
  discord_invite_url
)
values (
  1,
  'MangaZone',
  'Turkiyenin en iyi manga okuma platformu.',
  'iletisim@mangazone.com',
  false,
  true,
  'https://discord.gg/example'
)
on conflict (id) do nothing;
