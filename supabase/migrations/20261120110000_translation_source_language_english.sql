-- English as a translation source language (English scanlations translated into Turkish).
alter table public.translation_projects drop constraint translation_projects_source_language_check;
alter table public.translation_projects add constraint translation_projects_source_language_check
  check (source_language in ('ja', 'ko', 'zh', 'en'));

alter table public.translation_series_drafts drop constraint translation_series_drafts_source_language_check;
alter table public.translation_series_drafts add constraint translation_series_drafts_source_language_check
  check (source_language in ('ja', 'ko', 'zh', 'en'));

alter table public.translation_glossary drop constraint translation_glossary_source_language_check;
alter table public.translation_glossary add constraint translation_glossary_source_language_check
  check (source_language in ('ja', 'ko', 'zh', 'en'));
