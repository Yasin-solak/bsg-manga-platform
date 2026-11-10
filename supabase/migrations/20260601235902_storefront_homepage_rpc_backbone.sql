begin;

grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.storefront_home_collection_contract(
  p_row public.storefront_home_collections
)
returns jsonb
language sql
stable
set search_path = public, app_private
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', (p_row).id,
    'slug', (p_row).slug,
    'name', (p_row).name,
    'description', (p_row).description,
    'status', (p_row).status,
    'desktopBannerAssetUrl', (p_row).desktop_banner_asset_url,
    'mobileBannerAssetUrl', (p_row).mobile_banner_asset_url,
    'startsAt', (p_row).starts_at,
    'endsAt', (p_row).ends_at,
    'items', (p_row).items
  ));
$$;

create or replace function app_private.storefront_home_campaign_contract(
  p_row public.storefront_home_campaigns
)
returns jsonb
language sql
stable
set search_path = public, app_private
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', (p_row).id,
    'slug', (p_row).slug,
    'name', (p_row).name,
    'status', (p_row).status,
    'collectionId', (p_row).collection_id,
    'desktopBannerAssetUrl', (p_row).desktop_banner_asset_url,
    'mobileBannerAssetUrl', (p_row).mobile_banner_asset_url,
    'logoAssetUrl', (p_row).logo_asset_url,
    'startsAt', (p_row).starts_at,
    'endsAt', (p_row).ends_at,
    'heroLayers', (p_row).hero_layers
  ));
$$;

create or replace function app_private.storefront_home_draft_contract(
  p_row public.storefront_homepage_drafts
)
returns jsonb
language sql
stable
set search_path = public, app_private
as $$
  select jsonb_build_object(
    'schemaVersion', (p_row).schema_version,
    'draftId', (p_row).id,
    'updatedAt', (p_row).updated_at,
    'document', (p_row).document
  );
$$;

create or replace function app_private.storefront_home_snapshot_contract(
  p_row public.storefront_homepage_snapshots
)
returns jsonb
language sql
stable
set search_path = public, app_private
as $$
  select jsonb_build_object(
    'schemaVersion', (p_row).schema_version,
    'snapshotId', (p_row).id,
    'publishedAt', (p_row).published_at,
    'document', (p_row).document,
    'collections', (p_row).collections_payload,
    'campaigns', (p_row).campaigns_payload
  );
$$;

create or replace function app_private.ensure_storefront_homepage_draft()
returns public.storefront_homepage_drafts
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_row public.storefront_homepage_drafts%rowtype;
begin
  insert into public.storefront_homepage_drafts (draft_key)
  values ('default')
  on conflict (draft_key) do nothing;

  select *
  into v_row
  from public.storefront_homepage_drafts
  where draft_key = 'default'
  limit 1;

  return v_row;
end;
$$;

create or replace function app_private.admin_get_storefront_homepage_workspace_impl()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_draft public.storefront_homepage_drafts%rowtype;
  v_collections jsonb;
  v_campaigns jsonb;
  v_active_snapshot public.storefront_homepage_snapshots%rowtype;
begin
  if public.current_public_user_id() is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  v_draft := app_private.ensure_storefront_homepage_draft();

  select coalesce(jsonb_agg(app_private.storefront_home_collection_contract(c) order by c.updated_at desc), '[]'::jsonb)
  into v_collections
  from public.storefront_home_collections c;

  select coalesce(jsonb_agg(app_private.storefront_home_campaign_contract(c) order by c.updated_at desc), '[]'::jsonb)
  into v_campaigns
  from public.storefront_home_campaigns c;

  select *
  into v_active_snapshot
  from public.storefront_homepage_snapshots s
  where s.is_active = true
  order by s.published_at desc
  limit 1;

  return jsonb_build_object(
    'collections', v_collections,
    'campaigns', v_campaigns,
    'draft', app_private.storefront_home_draft_contract(v_draft),
    'activeSnapshot', case
      when v_active_snapshot.id is null then null
      else app_private.storefront_home_snapshot_contract(v_active_snapshot)
    end
  );
end;
$$;

create or replace function app_private.admin_upsert_storefront_home_collection_impl(
  p_collection_id uuid default null,
  p_slug text default '',
  p_name text default '',
  p_description text default null,
  p_status text default 'draft',
  p_desktop_banner_asset_url text default null,
  p_mobile_banner_asset_url text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.storefront_home_collections%rowtype;
  v_is_insert boolean := p_collection_id is null;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if btrim(coalesce(p_slug, '')) = '' or btrim(coalesce(p_name, '')) = '' then
    raise exception 'Koleksiyon slug ve ad alanlari zorunludur.';
  end if;

  if p_status not in ('draft', 'active', 'archived') then
    raise exception 'Gecersiz koleksiyon durumu.';
  end if;

  if p_desktop_banner_asset_url is not null and not app_private.is_valid_storefront_asset_ref(p_desktop_banner_asset_url) then
    raise exception 'Desktop banner referansi gecersiz.';
  end if;

  if p_mobile_banner_asset_url is not null and not app_private.is_valid_storefront_asset_ref(p_mobile_banner_asset_url) then
    raise exception 'Mobil banner referansi gecersiz.';
  end if;

  if p_collection_id is null then
    insert into public.storefront_home_collections (
      slug, name, description, status, desktop_banner_asset_url, mobile_banner_asset_url,
      starts_at, ends_at, items, created_by, updated_by
    )
    values (
      lower(btrim(p_slug)), btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
      p_status, nullif(btrim(coalesce(p_desktop_banner_asset_url, '')), ''),
      nullif(btrim(coalesce(p_mobile_banner_asset_url, '')), ''),
      p_starts_at, p_ends_at, coalesce(p_items, '[]'::jsonb), v_actor_id, v_actor_id
    )
    returning * into v_row;
  else
    update public.storefront_home_collections c
    set
      slug = lower(btrim(p_slug)),
      name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      status = p_status,
      desktop_banner_asset_url = nullif(btrim(coalesce(p_desktop_banner_asset_url, '')), ''),
      mobile_banner_asset_url = nullif(btrim(coalesce(p_mobile_banner_asset_url, '')), ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      items = coalesce(p_items, '[]'::jsonb),
      updated_by = v_actor_id
    where c.id = p_collection_id
    returning * into v_row;

    if not found then
      raise exception 'Koleksiyon bulunamadi.';
    end if;
  end if;

  perform public.create_admin_audit_log(
    case when v_is_insert then 'storefront_home_collection.create' else 'storefront_home_collection.update' end,
    'storefront_home_collection',
    v_row.id::text,
    format('%s koleksiyonu kaydedildi.', v_row.name),
    jsonb_build_object('slug', v_row.slug, 'status', v_row.status, 'itemCount', jsonb_array_length(v_row.items))
  );

  return app_private.storefront_home_collection_contract(v_row);
end;
$$;

create or replace function app_private.admin_archive_storefront_home_collection_impl(p_collection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.storefront_home_collections%rowtype;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  update public.storefront_home_collections c
  set status = 'archived', updated_by = v_actor_id
  where c.id = p_collection_id
  returning * into v_row;

  if not found then
    raise exception 'Koleksiyon bulunamadi.';
  end if;

  perform public.create_admin_audit_log(
    'storefront_home_collection.archive',
    'storefront_home_collection',
    v_row.id::text,
    format('%s koleksiyonu arsivlendi.', v_row.name),
    jsonb_build_object('slug', v_row.slug)
  );

  return app_private.storefront_home_collection_contract(v_row);
end;
$$;

create or replace function app_private.admin_upsert_storefront_home_campaign_impl(
  p_campaign_id uuid default null,
  p_slug text default '',
  p_name text default '',
  p_status text default 'draft',
  p_collection_id uuid default null,
  p_desktop_banner_asset_url text default '',
  p_mobile_banner_asset_url text default null,
  p_logo_asset_url text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_hero_layers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.storefront_home_campaigns%rowtype;
  v_is_insert boolean := p_campaign_id is null;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if btrim(coalesce(p_slug, '')) = '' or btrim(coalesce(p_name, '')) = '' or p_collection_id is null then
    raise exception 'Kampanya slug, ad ve koleksiyon alanlari zorunludur.';
  end if;

  if p_status not in ('draft', 'scheduled', 'active', 'archived') then
    raise exception 'Gecersiz kampanya durumu.';
  end if;

  if not app_private.is_valid_storefront_asset_ref(p_desktop_banner_asset_url) then
    raise exception 'Desktop banner referansi gecersiz.';
  end if;

  if not exists (
    select 1 from public.storefront_home_collections c where c.id = p_collection_id and c.status <> 'archived'
  ) then
    raise exception 'Kampanya icin aktif veya taslak koleksiyon bulunamadi.';
  end if;

  if p_mobile_banner_asset_url is not null and not app_private.is_valid_storefront_asset_ref(p_mobile_banner_asset_url) then
    raise exception 'Mobil banner referansi gecersiz.';
  end if;

  if p_logo_asset_url is not null and not app_private.is_valid_storefront_asset_ref(p_logo_asset_url) then
    raise exception 'Logo referansi gecersiz.';
  end if;

  if p_campaign_id is null then
    insert into public.storefront_home_campaigns (
      slug, name, status, collection_id, desktop_banner_asset_url, mobile_banner_asset_url,
      logo_asset_url, starts_at, ends_at, hero_layers, created_by, updated_by
    )
    values (
      lower(btrim(p_slug)), btrim(p_name), p_status, p_collection_id, btrim(p_desktop_banner_asset_url),
      nullif(btrim(coalesce(p_mobile_banner_asset_url, '')), ''),
      nullif(btrim(coalesce(p_logo_asset_url, '')), ''),
      p_starts_at, p_ends_at, coalesce(p_hero_layers, '[]'::jsonb), v_actor_id, v_actor_id
    )
    returning * into v_row;
  else
    update public.storefront_home_campaigns c
    set
      slug = lower(btrim(p_slug)),
      name = btrim(p_name),
      status = p_status,
      collection_id = p_collection_id,
      desktop_banner_asset_url = btrim(p_desktop_banner_asset_url),
      mobile_banner_asset_url = nullif(btrim(coalesce(p_mobile_banner_asset_url, '')), ''),
      logo_asset_url = nullif(btrim(coalesce(p_logo_asset_url, '')), ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      hero_layers = coalesce(p_hero_layers, '[]'::jsonb),
      updated_by = v_actor_id
    where c.id = p_campaign_id
    returning * into v_row;

    if not found then
      raise exception 'Kampanya bulunamadi.';
    end if;
  end if;

  perform public.create_admin_audit_log(
    case when v_is_insert then 'storefront_home_campaign.create' else 'storefront_home_campaign.update' end,
    'storefront_home_campaign',
    v_row.id::text,
    format('%s kampanyasi kaydedildi.', v_row.name),
    jsonb_build_object('slug', v_row.slug, 'status', v_row.status, 'collectionId', v_row.collection_id)
  );

  return app_private.storefront_home_campaign_contract(v_row);
end;
$$;

create or replace function app_private.admin_archive_storefront_home_campaign_impl(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.storefront_home_campaigns%rowtype;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  update public.storefront_home_campaigns c
  set status = 'archived', updated_by = v_actor_id
  where c.id = p_campaign_id
  returning * into v_row;

  if not found then
    raise exception 'Kampanya bulunamadi.';
  end if;

  perform public.create_admin_audit_log(
    'storefront_home_campaign.archive',
    'storefront_home_campaign',
    v_row.id::text,
    format('%s kampanyasi arsivlendi.', v_row.name),
    jsonb_build_object('slug', v_row.slug)
  );

  return app_private.storefront_home_campaign_contract(v_row);
end;
$$;

create or replace function app_private.admin_save_storefront_homepage_draft_impl(p_document jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.storefront_homepage_drafts%rowtype;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if not app_private.is_valid_storefront_homepage_document(p_document) then
    raise exception 'Ana sayfa taslagi gecersiz.';
  end if;

  insert into public.storefront_homepage_drafts (draft_key, document, updated_by)
  values ('default', p_document, v_actor_id)
  on conflict (draft_key) do update
    set document = excluded.document,
        updated_by = excluded.updated_by
  returning * into v_row;

  perform public.create_admin_audit_log(
    'storefront_homepage_draft.save',
    'storefront_homepage_draft',
    v_row.id::text,
    'Magaza ana sayfa taslagi kaydedildi.',
    jsonb_build_object('sectionCount', jsonb_array_length(v_row.document->'sections'))
  );

  return app_private.storefront_home_draft_contract(v_row);
end;
$$;

create or replace function app_private.admin_publish_storefront_homepage_snapshot_impl(
  p_document jsonb default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_draft public.storefront_homepage_drafts%rowtype;
  v_document jsonb;
  v_campaign_ids uuid[] := array[]::uuid[];
  v_collection_ids uuid[] := array[]::uuid[];
  v_campaign_collections uuid[] := array[]::uuid[];
  v_target_collections uuid[] := array[]::uuid[];
  v_campaign_target_collections uuid[] := array[]::uuid[];
  v_campaigns jsonb;
  v_collections jsonb;
  v_snapshot public.storefront_homepage_snapshots%rowtype;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  v_draft := app_private.ensure_storefront_homepage_draft();
  v_document := coalesce(p_document, v_draft.document);

  if not app_private.is_valid_storefront_homepage_document(v_document) then
    raise exception 'Yayin dokumani gecersiz.';
  end if;

  select coalesce(array_agg(distinct (section_value->>'campaignId')::uuid), array[]::uuid[])
  into v_campaign_ids
  from jsonb_array_elements(v_document->'sections') section_value
  where nullif(section_value->>'campaignId', '') is not null;

  select coalesce(array_agg(distinct (section_value->>'collectionId')::uuid), array[]::uuid[])
  into v_collection_ids
  from jsonb_array_elements(v_document->'sections') section_value
  where section_value->>'type' = 'product_rail';

  select coalesce(array_agg(distinct c.collection_id), array[]::uuid[])
  into v_campaign_collections
  from public.storefront_home_campaigns c
  where c.id = any(v_campaign_ids);

  select coalesce(array_agg(distinct (section_value->'target'->>'collectionId')::uuid), array[]::uuid[])
  into v_target_collections
  from jsonb_array_elements(v_document->'sections') section_value
  where section_value->'target'->>'kind' = 'collection';

  select coalesce(array_agg(distinct (layer_value->'target'->>'collectionId')::uuid), array[]::uuid[])
  into v_campaign_target_collections
  from public.storefront_home_campaigns c
  cross join jsonb_array_elements(c.hero_layers) layer_value
  where c.id = any(v_campaign_ids)
    and layer_value->'target'->>'kind' = 'collection';

  v_collection_ids := array(
    select distinct unnest(
      v_collection_ids || v_campaign_collections || v_target_collections || v_campaign_target_collections
    )
  );

  if cardinality(v_campaign_ids) <> (
    select count(*) from public.storefront_home_campaigns c where c.id = any(v_campaign_ids)
  ) then
    raise exception 'Yayin dokumaninda bulunamayan kampanya referansi var.';
  end if;

  if cardinality(v_collection_ids) <> (
    select count(*) from public.storefront_home_collections c where c.id = any(v_collection_ids)
  ) then
    raise exception 'Yayin dokumaninda bulunamayan koleksiyon referansi var.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_document->'sections') section_value
    join public.storefront_home_campaigns c
      on c.id = (section_value->>'campaignId')::uuid
    where section_value->>'type' = 'product_rail'
      and nullif(section_value->>'campaignId', '') is not null
      and c.collection_id <> (section_value->>'collectionId')::uuid
  ) then
    raise exception 'Urun rayi kampanyasi ray koleksiyonuyla eslesmeli.';
  end if;

  if exists (
    select 1 from public.storefront_home_collections c
    where c.id = any(v_collection_ids) and c.status <> 'active'
  ) then
    raise exception 'Yayin icin tum koleksiyonlar aktif olmalidir.';
  end if;

  if exists (
    select 1 from public.storefront_home_campaigns c
    where c.id = any(v_campaign_ids) and c.status not in ('active', 'scheduled')
  ) then
    raise exception 'Yayin icin kampanyalar aktif veya zamanlanmis olmalidir.';
  end if;

  select coalesce(jsonb_agg(app_private.storefront_home_collection_contract(c) order by c.updated_at desc), '[]'::jsonb)
  into v_collections
  from public.storefront_home_collections c
  where c.id = any(v_collection_ids);

  select coalesce(jsonb_agg(app_private.storefront_home_campaign_contract(c) order by c.updated_at desc), '[]'::jsonb)
  into v_campaigns
  from public.storefront_home_campaigns c
  where c.id = any(v_campaign_ids);

  update public.storefront_homepage_snapshots s
  set is_active = false,
      archived_at = coalesce(s.archived_at, now())
  where s.is_active = true;

  insert into public.storefront_homepage_snapshots (
    document, collections_payload, campaigns_payload, is_active, note, published_by
  )
  values (
    v_document, v_collections, v_campaigns, true, nullif(btrim(coalesce(p_note, '')), ''), v_actor_id
  )
  returning * into v_snapshot;

  perform public.create_admin_audit_log(
    'storefront_homepage_snapshot.publish',
    'storefront_homepage_snapshot',
    v_snapshot.id::text,
    'Magaza ana sayfasi yayina alindi.',
    jsonb_build_object(
      'sectionCount', jsonb_array_length(v_document->'sections'),
      'collectionCount', jsonb_array_length(v_collections),
      'campaignCount', jsonb_array_length(v_campaigns)
    )
  );

  return app_private.storefront_home_snapshot_contract(v_snapshot);
end;
$$;

create or replace function app_private.admin_rollback_storefront_homepage_snapshot_impl(p_snapshot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_snapshot public.storefront_homepage_snapshots%rowtype;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  select *
  into v_snapshot
  from public.storefront_homepage_snapshots s
  where s.id = p_snapshot_id
  for update;

  if not found then
    raise exception 'Snapshot bulunamadi.';
  end if;

  update public.storefront_homepage_snapshots s
  set is_active = false,
      archived_at = coalesce(s.archived_at, now())
  where s.is_active = true
    and s.id <> p_snapshot_id;

  update public.storefront_homepage_snapshots s
  set is_active = true,
      archived_at = null
  where s.id = p_snapshot_id
  returning * into v_snapshot;

  perform public.create_admin_audit_log(
    'storefront_homepage_snapshot.rollback',
    'storefront_homepage_snapshot',
    v_snapshot.id::text,
    'Magaza ana sayfasi onceki snapshot ile geri alindi.',
    jsonb_build_object('publishedAt', v_snapshot.published_at)
  );

  return app_private.storefront_home_snapshot_contract(v_snapshot);
end;
$$;

create or replace function app_private.get_public_storefront_homepage_snapshot_impl()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_snapshot public.storefront_homepage_snapshots%rowtype;
begin
  select *
  into v_snapshot
  from public.storefront_homepage_snapshots s
  where s.is_active = true
  order by s.published_at desc
  limit 1;

  if v_snapshot.id is null then
    return null;
  end if;

  return app_private.storefront_home_snapshot_contract(v_snapshot);
end;
$$;

create or replace function public.admin_get_storefront_homepage_workspace()
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_get_storefront_homepage_workspace_impl(); $$;

create or replace function public.admin_upsert_storefront_home_collection(
  p_collection_id uuid default null,
  p_slug text default '',
  p_name text default '',
  p_description text default null,
  p_status text default 'draft',
  p_desktop_banner_asset_url text default null,
  p_mobile_banner_asset_url text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_upsert_storefront_home_collection_impl($1,$2,$3,$4,$5,$6,$7,$8,$9,$10); $$;

create or replace function public.admin_archive_storefront_home_collection(p_collection_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_archive_storefront_home_collection_impl($1); $$;

create or replace function public.admin_upsert_storefront_home_campaign(
  p_campaign_id uuid default null,
  p_slug text default '',
  p_name text default '',
  p_status text default 'draft',
  p_collection_id uuid default null,
  p_desktop_banner_asset_url text default '',
  p_mobile_banner_asset_url text default null,
  p_logo_asset_url text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_hero_layers jsonb default '[]'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_upsert_storefront_home_campaign_impl($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11); $$;

create or replace function public.admin_archive_storefront_home_campaign(p_campaign_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_archive_storefront_home_campaign_impl($1); $$;

create or replace function public.admin_save_storefront_homepage_draft(p_document jsonb)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_save_storefront_homepage_draft_impl($1); $$;

create or replace function public.admin_publish_storefront_homepage_snapshot(
  p_document jsonb default null,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_publish_storefront_homepage_snapshot_impl($1,$2); $$;

create or replace function public.admin_rollback_storefront_homepage_snapshot(p_snapshot_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.admin_rollback_storefront_homepage_snapshot_impl($1); $$;

create or replace function public.get_public_storefront_homepage_snapshot()
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $$ select app_private.get_public_storefront_homepage_snapshot_impl(); $$;

revoke all on function public.admin_get_storefront_homepage_workspace() from public;
revoke all on function public.admin_upsert_storefront_home_collection(uuid, text, text, text, text, text, text, timestamptz, timestamptz, jsonb) from public;
revoke all on function public.admin_archive_storefront_home_collection(uuid) from public;
revoke all on function public.admin_upsert_storefront_home_campaign(uuid, text, text, text, uuid, text, text, text, timestamptz, timestamptz, jsonb) from public;
revoke all on function public.admin_archive_storefront_home_campaign(uuid) from public;
revoke all on function public.admin_save_storefront_homepage_draft(jsonb) from public;
revoke all on function public.admin_publish_storefront_homepage_snapshot(jsonb, text) from public;
revoke all on function public.admin_rollback_storefront_homepage_snapshot(uuid) from public;
revoke all on function public.get_public_storefront_homepage_snapshot() from public;

grant execute on function public.admin_get_storefront_homepage_workspace() to authenticated;
grant execute on function public.admin_upsert_storefront_home_collection(uuid, text, text, text, text, text, text, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.admin_archive_storefront_home_collection(uuid) to authenticated;
grant execute on function public.admin_upsert_storefront_home_campaign(uuid, text, text, text, uuid, text, text, text, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.admin_archive_storefront_home_campaign(uuid) to authenticated;
grant execute on function public.admin_save_storefront_homepage_draft(jsonb) to authenticated;
grant execute on function public.admin_publish_storefront_homepage_snapshot(jsonb, text) to authenticated;
grant execute on function public.admin_rollback_storefront_homepage_snapshot(uuid) to authenticated;
grant execute on function public.get_public_storefront_homepage_snapshot() to anon, authenticated;

revoke all on function app_private.admin_get_storefront_homepage_workspace_impl() from public;
revoke all on function app_private.ensure_storefront_homepage_draft() from public;
revoke all on function app_private.admin_upsert_storefront_home_collection_impl(uuid, text, text, text, text, text, text, timestamptz, timestamptz, jsonb) from public;
revoke all on function app_private.admin_archive_storefront_home_collection_impl(uuid) from public;
revoke all on function app_private.admin_upsert_storefront_home_campaign_impl(uuid, text, text, text, uuid, text, text, text, timestamptz, timestamptz, jsonb) from public;
revoke all on function app_private.admin_archive_storefront_home_campaign_impl(uuid) from public;
revoke all on function app_private.admin_save_storefront_homepage_draft_impl(jsonb) from public;
revoke all on function app_private.admin_publish_storefront_homepage_snapshot_impl(jsonb, text) from public;
revoke all on function app_private.admin_rollback_storefront_homepage_snapshot_impl(uuid) from public;
revoke all on function app_private.get_public_storefront_homepage_snapshot_impl() from public;

grant execute on function app_private.admin_get_storefront_homepage_workspace_impl() to authenticated;
grant execute on function app_private.admin_upsert_storefront_home_collection_impl(uuid, text, text, text, text, text, text, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function app_private.admin_archive_storefront_home_collection_impl(uuid) to authenticated;
grant execute on function app_private.admin_upsert_storefront_home_campaign_impl(uuid, text, text, text, uuid, text, text, text, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function app_private.admin_archive_storefront_home_campaign_impl(uuid) to authenticated;
grant execute on function app_private.admin_save_storefront_homepage_draft_impl(jsonb) to authenticated;
grant execute on function app_private.admin_publish_storefront_homepage_snapshot_impl(jsonb, text) to authenticated;
grant execute on function app_private.admin_rollback_storefront_homepage_snapshot_impl(uuid) to authenticated;
grant execute on function app_private.get_public_storefront_homepage_snapshot_impl() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
