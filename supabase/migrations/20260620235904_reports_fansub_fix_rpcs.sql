-- Reported content -> fansub fix loop: RPCs.
--
-- admin_remove_reported_content(report_id, note)
-- The site admin agrees with a report and removes the content. In one transaction:
-- - content is deactivated (manga/chapter: is_active=false, is_approved=false;
-- post: is_active=false, status='rejected') -> leaves public + falls to
-- "unapproved" for the fix.
-- - the report goes 'resolved'.
-- - if the content belongs to a fansub an 'awaiting_fix' record opens in fansub_reported_content
-- and the fansub team + content owner + reporter get notified.
--
-- fansub_submit_content_fix(id, note)
-- The fansub fixes the content and resends for review: content is_active=true +
-- is_approved=false (post: status='pending') -> enters the admin approval queue.
-- The record goes 'fix_submitted'. When the admin reapproves (trigger in 241) the record
-- goes 'resolved' automatically.
--
-- list_fansub_reported_content(fansub_id, status)
-- The fansub fix queue, enriched with content title/state.

begin;

create or replace function public.admin_remove_reported_content(
  p_report_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_target_id uuid;
  v_target_type text;
  v_reporter_id uuid;
  v_reason text;
  v_fansub_id uuid;
  v_owner_id uuid;
  v_title text;
  v_route text;
  v_label text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_fix_id uuid;
  v_staff record;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if not public.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;

  select r.target_id, r.target_type, r.reporter_id, r.reason
    into v_target_id, v_target_type, v_reporter_id, v_reason
  from public.reports r
  where r.id = p_report_id;

  if v_target_id is null then
    raise exception 'Rapor bulunamadi.';
  end if;

  if v_target_type not in ('manga', 'chapter', 'post') then
    raise exception 'Bu hedef tipi icin fansub duzeltme akisi kullanilmaz: %', v_target_type;
  end if;

  if v_target_type = 'manga' then
    update public.mangas
      set is_active = false, is_approved = false
    where id = v_target_id
    returning fansub_id, title, '/manga/' || coalesce(slug, id::text)
      into v_fansub_id, v_title, v_route;
    v_label := 'Manga';
  elsif v_target_type = 'chapter' then
    update public.chapters
      set is_active = false, is_approved = false
    where id = v_target_id
    returning fansub_id into v_fansub_id;
    select coalesce(m.title, 'Adsiz manga')
        || ' · ' || trim(to_char(c.chapter_number, 'FM999999990.##')) || '. Bolum',
      '/manga/' || coalesce(m.slug, m.id::text)
      into v_title, v_route
    from public.chapters c
    left join public.mangas m on m.id = c.manga_id
    where c.id = v_target_id;
    v_label := 'Manga bolumu';
  else
    update public.community_posts
      set is_active = false, status = 'rejected'
    where id = v_target_id
    returning related_fansub_id, author_id,
      coalesce(nullif(title, ''), 'Basliksiz gonderi'),
      '/discussion/' || id::text
      into v_fansub_id, v_owner_id, v_title, v_route;
    v_label := 'Topluluk gonderisi';
  end if;

  update public.reports
    set status = 'resolved', resolved_at = now(), resolved_by = v_actor_id
  where id = p_report_id;

  -- Notification to the content owner (post owner user; manga/chapter owner fansub).
  if v_owner_id is not null then
    perform public.push_notification(
      v_owner_id,
      'system',
      v_label || ' kaldirildi',
      v_label || ' rapor incelemesi sonucunda gorunurlukten kaldirildi.'
        || coalesce(' Gerekce: ' || nullif(v_reason, ''), ''),
      jsonb_build_object(
        'event', 'report_content_removed',
        'report_id', p_report_id,
        'target_id', v_target_id,
        'target_type', v_target_type,
        'target_title', v_title,
        'route_hint', v_route
      ),
      null
    );
  end if;

  -- Notification to the reporter.
  if v_reporter_id is not null and v_reporter_id is distinct from v_owner_id then
    perform public.push_notification(
      v_reporter_id,
      'system',
      'Raporunuz sonuclandi',
      v_label || ' icin gonderdiginiz rapor incelendi ve icerik kaldirildi.',
      jsonb_build_object(
        'event', 'report_resolved_content_removed',
        'report_id', p_report_id,
        'target_id', v_target_id,
        'target_type', v_target_type,
        'target_title', v_title,
        'route_hint', v_route
      ),
      null
    );
  end if;

  -- Fansub fix record + notification to the fansub team.
  if v_fansub_id is not null then
    select id into v_fix_id
    from public.fansub_reported_content
    where target_type = v_target_type
      and target_id = v_target_id
      and status in ('awaiting_fix', 'fix_submitted')
    limit 1;

    if v_fix_id is null then
      insert into public.fansub_reported_content (
        fansub_id, target_type, target_id, report_id, reason, admin_note,
        status, removed_by, removed_at
      ) values (
        v_fansub_id, v_target_type, v_target_id, p_report_id, v_reason, v_note,
        'awaiting_fix', v_actor_id, now()
      );
    else
      update public.fansub_reported_content
        set report_id = p_report_id,
            reason = v_reason,
            admin_note = coalesce(v_note, admin_note),
            status = 'awaiting_fix',
            removed_by = v_actor_id,
            removed_at = now(),
            fix_note = null,
            fixed_by = null,
            fixed_at = null,
            resolved_at = null
      where id = v_fix_id;
    end if;

    for v_staff in
      select fm.user_id
      from public.fansub_members fm
      where fm.fansub_id = v_fansub_id
        and fm.role in ('admin', 'moderator')
    loop
      perform public.push_notification(
        v_staff.user_id,
        'system',
        'Duzeltilecek icerik var',
        v_label || ' raporlandi ve site yonetimi tarafindan kaldirildi. Lutfen icerigi duzeltip yeniden incelemeye gonderin.',
        jsonb_build_object(
          'event', 'fansub_reported_content_added',
          'fansub_id', v_fansub_id,
          'target_id', v_target_id,
          'target_type', v_target_type,
          'target_title', v_title,
          'route_hint', '/fansub/' || v_fansub_id::text || '/yonet#postlar'
        ),
        null
      );
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'targetType', v_target_type,
    'fansubId', v_fansub_id,
    'fixCreated', v_fansub_id is not null
  );
end;
$$;

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

  if not (public.is_admin() or public.is_fansub_staff(v_fansub_id)) then
    raise exception 'Bu kaydi duzeltme yetkiniz yok.';
  end if;

  if v_status <> 'awaiting_fix' then
    raise exception 'Bu kayit zaten yeniden incelemeye gonderilmis veya kapanmis.';
  end if;

  -- Move the content to re-review state: visible but unapproved.
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

grant execute on function public.admin_remove_reported_content(uuid, text) to authenticated;
grant execute on function public.fansub_submit_content_fix(uuid, text) to authenticated;
grant execute on function public.list_fansub_reported_content(uuid, text) to authenticated;

commit;
