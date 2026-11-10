begin;

create or replace function public.get_admin_comment_moderation_window(
  p_source text default 'community',
  p_status text default 'active',
  p_signal text default 'flagged',
  p_search text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := lower(btrim(coalesce(p_source, 'community')));
  v_status text := lower(btrim(coalesce(p_status, 'active')));
  v_signal text := lower(btrim(coalesce(p_signal, 'flagged')));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 50));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_scan_limit integer := 140;
  v_source_sql text;
  v_sql text;
  v_payload jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if v_source not in ('community', 'chapter', 'manga', 'list') then
    raise exception 'Gecersiz yorum kaynagi: %', v_source;
  end if;

  if v_status not in ('all', 'active', 'removed') then
    raise exception 'Gecersiz yorum durumu: %', v_status;
  end if;

  if v_signal not in ('flagged', 'all', 'links', 'spoiler', 'spam', 'abuse') then
    raise exception 'Gecersiz yorum sinyali: %', v_signal;
  end if;

  v_scan_limit := case v_source
    when 'community' then 140
    when 'chapter' then 140
    when 'manga' then 120
    when 'list' then 120
    else 140
  end;

  if v_source = 'community' then
    v_source_sql := format($source$
      select
        cc.id,
        'community'::text as source,
        cc.post_id as entity_id,
        '/discussion/' || cc.post_id::text as route_hint,
        coalesce(nullif(btrim(cp.title), ''), 'Topluluk tartismasi') as context_title,
        'Topluluk yorumu'::text as context_subtitle,
        cc.author_id as author_user_id,
        coalesce(nullif(btrim(pud.username), ''), 'Bilinmeyen kullanici') as author_username,
        pud.avatar_url as author_avatar_url,
        pud.active_fansub_identity_tag,
        cc.parent_id,
        coalesce(cc.body, '') as body,
        coalesce(cc.is_active, true) as is_active,
        coalesce(cc.is_pinned, false) as is_pinned,
        coalesce(cc.likes_count, 0)::integer as likes_count,
        coalesce(cc.dislikes_count, 0)::integer as dislikes_count,
        cc.created_at,
        cc.updated_at,
        row_number() over (order by cc.created_at desc, cc.id desc) as sort_order
      from public.community_comments as cc
      join public.community_posts as cp
        on cp.id = cc.post_id
      left join public.public_user_directory as pud
        on pud.id = cc.author_id
      where (
        $1 = 'all'
        or ($1 = 'active' and coalesce(cc.is_active, true) = true)
        or ($1 = 'removed' and coalesce(cc.is_active, true) = false)
      )
      order by cc.created_at desc, cc.id desc
      limit %s
    $source$, v_scan_limit);
  elsif v_source = 'chapter' then
    v_source_sql := format($source$
      select
        mc.id,
        'chapter'::text as source,
        coalesce(mc.chapter_id, mc.manga_id) as entity_id,
        case
          when ch.chapter_number is not null
            then '/manga/' || mc.manga_id::text || '/chapter/' || floor(ch.chapter_number)::text
          else '/manga/' || mc.manga_id::text
        end as route_hint,
        coalesce(nullif(btrim(m.title), ''), 'Manga yorumu') as context_title,
        (
          'Bolum ' || coalesce(floor(ch.chapter_number)::text, '-')
          || case
            when nullif(btrim(ch.title), '') is not null then ' - ' || btrim(ch.title)
            else ''
          end
        )::text as context_subtitle,
        mc.user_id as author_user_id,
        coalesce(nullif(btrim(pud.username), ''), 'Bilinmeyen kullanici') as author_username,
        pud.avatar_url as author_avatar_url,
        pud.active_fansub_identity_tag,
        mc.parent_id,
        coalesce(mc.content, '') as body,
        coalesce(mc.is_active, true) as is_active,
        coalesce(mc.is_pinned, false) as is_pinned,
        coalesce(mc.likes, 0)::integer as likes_count,
        coalesce(mc.dislikes, 0)::integer as dislikes_count,
        mc.created_at,
        mc.updated_at,
        row_number() over (order by mc.created_at desc, mc.id desc) as sort_order
      from public.manga_comments as mc
      join public.mangas as m
        on m.id = mc.manga_id
      left join public.chapters as ch
        on ch.id = mc.chapter_id
      left join public.public_user_directory as pud
        on pud.id = mc.user_id
      where mc.chapter_id is not null
        and (
          $1 = 'all'
          or ($1 = 'active' and coalesce(mc.is_active, true) = true)
          or ($1 = 'removed' and coalesce(mc.is_active, true) = false)
        )
      order by mc.created_at desc, mc.id desc
      limit %s
    $source$, v_scan_limit);
  elsif v_source = 'manga' then
    v_source_sql := format($source$
      select
        mc.id,
        'manga'::text as source,
        mc.manga_id as entity_id,
        '/manga/' || mc.manga_id::text as route_hint,
        coalesce(nullif(btrim(m.title), ''), 'Manga yorumu') as context_title,
        'Manga yorumu'::text as context_subtitle,
        mc.user_id as author_user_id,
        coalesce(nullif(btrim(pud.username), ''), 'Bilinmeyen kullanici') as author_username,
        pud.avatar_url as author_avatar_url,
        pud.active_fansub_identity_tag,
        mc.parent_id,
        coalesce(mc.content, '') as body,
        coalesce(mc.is_active, true) as is_active,
        coalesce(mc.is_pinned, false) as is_pinned,
        coalesce(mc.likes, 0)::integer as likes_count,
        coalesce(mc.dislikes, 0)::integer as dislikes_count,
        mc.created_at,
        mc.updated_at,
        row_number() over (order by mc.created_at desc, mc.id desc) as sort_order
      from public.manga_comments as mc
      join public.mangas as m
        on m.id = mc.manga_id
      left join public.public_user_directory as pud
        on pud.id = mc.user_id
      where mc.chapter_id is null
        and (
          $1 = 'all'
          or ($1 = 'active' and coalesce(mc.is_active, true) = true)
          or ($1 = 'removed' and coalesce(mc.is_active, true) = false)
        )
      order by mc.created_at desc, mc.id desc
      limit %s
    $source$, v_scan_limit);
  else
    v_source_sql := format($source$
      select
        umc.id,
        'list'::text as source,
        umc.list_id as entity_id,
        '/listeler/' || umc.list_id::text as route_hint,
        coalesce(nullif(btrim(uml.title), ''), 'Manga listesi') as context_title,
        'Liste yorumu'::text as context_subtitle,
        umc.author_id as author_user_id,
        coalesce(nullif(btrim(pud.username), ''), 'Bilinmeyen kullanici') as author_username,
        pud.avatar_url as author_avatar_url,
        pud.active_fansub_identity_tag,
        umc.parent_id,
        coalesce(umc.body, '') as body,
        coalesce(umc.is_active, true) as is_active,
        false as is_pinned,
        coalesce(umc.likes_count, 0)::integer as likes_count,
        coalesce(umc.dislikes_count, 0)::integer as dislikes_count,
        umc.created_at,
        umc.updated_at,
        row_number() over (order by umc.created_at desc, umc.id desc) as sort_order
      from public.user_manga_list_comments as umc
      join public.user_manga_lists as uml
        on uml.id = umc.list_id
      left join public.public_user_directory as pud
        on pud.id = umc.author_id
      where (
        $1 = 'all'
        or ($1 = 'active' and coalesce(umc.is_active, true) = true)
        or ($1 = 'removed' and coalesce(umc.is_active, true) = false)
      )
      order by umc.created_at desc, umc.id desc
      limit %s
    $source$, v_scan_limit);
  end if;

  v_sql := format($sql$
    with window_rows as (
      %s
    ),
    signal_rows as (
      select
        wr.*,
        (wr.body || E'\n' || wr.context_title || E'\n' || wr.context_subtitle) as moderation_haystack,
        ((wr.body || E'\n' || wr.context_title || E'\n' || wr.context_subtitle) ~* '(https?://|www\\.|t\\.me/|discord\\.gg/|bit\\.ly/)') as has_links,
        ((wr.body || E'\n' || wr.context_title || E'\n' || wr.context_subtitle) ~* '\\m(spoiler|spoil|final|sonu|olum)\\M') as has_spoiler,
        ((wr.body || E'\n' || wr.context_title || E'\n' || wr.context_subtitle) ~* '\\m(bedava|cekilis|promo|indirim|satilik|coin|telegram|discord)\\M') as has_spam,
        ((wr.body || E'\n' || wr.context_title || E'\n' || wr.context_subtitle) ~* '\\m(aptal|salak|gerizekali|mal|orospu|pic|siktir|amk)\\M') as has_abuse,
        (
          case when ((wr.body || E'\n' || wr.context_title || E'\n' || wr.context_subtitle) ~* '(https?://|www\\.|t\\.me/|discord\\.gg/|bit\\.ly/)') then 1 else 0 end
          + case when ((wr.body || E'\n' || wr.context_title || E'\n' || wr.context_subtitle) ~* '\\m(spoiler|spoil|final|sonu|olum)\\M') then 1 else 0 end
          + case when ((wr.body || E'\n' || wr.context_title || E'\n' || wr.context_subtitle) ~* '\\m(bedava|cekilis|promo|indirim|satilik|coin|telegram|discord)\\M') then 1 else 0 end
          + case when ((wr.body || E'\n' || wr.context_title || E'\n' || wr.context_subtitle) ~* '\\m(aptal|salak|gerizekali|mal|orospu|pic|siktir|amk)\\M') then 1 else 0 end
        )::integer as signal_count,
        greatest(wr.created_at, wr.updated_at) as activity_at,
        jsonb_build_object(
          'id', wr.id,
          'source', wr.source,
          'entityId', wr.entity_id,
          'routeHint', wr.route_hint,
          'contextTitle', wr.context_title,
          'contextSubtitle', wr.context_subtitle,
          'authorUserId', wr.author_user_id,
          'authorUsername', wr.author_username,
          'authorAvatarUrl', wr.author_avatar_url,
          'activeFansubIdentityTag', wr.active_fansub_identity_tag,
          'parentId', wr.parent_id,
          'body', wr.body,
          'isActive', wr.is_active,
          'isPinned', wr.is_pinned,
          'likesCount', wr.likes_count,
          'dislikesCount', wr.dislikes_count,
          'createdAt', wr.created_at,
          'updatedAt', wr.updated_at
        ) as comment_json
      from window_rows as wr
    ),
    filtered_rows as (
      select sr.*
      from signal_rows as sr
      where (
        $2 is null
        or lower(sr.author_username) like '%%' || lower($2) || '%%'
        or lower(sr.body) like '%%' || lower($2) || '%%'
        or lower(sr.context_title) like '%%' || lower($2) || '%%'
        or lower(sr.context_subtitle) like '%%' || lower($2) || '%%'
      )
      and (
        $2 is not null
        or $3 = 'all'
        or ($3 = 'flagged' and sr.signal_count > 0)
        or ($3 = 'links' and sr.has_links)
        or ($3 = 'spoiler' and sr.has_spoiler)
        or ($3 = 'spam' and sr.has_spam)
        or ($3 = 'abuse' and sr.has_abuse)
      )
    ),
    strategy_row as (
      select
        case
          when $2 is not null then 'search'
          when $3 = 'all' then 'all'
          when $3 = 'flagged' and not exists (select 1 from filtered_rows) then 'recent'
          else 'flagged'
        end::text as strategy
    ),
    working_rows as (
      select sr.*
      from signal_rows as sr
      cross join strategy_row as strategy
      where strategy.strategy = 'recent'

      union all

      select fr.*
      from filtered_rows as fr
      cross join strategy_row as strategy
      where strategy.strategy <> 'recent'
    ),
    count_row as (
      select
        (select count(*)::integer from signal_rows) as scanned_count,
        (select count(*)::integer from working_rows) as working_count
    ),
    actor_rollup as (
      select
        sr.author_user_id,
        min(sr.author_username) as author_username,
        min(sr.author_avatar_url) as author_avatar_url,
        (
          array_agg(sr.active_fansub_identity_tag order by sr.activity_at desc, sr.sort_order asc)
          filter (where sr.active_fansub_identity_tag is not null)
        )[1] as active_fansub_identity_tag,
        count(*)::integer as total_comments,
        count(*) filter (where exists (select 1 from working_rows as wr where wr.id = sr.id))::integer as matched_comments,
        count(*) filter (where sr.is_active)::integer as active_comments,
        count(*) filter (where not sr.is_active)::integer as removed_comments,
        count(*) filter (where sr.parent_id is not null)::integer as reply_comments,
        count(*) filter (where sr.signal_count > 0)::integer as flagged_comments,
        max(sr.activity_at) as last_activity_at,
        (array_agg(sr.id order by sr.activity_at desc, sr.sort_order asc))[1] as latest_comment_id,
        (array_agg(sr.context_title order by sr.activity_at desc, sr.sort_order asc))[1] as latest_context_title,
        max(sr.source) as dominant_source,
        coalesce(sum(
          case when sr.has_abuse then 4 else 0 end
          + case when sr.has_spam then 3 else 0 end
          + case when sr.has_links then 2 else 0 end
          + case when sr.has_spoiler then 1 else 0 end
          + case when sr.is_active then 0 else 3 end
        ), 0)::integer as risk_score,
        array_remove(array[
          case when bool_or(sr.has_links) then 'links'::text end,
          case when bool_or(sr.has_spoiler) then 'spoiler'::text end,
          case when bool_or(sr.has_spam) then 'spam'::text end,
          case when bool_or(sr.has_abuse) then 'abuse'::text end
        ], null) as signals
      from signal_rows as sr
      group by sr.author_user_id
    ),
    actor_rows as (
      select
        ar.author_user_id,
        ar.author_username,
        ar.author_avatar_url,
        ar.active_fansub_identity_tag,
        ar.total_comments,
        ar.matched_comments,
        ar.active_comments,
        ar.removed_comments,
        ar.reply_comments,
        ar.flagged_comments,
        ar.last_activity_at,
        ar.latest_comment_id,
        ar.latest_context_title,
        ar.dominant_source,
        ar.signals,
        ar.risk_score,
        case
          when ar.flagged_comments >= 2 or ar.removed_comments >= 2 or ar.risk_score >= 8 then 'high'
          when ar.flagged_comments >= 1 or ar.removed_comments >= 1 or ar.risk_score >= 3 then 'medium'
          else 'low'
        end::text as risk_tier
      from actor_rollup as ar
      cross join count_row as count_info
      where not (
        count_info.working_count > 0
        and count_info.working_count < count_info.scanned_count
      ) or ar.matched_comments > 0
    ),
    paged_rows as (
      select wr.*
      from working_rows as wr
      order by wr.sort_order asc
      limit $4
      offset $5
    )
    select jsonb_build_object(
      'actors',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'authorUserId', ar.author_user_id,
            'authorUsername', ar.author_username,
            'authorAvatarUrl', ar.author_avatar_url,
            'activeFansubIdentityTag', ar.active_fansub_identity_tag,
            'totalComments', ar.total_comments,
            'matchedComments', ar.matched_comments,
            'activeComments', ar.active_comments,
            'removedComments', ar.removed_comments,
            'replyComments', ar.reply_comments,
            'flaggedComments', ar.flagged_comments,
            'lastActivityAt', ar.last_activity_at,
            'latestCommentId', ar.latest_comment_id,
            'latestContextTitle', ar.latest_context_title,
            'dominantSource', ar.dominant_source,
            'signals', ar.signals,
            'riskScore', ar.risk_score,
            'riskTier', ar.risk_tier
          )
          order by ar.risk_score desc, ar.matched_comments desc, ar.last_activity_at desc, ar.author_username asc
        )
        from actor_rows as ar
      ), '[]'::jsonb),
      'comments',
      coalesce((
        select jsonb_agg(pr.comment_json order by pr.sort_order asc)
        from paged_rows as pr
      ), '[]'::jsonb),
      'windowComments',
      coalesce((
        select jsonb_agg(sr.comment_json order by sr.sort_order asc)
        from signal_rows as sr
      ), '[]'::jsonb),
      'fetchedAt', now(),
      'hasMore', (
        select count_info.working_count > ($5 + $4)
        from count_row as count_info
      ),
      'nextOffset',
      (
        select
          case
            when count_info.working_count > ($5 + $4) then ($5 + $4)
            else null
          end
        from count_row as count_info
      ),
      'scannedCount', (
        select count_info.scanned_count
        from count_row as count_info
      ),
      'strategy', (
        select strategy.strategy
        from strategy_row as strategy
      )
    )
  $sql$, v_source_sql);

  execute v_sql
    into v_payload
    using v_status, v_search, v_signal, v_limit, v_offset;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

grant execute on function public.get_admin_comment_moderation_window(text, text, text, text, integer, integer) to authenticated;
revoke all on function public.get_admin_comment_moderation_window(text, text, text, text, integer, integer) from anon;

commit;
