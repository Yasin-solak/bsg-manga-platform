-- Translation Studio V2: raw page, text, editor and published language are split.
-- Old admin_typeset_* records are kept; no data moves to V2.

create or replace function app_private.studio_language_valid(p_language text)
returns boolean language sql immutable set search_path = '' as $function$
  select p_language is not null
    and pg_catalog.length(p_language) between 2 and 35
    and p_language ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$';
$function$;

create or replace function app_private.studio_polygon_valid(p_polygon jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
declare
  v_point jsonb;
  v_x numeric;
  v_y numeric;
begin
  if p_polygon is null or pg_catalog.jsonb_typeof(p_polygon) <> 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p_polygon) not between 3 and 128 then return false; end if;
  for v_point in select value from pg_catalog.jsonb_array_elements(p_polygon) loop
    if pg_catalog.jsonb_typeof(v_point->'x') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_point->'y') is distinct from 'number' then return false; end if;
    v_x := (v_point->>'x')::numeric;
    v_y := (v_point->>'y')::numeric;
    -- The typesetting engine uses natural pixel coordinates; the real limit is checked in the page trigger.
    if v_x < 0 or v_x > 100000 or v_y < 0 or v_y > 100000 then return false; end if;
  end loop;
  return true;
end;
$function$;

create or replace function app_private.studio_manifest_valid(p_manifest jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
declare
  v_page jsonb;
  v_key text;
  v_mime text;
  v_width text;
  v_height text;
  v_bytes text;
  v_source_x text;
  v_source_y text;
  v_source_width text;
  v_source_height text;
  v_sha256 text;
  v_page_index text;
  v_expected_index integer := 0;
begin
  if p_manifest is null or pg_catalog.jsonb_typeof(p_manifest) <> 'object' then return false; end if;
  if p_manifest->'schema_version' is distinct from '2'::jsonb
    or p_manifest->'clean_base' is distinct from 'true'::jsonb
    or p_manifest - 'schema_version' - 'clean_base' - 'pages' <> '{}'::jsonb then
    return false;
  end if;
  if pg_catalog.jsonb_typeof(p_manifest->'pages') is distinct from 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p_manifest->'pages') not between 1 and 1000 then return false; end if;
  for v_page in select value from pg_catalog.jsonb_array_elements(p_manifest->'pages') loop
    if pg_catalog.jsonb_typeof(v_page) is distinct from 'object' then return false; end if;
    if v_page - 'studio_page_id' - 'object_key' - 'width' - 'height'
      - 'mime_type' - 'byte_size' - 'source_x' - 'source_y'
      - 'source_width' - 'source_height' - 'sha256' - 'page_index'
      <> '{}'::jsonb then return false; end if;
    if coalesce(v_page->>'studio_page_id', '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    v_key := v_page->>'object_key';
    v_mime := v_page->>'mime_type';
    v_width := v_page->>'width';
    v_height := v_page->>'height';
    v_bytes := v_page->>'byte_size';
    v_source_x := v_page->>'source_x';
    v_source_y := v_page->>'source_y';
    v_source_width := v_page->>'source_width';
    v_source_height := v_page->>'source_height';
    v_sha256 := v_page->>'sha256';
    v_page_index := v_page->>'page_index';
    if v_key is null or v_key !~
      '^published/[0-9a-f-]{36}/page-[0-9]{1,4}/[0-9a-f]{64}\.(jpg|png|webp)$'
      or v_sha256 is null or v_sha256 !~ '^[0-9a-f]{64}$'
      or pg_catalog.strpos(v_key, '/' || v_sha256 || '.') = 0 then return false; end if;
    if v_mime is null or v_mime not in ('image/jpeg', 'image/png', 'image/webp')
      or (v_mime = 'image/jpeg' and pg_catalog.right(v_key, 4) <> '.jpg')
      or (v_mime = 'image/png' and pg_catalog.right(v_key, 4) <> '.png')
      or (v_mime = 'image/webp' and pg_catalog.right(v_key, 5) <> '.webp') then return false; end if;
    if v_width is null or v_width !~ '^[1-9][0-9]{0,5}$'
      or v_height is null or v_height !~ '^[1-9][0-9]{0,5}$'
      or v_bytes is null or v_bytes !~ '^[1-9][0-9]{0,8}$'
      or v_source_x is null or v_source_x !~ '^(0|[1-9][0-9]{0,5})$'
      or v_source_y is null or v_source_y !~ '^(0|[1-9][0-9]{0,5})$'
      or v_source_width is null or v_source_width !~ '^[1-9][0-9]{0,5}$'
      or v_source_height is null or v_source_height !~ '^[1-9][0-9]{0,5}$'
      or v_page_index is null or v_page_index !~ '^(0|[1-9][0-9]{0,3})$' then return false; end if;
    if v_width::integer > 20000 or v_height::integer > 100000
      or v_bytes::bigint > 33554432
      or v_source_width::integer > 20000 or v_source_height::integer > 100000
      or v_width::integer <> v_source_width::integer
      or v_height::integer <> v_source_height::integer
      or v_page_index::integer <> v_expected_index then return false; end if;
    v_expected_index := v_expected_index + 1;
  end loop;
  return true;
end;
$function$;

create table public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  manga_id uuid not null references public.mangas(id) on delete restrict,
  chapter_number numeric(8,2) not null check (chapter_number > 0),
  source_language text not null check (app_private.studio_language_valid(source_language)),
  primary_target_language text not null check (app_private.studio_language_valid(primary_target_language)),
  rights_status text not null default 'active' check (rights_status in ('active', 'paused', 'revoked')),
  version bigint not null default 1 check (version > 0),
  created_by uuid references public.users(id) on delete set null default app_private.current_public_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_projects_languages_different check (source_language <> primary_target_language),
  constraint studio_projects_identity_unique unique (fansub_id, manga_id, chapter_number)
);

create index studio_projects_fansub_updated_idx on public.studio_projects (fansub_id, updated_at desc);
create index studio_projects_manga_idx on public.studio_projects (manga_id, chapter_number);

create table public.studio_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  page_index integer not null check (page_index between 0 and 999),
  raw_status text not null default 'empty' check (raw_status in ('empty', 'pending', 'ready')),
  raw_object_key text,
  raw_sha256 text,
  raw_mime_type text,
  raw_byte_size bigint,
  raw_width integer,
  raw_height integer,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_pages_order_unique unique (project_id, page_index),
  constraint studio_pages_raw_metadata_check check (
    (raw_status = 'empty' and raw_object_key is null and raw_sha256 is null
      and raw_mime_type is null and raw_byte_size is null and raw_width is null and raw_height is null)
    or (raw_status in ('pending', 'ready')
      and raw_object_key is not null and raw_sha256 is not null
      and raw_mime_type is not null and raw_byte_size is not null
      and raw_width is not null and raw_height is not null
      and raw_sha256 ~ '^[0-9a-f]{64}$'
      and raw_mime_type in ('image/jpeg', 'image/png', 'image/webp')
      and raw_byte_size between 1 and 33554432
      and raw_width between 1 and 20000
      and raw_height between 1 and 100000
      and raw_width::bigint * raw_height::bigint <= 100000000
      and raw_object_key = 'pages/' || id::text || '/' || raw_sha256 ||
        case raw_mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end)
  )
);

create index studio_pages_project_idx on public.studio_pages (project_id, page_index);

create table public.studio_regions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.studio_pages(id) on delete cascade,
  kind text not null check (kind in ('bubble', 'caption', 'sfx', 'free')),
  polygon jsonb not null check (app_private.studio_polygon_valid(polygon)),
  source_text text not null default '' check (pg_catalog.length(source_text) <= 5000),
  source_origin text not null default 'manual' check (source_origin in ('ocr', 'manual')),
  ocr_confidence numeric(5,4) check (ocr_confidence between 0 and 1),
  needs_review boolean not null default false,
  reading_order integer not null default 0 check (reading_order >= 0),
  detection_key text check (pg_catalog.length(detection_key) between 1 and 128),
  version bigint not null default 1 check (version > 0),
  source_version bigint not null default 1 check (source_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_regions_detection_unique unique (page_id, detection_key)
);

create index studio_regions_page_order_idx on public.studio_regions (page_id, reading_order, id);

create table public.studio_translations (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.studio_regions(id) on delete cascade,
  language text not null check (app_private.studio_language_valid(language)),
  text text not null check (pg_catalog.length(text) <= 10000),
  origin text not null check (origin in ('machine', 'human')),
  review_state text not null check (review_state in ('machine', 'draft', 'reviewed', 'approved')),
  source_version bigint not null check (source_version > 0),
  provider text check (provider is null or pg_catalog.length(provider) between 1 and 120),
  model text check (model is null or pg_catalog.length(model) between 1 and 120),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_translations_language_unique unique (region_id, language),
  constraint studio_translations_origin_review_check check (
    (origin = 'machine' and review_state = 'machine' and provider is not null and model is not null)
    or (origin = 'human' and review_state <> 'machine')
  )
);

create index studio_translations_language_idx on public.studio_translations (language, review_state);

create table public.studio_page_layers (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.studio_pages(id) on delete cascade,
  language text not null check (language = '*' or app_private.studio_language_valid(language)),
  commands jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(commands) = 'array'
      and pg_catalog.jsonb_array_length(commands) <= 1000
      and pg_catalog.octet_length(commands::text) <= 1048576),
  schema_version integer not null default 1 check (schema_version = 1),
  version bigint not null default 1 check (version > 0),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_page_layers_language_unique unique (page_id, language)
);

create table public.studio_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  page_id uuid references public.studio_pages(id) on delete cascade,
  job_type text not null check (job_type in ('ocr', 'translate', 'inpaint', 'render')),
  language text check (language is null or app_private.studio_language_valid(language)),
  idempotency_key text not null check (pg_catalog.length(idempotency_key) between 1 and 200),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  input_version bigint not null check (input_version > 0),
  error_code text check (error_code is null or pg_catalog.length(error_code) <= 120),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_jobs_idempotent_unique unique (project_id, idempotency_key)
);

create index studio_jobs_queue_idx on public.studio_jobs (status, created_at) where status in ('queued', 'running');
create index studio_jobs_page_idx on public.studio_jobs (page_id) where page_id is not null;

create table public.studio_publications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  language text not null check (app_private.studio_language_valid(language)),
  manifest jsonb not null default '{"schema_version":2,"clean_base":true,"pages":[]}'::jsonb,
  quality_label text not null check (quality_label in ('machine', 'human', 'mixed', 'original')),
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  source_version bigint not null check (source_version > 0),
  version bigint not null default 1 check (version > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_publications_language_unique unique (project_id, language),
  constraint studio_publications_publish_valid check (
    status <> 'published' or (chapter_id is not null and published_at is not null
      and app_private.studio_manifest_valid(manifest))
  )
);

create index studio_publications_chapter_language_idx on public.studio_publications (chapter_id, language)
  where status = 'published';

-- The private raw image key, edit data and jobs never open to anonymous table reads.
alter table public.studio_projects enable row level security;
alter table public.studio_pages enable row level security;
alter table public.studio_regions enable row level security;
alter table public.studio_translations enable row level security;
alter table public.studio_page_layers enable row level security;
alter table public.studio_jobs enable row level security;
alter table public.studio_publications enable row level security;

-- Identity and raw object stay fixed; a fix goes through a new row/version.
create or replace function app_private.studio_project_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.fansub_id is distinct from old.fansub_id
    or new.manga_id is distinct from old.manga_id
    or new.chapter_number is distinct from old.chapter_number
    or new.source_language is distinct from old.source_language then
    raise sqlstate 'PT409' using message = 'Proje kimliği değiştirilemez.';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$function$;

create trigger studio_project_guard before update on public.studio_projects
for each row execute function app_private.studio_project_guard();

create or replace function app_private.studio_page_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.project_id is distinct from old.project_id then
    raise sqlstate 'PT409' using message = 'Sayfa başka projeye taşınamaz.';
  end if;
  if old.raw_status = 'ready' and (
      new.raw_status is distinct from 'ready'
      or new.raw_object_key is distinct from old.raw_object_key
      or new.raw_sha256 is distinct from old.raw_sha256
      or new.raw_mime_type is distinct from old.raw_mime_type
      or new.raw_byte_size is distinct from old.raw_byte_size
      or new.raw_width is distinct from old.raw_width
      or new.raw_height is distinct from old.raw_height
    ) then
    raise sqlstate 'PT409' using message = 'Hazır ham görsel değiştirilemez; yeni sayfa açın.';
  end if;
  if old.raw_status = 'pending' and (
      new.raw_status not in ('pending', 'ready')
      or new.raw_object_key is distinct from old.raw_object_key
      or new.raw_sha256 is distinct from old.raw_sha256
      or new.raw_mime_type is distinct from old.raw_mime_type
      or new.raw_byte_size is distinct from old.raw_byte_size
      or new.raw_width is distinct from old.raw_width
      or new.raw_height is distinct from old.raw_height
    ) then
    raise sqlstate 'PT409' using message = 'Hazırlanmış ham görsel değiştirilemez; yeni sayfa açın.';
  end if;
  if old.raw_status = 'empty' and new.raw_status = 'ready' then
    raise sqlstate 'PT409' using message = 'Ham görsel önce hazırlanmalıdır.';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$function$;

create trigger studio_page_guard before update on public.studio_pages
for each row execute function app_private.studio_page_guard();

create or replace function app_private.studio_region_guard()
returns trigger language plpgsql set search_path = '' as $function$
declare
  v_width integer;
  v_height integer;
  v_status text;
  v_rights_status text;
  v_point jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.page_id is distinct from old.page_id then
      raise sqlstate 'PT409' using message = 'Metin bölgesi başka sayfaya taşınamaz.';
    end if;
    if old.source_origin = 'manual' and new.source_origin = 'ocr' then
      raise sqlstate 'PT409' using message = 'İnsan düzeltmesi OCR tarafından ezilemez.';
    end if;
  end if;
  select p.raw_width, p.raw_height, p.raw_status, project.rights_status
    into v_width, v_height, v_status, v_rights_status
  from public.studio_pages p
  join public.studio_projects project on project.id = p.project_id
  where p.id = new.page_id;
  if v_rights_status is distinct from 'active' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
  end if;
  if v_status is distinct from 'ready' then
    raise sqlstate 'PT409' using message = 'Ham sayfa hazır olmadan metin bölgesi kaydedilemez.';
  end if;
  if not app_private.studio_polygon_valid(new.polygon) then
    raise sqlstate '22023' using message = 'Bölge koordinatları geçersiz.';
  end if;
  for v_point in select value from pg_catalog.jsonb_array_elements(new.polygon) loop
    if (v_point->>'x')::numeric > v_width or (v_point->>'y')::numeric > v_height then
      raise sqlstate '22023' using message = 'Bölge sayfa sınırını aşıyor.';
    end if;
  end loop;
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.source_version := old.source_version +
      case when new.source_text is distinct from old.source_text then 1 else 0 end;
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

create trigger studio_region_guard before insert or update on public.studio_regions
for each row execute function app_private.studio_region_guard();

create or replace function app_private.studio_translation_guard()
returns trigger language plpgsql set search_path = '' as $function$
declare
  v_source_version bigint;
  v_rights_status text;
begin
  select r.source_version, project.rights_status into v_source_version, v_rights_status
  from public.studio_regions r
  join public.studio_pages p on p.id = r.page_id
  join public.studio_projects project on project.id = p.project_id
  where r.id = new.region_id;
  if v_rights_status is distinct from 'active' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
  end if;
  if new.source_version is distinct from v_source_version then
    raise sqlstate 'PT409' using message = 'Çeviri güncel kaynak sürümüne dayanmalıdır.';
  end if;
  if tg_op = 'UPDATE' then
    if new.region_id is distinct from old.region_id or new.language is distinct from old.language then
      raise sqlstate 'PT409' using message = 'Çeviri kimliği değiştirilemez.';
    end if;
    if old.origin = 'human' and new.origin = 'machine' then
      raise sqlstate 'PT409' using message = 'İnsan çevirisi makine tarafından ezilemez.';
    end if;
    if new.source_version < old.source_version then
      raise sqlstate 'PT409' using message = 'Kaynak sürümü geriye alınamaz.';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

create trigger studio_translation_guard before insert or update on public.studio_translations
for each row execute function app_private.studio_translation_guard();

create or replace function app_private.studio_version_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$function$;

create trigger studio_layers_version before update on public.studio_page_layers
for each row execute function app_private.studio_version_guard();
create trigger studio_jobs_version before update on public.studio_jobs
for each row execute function app_private.studio_version_guard();

create or replace function app_private.studio_job_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.page_id is not null and not exists (
    select 1 from public.studio_pages p where p.id = new.page_id and p.project_id = new.project_id
  ) then
    raise sqlstate 'PT409' using message = 'İşin sayfası projeye ait değil.';
  end if;
  return new;
end;
$function$;

create trigger studio_job_guard before insert or update on public.studio_jobs
for each row execute function app_private.studio_job_guard();

create or replace function app_private.studio_publication_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.chapter_id is not null and not exists (
    select 1 from public.chapters c
    join public.studio_projects p on p.id = new.project_id
    where c.id = new.chapter_id and c.manga_id = p.manga_id
      and c.fansub_id = p.fansub_id and c.chapter_number = p.chapter_number
  ) then
    raise sqlstate 'PT409' using message = 'Yayın bölümü proje ile eşleşmiyor.';
  end if;
  if tg_op = 'UPDATE' then
    if new.project_id is distinct from old.project_id or new.language is distinct from old.language then
      raise sqlstate 'PT409' using message = 'Yayın kimliği değiştirilemez.';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

create trigger studio_publication_guard before insert or update on public.studio_publications
for each row execute function app_private.studio_publication_guard();

-- Policy helpers stay in the private schema; the access decision depends on active membership.
create or replace function app_private.studio_rollout_allowed(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.is_admin() or (
    app_private.is_fansub_staff(p_fansub_id)
    and app_private.is_feature_enabled('typeset.studio', false)
    and exists (
      select 1 from public.typeset_studio_pilot_fansubs pilot
      where pilot.fansub_id = p_fansub_id
    )
  );
$function$;

create or replace function app_private.studio_can_project(p_project_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.studio_projects p
    where p.id = p_project_id
      and p.rights_status = 'active'
      and (case when p_write then app_private.studio_rollout_allowed(p.fansub_id)
        else app_private.is_admin() or app_private.is_fansub_staff(p.fansub_id) end)
  );
$function$;

create or replace function app_private.studio_can_page(p_page_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.studio_pages p
    where p.id = p_page_id and app_private.studio_can_project(p.project_id, p_write)
  );
$function$;

create or replace function app_private.studio_can_region(p_region_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.studio_regions r
    where r.id = p_region_id and app_private.studio_can_page(r.page_id, p_write)
  );
$function$;

create or replace function app_private.studio_rights_active(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.studio_projects p where p.id = p_project_id and p.rights_status = 'active'
  );
$function$;

-- The reader gate validates chapter/manga state directly; this prevents the NOT EXISTS condition
-- from wrongly allowing because of a hidden manga row.
create or replace function app_private.studio_publication_reader_allowed(p_publication_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.studio_publications publication
    join public.studio_projects project on project.id = publication.project_id
    join public.chapters chapter on chapter.id = publication.chapter_id
    join public.mangas manga on manga.id = chapter.manga_id
    where publication.id = p_publication_id
      and publication.status = 'published'
      and project.rights_status = 'active'
      and chapter.manga_id = project.manga_id
      and chapter.fansub_id = project.fansub_id
      and chapter.chapter_number = project.chapter_number
      and chapter.is_active and chapter.is_approved
      and manga.is_active and manga.is_approved
      and (not manga.is_mature or app_private.current_user_is_adult())
      and app_private.can_current_user_access_chapter(chapter.publish_at)
  );
$function$;

create policy studio_projects_read on public.studio_projects for select to authenticated
  using (app_private.is_admin() or app_private.is_fansub_staff(fansub_id));
create policy studio_projects_create on public.studio_projects for insert to authenticated
  with check (rights_status = 'active' and version = 1
    and app_private.studio_rollout_allowed(fansub_id));

create policy studio_pages_read on public.studio_pages for select to authenticated
  using (app_private.studio_can_project(project_id));
create policy studio_pages_create on public.studio_pages for insert to authenticated
  with check (raw_status = 'empty' and app_private.studio_can_project(project_id, true));

create policy studio_regions_read on public.studio_regions for select to authenticated
  using (app_private.studio_can_page(page_id));
create policy studio_regions_create on public.studio_regions for insert to authenticated
  with check (source_origin = 'manual' and detection_key is null
    and app_private.studio_can_page(page_id, true));

create policy studio_translations_read on public.studio_translations for select to authenticated
  using (app_private.studio_can_region(region_id));
create policy studio_page_layers_read on public.studio_page_layers for select to authenticated
  using (app_private.studio_can_page(page_id));
create policy studio_jobs_read on public.studio_jobs for select to authenticated
  using (app_private.studio_can_project(project_id));

create policy studio_publications_staff_read on public.studio_publications for select to authenticated
  using (app_private.studio_can_project(project_id));
revoke all on public.studio_projects, public.studio_pages, public.studio_regions,
  public.studio_translations, public.studio_page_layers, public.studio_jobs,
  public.studio_publications from public, anon, authenticated;
grant select on public.studio_projects, public.studio_pages, public.studio_regions,
  public.studio_translations, public.studio_page_layers, public.studio_jobs,
  public.studio_publications to authenticated;
grant insert (fansub_id, manga_id, chapter_number, source_language, primary_target_language)
  on public.studio_projects to authenticated;
grant insert (project_id, page_index) on public.studio_pages to authenticated;
grant insert (page_id, kind, polygon, source_text, reading_order) on public.studio_regions to authenticated;
grant all on public.studio_projects, public.studio_pages, public.studio_regions,
  public.studio_translations, public.studio_page_layers, public.studio_jobs,
  public.studio_publications to service_role;

grant usage on schema app_private to anon, authenticated, service_role;
revoke all on function app_private.studio_can_project(uuid, boolean),
  app_private.studio_can_page(uuid, boolean), app_private.studio_can_region(uuid, boolean),
  app_private.studio_rollout_allowed(uuid),
  app_private.studio_publication_reader_allowed(uuid),
  app_private.studio_rights_active(uuid), app_private.studio_language_valid(text),
  app_private.studio_polygon_valid(jsonb), app_private.studio_manifest_valid(jsonb)
  from public;
grant execute on function app_private.studio_can_project(uuid, boolean),
  app_private.studio_can_page(uuid, boolean), app_private.studio_can_region(uuid, boolean),
  app_private.studio_rollout_allowed(uuid),
  app_private.studio_language_valid(text), app_private.studio_polygon_valid(jsonb),
  app_private.studio_manifest_valid(jsonb) to authenticated, service_role;
grant execute on function app_private.studio_rights_active(uuid) to anon, authenticated, service_role;
grant execute on function app_private.studio_publication_reader_allowed(uuid)
  to anon, authenticated, service_role;
