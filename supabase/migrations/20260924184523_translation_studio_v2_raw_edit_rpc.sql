-- Translation Studio V2: raw image and editor RPC layer.
-- The raw file is not written directly to the table from the client. The DB produces a key, the Worker only moves it to R2.
create or replace function app_private.studio_raw_prepare(
  p_page_id uuid, p_sha256 text, p_mime_type text, p_byte_size bigint,
  p_width integer, p_height integer
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_page record;
  v_extension text;
  v_key text;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size is null or p_byte_size not between 1 and 33554432
    or p_width is null or p_width not between 1 and 20000
    or p_height is null or p_height not between 1 and 100000
    or p_width::bigint * p_height::bigint > 100000000 then
    raise sqlstate '22023' using message = 'Ham görsel bilgileri geçersiz.';
  end if;

  select s.*, p.fansub_id, p.rights_status into v_page
  from public.studio_pages s
  join public.studio_projects p on p.id = s.project_id
  where s.id = p_page_id for update of s;
  if not found then raise sqlstate 'PT404' using message = 'Sayfa bulunamadı.'; end if;
  if v_page.rights_status <> 'active'
    or not app_private.studio_rollout_allowed(v_page.fansub_id) then
    raise sqlstate 'PT403' using message = 'Ham görsel yükleme yetkisi yok.';
  end if;

  v_extension := case p_mime_type
    when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end;
  v_key := 'pages/' || p_page_id::text || '/' || p_sha256 || v_extension;
  if v_page.raw_status <> 'empty' then
    if v_page.raw_sha256 is distinct from p_sha256
      or v_page.raw_mime_type is distinct from p_mime_type
      or v_page.raw_byte_size is distinct from p_byte_size
      or v_page.raw_width is distinct from p_width
      or v_page.raw_height is distinct from p_height
      or v_page.raw_object_key is distinct from v_key then
      raise sqlstate 'PT409' using message = 'Sayfada farklı bir ham görsel hazırlanmış.';
    end if;
    return pg_catalog.jsonb_build_object('object_key', v_key,
      'upload_required', v_page.raw_status = 'pending');
  end if;

  update public.studio_pages set raw_status = 'pending', raw_object_key = v_key,
    raw_sha256 = p_sha256, raw_mime_type = p_mime_type, raw_byte_size = p_byte_size,
    raw_width = p_width, raw_height = p_height where id = p_page_id;
  return pg_catalog.jsonb_build_object('object_key', v_key, 'upload_required', true);
end;
$function$;

create or replace function app_private.studio_raw_complete(p_page_id uuid, p_sha256 text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_page record;
begin
  -- Inside SECURITY DEFINER current_user is the function owner; the caller JWT role is the basis.
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'Tamamlama yalnız sunucu işlemidir.';
  end if;
  select s.*, p.rights_status into v_page
  from public.studio_pages s
  join public.studio_projects p on p.id = s.project_id
  where s.id = p_page_id for update of s;
  if not found then raise sqlstate 'PT404' using message = 'Sayfa bulunamadı.'; end if;
  if v_page.rights_status <> 'active' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
  end if;
  if v_page.raw_sha256 is distinct from p_sha256 then
    raise sqlstate 'PT409' using message = 'Ham görsel özeti eşleşmiyor.';
  end if;
  if v_page.raw_status = 'pending' then
    update public.studio_pages set raw_status = 'ready' where id = p_page_id;
  elsif v_page.raw_status <> 'ready' then
    raise sqlstate 'PT409' using message = 'Önce yükleme hazırlanmalıdır.';
  end if;
  return pg_catalog.jsonb_build_object('object_key', v_page.raw_object_key, 'status', 'ready');
end;
$function$;

create or replace function app_private.studio_raw_access(p_page_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_page record;
begin
  select s.*, p.fansub_id, p.rights_status into v_page
  from public.studio_pages s
  join public.studio_projects p on p.id = s.project_id
  where s.id = p_page_id;
  if not found then raise sqlstate 'PT404' using message = 'Sayfa bulunamadı.'; end if;
  if v_page.rights_status <> 'active'
    or not app_private.studio_rollout_allowed(v_page.fansub_id) then
    raise sqlstate 'PT403' using message = 'Ham görsel okuma yetkisi yok.';
  end if;
  if v_page.raw_status <> 'ready' then
    raise sqlstate 'PT409' using message = 'Ham görsel hazır değil.';
  end if;
  return pg_catalog.jsonb_build_object(
    'object_key', v_page.raw_object_key, 'mime_type', v_page.raw_mime_type,
    'byte_size', v_page.raw_byte_size, 'sha256', v_page.raw_sha256,
    'width', v_page.raw_width, 'height', v_page.raw_height);
end;
$function$;

-- Exposed public surfaces are invoker only; the privileged core is in app_private.
create or replace function public.studio_raw_prepare(
  p_page_id uuid, p_sha256 text, p_mime_type text, p_byte_size bigint,
  p_width integer, p_height integer
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_raw_prepare(p_page_id, p_sha256, p_mime_type,
    p_byte_size, p_width, p_height);
$function$;

create or replace function public.studio_raw_complete(p_page_id uuid, p_sha256 text)
returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_raw_complete(p_page_id, p_sha256);
$function$;

create or replace function public.studio_raw_access(p_page_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $function$
  select app_private.studio_raw_access(p_page_id);
$function$;

revoke all on function app_private.studio_raw_prepare(uuid, text, text, bigint, integer, integer),
  app_private.studio_raw_complete(uuid, text), app_private.studio_raw_access(uuid)
  from public, anon, authenticated;
grant execute on function app_private.studio_raw_prepare(uuid, text, text, bigint, integer, integer),
  app_private.studio_raw_access(uuid) to authenticated, service_role;
grant execute on function app_private.studio_raw_complete(uuid, text) to service_role;

revoke all on function public.studio_raw_prepare(uuid, text, text, bigint, integer, integer),
  public.studio_raw_complete(uuid, text), public.studio_raw_access(uuid)
  from public, anon, authenticated;
grant execute on function public.studio_raw_prepare(uuid, text, text, bigint, integer, integer),
  public.studio_raw_access(uuid) to authenticated;
grant execute on function public.studio_raw_complete(uuid, text) to service_role;

-- Editor saves use compare-and-swap; an old tab cannot overwrite new work.
create or replace function app_private.studio_region_update(
  p_region_id uuid, p_expected_version bigint, p_kind text,
  p_polygon jsonb, p_source_text text, p_reading_order integer
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_region record;
begin
  if not exists (select 1 from public.studio_regions r where r.id = p_region_id) then
    raise sqlstate 'PT404' using message = 'Metin bölgesi bulunamadı.';
  end if;
  if not app_private.studio_can_region(p_region_id, true) then
    raise sqlstate 'PT403' using message = 'Metin bölgesini düzenleme yetkisi yok.';
  end if;
  update public.studio_regions set kind = p_kind, polygon = p_polygon,
    source_text = p_source_text, reading_order = p_reading_order,
    source_origin = 'manual', ocr_confidence = null, needs_review = false
  where id = p_region_id and version = p_expected_version
  returning id, version, source_version, source_text, source_origin into v_region;
  if not found then
    raise sqlstate 'PT409' using message = 'Metin bölgesi başka oturumda değişti.';
  end if;
  return pg_catalog.jsonb_build_object('id', v_region.id, 'version', v_region.version,
    'source_version', v_region.source_version,
    'source_text', v_region.source_text, 'source_origin', v_region.source_origin);
end;
$function$;

create or replace function app_private.studio_translation_update(
  p_region_id uuid, p_language text, p_text text, p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_source_version bigint;
  v_translation record;
begin
  select r.source_version into v_source_version from public.studio_regions r
  where r.id = p_region_id for share;
  if not found then raise sqlstate 'PT404' using message = 'Metin bölgesi bulunamadı.'; end if;
  if not app_private.studio_can_region(p_region_id, true) then
    raise sqlstate 'PT403' using message = 'Çeviriyi düzenleme yetkisi yok.';
  end if;
  if p_expected_version = 0 then
    insert into public.studio_translations
      (region_id, language, text, origin, review_state, source_version)
    values (p_region_id, p_language, p_text, 'human', 'reviewed', v_source_version)
    on conflict (region_id, language) do nothing
    returning id, version, source_version into v_translation;
  else
    update public.studio_translations set text = p_text, origin = 'human',
      review_state = 'reviewed', provider = null, model = null, source_version = v_source_version
    where region_id = p_region_id and language = p_language and version = p_expected_version
    returning id, version, source_version into v_translation;
  end if;
  if not found then
    raise sqlstate 'PT409' using message = 'Çeviri başka oturumda değişti.';
  end if;
  return pg_catalog.jsonb_build_object('id', v_translation.id, 'version', v_translation.version,
    'source_version', v_translation.source_version);
end;
$function$;

create or replace function app_private.studio_layers_update(
  p_page_id uuid, p_language text, p_commands jsonb, p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_layer record;
begin
  if not exists (select 1 from public.studio_pages p where p.id = p_page_id) then
    raise sqlstate 'PT404' using message = 'Sayfa bulunamadı.';
  end if;
  if not app_private.studio_can_page(p_page_id, true) then
    raise sqlstate 'PT403' using message = 'Editör katmanını düzenleme yetkisi yok.';
  end if;
  if p_expected_version = 0 then
    insert into public.studio_page_layers (page_id, language, commands, updated_by)
    values (p_page_id, p_language, p_commands, app_private.current_public_user_id())
    on conflict (page_id, language) do nothing
    returning id, version into v_layer;
  else
    update public.studio_page_layers set commands = p_commands,
      updated_by = app_private.current_public_user_id()
    where page_id = p_page_id and language = p_language and version = p_expected_version
    returning id, version into v_layer;
  end if;
  if not found then
    raise sqlstate 'PT409' using message = 'Editör katmanı başka oturumda değişti.';
  end if;
  return pg_catalog.jsonb_build_object('id', v_layer.id, 'version', v_layer.version);
end;
$function$;

create or replace function public.studio_region_update(
  p_region_id uuid, p_expected_version bigint, p_kind text,
  p_polygon jsonb, p_source_text text, p_reading_order integer
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_region_update(p_region_id, p_expected_version,
    p_kind, p_polygon, p_source_text, p_reading_order);
$function$;

create or replace function public.studio_translation_update(
  p_region_id uuid, p_language text, p_text text, p_expected_version bigint
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_translation_update(p_region_id, p_language, p_text, p_expected_version);
$function$;

create or replace function public.studio_layers_update(
  p_page_id uuid, p_language text, p_commands jsonb, p_expected_version bigint
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_layers_update(p_page_id, p_language, p_commands, p_expected_version);
$function$;

revoke all on function app_private.studio_region_update(uuid, bigint, text, jsonb, text, integer),
  app_private.studio_translation_update(uuid, text, text, bigint),
  app_private.studio_layers_update(uuid, text, jsonb, bigint),
  public.studio_region_update(uuid, bigint, text, jsonb, text, integer),
  public.studio_translation_update(uuid, text, text, bigint),
  public.studio_layers_update(uuid, text, jsonb, bigint)
  from public, anon;
grant execute on function app_private.studio_region_update(uuid, bigint, text, jsonb, text, integer),
  app_private.studio_translation_update(uuid, text, text, bigint),
  app_private.studio_layers_update(uuid, text, jsonb, bigint) to authenticated, service_role;
grant execute on function public.studio_region_update(uuid, bigint, text, jsonb, text, integer),
  public.studio_translation_update(uuid, text, text, bigint),
  public.studio_layers_update(uuid, text, jsonb, bigint) to authenticated;

-- Many machine translations are written in one request. A row changed in a race or fixed by a
-- human is skipped; the response carries only what was really saved.
create or replace function app_private.studio_machine_translations_apply(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_row jsonb;
  v_region_id uuid;
  v_language text;
  v_text text;
  v_provider text;
  v_model text;
  v_source_version bigint;
  v_expected_version bigint;
  v_current_source_version bigint;
  v_rights_status text;
  v_translation record;
  v_saved jsonb := '[]'::jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'Makine çevirisi yazımı yalnız sunucu işlemidir.';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) is distinct from 'array' then
    raise sqlstate '22023' using message = 'Çeviri listesi geçersiz.';
  end if;
  if pg_catalog.jsonb_array_length(p_rows) not between 1 and 200
    or pg_catalog.octet_length(p_rows::text) > 1048576 then
    raise sqlstate '22023' using message = 'Çeviri listesi sınırı aşıyor.';
  end if;

  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows) loop
    if pg_catalog.jsonb_typeof(v_row) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_row->'source_version') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_row->'expected_version') is distinct from 'number' then
      raise sqlstate '22023' using message = 'Çeviri adayı geçersiz.';
    end if;
    v_region_id := (v_row->>'region_id')::uuid;
    v_language := v_row->>'language';
    v_text := v_row->>'text';
    v_provider := v_row->>'provider';
    v_model := v_row->>'model';
    v_source_version := (v_row->>'source_version')::bigint;
    v_expected_version := (v_row->>'expected_version')::bigint;
    if v_region_id is null or not app_private.studio_language_valid(v_language)
      or v_text is null or pg_catalog.btrim(v_text) = ''
      or pg_catalog.length(v_text) > 10000
      or v_provider is null or pg_catalog.length(v_provider) not between 1 and 120
      or v_model is null or pg_catalog.length(v_model) not between 1 and 120
      or v_source_version < 1 or v_expected_version < 0 then
      raise sqlstate '22023' using message = 'Çeviri adayı eksik veya geçersiz.';
    end if;

    select r.source_version, project.rights_status
      into v_current_source_version, v_rights_status
    from public.studio_regions r
    join public.studio_pages page on page.id = r.page_id
    join public.studio_projects project on project.id = page.project_id
    where r.id = v_region_id for share of r;
    if not found then continue; end if;
    if v_rights_status <> 'active' then
      raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
    end if;
    if v_source_version <> v_current_source_version then continue; end if;

    if v_expected_version = 0 then
      insert into public.studio_translations
        (region_id, language, text, origin, review_state, source_version, provider, model)
      values (v_region_id, v_language, v_text, 'machine', 'machine',
        v_source_version, v_provider, v_model)
      on conflict (region_id, language) do nothing
      returning id, region_id, language, text, origin, review_state,
        source_version, provider, model, version into v_translation;
    else
      update public.studio_translations set text = v_text, origin = 'machine',
        review_state = 'machine', source_version = v_source_version,
        provider = v_provider, model = v_model
      where region_id = v_region_id and language = v_language
        and origin = 'machine' and version = v_expected_version
      returning id, region_id, language, text, origin, review_state,
        source_version, provider, model, version into v_translation;
    end if;
    if found then
      v_saved := v_saved || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id', v_translation.id, 'region_id', v_translation.region_id,
        'language', v_translation.language, 'text', v_translation.text,
        'origin', v_translation.origin, 'review_state', v_translation.review_state,
        'source_version', v_translation.source_version, 'provider', v_translation.provider,
        'model', v_translation.model, 'version', v_translation.version));
    end if;
  end loop;
  return v_saved;
end;
$function$;

create or replace function public.studio_machine_translations_apply(p_rows jsonb)
returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_machine_translations_apply(p_rows);
$function$;

revoke all on function app_private.studio_machine_translations_apply(jsonb),
  public.studio_machine_translations_apply(jsonb) from public, anon, authenticated;
grant execute on function app_private.studio_machine_translations_apply(jsonb),
  public.studio_machine_translations_apply(jsonb) to service_role;
