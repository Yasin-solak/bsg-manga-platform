begin;

create or replace function app_private.is_publishable_storefront_store_item(
  p_item_id uuid,
  p_item_type text
)
returns boolean
language sql
stable
set search_path = public, app_private
as $$
  select exists (
    select 1
    from public.store_items si
    where si.id = p_item_id
      and si.type::text = p_item_type
      and si.type::text in ('frame', 'profile_effect')
      and si.is_active = true
  );
$$;

create or replace function app_private.is_publishable_storefront_package(
  p_package_key text
)
returns boolean
language sql
stable
set search_path = public, app_private
as $$
  select exists (
    select 1
    from public.store_cosmetic_packages scp
    join public.store_items frame_item on frame_item.id = scp.frame_store_item_id
    join public.store_items effect_item on effect_item.id = scp.profile_effect_store_item_id
    where scp.package_key = btrim(coalesce(p_package_key, ''))
      and scp.package_key ~ '^[a-z0-9][a-z0-9_-]{1,99}$'
      and scp.is_active = true
      and frame_item.type::text = 'frame'
      and frame_item.is_active = true
      and effect_item.type::text = 'profile_effect'
      and effect_item.is_active = true
  );
$$;

create or replace function app_private.assert_storefront_home_publishable_payload(
  p_collections jsonb,
  p_campaigns jsonb
)
returns void
language plpgsql
stable
set search_path = public, app_private
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_collections, '[]'::jsonb)) collection_value
    cross join jsonb_array_elements(coalesce(collection_value->'items', '[]'::jsonb)) item_value
    where item_value->'merchandise'->>'kind' = 'store_item'
      and not app_private.is_publishable_storefront_store_item(
        (item_value->'merchandise'->>'itemId')::uuid,
        item_value->'merchandise'->>'itemType'
      )
  ) then
    raise exception 'Yayin koleksiyonlarinda pasif veya bulunamayan urun referansi var.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_collections, '[]'::jsonb)) collection_value
    cross join jsonb_array_elements(coalesce(collection_value->'items', '[]'::jsonb)) item_value
    where item_value->'merchandise'->>'kind' = 'package'
      and not app_private.is_publishable_storefront_package(item_value->'merchandise'->>'packageKey')
  ) then
    raise exception 'Yayin koleksiyonlarinda pasif, bulunamayan veya uyumsuz paket referansi var.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_campaigns, '[]'::jsonb)) campaign_value
    cross join jsonb_array_elements(coalesce(campaign_value->'heroLayers', '[]'::jsonb)) layer_value
    where layer_value->>'interactionMode' = 'commerce_card'
      and layer_value->'merchandise'->>'kind' = 'store_item'
      and not app_private.is_publishable_storefront_store_item(
        (layer_value->'merchandise'->>'itemId')::uuid,
        layer_value->'merchandise'->>'itemType'
      )
  ) then
    raise exception 'Yayin kampanya katmanlarinda pasif veya bulunamayan urun referansi var.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_campaigns, '[]'::jsonb)) campaign_value
    cross join jsonb_array_elements(coalesce(campaign_value->'heroLayers', '[]'::jsonb)) layer_value
    where layer_value->>'interactionMode' = 'commerce_card'
      and layer_value->'merchandise'->>'kind' = 'package'
      and not app_private.is_publishable_storefront_package(layer_value->'merchandise'->>'packageKey')
  ) then
    raise exception 'Yayin kampanya katmanlarinda pasif, bulunamayan veya uyumsuz paket referansi var.';
  end if;
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

  perform app_private.assert_storefront_home_publishable_payload(v_collections, v_campaigns);

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

revoke all on function app_private.is_publishable_storefront_store_item(uuid, text) from public;
revoke all on function app_private.is_publishable_storefront_package(text) from public;
revoke all on function app_private.assert_storefront_home_publishable_payload(jsonb, jsonb) from public;

notify pgrst, 'reload schema';

commit;
