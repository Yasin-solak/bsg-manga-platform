-- BSG Manga | Site settings rebrand defaults

alter table public.site_settings
  alter column site_title set default 'BSG Manga';

alter table public.site_settings
  alter column contact_email set default 'iletisim@bsgmanga.com';

update public.site_settings
set
  site_title = 'BSG Manga',
  contact_email = 'iletisim@bsgmanga.com',
  updated_at = now()
where id = 1
  and (
    coalesce(site_title, '') = 'MangaZone'
    or coalesce(contact_email, '') = 'iletisim@mangazone.com'
  );
