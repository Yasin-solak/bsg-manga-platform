-- RPC returning admin user detail in one query
-- Goal:
-- - One RPC instead of multiple REST calls when a modal opens in the admin panel
-- - Make permission explicit at DB level (admin only)

create or replace function public.get_admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_user_id is null then
    raise exception 'Kullanici id zorunludur.';
  end if;

  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'Kullanici bulunamadi.';
  end if;

  with profile as (
    select
      u.id,
      u.username,
      u.avatar_url,
      coalesce(u.bio, '') as bio,
      coalesce(u.level, 'Yeni Uye') as level,
      coalesce(u.social_links, '[]'::jsonb) as social_links,
      coalesce(u.role, 'user') as role,
      coalesce(u.stones, 0) as stones,
      coalesce(u.frame_type, 'default') as frame_type,
      coalesce(u.is_banned, false) as is_banned,
      coalesce(u.is_active, true) as is_active,
      u.created_at,
      u.updated_at,
      coalesce(u.owned_items, '{}'::jsonb) as owned_items
    from public.users u
    where u.id = p_user_id
  ),
  owned_refs as (
    select 'frame'::text as type, ref
    from profile p
    cross join lateral jsonb_array_elements_text(coalesce(p.owned_items->'frames', '[]'::jsonb)) t(ref)
    union all
    select 'background'::text as type, ref
    from profile p
    cross join lateral jsonb_array_elements_text(coalesce(p.owned_items->'backgrounds', '[]'::jsonb)) t(ref)
    union all
    select 'pattern'::text as type, ref
    from profile p
    cross join lateral jsonb_array_elements_text(coalesce(p.owned_items->'patterns', '[]'::jsonb)) t(ref)
    union all
    select 'badge'::text as type, ref
    from profile p
    cross join lateral jsonb_array_elements_text(coalesce(p.owned_items->'badges', '[]'::jsonb)) t(ref)
    union all
    select 'premium'::text as type, ref
    from profile p
    cross join lateral jsonb_array_elements_text(coalesce(p.owned_items->'premium', '[]'::jsonb)) t(ref)
  ),
  inventory_rows as (
    select
      r.type,
      r.ref,
      coalesce(
        si.name,
        nullif(trim(regexp_replace(r.ref, '[-_]+', ' ', 'g')), ''),
        r.ref
      ) as name,
      si.id as store_item_id,
      si.identifier
    from owned_refs r
    left join public.store_items si
      on (
        case
          when r.ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then si.id::text = r.ref
          else
            lower(si.identifier) = lower(r.ref) and si.type = r.type
        end
      )
  ),
  reading_rows as (
    select
      rh.manga_id,
      rh.chapter_id,
      rh.chapter_number,
      rh.read_at,
      m.title as manga_title,
      m.cover_image_url as manga_cover_url,
      coalesce(m.genres, '{}'::text[]) as manga_genres,
      c.title as chapter_title,
      c.chapter_number as chapter_number_from_chapter
    from public.reading_history rh
    left join public.mangas m on m.id = rh.manga_id
    left join public.chapters c on c.id = rh.chapter_id
    where rh.user_id = p_user_id
    order by rh.read_at desc
    limit 200
  ),
  recent_reads as (
    select *
    from reading_rows rr
    order by rr.read_at desc
    limit 5
  ),
  genre_counts as (
    select
      trim(g.genre) as name,
      count(*)::int as count
    from reading_rows rr
    cross join lateral unnest(coalesce(rr.manga_genres, '{}'::text[])) g(genre)
    where trim(g.genre) <> ''
    group by trim(g.genre)
  ),
  genre_total as (
    select coalesce(sum(gc.count), 0)::int as total
    from genre_counts gc
  ),
  favorite_genres as (
    select
      gc.name,
      gc.count,
      case
        when gt.total > 0 then round((gc.count::numeric * 100) / gt.total)::int
        else 0
      end as percent
    from genre_counts gc
    cross join genre_total gt
    order by gc.count desc, gc.name asc
    limit 5
  ),
  top_mangas as (
    select
      rr.manga_id,
      min(rr.manga_title) as manga_title,
      min(rr.manga_cover_url) as manga_cover_url,
      count(*)::int as read_count,
      max(rr.read_at) as last_read_at,
      (array_agg(rr.chapter_number order by rr.read_at desc nulls last))[1] as last_chapter_number
    from reading_rows rr
    group by rr.manga_id
    order by read_count desc, last_read_at desc
    limit 5
  ),
  top_chapters as (
    select
      coalesce(rr.chapter_id::text, rr.manga_id::text || ':' || coalesce(rr.chapter_number::text, 'na')) as chapter_key,
      rr.manga_id,
      min(rr.manga_title) as manga_title,
      min(rr.manga_cover_url) as manga_cover_url,
      (array_agg(rr.chapter_id order by rr.read_at desc nulls last))[1] as chapter_id,
      nullif((array_agg(coalesce(rr.chapter_title, '') order by rr.read_at desc nulls last))[1], '') as chapter_title,
      (array_agg(coalesce(rr.chapter_number_from_chapter, rr.chapter_number) order by rr.read_at desc nulls last))[1] as chapter_number,
      count(*)::int as read_count,
      max(rr.read_at) as last_read_at
    from reading_rows rr
    group by coalesce(rr.chapter_id::text, rr.manga_id::text || ':' || coalesce(rr.chapter_number::text, 'na')), rr.manga_id
    order by read_count desc, last_read_at desc
    limit 5
  ),
  community_posts_rows as (
    select
      cp.id,
      cp.title,
      cp.category,
      coalesce(cp.status, 'pending') as status,
      coalesce(cp.is_active, true) as is_active,
      coalesce(cp.likes_count, 0)::int as likes_count,
      coalesce(cp.comments_count, 0)::int as comments_count,
      cp.created_at
    from public.community_posts cp
    where cp.author_id = p_user_id
    order by cp.created_at desc
    limit 25
  ),
  community_comments_rows as (
    select
      cc.id,
      cc.post_id,
      coalesce(cp.title, 'Bilinmeyen Gonderi') as post_title,
      coalesce(cc.body, '') as body,
      coalesce(cc.likes_count, 0)::int as likes_count,
      coalesce(cc.dislikes_count, 0)::int as dislikes_count,
      coalesce(cc.is_active, true) as is_active,
      cc.created_at
    from public.community_comments cc
    left join public.community_posts cp on cp.id = cc.post_id
    where cc.author_id = p_user_id
    order by cc.created_at desc
    limit 40
  ),
  manga_comments_rows as (
    select
      mc.id,
      mc.manga_id,
      coalesce(m.title, 'Bilinmeyen Manga') as manga_title,
      coalesce(mc.content, '') as content,
      coalesce(mc.likes, 0)::int as likes,
      coalesce(mc.is_pinned, false) as is_pinned,
      coalesce(mc.is_active, true) as is_active,
      mc.created_at
    from public.manga_comments mc
    left join public.mangas m on m.id = mc.manga_id
    where mc.user_id = p_user_id
    order by mc.created_at desc
    limit 40
  ),
  badges_rows as (
    select
      ub.badge_id,
      coalesce(b.name, ub.badge_id::text) as name,
      b.image_url,
      coalesce(ub.is_displayed, false) as is_displayed,
      coalesce(ub.display_order, 0)::int as display_order,
      ub.obtained_at
    from public.user_badges ub
    left join public.badges b on b.id = ub.badge_id
    where ub.user_id = p_user_id
    order by ub.display_order asc, ub.obtained_at desc
  ),
  fansub_memberships_rows as (
    select
      fm.fansub_id,
      coalesce(f.name, 'Bilinmeyen Fansub') as fansub_name,
      coalesce(f.slug, '-') as fansub_slug,
      f.avatar_url as fansub_avatar_url,
      coalesce(f.is_active, false) as fansub_is_active,
      fm.role,
      fm.team_tag,
      fm.created_at as joined_at
    from public.fansub_members fm
    left join public.fansubs f on f.id = fm.fansub_id
    where fm.user_id = p_user_id
    order by fm.created_at desc
  ),
  fansub_history_rows as (
    select
      fmh.id,
      fmh.fansub_id,
      coalesce(f.name, 'Bilinmeyen Fansub') as fansub_name,
      coalesce(f.slug, '-') as fansub_slug,
      fmh.role,
      fmh.team_tag,
      fmh.joined_at,
      fmh.left_at,
      fmh.left_reason,
      fmh.ended_by_user_id,
      ended_user.username as ended_by_username
    from public.fansub_member_history fmh
    left join public.fansubs f on f.id = fmh.fansub_id
    left join public.users ended_user on ended_user.id = fmh.ended_by_user_id
    where fmh.user_id = p_user_id
    order by fmh.joined_at desc
    limit 80
  ),
  sent_invites_rows as (
    select
      fi.id,
      fi.fansub_id,
      coalesce(f.name, 'Bilinmeyen Fansub') as fansub_name,
      coalesce(f.slug, '-') as fansub_slug,
      fi.invited_user_id,
      coalesce(invited_user.username, 'Bilinmeyen Kullanici') as invited_username,
      invited_user.avatar_url as invited_user_avatar_url,
      fi.role,
      fi.status,
      fi.note,
      fi.responded_at,
      coalesce(fi.is_active, true) as is_active,
      fi.created_at
    from public.fansub_invites fi
    left join public.fansubs f on f.id = fi.fansub_id
    left join public.users invited_user on invited_user.id = fi.invited_user_id
    where fi.invited_by_user_id = p_user_id
    order by fi.created_at desc
    limit 80
  ),
  join_requests_rows as (
    select
      fjr.id,
      fjr.fansub_id,
      coalesce(f.name, 'Bilinmeyen Fansub') as fansub_name,
      coalesce(f.slug, '-') as fansub_slug,
      fjr.status,
      fjr.message,
      fjr.review_note,
      reviewer.username as reviewed_by_username,
      fjr.reviewed_at,
      coalesce(fjr.is_active, true) as is_active,
      fjr.created_at
    from public.fansub_join_requests fjr
    left join public.fansubs f on f.id = fjr.fansub_id
    left join public.users reviewer on reviewer.id = fjr.reviewed_by
    where fjr.requester_user_id = p_user_id
    order by fjr.created_at desc
    limit 80
  ),
  stats as (
    select
      (select count(*)::int from public.user_follows uf where uf.following_id = p_user_id) as followers,
      (select count(*)::int from public.user_follows uf where uf.follower_id = p_user_id) as following,
      (select count(*)::int from public.manga_follows mf where mf.user_id = p_user_id) as manga_follows,
      (select count(*)::int from public.fansub_follows ff where ff.user_id = p_user_id) as fansub_follows,
      (select count(*)::int from public.reading_history rh where rh.user_id = p_user_id) as reading_count,
      (select count(*)::int from public.community_posts cp where cp.author_id = p_user_id) as post_count,
      (select count(*)::int from public.community_comments cc where cc.author_id = p_user_id) as community_comment_count,
      (select count(*)::int from public.manga_comments mc where mc.user_id = p_user_id) as manga_comment_count,
      (select count(*)::int from public.user_badges ub where ub.user_id = p_user_id) as badge_count,
      (select count(*)::int from fansub_memberships_rows) as fansub_membership_count,
      (select count(*)::int from fansub_history_rows) as fansub_role_history_count,
      (select count(*)::int from sent_invites_rows) as sent_invite_count,
      (select count(*)::int from join_requests_rows) as join_request_count
  )
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'avatarUrl', coalesce(p.avatar_url, 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || p.username),
      'bio', p.bio,
      'level', p.level,
      'socialLinks', p.social_links,
      'role', p.role,
      'stones', p.stones,
      'frameType', p.frame_type,
      'isBanned', p.is_banned,
      'isActive', p.is_active,
      'createdAt', p.created_at,
      'updatedAt', p.updated_at
    ),
    'stats', jsonb_build_object(
      'followers', s.followers,
      'following', s.following,
      'mangaFollows', s.manga_follows,
      'fansubFollows', s.fansub_follows,
      'readingCount', s.reading_count,
      'postCount', s.post_count,
      'communityCommentCount', s.community_comment_count,
      'mangaCommentCount', s.manga_comment_count,
      'badgeCount', s.badge_count,
      'estimatedReadMinutes', s.reading_count * 5,
      'fansubMembershipCount', s.fansub_membership_count,
      'fansubRoleHistoryCount', s.fansub_role_history_count,
      'sentInviteCount', s.sent_invite_count,
      'joinRequestCount', s.join_request_count
    ),
    'inventory', jsonb_build_object(
      'frames', coalesce((
        select jsonb_agg(jsonb_build_object('type', ir.type, 'ref', ir.ref, 'name', ir.name, 'storeItemId', ir.store_item_id, 'identifier', ir.identifier))
        from inventory_rows ir where ir.type = 'frame'
      ), '[]'::jsonb),
      'backgrounds', coalesce((
        select jsonb_agg(jsonb_build_object('type', ir.type, 'ref', ir.ref, 'name', ir.name, 'storeItemId', ir.store_item_id, 'identifier', ir.identifier))
        from inventory_rows ir where ir.type = 'background'
      ), '[]'::jsonb),
      'patterns', coalesce((
        select jsonb_agg(jsonb_build_object('type', ir.type, 'ref', ir.ref, 'name', ir.name, 'storeItemId', ir.store_item_id, 'identifier', ir.identifier))
        from inventory_rows ir where ir.type = 'pattern'
      ), '[]'::jsonb),
      'badges', coalesce((
        select jsonb_agg(jsonb_build_object('type', ir.type, 'ref', ir.ref, 'name', ir.name, 'storeItemId', ir.store_item_id, 'identifier', ir.identifier))
        from inventory_rows ir where ir.type = 'badge'
      ), '[]'::jsonb),
      'premium', coalesce((
        select jsonb_agg(jsonb_build_object('type', ir.type, 'ref', ir.ref, 'name', ir.name, 'storeItemId', ir.store_item_id, 'identifier', ir.identifier))
        from inventory_rows ir where ir.type = 'premium'
      ), '[]'::jsonb)
    ),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'badgeId', br.badge_id,
        'name', br.name,
        'imageUrl', br.image_url,
        'isDisplayed', br.is_displayed,
        'displayOrder', br.display_order,
        'obtainedAt', br.obtained_at
      ))
      from badges_rows br
    ), '[]'::jsonb),
    'recentReads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mangaId', rr.manga_id,
        'mangaTitle', coalesce(rr.manga_title, 'Bilinmeyen Manga'),
        'mangaCoverUrl', rr.manga_cover_url,
        'chapterId', rr.chapter_id,
        'chapterTitle', rr.chapter_title,
        'chapterNumber', coalesce(rr.chapter_number_from_chapter, rr.chapter_number),
        'readAt', rr.read_at
      ) order by rr.read_at desc)
      from recent_reads rr
    ), '[]'::jsonb),
    'favoriteGenres', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', fg.name,
        'count', fg.count,
        'percent', fg.percent
      ))
      from favorite_genres fg
    ), '[]'::jsonb),
    'favoriteGenreMethod', 'Son 200 okuma kaydinda gecen manga turleri sayilarak ilk 5 tur hesaplanir.',
    'topMangas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mangaId', tm.manga_id,
        'mangaTitle', coalesce(tm.manga_title, 'Bilinmeyen Manga'),
        'mangaCoverUrl', tm.manga_cover_url,
        'readCount', tm.read_count,
        'lastReadAt', tm.last_read_at,
        'lastChapterNumber', tm.last_chapter_number
      ))
      from top_mangas tm
    ), '[]'::jsonb),
    'topChapters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', tc.chapter_key,
        'mangaId', tc.manga_id,
        'mangaTitle', coalesce(tc.manga_title, 'Bilinmeyen Manga'),
        'mangaCoverUrl', tc.manga_cover_url,
        'chapterId', tc.chapter_id,
        'chapterTitle', tc.chapter_title,
        'chapterNumber', tc.chapter_number,
        'readCount', tc.read_count,
        'lastReadAt', tc.last_read_at
      ))
      from top_chapters tc
    ), '[]'::jsonb),
    'communityPosts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cpr.id,
        'title', coalesce(cpr.title, '(Basliksiz)'),
        'category', cpr.category,
        'status', cpr.status,
        'isActive', cpr.is_active,
        'likes', cpr.likes_count,
        'comments', cpr.comments_count,
        'createdAt', cpr.created_at
      ))
      from community_posts_rows cpr
    ), '[]'::jsonb),
    'communityComments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ccr.id,
        'postId', ccr.post_id,
        'postTitle', ccr.post_title,
        'body', ccr.body,
        'likes', ccr.likes_count,
        'dislikes', ccr.dislikes_count,
        'isActive', ccr.is_active,
        'createdAt', ccr.created_at
      ))
      from community_comments_rows ccr
    ), '[]'::jsonb),
    'mangaComments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', mcr.id,
        'mangaId', mcr.manga_id,
        'mangaTitle', mcr.manga_title,
        'content', mcr.content,
        'likes', mcr.likes,
        'isPinned', mcr.is_pinned,
        'isActive', mcr.is_active,
        'createdAt', mcr.created_at
      ))
      from manga_comments_rows mcr
    ), '[]'::jsonb),
    'fansubMemberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fansubId', fmr.fansub_id,
        'fansubName', fmr.fansub_name,
        'fansubSlug', fmr.fansub_slug,
        'fansubAvatarUrl', fmr.fansub_avatar_url,
        'fansubIsActive', fmr.fansub_is_active,
        'role', fmr.role,
        'teamTag', fmr.team_tag,
        'joinedAt', fmr.joined_at
      ))
      from fansub_memberships_rows fmr
    ), '[]'::jsonb),
    'fansubMembershipHistory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fhr.id,
        'fansubId', fhr.fansub_id,
        'fansubName', fhr.fansub_name,
        'fansubSlug', fhr.fansub_slug,
        'role', fhr.role,
        'teamTag', fhr.team_tag,
        'joinedAt', fhr.joined_at,
        'leftAt', fhr.left_at,
        'leftReason', fhr.left_reason,
        'endedByUserId', fhr.ended_by_user_id,
        'endedByUsername', fhr.ended_by_username
      ))
      from fansub_history_rows fhr
    ), '[]'::jsonb),
    'sentFansubInvites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sir.id,
        'fansubId', sir.fansub_id,
        'fansubName', sir.fansub_name,
        'fansubSlug', sir.fansub_slug,
        'invitedUserId', sir.invited_user_id,
        'invitedUsername', sir.invited_username,
        'invitedUserAvatarUrl', sir.invited_user_avatar_url,
        'role', sir.role,
        'status', sir.status,
        'note', sir.note,
        'respondedAt', sir.responded_at,
        'isActive', sir.is_active,
        'createdAt', sir.created_at
      ))
      from sent_invites_rows sir
    ), '[]'::jsonb),
    'joinRequests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', jrr.id,
        'fansubId', jrr.fansub_id,
        'fansubName', jrr.fansub_name,
        'fansubSlug', jrr.fansub_slug,
        'status', jrr.status,
        'message', jrr.message,
        'reviewNote', jrr.review_note,
        'reviewedByUsername', jrr.reviewed_by_username,
        'reviewedAt', jrr.reviewed_at,
        'isActive', jrr.is_active,
        'createdAt', jrr.created_at
      ))
      from join_requests_rows jrr
    ), '[]'::jsonb)
  )
  into v_result
  from profile p
  cross join stats s;

  return v_result;
end;
$$;

grant execute on function public.get_admin_user_detail(uuid) to authenticated;
revoke all on function public.get_admin_user_detail(uuid) from anon;

