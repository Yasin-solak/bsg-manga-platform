begin;

-- On the Boost V2 move basic analytics and basic closing credit go to the core
-- layer. This migration only removes the Level 2 capability locks;
-- permission and feature-flag checks are kept.

create or replace function public.get_fansub_manage_analytics_summary(
  p_fansub_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_payload jsonb;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not exists (
    select 1
    from public.fansubs
    where id = p_fansub_id
  ) then
    raise exception 'Fansub bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun istatistiklerini gorme yetkiniz yok.';
  end if;

  with fansub_base as (
    select
      f.id,
      coalesce(f.follower_count, 0)::bigint as follower_count
    from public.fansubs f
    where f.id = p_fansub_id
  ),
  manga_stats as (
    select
      count(*)::bigint as total_count,
      count(*) filter (where m.is_approved = true)::bigint as approved_count,
      count(*) filter (where m.is_approved = false)::bigint as pending_count,
      count(*) filter (where m.is_active = true)::bigint as active_count,
      count(*) filter (where m.is_active = false)::bigint as inactive_count,
      coalesce(sum(coalesce(m.total_views, 0)), 0)::bigint as total_views
    from public.mangas m
    where m.fansub_id = p_fansub_id
  ),
  chapter_stats as (
    select
      count(*)::bigint as total_count,
      count(*) filter (where c.is_approved = true)::bigint as approved_count,
      count(*) filter (where c.is_approved = false)::bigint as pending_count,
      count(*) filter (
        where c.is_approved = true
          and coalesce(c.publish_at, c.created_at, now()) > now()
      )::bigint as scheduled_count,
      count(*) filter (
        where coalesce(c.publish_at, c.created_at, now()) >= now() - interval '7 days'
      )::bigint as created_7d,
      count(*) filter (
        where coalesce(c.publish_at, c.created_at, now()) >= now() - interval '30 days'
      )::bigint as created_30d
    from public.chapters c
    where c.fansub_id = p_fansub_id
  ),
  post_stats as (
    select
      count(*) filter (where cp.is_active = true)::bigint as total_count,
      count(*) filter (where cp.is_active = true and cp.status = 'approved')::bigint as approved_count,
      count(*) filter (where cp.is_active = true and cp.status = 'pending')::bigint as pending_count,
      count(*) filter (where cp.is_active = true and cp.status = 'rejected')::bigint as rejected_count,
      count(*) filter (
        where cp.is_active = true
          and cp.created_at >= now() - interval '7 days'
      )::bigint as created_7d,
      count(*) filter (
        where cp.is_active = true
          and cp.created_at >= now() - interval '30 days'
      )::bigint as created_30d
    from public.community_posts cp
    where cp.related_fansub_id = p_fansub_id
  ),
  follow_stats as (
    select
      count(*) filter (where ff.created_at >= now() - interval '7 days')::bigint as new_7d,
      count(*) filter (where ff.created_at >= now() - interval '30 days')::bigint as new_30d
    from public.fansub_follows ff
    where ff.fansub_id = p_fansub_id
  ),
  donation_stats as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(greatest(ft.amount, 0)), 0)::bigint as total_amount,
      count(*) filter (where ft.created_at >= now() - interval '7 days')::bigint as count_7d,
      count(*) filter (where ft.created_at >= now() - interval '30 days')::bigint as count_30d,
      coalesce(sum(greatest(ft.amount, 0)) filter (
        where ft.created_at >= now() - interval '7 days'
      ), 0)::bigint as amount_7d,
      coalesce(sum(greatest(ft.amount, 0)) filter (
        where ft.created_at >= now() - interval '30 days'
      ), 0)::bigint as amount_30d,
      max(ft.created_at) as last_donation_at
    from public.fansub_transactions ft
    where ft.fansub_id = p_fansub_id
      and ft.type = 'donation'
  ),
  top_manga_rows as (
    select
      m.id,
      m.title,
      m.slug,
      coalesce(m.total_views, 0)::bigint as total_views,
      (
        select count(*)::bigint
        from public.manga_follows mf
        where mf.manga_id = m.id
      ) as follower_count,
      m.last_chapter_number,
      m.is_approved,
      m.is_active,
      m.updated_at
    from public.mangas m
    where m.fansub_id = p_fansub_id
    order by coalesce(m.total_views, 0) desc, m.updated_at desc
    limit 5
  ),
  top_mangas as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', tmr.id,
          'title', tmr.title,
          'slug', tmr.slug,
          'totalViews', tmr.total_views,
          'followerCount', coalesce(tmr.follower_count, 0),
          'lastChapterNumber', tmr.last_chapter_number,
          'isApproved', tmr.is_approved,
          'isActive', tmr.is_active
        )
        order by tmr.total_views desc, tmr.updated_at desc
      ),
      '[]'::jsonb
    ) as items
    from top_manga_rows tmr
  )
  select jsonb_build_object(
    'overview', jsonb_build_object(
      'followerCount', fb.follower_count,
      'totalViews', ms.total_views,
      'totalDonationAmount', ds.total_amount,
      'totalDonationCount', ds.total_count,
      'totalMangaCount', ms.total_count,
      'totalChapterCount', cs.total_count,
      'totalPostCount', ps.total_count,
      'lastDonationAt', ds.last_donation_at
    ),
    'momentum', jsonb_build_object(
      'newFollowers7d', fs.new_7d,
      'newFollowers30d', fs.new_30d,
      'newChapters7d', cs.created_7d,
      'newChapters30d', cs.created_30d,
      'newPosts7d', ps.created_7d,
      'newPosts30d', ps.created_30d,
      'donationCount7d', ds.count_7d,
      'donationCount30d', ds.count_30d,
      'donationAmount7d', ds.amount_7d,
      'donationAmount30d', ds.amount_30d
    ),
    'statuses', jsonb_build_object(
      'mangas', jsonb_build_object(
        'approved', ms.approved_count,
        'pending', ms.pending_count,
        'active', ms.active_count,
        'inactive', ms.inactive_count
      ),
      'chapters', jsonb_build_object(
        'approved', cs.approved_count,
        'pending', cs.pending_count,
        'scheduled', cs.scheduled_count
      ),
      'posts', jsonb_build_object(
        'approved', ps.approved_count,
        'pending', ps.pending_count,
        'rejected', ps.rejected_count
      )
    ),
    'topMangas', tm.items
  )
  into v_payload
  from fansub_base fb
  cross join manga_stats ms
  cross join chapter_stats cs
  cross join post_stats ps
  cross join follow_stats fs
  cross join donation_stats ds
  cross join top_mangas tm;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'overview', jsonb_build_object(
        'followerCount', 0,
        'totalViews', 0,
        'totalDonationAmount', 0,
        'totalDonationCount', 0,
        'totalMangaCount', 0,
        'totalChapterCount', 0,
        'totalPostCount', 0,
        'lastDonationAt', null
      ),
      'momentum', jsonb_build_object(
        'newFollowers7d', 0,
        'newFollowers30d', 0,
        'newChapters7d', 0,
        'newChapters30d', 0,
        'newPosts7d', 0,
        'newPosts30d', 0,
        'donationCount7d', 0,
        'donationCount30d', 0,
        'donationAmount7d', 0,
        'donationAmount30d', 0
      ),
      'statuses', jsonb_build_object(
        'mangas', jsonb_build_object('approved', 0, 'pending', 0, 'active', 0, 'inactive', 0),
        'chapters', jsonb_build_object('approved', 0, 'pending', 0, 'scheduled', 0),
        'posts', jsonb_build_object('approved', 0, 'pending', 0, 'rejected', 0)
      ),
      'topMangas', '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.upsert_fansub_chapter_credit_settings(
  p_fansub_id uuid,
  p_is_enabled boolean,
  p_title text default null,
  p_body text default null,
  p_cta_label text default null,
  p_cta_target text default null,
  p_show_metrics boolean default true,
  p_show_supporters boolean default true,
  p_max_supporter_count smallint default 2
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_cta_label text := nullif(btrim(coalesce(p_cta_label, '')), '');
  v_cta_target text := public.normalize_fansub_chapter_credit_cta_target(p_cta_target);
  v_max_supporter_count smallint := greatest(1, least(coalesce(p_max_supporter_count, 2), 6));
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not exists (
    select 1
    from public.fansubs
    where id = p_fansub_id
  ) then
    raise exception 'Fansub bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun kapanis kredisi ayarlarini guncelleme yetkiniz yok.';
  end if;

  if v_cta_label is not null and v_cta_target is null then
    raise exception 'CTA metni girildiginde hedef secilmelidir.';
  end if;

  insert into public.fansub_chapter_credit_settings as settings (
    fansub_id,
    is_enabled,
    title,
    body,
    cta_label,
    cta_target,
    show_metrics,
    show_supporters,
    max_supporter_count
  )
  values (
    p_fansub_id,
    coalesce(p_is_enabled, false),
    v_title,
    v_body,
    v_cta_label,
    v_cta_target,
    coalesce(p_show_metrics, true),
    coalesce(p_show_supporters, true),
    v_max_supporter_count
  )
  on conflict (fansub_id) do update
  set
    is_enabled = excluded.is_enabled,
    title = excluded.title,
    body = excluded.body,
    cta_label = excluded.cta_label,
    cta_target = excluded.cta_target,
    show_metrics = excluded.show_metrics,
    show_supporters = excluded.show_supporters,
    max_supporter_count = excluded.max_supporter_count,
    updated_at = now();

  return public.get_fansub_manage_chapter_credit_settings(p_fansub_id);
end;
$$;

create or replace function public.upsert_fansub_chapter_credit_override(
  p_fansub_id uuid,
  p_chapter_id uuid,
  p_override_mode text,
  p_title text default null,
  p_body text default null,
  p_cta_label text default null,
  p_cta_target text default null,
  p_show_metrics boolean default null,
  p_show_supporters boolean default null,
  p_max_supporter_count smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_override_mode text := lower(btrim(coalesce(p_override_mode, 'inherit')));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_cta_label text := nullif(btrim(coalesce(p_cta_label, '')), '');
  v_cta_target text := public.normalize_fansub_chapter_credit_cta_target(p_cta_target);
  v_max_supporter_count smallint;
  v_existing_fansub_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null or p_chapter_id is null then
    raise exception 'Fansub ve bolum bilgisi zorunludur.';
  end if;

  if not exists (
    select 1
    from public.fansubs
    where id = p_fansub_id
  ) then
    raise exception 'Fansub bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun kapanis kredisi override kayitlarini guncelleme yetkiniz yok.';
  end if;

  select c.fansub_id
  into v_existing_fansub_id
  from public.chapters c
  where c.id = p_chapter_id;

  if v_existing_fansub_id is null then
    raise exception 'Bolum bulunamadi.';
  end if;

  if v_existing_fansub_id <> p_fansub_id then
    raise exception 'Secilen bolum bu fansuba ait degil.';
  end if;

  if v_override_mode not in ('inherit', 'disabled', 'custom') then
    raise exception 'Override modu gecersiz.';
  end if;

  if v_cta_label is not null and v_cta_target is null then
    raise exception 'CTA metni girildiginde hedef secilmelidir.';
  end if;

  if p_max_supporter_count is not null then
    v_max_supporter_count := greatest(1, least(p_max_supporter_count, 6));
  else
    v_max_supporter_count := null;
  end if;

  if v_override_mode = 'inherit' then
    delete from public.fansub_chapter_credit_overrides
    where chapter_id = p_chapter_id
      and fansub_id = p_fansub_id;

    return jsonb_build_object(
      'chapterId', p_chapter_id,
      'fansubId', p_fansub_id,
      'overrideMode', 'inherit'
    );
  end if;

  if v_override_mode = 'custom'
    and v_title is null
    and v_body is null
    and v_cta_label is null
    and v_cta_target is null
    and p_show_metrics is null
    and p_show_supporters is null
    and v_max_supporter_count is null then
    raise exception 'Ozel override icin en az bir alan degistirilmelidir.';
  end if;

  insert into public.fansub_chapter_credit_overrides as credit_override (
    chapter_id,
    fansub_id,
    override_mode,
    title,
    body,
    cta_label,
    cta_target,
    show_metrics,
    show_supporters,
    max_supporter_count
  )
  values (
    p_chapter_id,
    p_fansub_id,
    v_override_mode,
    v_title,
    v_body,
    v_cta_label,
    v_cta_target,
    p_show_metrics,
    p_show_supporters,
    v_max_supporter_count
  )
  on conflict (chapter_id) do update
  set
    fansub_id = excluded.fansub_id,
    override_mode = excluded.override_mode,
    title = excluded.title,
    body = excluded.body,
    cta_label = excluded.cta_label,
    cta_target = excluded.cta_target,
    show_metrics = excluded.show_metrics,
    show_supporters = excluded.show_supporters,
    max_supporter_count = excluded.max_supporter_count,
    updated_at = now();

  return (
    select jsonb_build_object(
      'chapterId', chapter.id,
      'fansubId', credit_override.fansub_id,
      'mangaId', manga.id,
      'mangaTitle', manga.title,
      'mangaSlug', manga.slug,
      'chapterNumber', chapter.chapter_number,
      'chapterTitle', chapter.title,
      'publishAt', chapter.publish_at,
      'chapterCreatedAt', chapter.created_at,
      'overrideMode', credit_override.override_mode,
      'title', credit_override.title,
      'body', credit_override.body,
      'ctaLabel', credit_override.cta_label,
      'ctaTarget', credit_override.cta_target,
      'showMetrics', credit_override.show_metrics,
      'showSupporters', credit_override.show_supporters,
      'maxSupporterCount', credit_override.max_supporter_count,
      'createdAt', credit_override.created_at,
      'updatedAt', credit_override.updated_at
    )
    from public.fansub_chapter_credit_overrides credit_override
    join public.chapters chapter
      on chapter.id = credit_override.chapter_id
    join public.mangas manga
      on manga.id = chapter.manga_id
    where credit_override.chapter_id = p_chapter_id
      and credit_override.fansub_id = p_fansub_id
  );
end;
$$;

create or replace function public.get_effective_public_chapter_credit_config(
  p_fansub_id uuid,
  p_chapter_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.fansub_chapter_credit_settings%rowtype;
  v_override public.fansub_chapter_credit_overrides%rowtype;
  v_chapter record;
  v_manga record;
begin
  if p_fansub_id is null or p_chapter_id is null then
    return null;
  end if;

  if not public.is_feature_enabled('boost.system', false) then
    return null;
  end if;

  select
    c.id,
    c.fansub_id,
    c.manga_id,
    c.is_active,
    c.is_approved,
    c.publish_at,
    c.created_at
  into v_chapter
  from public.chapters c
  where c.id = p_chapter_id
    and c.fansub_id = p_fansub_id;

  if v_chapter.id is null then
    return null;
  end if;

  if coalesce(v_chapter.is_active, false) = false or coalesce(v_chapter.is_approved, false) = false then
    return null;
  end if;

  if not public.is_chapter_publicly_unlocked(v_chapter.publish_at) then
    return null;
  end if;

  select
    m.id,
    m.title,
    m.slug,
    m.is_active,
    m.is_approved
  into v_manga
  from public.mangas m
  where m.id = v_chapter.manga_id;

  if v_manga.id is null then
    return null;
  end if;

  if coalesce(v_manga.is_active, false) = false or coalesce(v_manga.is_approved, false) = false then
    return null;
  end if;

  select *
  into v_settings
  from public.fansub_chapter_credit_settings
  where fansub_id = p_fansub_id;

  if coalesce(v_settings.is_enabled, false) = false then
    return null;
  end if;

  select *
  into v_override
  from public.fansub_chapter_credit_overrides
  where chapter_id = p_chapter_id
    and fansub_id = p_fansub_id;

  if v_override.override_mode = 'disabled' then
    return null;
  end if;

  return jsonb_build_object(
    'fansubId', p_fansub_id,
    'chapterId', p_chapter_id,
    'overrideMode', coalesce(v_override.override_mode, 'inherit'),
    'source', case when v_override.override_mode = 'custom' then 'override' else 'default' end,
    'title', case when v_override.override_mode = 'custom' then coalesce(v_override.title, v_settings.title) else v_settings.title end,
    'body', case when v_override.override_mode = 'custom' then coalesce(v_override.body, v_settings.body) else v_settings.body end,
    'ctaLabel', case when v_override.override_mode = 'custom' then coalesce(v_override.cta_label, v_settings.cta_label) else v_settings.cta_label end,
    'ctaTarget', case when v_override.override_mode = 'custom' then coalesce(v_override.cta_target, v_settings.cta_target) else v_settings.cta_target end,
    'showMetrics', case when v_override.override_mode = 'custom' then coalesce(v_override.show_metrics, v_settings.show_metrics, true) else coalesce(v_settings.show_metrics, true) end,
    'showSupporters', case when v_override.override_mode = 'custom' then coalesce(v_override.show_supporters, v_settings.show_supporters, true) else coalesce(v_settings.show_supporters, true) end,
    'maxSupporterCount', greatest(
      1,
      least(
        coalesce(
          case when v_override.override_mode = 'custom' then v_override.max_supporter_count else null end,
          v_settings.max_supporter_count,
          2
        ),
        6
      )
    )
  );
end;
$$;

grant execute on function public.get_fansub_manage_analytics_summary(uuid) to authenticated;
grant execute on function public.upsert_fansub_chapter_credit_settings(uuid, boolean, text, text, text, text, boolean, boolean, smallint) to authenticated;
grant execute on function public.upsert_fansub_chapter_credit_override(uuid, uuid, text, text, text, text, text, boolean, boolean, smallint) to authenticated;
grant execute on function public.get_effective_public_chapter_credit_config(uuid, uuid) to anon, authenticated;

commit;
