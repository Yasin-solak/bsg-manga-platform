begin;

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

  if not public.fansub_has_boost_capability(p_fansub_id, 'hasAnalytics') then
    raise exception 'Temel analizler icin Seviye 2 takviye gerekir.';
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

grant execute on function public.get_fansub_manage_analytics_summary(uuid) to authenticated;

commit;
