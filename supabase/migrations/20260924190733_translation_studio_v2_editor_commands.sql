-- Translation Studio V2: editor commands are tied to a narrow schema on the server too.
-- Client validation alone does not make RLS/service role writes safe.

alter table public.studio_translations add constraint studio_translations_text_nonempty
  check (pg_catalog.btrim(text) <> '');

create or replace function app_private.studio_layer_commands_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_page record;
  v_command jsonb;
  v_point jsonb;
  v_region_id uuid;
  v_value numeric;
begin
  select page.raw_status, page.raw_width, page.raw_height,
    project.source_language, project.rights_status into v_page
  from public.studio_pages page
  join public.studio_projects project on project.id = page.project_id
  where page.id = new.page_id;
  if not found then
    raise sqlstate 'PT404' using message = 'Editör sayfası bulunamadı.';
  end if;
  if v_page.rights_status is distinct from 'active' then
    raise sqlstate 'PT403' using message = 'Editör sayfasına erişilemiyor.';
  end if;
  if v_page.raw_status <> 'ready' then
    raise sqlstate 'PT409' using message = 'Raw sayfa hazır olmadan editör komutu yazılamaz.';
  end if;
  if pg_catalog.jsonb_typeof(new.commands) is distinct from 'array' then
    raise sqlstate '22023' using message = 'Editör komut listesi dizi olmalıdır.';
  end if;
  if pg_catalog.jsonb_array_length(new.commands) > 1000
    or pg_catalog.octet_length(new.commands::text) > 1048576 then
    raise sqlstate '22023' using message = 'Editör komut listesi geçersiz.';
  end if;
  for v_command in select value from pg_catalog.jsonb_array_elements(new.commands) loop
    if pg_catalog.jsonb_typeof(v_command) is distinct from 'object' then
      raise sqlstate '22023' using message = 'Editör komutu nesne olmalıdır.';
    end if;
    if v_command->>'type' = 'mask_stroke' then
      if new.language <> '*'
        or v_command - 'type' - 'points' - 'radius' <> '{}'::jsonb
        or pg_catalog.jsonb_typeof(v_command->'points') is distinct from 'array'
        or pg_catalog.jsonb_array_length(v_command->'points') not between 1 and 256
        or pg_catalog.jsonb_typeof(v_command->'radius') is distinct from 'number' then
        raise sqlstate '22023' using message = 'Temizleme fırçası geçersiz.';
      end if;
      v_value := (v_command->>'radius')::numeric;
      if v_value <> pg_catalog.trunc(v_value) or v_value not between 2 and 80 then
        raise sqlstate '22023' using message = 'Fırça yarıçapı geçersiz.';
      end if;
      for v_point in select value from pg_catalog.jsonb_array_elements(v_command->'points') loop
        if pg_catalog.jsonb_typeof(v_point) is distinct from 'object'
          or v_point - 'x' - 'y' <> '{}'::jsonb
          or pg_catalog.jsonb_typeof(v_point->'x') is distinct from 'number'
          or pg_catalog.jsonb_typeof(v_point->'y') is distinct from 'number' then
          raise sqlstate '22023' using message = 'Fırça noktası geçersiz.';
        end if;
        v_value := (v_point->>'x')::numeric;
        if v_value <> pg_catalog.trunc(v_value)
          or v_value < 0 or v_value > v_page.raw_width then
          raise sqlstate '22023' using message = 'Fırça X koordinatı sayfayı aşıyor.';
        end if;
        v_value := (v_point->>'y')::numeric;
        if v_value <> pg_catalog.trunc(v_value)
          or v_value < 0 or v_value > v_page.raw_height then
          raise sqlstate '22023' using message = 'Fırça Y koordinatı sayfayı aşıyor.';
        end if;
      end loop;
    elsif v_command->>'type' = 'text_style' then
      if new.language = '*' or new.language = v_page.source_language
        or v_command - 'type' - 'region_id' - 'font_size' - 'align' - 'color' <> '{}'::jsonb
        or coalesce(v_command->>'region_id', '') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or pg_catalog.jsonb_typeof(v_command->'font_size') is distinct from 'number'
        or coalesce(v_command->>'align', '') not in ('left', 'center', 'right')
        or coalesce(v_command->>'color', '') !~ '^#[0-9a-fA-F]{6}$' then
        raise sqlstate '22023' using message = 'Metin stili geçersiz.';
      end if;
      v_value := (v_command->>'font_size')::numeric;
      if v_value <> pg_catalog.trunc(v_value) or v_value not between 8 and 96 then
        raise sqlstate '22023' using message = 'Yazı boyutu geçersiz.';
      end if;
      v_region_id := (v_command->>'region_id')::uuid;
      if not exists (
        select 1 from public.studio_regions region
        where region.id = v_region_id and region.page_id = new.page_id
      ) then
        raise sqlstate 'PT409' using message = 'Metin stili başka sayfanın bölgesine bağlı.';
      end if;
    else
      raise sqlstate '22023' using message = 'Editör komut türü desteklenmiyor.';
    end if;
  end loop;
  return new;
end;
$function$;

create trigger studio_layer_commands_guard before insert or update on public.studio_page_layers
for each row execute function app_private.studio_layer_commands_guard();

-- The main reader RPC applies the access gate; this layer adds only validated style commands.
create or replace function app_private.studio_reader_overlay_with_styles(
  p_chapter_id uuid, p_language text
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_overlay jsonb;
  v_manifest jsonb;
  v_project_id uuid;
  v_page jsonb;
  v_manifest_page jsonb;
  v_styles jsonb;
  v_style_map jsonb := '{}'::jsonb;
  v_pages jsonb := '[]'::jsonb;
begin
  v_overlay := app_private.studio_reader_overlay(p_chapter_id, p_language);
  if v_overlay is null then return null; end if;
  select publication.manifest, publication.project_id into v_manifest, v_project_id
  from public.studio_publications publication
  where publication.id = (v_overlay->>'publication_id')::uuid;
  if not found then return null; end if;
  -- A raw page can have many segments; parse JSON commands once per page.
  select coalesce(pg_catalog.jsonb_object_agg(layer.page_id::text,
    styles.commands), '{}'::jsonb) into v_style_map
  from public.studio_page_layers layer
  join public.studio_pages raw_page on raw_page.id = layer.page_id
  cross join lateral (
    select coalesce(pg_catalog.jsonb_agg(command.value
      order by command.ordinality), '[]'::jsonb) as commands
    from pg_catalog.jsonb_array_elements(layer.commands)
      with ordinality as command(value, ordinality)
    where command.value->>'type' = 'text_style'
  ) styles
  where raw_page.project_id = v_project_id and layer.language = p_language;
  for v_page in select value from pg_catalog.jsonb_array_elements(v_overlay->'pages') loop
    v_manifest_page := v_manifest->'pages'->(v_page->>'page_index')::integer;
    v_styles := coalesce(
      v_style_map->(v_manifest_page->>'studio_page_id'), '[]'::jsonb);
    v_pages := v_pages || pg_catalog.jsonb_build_array(
      v_page || pg_catalog.jsonb_build_object('text_styles', v_styles));
  end loop;
  return pg_catalog.jsonb_set(v_overlay, '{pages}', v_pages);
end;
$function$;

create or replace function public.studio_reader_overlay(
  p_chapter_id uuid, p_language text
) returns jsonb language sql stable security invoker set search_path = '' as $function$
  select app_private.studio_reader_overlay_with_styles(p_chapter_id, p_language);
$function$;

revoke all on function app_private.studio_layer_commands_guard(),
  app_private.studio_reader_overlay_with_styles(uuid, text) from public, anon, authenticated;
grant execute on function app_private.studio_reader_overlay_with_styles(uuid, text)
  to anon, authenticated, service_role;
