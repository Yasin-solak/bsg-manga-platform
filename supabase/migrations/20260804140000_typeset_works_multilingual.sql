-- Makes typesetting work MULTI-LANGUAGE.
--
-- **Core split: geometry is language independent.** A balloon polygon is drawn
-- once; only the text inside changes. Nesting them would make the same
-- page's second language need balloons redrawn too.
--
-- `translations` shape: { "tr": { "<balloon-id>": "text" }, "en": { ... } }
--
-- **The source language is NOT a special field, just another key.** If the original
-- English text sits under `en` a later language can translate FROM it;
-- translating from Turkish would accumulate relay errors. A special `source_text`
-- column does the same job but needs another schema change when a third language
-- arrives.
--
-- Text now lives HERE; text in `bubbles` stays for old records
-- as backward compatibility.

alter table public.admin_typeset_works
  add column if not exists translations jsonb not null default '{}'::jsonb,
  add column if not exists primary_language text not null default 'tr';

comment on column public.admin_typeset_works.translations is
  'Dil -> (balon id -> metin). Geometri dilden bagimsiz oldugu icin balonlardan ayri tutulur.';

-- Existing work must not be lost: current text moves under `tr`.
-- `jsonb_object_agg` returns NULL for an empty set; without coalesce translations
-- goes NULL and breaks the not-null constraint.
update public.admin_typeset_works
set translations = jsonb_build_object(
  'tr',
  coalesce(
    (
      select jsonb_object_agg(bubble->>'id', bubble->>'text')
      from jsonb_array_elements(bubbles) as bubble
      where coalesce(bubble->>'text', '') <> ''
    ),
    '{}'::jsonb
  )
)
where translations = '{}'::jsonb
  and jsonb_typeof(bubbles) = 'array'
  and jsonb_array_length(bubbles) > 0;

-- To ask which languages a page is ready in.
create index if not exists admin_typeset_works_translations_idx
  on public.admin_typeset_works using gin (translations);
