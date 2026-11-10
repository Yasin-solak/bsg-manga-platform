-- Chapter page dimensions (for space reservation).
--
-- Goal: the reader can reserve the right height for each page BEFORE images
-- load. Without a reservation the strip jumps at each image and
-- the read line shifts during auto scroll.
--
-- Design decisions:
-- * ADDITIONAL and NULLABLE: the `pages` jsonb shape DOES NOT CHANGE. Old chapters stay
-- null; the reader then measures the ratio from the image (current behavior).
-- * Not an array but a REF-KEYED dictionary: {"<page-ref>": {"w":1200,"h":1800}}.
-- With an array page add/delete/sort would shift dimensions to the wrong
-- pages; a wrong reservation is worse than none.
-- In a ref key an unknown page is just "unknown".
-- * NO new RLS policy: existing chapters policies cover this column too.
-- (the app_private wrapper rule does not apply here; no policy/default
-- is added.)

alter table public.chapters
  add column if not exists page_dimensions jsonb;

comment on column public.chapters.page_dimensions is
  'Sayfa en-boy bilgisi, sayfa referansiyla anahtarlanmis: {"<page-ref>":{"w":1200,"h":1800}}. Null/eksik = bilinmiyor; okuyucu orani gorselden olcer. Yalnizca yer ayirma (layout shift) icin kullanilir.';

-- Nothing but a dictionary must be written (no array/scalar): sanitized on the
-- client, pinned here at database level too.
alter table public.chapters
  drop constraint if exists chapters_page_dimensions_is_object;

alter table public.chapters
  add constraint chapters_page_dimensions_is_object
  check (page_dimensions is null or jsonb_typeof(page_dimensions) = 'object');
