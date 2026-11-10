-- Community post image SPOILER support.
--
-- Each uploaded image can be marked "spoiler"; it shows blurred + opens with "Goster"
-- (Discord/Reddit style). GIFs are out of scope (a single-type limit already exists).
--
-- 1) community_post_assets.is_spoiler column.
-- 2) get_community_post_assets: isSpoiler added to output (singular get_community_post_asset
-- takes [0] of this function so it is covered automatically).
-- 3) get_fansub_reported_post_media: isSpoiler added for the reported post fix dialog.
-- 4) fansub_fix_reported_post: writes is_spoiler on newly added images.

begin;

alter table public.community_post_assets
  add column if not exists is_spoiler boolean not null default false;

-- ──────────────────────────────────────────────────────────────────────────
-- get_community_post_assets: add isSpoiler (body from 190, one field differs).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.get_community_post_assets(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cpa.id,
        'postId', cpa.post_id,
        'assetType', cpa.asset_type,
        'provider', cpa.provider,
        'providerAssetId', cpa.provider_asset_id,
        'originalUrl', cpa.original_url,
        'previewUrl', cpa.preview_url,
        'width', cpa.width,
        'height', cpa.height,
        'altText', cpa.alt_text,
        'position', cpa.position,
        'isSpoiler', cpa.is_spoiler,
        'metadata', cpa.metadata
      )
      order by cpa.position asc, cpa.created_at asc
    ),
    '[]'::jsonb
  )
  from public.community_post_assets cpa
  join public.community_posts cp on cp.id = cpa.post_id
  where cpa.post_id = p_post_id
    and (
      (cp.status = 'approved' and cp.is_active = true)
      or cp.author_id = public.current_public_user_id()
      or public.is_admin()
    );
$$;

revoke all on function public.get_community_post_assets(uuid) from public;
grant execute on function public.get_community_post_assets(uuid) to anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- get_fansub_reported_post_media: add isSpoiler to assets (body from 244).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.get_fansub_reported_post_media(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fansub_id uuid;
  v_target_type text;
  v_target_id uuid;
  v_assets jsonb;
  v_poll jsonb;
begin
  if public.current_public_user_id() is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  select fr.fansub_id, fr.target_type, fr.target_id
    into v_fansub_id, v_target_type, v_target_id
  from public.fansub_reported_content fr
  where fr.id = p_id;

  if v_fansub_id is null then
    raise exception 'Duzeltme kaydi bulunamadi.';
  end if;

  if v_target_type <> 'post' then
    raise exception 'Bu kayit bir topluluk gonderisi degil.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(v_fansub_id)) then
    raise exception 'Bu icerigi gorme yetkiniz yok.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cpa.id,
      'assetType', cpa.asset_type,
      'provider', cpa.provider,
      'providerAssetId', cpa.provider_asset_id,
      'originalUrl', cpa.original_url,
      'previewUrl', cpa.preview_url,
      'width', cpa.width,
      'height', cpa.height,
      'altText', cpa.alt_text,
      'position', cpa.position,
      'isSpoiler', cpa.is_spoiler
    )
    order by cpa.position asc nulls last, cpa.created_at asc
  ), '[]'::jsonb)
  into v_assets
  from public.community_post_assets cpa
  where cpa.post_id = v_target_id;

  select case when p.id is null then null else jsonb_build_object(
    'id', p.id,
    'closesAt', p.closes_at,
    'totalVotesCount', p.total_votes_count,
    'options', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', o.id, 'label', o.label, 'position', o.position, 'votesCount', o.votes_count)
        order by o.position asc
      )
      from public.community_post_poll_options o
      where o.poll_id = p.id
    ), '[]'::jsonb)
  ) end
  into v_poll
  from public.community_post_polls p
  where p.post_id = v_target_id
  limit 1;

  return jsonb_build_object('assets', v_assets, 'poll', v_poll);
end;
$$;

grant execute on function public.get_fansub_reported_post_media(uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- fansub_fix_reported_post: writes is_spoiler on added images (body from 244,
-- only the asset insert line changed).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.fansub_fix_reported_post(
  p_id uuid,
  p_title text,
  p_body text,
  p_category text default null,
  p_remove_asset_ids uuid[] default '{}',
  p_add_assets jsonb default '[]'::jsonb,
  p_poll_action text default 'keep',
  p_poll_options jsonb default '[]'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_fansub_id uuid;
  v_target_type text;
  v_target_id uuid;
  v_status text;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_category text := nullif(trim(coalesce(p_category, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_poll_action text := lower(trim(coalesce(p_poll_action, 'keep')));
  v_remove uuid[] := coalesce(p_remove_asset_ids, '{}');
  v_asset jsonb;
  v_opt jsonb;
  v_poll_id uuid;
  v_pos int := 0;
  v_image_count int;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  select fr.fansub_id, fr.target_type, fr.target_id, fr.status
    into v_fansub_id, v_target_type, v_target_id, v_status
  from public.fansub_reported_content fr
  where fr.id = p_id;

  if v_fansub_id is null then
    raise exception 'Duzeltme kaydi bulunamadi.';
  end if;

  if v_target_type <> 'post' then
    raise exception 'Bu kayit bir topluluk gonderisi degil.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(v_fansub_id)) then
    raise exception 'Bu islemi yalnizca fansub yoneticisi yapabilir.';
  end if;

  if v_status <> 'awaiting_fix' then
    raise exception 'Bu kayit zaten yeniden incelemeye gonderilmis veya kapanmis.';
  end if;

  if v_title is null and v_body is null then
    raise exception 'Baslik veya icerik bos birakilamaz.';
  end if;

  if v_poll_action not in ('keep', 'replace', 'delete') then
    v_poll_action := 'keep';
  end if;

  update public.community_posts
    set title = coalesce(v_title, title),
        body = coalesce(v_body, body),
        category = coalesce(v_category, category),
        is_active = true,
        status = 'pending'
  where id = v_target_id
    and related_fansub_id = v_fansub_id;

  if not found then
    raise exception 'Gonderi bulunamadi veya bu fansub adina paylasilmis bir gonderi degil.';
  end if;

  if array_length(v_remove, 1) is not null then
    delete from public.community_post_assets
    where post_id = v_target_id
      and id = any(v_remove);
  end if;

  if jsonb_typeof(p_add_assets) = 'array' then
    for v_asset in select * from jsonb_array_elements(p_add_assets)
    loop
      insert into public.community_post_assets (
        post_id, asset_type, provider, provider_asset_id,
        original_url, preview_url, width, height, alt_text, position, is_spoiler, metadata
      ) values (
        v_target_id,
        'image',
        'r2',
        v_asset->>'objectPath',
        v_asset->>'assetRef',
        v_asset->>'assetRef',
        greatest(0, floor(coalesce((v_asset->>'width')::numeric, 0))::int),
        greatest(0, floor(coalesce((v_asset->>'height')::numeric, 0))::int),
        nullif(trim(coalesce(v_asset->>'altText', '')), ''),
        coalesce((v_asset->>'position')::int, 1),
        coalesce((v_asset->>'isSpoiler')::boolean, false),
        coalesce(v_asset->'metadata', '{}'::jsonb)
      );
    end loop;
  end if;

  select count(*) into v_image_count
  from public.community_post_assets
  where post_id = v_target_id and asset_type = 'image';
  if v_image_count > 4 then
    raise exception 'Bir gonderide en fazla 4 gorsel olabilir.';
  end if;

  if v_poll_action = 'delete' then
    delete from public.community_post_polls where post_id = v_target_id;
  elsif v_poll_action = 'replace' then
    select id into v_poll_id from public.community_post_polls where post_id = v_target_id limit 1;
    if v_poll_id is not null then
      delete from public.community_post_poll_options where poll_id = v_poll_id;
      for v_opt in select * from jsonb_array_elements(coalesce(p_poll_options, '[]'::jsonb))
      loop
        if nullif(trim(coalesce(v_opt->>'label', '')), '') is not null then
          v_pos := v_pos + 1;
          insert into public.community_post_poll_options (poll_id, position, label)
          values (v_poll_id, v_pos, left(trim(v_opt->>'label'), 120));
        end if;
      end loop;
      if v_pos < 2 then
        raise exception 'Anket icin en az 2 secenek gerekli. Anketi tamamen kaldirmak istiyorsaniz "Anketi sil" secenegini kullanin.';
      end if;
      update public.community_post_polls set total_votes_count = 0 where id = v_poll_id;
    end if;
  end if;

  update public.fansub_reported_content
    set status = 'fix_submitted', fix_note = v_note, fixed_by = v_actor_id, fixed_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fansub_fix_reported_post(uuid, text, text, text, uuid[], jsonb, text, jsonb, text) to authenticated;

commit;
