-- Reported content fix: permission narrowing + post editing.
--
-- Product decision: FIXING reported and removed content can be done only by the FANSUB
-- ADMIN (or site admin); a moderator views but cannot intervene.
--
-- 1) fansub_submit_content_fix: permission narrowed is_fansub_staff -> is_fansub_admin
-- (manga/chapter: content is edited on its tab and resent for review).
-- 2) fansub_fix_reported_post: the fansub admin edits a post shared in the fansub name (related_fansub_id) and
-- removed (is_active=false); in one step the content
-- updates + resends for review (is_active=true, status='pending').
-- 3) list_fansub_reported_content: a 'category' field added to post rows
-- (for the edit dialog initial values).

begin;

create or replace function public.fansub_submit_content_fix(
  p_id uuid,
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
  v_note text := nullif(trim(coalesce(p_note, '')), '');
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

  -- Permission: site admin or FANSUB ADMIN only.
  if not (public.is_admin() or public.is_fansub_admin(v_fansub_id)) then
    raise exception 'Bu islemi yalnizca fansub yoneticisi yapabilir.';
  end if;

  if v_status <> 'awaiting_fix' then
    raise exception 'Bu kayit zaten yeniden incelemeye gonderilmis veya kapanmis.';
  end if;

  if v_target_type = 'manga' then
    update public.mangas set is_active = true, is_approved = false where id = v_target_id;
  elsif v_target_type = 'chapter' then
    update public.chapters set is_active = true, is_approved = false where id = v_target_id;
  else
    update public.community_posts set is_active = true, status = 'pending' where id = v_target_id;
  end if;

  update public.fansub_reported_content
    set status = 'fix_submitted', fix_note = v_note, fixed_by = v_actor_id, fixed_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fansub_fix_reported_post(
  p_id uuid,
  p_title text,
  p_body text,
  p_category text default null,
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

  -- Permission: site admin or FANSUB ADMIN only.
  if not (public.is_admin() or public.is_fansub_admin(v_fansub_id)) then
    raise exception 'Bu islemi yalnizca fansub yoneticisi yapabilir.';
  end if;

  if v_status <> 'awaiting_fix' then
    raise exception 'Bu kayit zaten yeniden incelemeye gonderilmis veya kapanmis.';
  end if;

  if v_title is null and v_body is null then
    raise exception 'Baslik veya icerik bos birakilamaz.';
  end if;

  -- Even a removed post (is_active=false) can be fixed; in the same step it is resent
  -- for review: is_active=true + status='pending'.
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

  update public.fansub_reported_content
    set status = 'fix_submitted', fix_note = v_note, fixed_by = v_actor_id, fixed_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.list_fansub_reported_content(
  p_fansub_id uuid,
  p_status text default 'open'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_status text := lower(trim(coalesce(p_status, 'open')));
  v_items jsonb;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun raporlanan icerik kuyrugunu gorme yetkiniz yok.';
  end if;

  if v_status not in ('open', 'all', 'awaiting_fix', 'fix_submitted', 'resolved', 'dismissed') then
    v_status := 'open';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', fr.id,
        'targetType', fr.target_type,
        'targetId', fr.target_id,
        'reportId', fr.report_id,
        'reason', fr.reason,
        'adminNote', fr.admin_note,
        'status', fr.status,
        'removedAt', fr.removed_at,
        'fixNote', fr.fix_note,
        'fixedAt', fr.fixed_at,
        'resolvedAt', fr.resolved_at,
        'title', case fr.target_type
          when 'manga' then coalesce(mm.title, 'Adsiz manga')
          when 'chapter' then coalesce(cm.title, 'Adsiz manga')
          else coalesce(nullif(pp.title, ''), 'Basliksiz gonderi')
        end,
        'mangaSlug', case fr.target_type
          when 'manga' then mm.slug
          when 'chapter' then cm.slug
          else null
        end,
        'chapterNumber', case when fr.target_type = 'chapter' then cc.chapter_number else null end,
        'preview', case fr.target_type when 'post' then pp.body else null end,
        'category', case fr.target_type when 'post' then pp.category else null end,
        'contentIsActive', case fr.target_type
          when 'manga' then mm.is_active
          when 'chapter' then cc.is_active
          else pp.is_active
        end,
        'contentIsApproved', case fr.target_type
          when 'manga' then mm.is_approved
          when 'chapter' then cc.is_approved
          else (pp.status = 'approved')
        end,
        'contentExists', case fr.target_type
          when 'manga' then (mm.id is not null)
          when 'chapter' then (cc.id is not null)
          else (pp.id is not null)
        end
      )
      order by fr.removed_at desc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.fansub_reported_content fr
  left join public.mangas mm on fr.target_type = 'manga' and mm.id = fr.target_id
  left join public.chapters cc on fr.target_type = 'chapter' and cc.id = fr.target_id
  left join public.mangas cm on cc.manga_id = cm.id
  left join public.community_posts pp on fr.target_type = 'post' and pp.id = fr.target_id
  where fr.fansub_id = p_fansub_id
    and (
      (v_status = 'open' and fr.status in ('awaiting_fix', 'fix_submitted'))
      or (v_status = 'all')
      or (v_status not in ('open', 'all') and fr.status = v_status)
    );

  return jsonb_build_object('items', v_items);
end;
$$;

grant execute on function public.fansub_submit_content_fix(uuid, text) to authenticated;
grant execute on function public.fansub_fix_reported_post(uuid, text, text, text, text) to authenticated;
grant execute on function public.list_fansub_reported_content(uuid, text) to authenticated;

commit;
