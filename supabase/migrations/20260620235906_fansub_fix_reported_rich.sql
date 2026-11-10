-- Reported content fix: RICH editing (image + poll + chapter pages).
--
-- Product decision (on top of 243):
-- - The SITE ADMIN handles manga reports; a fansub does not fix mangas. The RPCs here
-- are for POST and CHAPTER only.
-- - Post: the fansub admin fixes title/content/category + images (add/remove) +
-- poll (change options/delete poll); in one step resends for
-- review.
-- - Chapter: the fansub admin fixes pages (add/remove/sort) + title.
--
-- SECURITY NOTE (critical):
-- admin_remove_reported_content sets the removed post to status='rejected'.
-- enforce_community_post_moderation_guard blocks a non-site-admin from updating
-- a post with old.status <> 'pending'; also post child tables
-- (assets/polls/poll_options) child guards limit writes to
-- author+pending+active or site admin. A fansub admin cannot pass them.
-- So we whitelist fix RPCs on the related guards using the existing
-- is_trusted_mutation_stack() pattern (same as sync_community_post_poll_counts).
-- The bypass is limited to the fix RPC call stack;
-- the RPC itself validates fansub-admin permission + content ownership.

begin;

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Add a trusted-stack bypass to guards (function bodies taken as is from
-- 195/196; only the fix RPC was added to the first bypass condition).
-- ──────────────────────────────────────────────────────────────────────────

-- Parent: community_posts moderasyon guard'i (195).
create or replace function public.enforce_community_post_moderation_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_moderation_state()
    or public.is_trusted_mutation_stack('fansub_fix_reported_post')
    or public.is_trusted_mutation_stack('fansub_submit_content_fix') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.author_id is distinct from new.author_id then
      raise exception 'Topluluk gonderisi sahibi degistirilemez.';
    end if;

    if old.related_fansub_id is distinct from new.related_fansub_id then
      raise exception 'Topluluk gonderisi fansub baglami degistirilemez.';
    end if;

    if old.status <> 'pending' then
      raise exception 'Incelemesi tamamlanan topluluk gonderisini yalniz admin guncelleyebilir.';
    end if;
  end if;

  if coalesce(new.status, 'pending') <> 'pending' then
    raise exception 'Topluluk gonderisi onay durumunu yalniz admin degistirebilir.';
  end if;

  if new.approved_at is not null
    or new.approved_by is not null
    or new.rejected_at is not null
    or new.rejected_by is not null
    or new.reject_reason is not null then
    raise exception 'Topluluk gonderisi moderasyon alanlarini yalniz admin degistirebilir.';
  end if;

  return new;
end;
$$;

-- Child: community_post_assets guard'i (196).
create or replace function public.enforce_community_post_asset_child_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_moderation_state()
    or public.is_trusted_mutation_stack('fansub_fix_reported_post') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.can_write_pending_community_post_child(old.post_id) then
      raise exception 'Onaylanmis topluluk gonderisi medyasini yalniz admin degistirebilir.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.post_id is distinct from old.post_id then
    raise exception 'Topluluk gonderisi medya baglami degistirilemez.';
  end if;

  if not public.can_write_pending_community_post_child(new.post_id) then
    raise exception 'Onaylanmis topluluk gonderisi medyasini yalniz admin degistirebilir.';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  end if;

  return new;
end;
$$;

-- Child: community_post_polls guard'i (196).
create or replace function public.enforce_community_post_poll_child_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_sync boolean := public.is_trusted_mutation_stack('sync_community_post_poll_counts');
begin
  if public.can_manage_moderation_state()
    or public.is_trusted_mutation_stack('fansub_fix_reported_post') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.can_write_pending_community_post_child(old.post_id) then
      raise exception 'Onaylanmis topluluk gonderisi anketini yalniz admin degistirebilir.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not public.can_write_pending_community_post_child(new.post_id) then
      raise exception 'Onaylanmis topluluk gonderisi anketini yalniz admin degistirebilir.';
    end if;

    new.total_votes_count := 0;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if v_count_sync then
    if new.post_id is distinct from old.post_id
      or new.closes_at is distinct from old.closes_at
      or new.created_at is distinct from old.created_at then
      raise exception 'Anket sayac senkronu yalniz sayac alanlarini guncelleyebilir.';
    end if;

    return new;
  end if;

  if new.post_id is distinct from old.post_id then
    raise exception 'Anket gonderi baglami degistirilemez.';
  end if;

  if new.total_votes_count is distinct from old.total_votes_count then
    raise exception 'Anket oy sayaci yalniz RPC ile degistirilebilir.';
  end if;

  if not public.can_write_pending_community_post_child(new.post_id) then
    raise exception 'Onaylanmis topluluk gonderisi anketini yalniz admin degistirebilir.';
  end if;

  return new;
end;
$$;

-- Child: community_post_poll_options guard'i (196).
create or replace function public.enforce_community_post_poll_option_child_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_sync boolean := public.is_trusted_mutation_stack('sync_community_post_poll_counts');
begin
  if public.can_manage_moderation_state()
    or public.is_trusted_mutation_stack('fansub_fix_reported_post') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.can_write_pending_community_poll_child(old.poll_id) then
      raise exception 'Onaylanmis topluluk gonderisi anket secenegini yalniz admin degistirebilir.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not public.can_write_pending_community_poll_child(new.poll_id) then
      raise exception 'Onaylanmis topluluk gonderisi anket secenegini yalniz admin degistirebilir.';
    end if;

    new.votes_count := 0;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if v_count_sync then
    if new.poll_id is distinct from old.poll_id
      or new.position is distinct from old.position
      or new.label is distinct from old.label
      or new.created_at is distinct from old.created_at then
      raise exception 'Anket secenek sayac senkronu yalniz sayac alanlarini guncelleyebilir.';
    end if;

    return new;
  end if;

  if new.poll_id is distinct from old.poll_id then
    raise exception 'Anket secenegi baglami degistirilemez.';
  end if;

  if new.votes_count is distinct from old.votes_count then
    raise exception 'Anket secenek oy sayaci yalniz RPC ile degistirilebilir.';
  end if;

  if not public.can_write_pending_community_poll_child(new.poll_id) then
    raise exception 'Onaylanmis topluluk gonderisi anket secenegini yalniz admin degistirebilir.';
  end if;

  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Fansub admin reading current media/poll of the reported post.
-- get_community_post_assets / get_community_post_poll apply an author/approved filter,
-- so the fansub admin cannot see a removed post; this RPC reads with fansub
-- permission.
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
      'position', cpa.position
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

-- ──────────────────────────────────────────────────────────────────────────
-- 3) Make the post fix RPC RICH (image + poll). The 5-arg signature in 243
-- is left in place.
-- ──────────────────────────────────────────────────────────────────────────
drop function if exists public.fansub_fix_reported_post(uuid, text, text, text, text);

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

  -- Post text + move to re-review (visible but unapproved).
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

  -- Image/GIF removal.
  if array_length(v_remove, 1) is not null then
    delete from public.community_post_assets
    where post_id = v_target_id
      and id = any(v_remove);
  end if;

  -- New image insert (image only; the client blocks a GIF+image mix,
  -- additionally the prevent_mixed_community_post_asset_types trigger protects it).
  if jsonb_typeof(p_add_assets) = 'array' then
    for v_asset in select * from jsonb_array_elements(p_add_assets)
    loop
      insert into public.community_post_assets (
        post_id, asset_type, provider, provider_asset_id,
        original_url, preview_url, width, height, alt_text, position, metadata
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

  -- Anket.
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
      -- Options changed: reset vote counters (allowed with the guard bypass).
      update public.community_post_polls set total_votes_count = 0 where id = v_poll_id;
    end if;
  end if;

  update public.fansub_reported_content
    set status = 'fix_submitted', fix_note = v_note, fixed_by = v_actor_id, fixed_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) Chapter fix RPC (pages + title). The chapters guard allows is_approved
-- false->false + is_active change, so NO extra bypass is needed;
-- definer skips RLS.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.fansub_fix_reported_chapter(
  p_id uuid,
  p_title text,
  p_pages text[],
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
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_pages text[] := coalesce(p_pages, '{}');
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

  if v_target_type <> 'chapter' then
    raise exception 'Bu kayit bir bolum degil.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(v_fansub_id)) then
    raise exception 'Bu islemi yalnizca fansub yoneticisi yapabilir.';
  end if;

  if v_status <> 'awaiting_fix' then
    raise exception 'Bu kayit zaten yeniden incelemeye gonderilmis veya kapanmis.';
  end if;

  if array_length(v_pages, 1) is null then
    raise exception 'Bolum en az bir sayfa icermelidir.';
  end if;

  update public.chapters
    set title = v_title,
        pages = v_pages,
        is_active = true,
        is_approved = false
  where id = v_target_id
    and fansub_id = v_fansub_id;

  if not found then
    raise exception 'Bolum bulunamadi veya bu fansuba ait degil.';
  end if;

  update public.fansub_reported_content
    set status = 'fix_submitted', fix_note = v_note, fixed_by = v_actor_id, fixed_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.get_fansub_reported_post_media(uuid) to authenticated;
grant execute on function public.fansub_fix_reported_post(uuid, text, text, text, uuid[], jsonb, text, jsonb, text) to authenticated;
grant execute on function public.fansub_fix_reported_chapter(uuid, text, text[], text) to authenticated;

commit;
