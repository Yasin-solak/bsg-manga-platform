-- MangaZone: add a logo_url column to site_settings
-- This column holds the logo URL uploaded from the admin panel.
-- When empty (NULL) the static PNG fallback is used.

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN site_settings.logo_url IS 'Admin tarafindan yuklenen site logosu URL. NULL ise statik fallback kullanilir.';
