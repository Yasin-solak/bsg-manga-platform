-- Translation Studio V3: fansub-facing design (handoff "Ceviri Studyosu v3").
-- Flow: series -> chapter -> upload -> scan -> edit -> publish.
-- Coordinates everywhere are the page NATURAL pixels (bbox x,y,w,h).
-- Raw text, translation, style, cleanup strokes and positions are durable in the DB.
-- V2 (studio_*) tables are not touched; removal is in a separate migration.

-- ---------------------------------------------------------------------------
-- Yardimcilar
-- ---------------------------------------------------------------------------

create or replace function app_private.tl_language_valid(p_language text)
returns boolean language sql immutable set search_path = '' as $function$
  select p_language is not null
    and pg_catalog.length(p_language) between 2 and 35
    and p_language ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$';
$function$;

-- Style contract: known keys only, reasonable ranges.
create or replace function app_private.tl_style_valid(p_style jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
begin
  if p_style is null or pg_catalog.jsonb_typeof(p_style) <> 'object' then return false; end if;
  if p_style - 'font' - 'size' - 'lineHeight' - 'letterSpacing' - 'align'
    - 'color' - 'stroke' - 'strokeColor' - 'strokeWidth' - 'italic' <> '{}'::jsonb then
    return false;
  end if;
  if p_style ? 'font' and (pg_catalog.jsonb_typeof(p_style->'font') <> 'string'
    or pg_catalog.length(p_style->>'font') not between 1 and 64) then return false; end if;
  if p_style ? 'size' and (pg_catalog.jsonb_typeof(p_style->'size') <> 'number'
    or (p_style->>'size')::numeric not between 4 and 400) then return false; end if;
  if p_style ? 'lineHeight' and (pg_catalog.jsonb_typeof(p_style->'lineHeight') <> 'number'
    or (p_style->>'lineHeight')::numeric not between 0.5 and 3) then return false; end if;
  if p_style ? 'letterSpacing' and (pg_catalog.jsonb_typeof(p_style->'letterSpacing') <> 'number'
    or (p_style->>'letterSpacing')::numeric not between -20 and 50) then return false; end if;
  if p_style ? 'align' and coalesce(p_style->>'align', '') not in ('left', 'center', 'right') then
    return false;
  end if;
  if p_style ? 'color' and coalesce(p_style->>'color', '') !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  if p_style ? 'strokeColor' and coalesce(p_style->>'strokeColor', '') !~ '^#[0-9a-fA-F]{6}$' then
    return false;
  end if;
  if p_style ? 'strokeWidth' and (pg_catalog.jsonb_typeof(p_style->'strokeWidth') <> 'number'
    or (p_style->>'strokeWidth')::numeric not between 0 and 40) then return false; end if;
  if p_style ? 'stroke' and pg_catalog.jsonb_typeof(p_style->'stroke') <> 'boolean' then return false; end if;
  if p_style ? 'italic' and pg_catalog.jsonb_typeof(p_style->'italic') <> 'boolean' then return false; end if;
  return true;
end;
$function$;

-- Font onerisi: {font, size, reason}
create or replace function app_private.tl_font_suggestion_valid(p jsonb)
returns boolean language sql immutable set search_path = '' as $function$
  select p is null or (
    pg_catalog.jsonb_typeof(p) = 'object'
    and p - 'font' - 'size' - 'reason' = '{}'::jsonb
    and pg_catalog.jsonb_typeof(p->'font') = 'string'
    and pg_catalog.length(p->>'font') between 1 and 64
    and pg_catalog.jsonb_typeof(p->'size') = 'number'
    and (p->>'size')::numeric between 4 and 400
    and (not p ? 'reason' or (pg_catalog.jsonb_typeof(p->'reason') = 'string'
      and pg_catalog.length(p->>'reason') <= 200))
  );
$function$;

-- Cleanup stroke: [{tool:'firca'|'onarim'|'silgi', color?, radius, points:[{x,y}]}]
create or replace function app_private.tl_strokes_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
declare
  v_stroke jsonb;
  v_point jsonb;
begin
  if p is null or pg_catalog.jsonb_typeof(p) <> 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p) > 2000 or pg_catalog.octet_length(p::text) > 2097152 then
    return false;
  end if;
  for v_stroke in select value from pg_catalog.jsonb_array_elements(p) loop
    if pg_catalog.jsonb_typeof(v_stroke) <> 'object'
      or v_stroke - 'tool' - 'color' - 'radius' - 'points' <> '{}'::jsonb
      or coalesce(v_stroke->>'tool', '') not in ('firca', 'onarim', 'silgi')
      or pg_catalog.jsonb_typeof(v_stroke->'radius') is distinct from 'number'
      or (v_stroke->>'radius')::numeric not between 1 and 200
      or (v_stroke ? 'color' and coalesce(v_stroke->>'color', '') !~ '^#[0-9a-fA-F]{6}$')
      or pg_catalog.jsonb_typeof(v_stroke->'points') is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_stroke->'points') not between 1 and 4096 then
      return false;
    end if;
    for v_point in select value from pg_catalog.jsonb_array_elements(v_stroke->'points') loop
      if pg_catalog.jsonb_typeof(v_point->'x') is distinct from 'number'
        or pg_catalog.jsonb_typeof(v_point->'y') is distinct from 'number' then return false; end if;
    end loop;
  end loop;
  return true;
end;
$function$;

-- Free area (lasso) polygon; optional with bbox.
create or replace function app_private.tl_polygon_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
declare
  v_point jsonb;
begin
  if p is null then return true; end if;
  if pg_catalog.jsonb_typeof(p) <> 'array' or pg_catalog.jsonb_array_length(p) not between 3 and 256 then
    return false;
  end if;
  for v_point in select value from pg_catalog.jsonb_array_elements(p) loop
    if pg_catalog.jsonb_typeof(v_point->'x') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_point->'y') is distinct from 'number'
      or (v_point->>'x')::numeric < 0 or (v_point->>'y')::numeric < 0 then return false; end if;
  end loop;
  return true;
end;
$function$;

-- Erisim: site admini ya da fansub admin/moderatoru; ozellik bayragi arkasinda.
create or replace function app_private.tl_can_fansub(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.is_admin()
    or (app_private.is_feature_enabled('translation.studio_v3', false)
      and app_private.is_fansub_staff(p_fansub_id));
$function$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A draft a fansub opens for a series not on the site; tied to mangas on admin approval.
create table public.translation_series_drafts (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 200),
  original_title text check (original_title is null or pg_catalog.length(original_title) <= 200),
  source_language text not null check (source_language in ('ja', 'ko', 'zh')),
  genres text[] not null default '{}' check (pg_catalog.cardinality(genres) <= 12),
  cover_object_key text check (cover_object_key is null or pg_catalog.length(cover_object_key) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  manga_id uuid references public.mangas(id) on delete set null,
  created_by uuid references public.users(id) on delete set null default app_private.current_public_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_series_drafts_approved_check check (status <> 'approved' or manga_id is not null)
);

create index translation_series_drafts_fansub_idx on public.translation_series_drafts (fansub_id, created_at desc);

create table public.translation_projects (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  manga_id uuid references public.mangas(id) on delete restrict,
  series_draft_id uuid references public.translation_series_drafts(id) on delete restrict,
  chapter_number numeric(8,2) not null check (chapter_number > 0),
  chapter_title text check (chapter_title is null or pg_catalog.length(chapter_title) <= 200),
  source_language text not null check (source_language in ('ja', 'ko', 'zh')),
  target_language text not null default 'tr' check (app_private.tl_language_valid(target_language)),
  -- Wizard step: the user returns to unfinished work from here ("Basla" screen).
  stage text not null default 'upload'
    check (stage in ('upload', 'scan', 'edit', 'publish', 'scheduled', 'published', 'archived')),
  publish_at timestamptz,
  chapter_id uuid references public.chapters(id) on delete set null,
  version bigint not null default 1 check (version > 0),
  created_by uuid references public.users(id) on delete set null default app_private.current_public_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_projects_series_check check ((manga_id is null) <> (series_draft_id is null)),
  constraint translation_projects_schedule_check check (stage <> 'scheduled' or publish_at is not null)
);

create unique index translation_projects_manga_unique
  on public.translation_projects (fansub_id, manga_id, chapter_number) where manga_id is not null;
create unique index translation_projects_draft_unique
  on public.translation_projects (fansub_id, series_draft_id, chapter_number) where series_draft_id is not null;
create index translation_projects_fansub_updated_idx on public.translation_projects (fansub_id, updated_at desc);

create table public.translation_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.translation_projects(id) on delete cascade,
  page_index integer not null check (page_index between 0 and 999),
  file_name text check (file_name is null or pg_catalog.length(file_name) <= 255),
  raw_status text not null default 'empty' check (raw_status in ('empty', 'pending', 'ready')),
  raw_object_key text,
  raw_sha256 text check (raw_sha256 is null or raw_sha256 ~ '^[0-9a-f]{64}$'),
  raw_mime_type text check (raw_mime_type is null or raw_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  raw_byte_size bigint check (raw_byte_size is null or raw_byte_size between 1 and 33554432),
  width integer check (width is null or width between 1 and 20000),
  height integer check (height is null or height between 1 and 100000),
  -- Otomatik temizlenmis taban (beyaz dolgu + onarim) ayri nesnedir; raw degismez.
  clean_object_key text,
  clean_sha256 text check (clean_sha256 is null or clean_sha256 ~ '^[0-9a-f]{64}$'),
  -- Tara adimi: yuklendi -> alanlar -> ocr -> oneri -> temiz.
  scan_stage text not null default 'none'
    check (scan_stage in ('none', 'uploaded', 'detected', 'read', 'suggested', 'cleaned', 'failed')),
  scan_error text check (scan_error is null or pg_catalog.length(scan_error) <= 500),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_pages_order_unique unique (project_id, page_index) deferrable initially immediate,
  constraint translation_pages_raw_check check (
    (raw_status = 'empty' and raw_object_key is null and raw_sha256 is null and raw_mime_type is null
      and raw_byte_size is null and width is null and height is null)
    or (raw_status in ('pending', 'ready') and raw_object_key is not null and raw_sha256 is not null
      and raw_mime_type is not null and raw_byte_size is not null and width is not null and height is not null
      and width::bigint * height::bigint <= 100000000)
  )
);

create index translation_pages_project_idx on public.translation_pages (project_id, page_index);

-- Oge (alan): balon / anlatim / sfx / tabela. shape gorseldeki sekildir, turden bagimsiz.
create table public.translation_items (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.translation_pages(id) on delete cascade,
  type text not null check (type in ('balon', 'anlatim', 'sfx', 'tabela')),
  shape text not null default 'yok' check (shape in ('elips', 'kutu', 'yok')),
  bbox_x integer not null check (bbox_x >= 0),
  bbox_y integer not null check (bbox_y >= 0),
  bbox_w integer not null check (bbox_w between 1 and 20000),
  bbox_h integer not null check (bbox_h between 1 and 100000),
  polygon jsonb check (app_private.tl_polygon_valid(polygon)),
  rotation numeric(6,2) not null default 0 check (rotation between -180 and 180),
  reading_order integer not null default 0 check (reading_order >= 0),
  source_text text not null default '' check (pg_catalog.length(source_text) <= 5000),
  source_origin text not null default 'manual' check (source_origin in ('ocr', 'manual')),
  ocr_confidence numeric(5,4) check (ocr_confidence between 0 and 1),
  -- Size of the original text on the raw; for cleanup and placement scale.
  source_font_size numeric(6,2) check (source_font_size is null or source_font_size between 1 and 1000),
  manual boolean not null default false,
  cleanup text not null default 'beyaz' check (cleanup in ('beyaz', 'onarim')),
  style jsonb not null default '{}'::jsonb check (app_private.tl_style_valid(style)),
  font_suggestion jsonb check (app_private.tl_font_suggestion_valid(font_suggestion)),
  detection_key text check (detection_key is null or pg_catalog.length(detection_key) between 1 and 128),
  version bigint not null default 1 check (version > 0),
  source_version bigint not null default 1 check (source_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_items_detection_unique unique (page_id, detection_key)
);

create index translation_items_page_order_idx on public.translation_items (page_id, reading_order, id);

-- Current text for item + language. TR is the team translation; other languages generate automatically for readers.
create table public.translation_item_texts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.translation_items(id) on delete cascade,
  language text not null check (app_private.tl_language_valid(language)),
  text text not null default '' check (pg_catalog.length(text) <= 10000),
  status text not null check (status in ('eksik', 'oneri', 'onayli')),
  origin text not null check (origin in ('machine', 'human')),
  provider text check (provider is null or pg_catalog.length(provider) between 1 and 60),
  model text check (model is null or pg_catalog.length(model) between 1 and 120),
  source_version bigint not null check (source_version > 0),
  version bigint not null default 1 check (version > 0),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_item_texts_language_unique unique (item_id, language),
  constraint translation_item_texts_origin_status_check check (
    (origin = 'machine' and status <> 'onayli' and provider is not null and model is not null)
    or origin = 'human'
  )
);

create index translation_item_texts_language_idx on public.translation_item_texts (language, status);

-- Translation candidates: several models produce candidates for one item; a cheap model drafts, a pricey one gives alternatives.
create table public.translation_suggestions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.translation_items(id) on delete cascade,
  language text not null check (app_private.tl_language_valid(language)),
  rank smallint not null check (rank between 0 and 9),
  text text not null check (pg_catalog.length(text) between 1 and 10000),
  provider text not null check (pg_catalog.length(provider) between 1 and 60),
  model text not null check (pg_catalog.length(model) between 1 and 120),
  source_version bigint not null check (source_version > 0),
  created_at timestamptz not null default now(),
  constraint translation_suggestions_rank_unique unique (item_id, language, source_version, rank)
);

create index translation_suggestions_item_idx on public.translation_suggestions (item_id, language, rank);

-- Page cleanup layer (brush / repair / eraser strokes). Separate from the text layer.
create table public.translation_page_cleanup (
  page_id uuid primary key references public.translation_pages(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb check (app_private.tl_strokes_valid(strokes)),
  version bigint not null default 1 check (version > 0),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.translation_glossary (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  manga_id uuid references public.mangas(id) on delete cascade,
  source_language text not null check (source_language in ('ja', 'ko', 'zh')),
  target_language text not null default 'tr' check (app_private.tl_language_valid(target_language)),
  source_term text not null check (pg_catalog.length(pg_catalog.btrim(source_term)) between 1 and 200),
  target_term text not null check (pg_catalog.length(pg_catalog.btrim(target_term)) between 1 and 200),
  note text check (note is null or pg_catalog.length(note) <= 500),
  created_by uuid references public.users(id) on delete set null default app_private.current_public_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index translation_glossary_term_unique on public.translation_glossary
  (fansub_id, coalesce(manga_id, '00000000-0000-0000-0000-000000000000'::uuid),
   source_language, target_language, source_term);

-- Model routing: providers/models in priority order per task. To lower cost
-- a cheap model is tried first; if it misses the quality threshold the next model is used.
create table public.translation_model_routes (
  id uuid primary key default gen_random_uuid(),
  task text not null check (task in ('detect', 'ocr', 'translate_draft', 'translate_alt',
    'translate_reader', 'font_suggest')),
  priority smallint not null default 0 check (priority between 0 and 99),
  provider text not null check (pg_catalog.length(provider) between 1 and 60),
  model text not null check (pg_catalog.length(model) between 1 and 120),
  -- USD per 1M tokens; for budget calculation and reporting.
  input_cost_per_mtok numeric(10,4) not null default 0 check (input_cost_per_mtok >= 0),
  output_cost_per_mtok numeric(10,4) not null default 0 check (output_cost_per_mtok >= 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint translation_model_routes_unique unique (task, provider, model)
);

create table public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.translation_projects(id) on delete cascade,
  page_id uuid references public.translation_pages(id) on delete cascade,
  task text not null check (task in ('detect', 'ocr', 'translate_draft', 'translate_alt',
    'translate_reader', 'font_suggest', 'clean', 'publish')),
  idempotency_key text not null check (pg_catalog.length(idempotency_key) between 8 and 200),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempt integer not null default 0 check (attempt between 0 and 10),
  attempt_token uuid,
  lease_until timestamptz,
  provider text,
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cost_usd numeric(12,6) check (cost_usd is null or cost_usd >= 0),
  error text check (error is null or pg_catalog.length(error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_jobs_idempotency_unique unique (project_id, idempotency_key)
);

create index translation_jobs_project_idx on public.translation_jobs (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Erisim zinciri
-- ---------------------------------------------------------------------------

create or replace function app_private.tl_can_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.translation_projects p
    where p.id = p_project_id and app_private.tl_can_fansub(p.fansub_id)
  );
$function$;

create or replace function app_private.tl_can_page(p_page_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.translation_pages pg
    join public.translation_projects p on p.id = pg.project_id
    where pg.id = p_page_id and app_private.tl_can_fansub(p.fansub_id)
  );
$function$;

create or replace function app_private.tl_can_item(p_item_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.translation_items i
    join public.translation_pages pg on pg.id = i.page_id
    join public.translation_projects p on p.id = pg.project_id
    where i.id = p_item_id and app_private.tl_can_fansub(p.fansub_id)
  );
$function$;

-- ---------------------------------------------------------------------------
-- Triggers: version, updated_at, immutability rules
-- ---------------------------------------------------------------------------

create or replace function app_private.tl_is_service()
returns boolean language sql stable set search_path = '' as $function$
  select coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or coalesce((nullif(pg_catalog.current_setting('request.jwt.claims', true), ''))::jsonb->>'role', '') = 'service_role'
    or current_user = 'service_role';
$function$;

create or replace function app_private.tl_touch()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if tg_op = 'UPDATE' then
    if pg_catalog.to_jsonb(new) ? 'version' then
      new.version := old.version + 1;
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

create or replace function app_private.tl_project_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if tg_op = 'UPDATE' then
    if new.fansub_id <> old.fansub_id then
      raise exception 'fansub degistirilemez' using errcode = 'PT409';
    end if;
    if new.source_language <> old.source_language
      and exists (select 1 from public.translation_pages where project_id = old.id and scan_stage <> 'none') then
      raise exception 'tarama basladiktan sonra ham dil degismez' using errcode = 'PT409';
    end if;
    if new.chapter_id is distinct from old.chapter_id and not app_private.tl_is_service() then
      raise exception 'bolum baglantisi yalniz yayin servisi tarafindan yazilir' using errcode = 'PT403';
    end if;
  elsif tg_op = 'INSERT' then
    if new.chapter_id is not null and not app_private.tl_is_service() then
      raise exception 'bolum baglantisi yalniz yayin servisi tarafindan yazilir' using errcode = 'PT403';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function app_private.tl_page_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  -- Raw and clean base keys are written only by the Worker (service role).
  if not app_private.tl_is_service() then
    if tg_op = 'INSERT' and (new.raw_status <> 'empty' or new.clean_object_key is not null) then
      raise exception 'raw yalniz yukleme servisi ile hazirlanir' using errcode = 'PT403';
    end if;
    if tg_op = 'UPDATE' and (
      new.raw_status is distinct from old.raw_status
      or new.raw_object_key is distinct from old.raw_object_key
      or new.raw_sha256 is distinct from old.raw_sha256
      or new.width is distinct from old.width
      or new.height is distinct from old.height
      or new.clean_object_key is distinct from old.clean_object_key
      or new.clean_sha256 is distinct from old.clean_sha256) then
      raise exception 'raw yalniz yukleme servisi ile degisir' using errcode = 'PT403';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    raise exception 'sayfa baska projeye tasinamaz' using errcode = 'PT409';
  end if;
  return new;
end;
$function$;

create or replace function app_private.tl_item_guard()
returns trigger language plpgsql set search_path = '' as $function$
declare
  v_width integer;
  v_height integer;
begin
  select width, height into v_width, v_height from public.translation_pages where id = new.page_id;
  if v_width is not null and (new.bbox_x + new.bbox_w > v_width or new.bbox_y + new.bbox_h > v_height) then
    raise exception 'alan sayfa sinirini asiyor' using errcode = 'PT422';
  end if;
  if tg_op = 'UPDATE' then
    if new.page_id <> old.page_id then
      raise exception 'oge baska sayfaya tasinamaz' using errcode = 'PT409';
    end if;
    if new.source_text is distinct from old.source_text then
      new.source_version := old.source_version + 1;
    else
      new.source_version := old.source_version;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function app_private.tl_item_text_guard()
returns trigger language plpgsql set search_path = '' as $function$
declare
  v_source_version bigint;
begin
  select source_version into v_source_version from public.translation_items where id = new.item_id;
  if new.source_version > v_source_version then
    raise exception 'kaynak surumu ileriden gelemez' using errcode = 'PT409';
  end if;
  if tg_op = 'UPDATE' then
    if new.item_id <> old.item_id or new.language <> old.language then
      raise exception 'oge/dil degismez' using errcode = 'PT409';
    end if;
    -- Insan metni makine tarafindan ezilemez.
    if old.origin = 'human' and new.origin = 'machine' then
      raise exception 'insan cevirisi makine tarafindan ezilemez' using errcode = 'PT409';
    end if;
  end if;
  if new.origin = 'human' then
    new.updated_by := app_private.current_public_user_id();
  elsif not app_private.tl_is_service() then
    raise exception 'makine metni yalniz servis tarafindan yazilir' using errcode = 'PT403';
  end if;
  return new;
end;
$function$;

create or replace function app_private.tl_service_only_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if not app_private.tl_is_service() then
    raise exception 'yalniz servis yazabilir' using errcode = 'PT403';
  end if;
  return coalesce(new, old);
end;
$function$;

create or replace function app_private.tl_cleanup_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  new.updated_by := app_private.current_public_user_id();
  return new;
end;
$function$;

create trigger translation_series_drafts_touch before update on public.translation_series_drafts
  for each row execute function app_private.tl_touch();
create trigger translation_projects_guard before insert or update on public.translation_projects
  for each row execute function app_private.tl_project_guard();
create trigger translation_projects_touch before update on public.translation_projects
  for each row execute function app_private.tl_touch();
create trigger translation_pages_guard before insert or update on public.translation_pages
  for each row execute function app_private.tl_page_guard();
create trigger translation_pages_touch before update on public.translation_pages
  for each row execute function app_private.tl_touch();
create trigger translation_items_guard before insert or update on public.translation_items
  for each row execute function app_private.tl_item_guard();
create trigger translation_items_touch before update on public.translation_items
  for each row execute function app_private.tl_touch();
create trigger translation_item_texts_guard before insert or update on public.translation_item_texts
  for each row execute function app_private.tl_item_text_guard();
create trigger translation_item_texts_touch before update on public.translation_item_texts
  for each row execute function app_private.tl_touch();
create trigger translation_suggestions_service before insert or update on public.translation_suggestions
  for each row execute function app_private.tl_service_only_guard();
create trigger translation_page_cleanup_guard before insert or update on public.translation_page_cleanup
  for each row execute function app_private.tl_cleanup_guard();
create trigger translation_page_cleanup_touch before update on public.translation_page_cleanup
  for each row execute function app_private.tl_touch();
create trigger translation_glossary_touch before update on public.translation_glossary
  for each row execute function app_private.tl_touch();
create trigger translation_model_routes_touch before update on public.translation_model_routes
  for each row execute function app_private.tl_touch();
create trigger translation_jobs_touch before update on public.translation_jobs
  for each row execute function app_private.tl_touch();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.translation_series_drafts enable row level security;
alter table public.translation_projects enable row level security;
alter table public.translation_pages enable row level security;
alter table public.translation_items enable row level security;
alter table public.translation_item_texts enable row level security;
alter table public.translation_suggestions enable row level security;
alter table public.translation_page_cleanup enable row level security;
alter table public.translation_glossary enable row level security;
alter table public.translation_model_routes enable row level security;
alter table public.translation_jobs enable row level security;

revoke all on public.translation_series_drafts, public.translation_projects, public.translation_pages,
  public.translation_items, public.translation_item_texts, public.translation_suggestions,
  public.translation_page_cleanup, public.translation_glossary, public.translation_model_routes,
  public.translation_jobs from anon, authenticated;

grant select, insert, update on public.translation_series_drafts to authenticated;
grant select, insert, update, delete on public.translation_projects, public.translation_pages,
  public.translation_items, public.translation_item_texts, public.translation_page_cleanup,
  public.translation_glossary to authenticated;
grant select on public.translation_suggestions, public.translation_jobs, public.translation_model_routes
  to authenticated;

create policy translation_series_drafts_staff on public.translation_series_drafts for all to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)))
  with check ((select app_private.tl_can_fansub(fansub_id))
    and (status = 'pending' or (select app_private.is_admin())));

create policy translation_projects_staff on public.translation_projects for all to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)))
  with check ((select app_private.tl_can_fansub(fansub_id)));

create policy translation_pages_staff on public.translation_pages for all to authenticated
  using ((select app_private.tl_can_project(project_id)))
  with check ((select app_private.tl_can_project(project_id)));

create policy translation_items_staff on public.translation_items for all to authenticated
  using ((select app_private.tl_can_page(page_id)))
  with check ((select app_private.tl_can_page(page_id)));

create policy translation_item_texts_staff on public.translation_item_texts for all to authenticated
  using ((select app_private.tl_can_item(item_id)))
  with check ((select app_private.tl_can_item(item_id)));

create policy translation_suggestions_staff_read on public.translation_suggestions for select to authenticated
  using ((select app_private.tl_can_item(item_id)));

create policy translation_page_cleanup_staff on public.translation_page_cleanup for all to authenticated
  using ((select app_private.tl_can_page(page_id)))
  with check ((select app_private.tl_can_page(page_id)));

create policy translation_glossary_staff on public.translation_glossary for all to authenticated
  using ((select app_private.tl_can_fansub(fansub_id)))
  with check ((select app_private.tl_can_fansub(fansub_id)));

create policy translation_model_routes_admin_read on public.translation_model_routes for select to authenticated
  using ((select app_private.is_admin()));

create policy translation_jobs_staff_read on public.translation_jobs for select to authenticated
  using ((select app_private.tl_can_project(project_id)));

-- Default routing: a cheap model drafts, a stronger model for alternatives and reader languages.
insert into public.translation_model_routes (task, priority, provider, model) values
  ('detect', 0, 'openai', 'gpt-4.1'),
  ('ocr', 0, 'openai', 'gpt-4.1'),
  ('translate_draft', 0, 'openai', 'gpt-4.1-mini'),
  ('translate_alt', 0, 'openai', 'gpt-4.1'),
  ('translate_reader', 0, 'openai', 'gpt-4.1-mini'),
  ('font_suggest', 0, 'openai', 'gpt-4.1-mini')
on conflict (task, provider, model) do nothing;

insert into public.feature_flags (key, label, description, is_enabled, rollout_percent)
values ('translation.studio_v3', 'Ceviri Studyosu V3', 'Fansub ceviri studyosu (seri -> yayin akisi)', false, 0)
on conflict (key) do nothing;
