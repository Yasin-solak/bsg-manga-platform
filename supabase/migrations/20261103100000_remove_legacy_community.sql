-- Fully removes the old community post feed (community_posts, /discussion) with its data
-- . Community is only community_v2 (server / channel /
-- message). User decision: 2026-11-01 "remove entirely", 2026-11-03 "including
-- the data".
--
-- Order: (1) records tied to old content, (2) old branches in shared functions
-- (a targeted change on pg_get_functiondef; on no pattern match the migration
-- stops), (3) constraints, (4) old tables / functions, (5) validation.

-- Targeted function fixer: each pattern must match at least once; no old
-- table name may remain in the result.
create or replace function pg_temp.mz_patch(fn regprocedure, patterns text[], replacements text[])
returns void
language plpgsql
as $f$
declare
  d text := replace(pg_get_functiondef(fn), E'\r', '');
  n text;
  i integer;
begin
  for i in 1..coalesce(array_length(patterns, 1), 0) loop
    n := regexp_replace(d, patterns[i], replacements[i], 'g');
    if n = d then
      raise exception 'mz_patch %: desen eslesmedi: %', fn, left(patterns[i], 80);
    end if;
    d := n;
  end loop;
  if d ~ 'community_(posts|comments|post_likes|post_polls|post_poll_options|post_poll_votes|post_assets|post_reactions|post_view_events|comment_reactions)\M' then
    raise exception 'mz_patch %: eski tablo referansi kaldi', fn;
  end if;
  execute d;
end
$f$;

-- ---------------------------------------------------------------------------
-- 1) Records tied to old content
-- ---------------------------------------------------------------------------

-- Old post / comment notifications (their targets are gone).
delete from public.notifications
where data ? 'post_id'
   or data ? 'postId'
   or data->>'event' like 'community_post%'
   or data->>'event' like 'community_comment%'
   or data->>'event' = 'fansub_post';

-- Post / post comment reports and fansub fix records.
delete from public.fansub_reported_content where target_type = 'post';
delete from public.reports where target_type in ('post', 'comment');

-- Takip akisindaki "fansub gonderisi" olaylari.
delete from public.activity_events where post_id is not null or event_type = 'fansub_post';

-- Old "post" targeted notification broadcast and profile layouts.
update public.fansub_special_notification_broadcasts set route_target = 'mangalar' where route_target = 'postlar';
update public.user_profile_layouts
set tabs = array_remove(tabs, 'posts'),
    slot_left = case when slot_left = 'post' then 'none' else slot_left end,
    slot_right = case when slot_right = 'post' then 'none' else slot_right end
where 'posts' = any(tabs) or slot_left = 'post' or slot_right = 'post';

-- Post-based tasks are deactivated (earned rewards are kept).
update public.quests set is_active = false
where metric_key in ('community_post_count', 'community_comment_count', 'qualified_posts', 'community_leader_score');
update public.user_reward_tasks set is_active = false
where metric_key in ('community_post_count', 'community_comment_count', 'qualified_posts', 'community_leader_score');

-- Feature flags of the old feed.
delete from public.feature_flags
where key in ('community.posting', 'community.rich_detail', 'community.polls', 'community.gifs', 'community.emoji_reactions');

-- ---------------------------------------------------------------------------
-- 2) Old branches in shared functions
-- ---------------------------------------------------------------------------

-- Home feed: popular post and daily/weekly/monthly highlights go away
-- (p_popular_post_limit stays for signature compatibility, unused).
select pg_temp.mz_patch('public.get_homepage_feed(integer,integer,integer,integer,integer,integer)', array[
  $p$,\n  active_posts as \(.*?community_monthly as \(.*?limit 3\n  \)\n$p$,
  $p$\n    'community_posts',\n.*?community_monthly t\), '\[\]'::jsonb\)\n    \),$p$
], array[E'\n', '']);

-- Overview summary: the "Community" queue = open message reports, metric =
-- server messages, quality = report outcome rate (community_v2).
select pg_temp.mz_patch('app_private.get_admin_dashboard_snapshot(text,timestamptz)', array[
  $p$    select 'community', 'community_post:' \|\| p\.id::text, p\.created_at\n    from public\.community_posts p\n    where p\.status = 'pending'$p$,
  $p$      'community',\n      'community_post:' \|\| p\.id::text,\n      'community_post:' \|\| p\.id::text,\n      p\.created_at,\n      p\.status,\n      p\.status in \('approved', 'rejected'\),\n      p\.status,\n      case p\.status when 'approved' then p\.approved_at when 'rejected' then p\.rejected_at end\n    from public\.community_posts p\n    where p\.created_at >= v_previous_start\n      and p\.created_at < v_current_end$p$,
  $p$    from public\.community_posts p\n    union all\n    select\n      'fansubs'$p$,
  $p$'Topluluk moderasyonu'::text$p$,
  $p$'community_approval', 'Topluluk onay orani'$p$,
  $p$'Su an karara bagli ve donem sonundan once sonuclanmis benzersiz topluluk iceriklerindeki onay payidir; yeniden kuyruga alinanlar bugunku durumuyla okunur\.'$p$,
  $p$    select 'community', p\.created_at from public\.community_posts p\n    where p\.created_at >= v_current_start and p\.created_at < v_current_end$p$
], array[
  E'    select ''community'', ''community_report:'' || r.id::text, r.created_at\n    from community_v2.message_reports r\n    where r.status = ''open''',
  E'      ''community'',\n      ''community_report:'' || r.id::text,\n      ''community_report:'' || r.id::text,\n      r.created_at,\n      case when r.status = ''open'' then ''pending'' else r.status end,\n      r.status <> ''open'',\n      case r.status when ''resolved'' then ''approved'' when ''dismissed'' then ''rejected'' else r.status end,\n      r.reviewed_at\n    from community_v2.message_reports r\n    where r.created_at >= v_previous_start\n      and r.created_at < v_current_end',
  E'    from community_v2.messages p\n    where p.deleted_at is null\n    union all\n    select\n      ''fansubs''',
  $r$'Topluluk şikâyetleri'::text$r$,
  $r$'community_approval', 'Topluluk şikâyet sonuç oranı'$r$,
  $r$'Dönemde gelen ve dönem sonundan önce karara bağlanan topluluk mesaj şikâyetlerinde sonuçlandırılanların payıdır; gerekçesiz bulunanlar paydaya dahildir.'$r$,
  E'    select ''community'', p.created_at from community_v2.messages p\n    where p.deleted_at is null and p.created_at >= v_current_start and p.created_at < v_current_end'
]);

-- Comment moderation: sources manga / chapter / list.
select pg_temp.mz_patch('public.admin_list_moderation_comments(text,text,text,text,integer,integer)', array[
  $p$\('all', 'community', 'chapter', 'manga', 'list'\)$p$,
  $p$      select\n        'community'::text as source,.*?join public\.community_posts as cp on cp\.id = cc\.post_id\n      union all\n$p$,
  $p$\n            when 'community' then \(select count\(\*\) from public\.community_comments as r where r\.parent_id = p\.id\)$p$,
  $p$\n            \(select count\(\*\) from public\.community_comments as x where x\.author_id = p\.author_user_id and not coalesce\(x\.is_active, true\)\)\n            \+ \(select count$p$,
  $p$\n          'community', count\(\*\) filter \(where f\.source = 'community'\),$p$,
  -- Union column names now come from the first (manga) branch.
  $p$case when mc\.chapter_id is null then 'manga' else 'chapter' end, mc\.id,\n        coalesce\(mc\.chapter_id, mc\.manga_id\), mc\.manga_id,$p$,
  $p$          else '/manga/' \|\| mc\.manga_id::text\n        end,\n        coalesce\(nullif\(btrim\(m\.title\), ''\), 'Manga'\),$p$,
  $p$ else '' end\n        end,\n        mc\.user_id, mc\.parent_id, coalesce\(mc\.content, ''\),\n        coalesce\(mc\.is_spoiler, false\), coalesce\(mc\.is_active, true\), coalesce\(mc\.is_pinned, false\),\n        coalesce\(mc\.likes, 0\)::integer, coalesce\(mc\.dislikes, 0\)::integer, mc\.created_at, mc\.updated_at$p$
], array[
  $r$('all', 'chapter', 'manga', 'list')$r$,
  '',
  '',
  E'\n            (select count',
  '',
  E'case when mc.chapter_id is null then ''manga'' else ''chapter'' end as source, mc.id,\n        coalesce(mc.chapter_id, mc.manga_id) as entity_id, mc.manga_id,',
  E'          else ''/manga/'' || mc.manga_id::text\n        end as route_hint,\n        coalesce(nullif(btrim(m.title), ''''), ''Manga'') as context_title,',
  E' else '''' end\n        end as context_subtitle,\n        mc.user_id as author_user_id, mc.parent_id, coalesce(mc.content, '''') as body,\n        coalesce(mc.is_spoiler, false) as is_spoiler, coalesce(mc.is_active, true) as is_active, coalesce(mc.is_pinned, false) as is_pinned,\n        coalesce(mc.likes, 0)::integer as likes_count, coalesce(mc.dislikes, 0)::integer as dislikes_count, mc.created_at, mc.updated_at'
]);

-- Admin user detail: post / post comment lists and counters.
select pg_temp.mz_patch('app_private.get_admin_user_detail(uuid)', array[
  $p$  community_posts_rows as \(.*?limit 25\n  \),\n  community_comments_rows as \(.*?\n  \),\n$p$,
  $p$\n      \(select count\(\*\)::int from public\.community_posts cp where cp\.author_id = p_user_id\) as post_count,$p$,
  $p$\n      \(select count\(\*\)::int from public\.community_comments cc where cc\.author_id = p_user_id\) as community_comment_count,$p$,
  $p$\n      'postCount', s\.post_count,\n      'communityCommentCount', s\.community_comment_count,$p$,
  $p$\n    'communityPosts', coalesce\(.*?from community_comments_rows ccr\n    \), '\[\]'::jsonb\),$p$
], array['', '', '', '', '']);

-- Fansub istatistik ozeti: gonderi sayaclari.
select pg_temp.mz_patch('app_private.get_fansub_manage_analytics_summary(uuid)', array[
  $p$  post_stats as \(.*?where cp\.related_fansub_id = p_fansub_id\n  \),\n$p$,
  $p$\n  cross join post_stats ps$p$,
  $p$\n\s*'totalPostCount', ps\.total_count,$p$,
  $p$\n\s*'newPosts7d', ps\.created_7d,\n\s*'newPosts30d', ps\.created_30d,$p$,
  $p$,\n\s*'posts', jsonb_build_object\(\n\s*'approved', ps\.approved_count,\n\s*'pending', ps\.pending_count,\n\s*'rejected', ps\.rejected_count\n\s*\)$p$,
  $p$\n\s*'totalPostCount', 0,$p$,
  $p$\n\s*'newPosts7d', 0,\n\s*'newPosts30d', 0,$p$,
  $p$,\n\s*'posts', jsonb_build_object\('approved', 0, 'pending', 0, 'rejected', 0\)$p$
], array['', '', '', '', '', '', '', '']);

-- Fansub cockpit: pending post queue, post interactions and
-- post reports; daily summary only manga comments.
select pg_temp.mz_patch('public.get_fansub_manage_overview_cockpit(uuid)', array[
  $p$  queue_posts as \(.*?limit 6\n  \),\n$p$,
  $p$\n    union all\n    select \* from queue_posts$p$,
  $p$  -- Daily community summary\n  community_today as \(\n    select\n      \(\n        select count\(\*\)::bigint\n        from public\.community_comments cc.*?\)\n      \+\n      \($p$,
  $p$ as comments_today,\n.*? as posts_today\n  \),\n  -- Open reports.*?\n  \)\n  select jsonb_build_object\($p$,
  $p$,\n      'likesToday', ct\.likes_today,\n      'reactionsToday', ct\.reactions_today,\n      'postsToday', ct\.posts_today,\n      'openReports', orp\.open_count$p$,
  $p$\n  cross join open_reports orp;$p$,
  $p$'community', jsonb_build_object\('commentsToday', 0, 'likesToday', 0, 'reactionsToday', 0, 'postsToday', 0, 'openReports', 0\)$p$
], array[
  '',
  '',
  E'  -- Daily summary: manga comments written today on the fansub series\n  community_today as (\n    select\n      (',
  E' as comments_today\n  )\n  select jsonb_build_object(',
  '',
  ';',
  $r$'community', jsonb_build_object('commentsToday', 0)$r$
]);

-- Task metrics: post / community comment branches go away; likes count only
-- from manga comments. An unknown metric already returns 0.
select pg_temp.mz_patch('app_private.get_user_reward_metric_value(text,uuid)', array[
  $p$  elsif v_metric = 'community_comment_count' then\n.*?\n\n  elsif v_metric = 'total_comment_count' then$p$,
  $p$\n      \+\n      coalesce\(\(\n        select count\(\*\)::bigint\n        from public\.community_comments\n        where author_id = v_user_id\n          and coalesce\(is_active, true\) = true\n      \), 0\)$p$,
  $p$  elsif v_metric = 'qualified_posts' then\n.*?\n\n  elsif v_metric = 'upvotes_received' then$p$,
  $p$\n      \+\n      coalesce\(\(\n        select count\(\*\)::bigint\n        from public\.community_comment_reactions ccr.*?'like'\n      \), 0\)\n    \)::bigint into v_value;\n\n  elsif v_metric = 'chapters_in_single_day'$p$,
  $p$  elsif v_metric = 'community_leader_score' then\n.*?\n\n  elsif v_metric = 'weekly_trending_read' then$p$
], array[
  $r$  elsif v_metric = 'total_comment_count' then$r$,
  '',
  $r$  elsif v_metric = 'upvotes_received' then$r$,
  E'\n    )::bigint into v_value;\n\n  elsif v_metric = ''chapters_in_single_day''',
  $r$  elsif v_metric = 'weekly_trending_read' then$r$
]);

-- Event task metric list.
select pg_temp.mz_patch('public.admin_upsert_event_quest(uuid,uuid,text,text,text,integer,integer,integer,uuid,boolean)', array[
  $p$, 'total_comment_count', 'community_post_count'\)$p$,
  $p$, total_comment_count, community_post_count\)$p$
], array[
  $r$, 'total_comment_count')$r$,
  ', total_comment_count)'
]);

-- Duyuru referanslari: "gonderi" turu kalkar.
select pg_temp.mz_patch('announcement_internal.reference(text,uuid)', array[
  $p$ elsif k='post' then\n.*?is_user_blocked_between\(p\.author_id,uid\);\n$p$
], array['']);
select pg_temp.mz_patch('announcement_internal.search(text,text)', array[
  $p$ elsif p_kind='post' then select array_agg.*?limit 15\) x;\n$p$
], array['']);

-- Report and content removal: only manga / chapter; team notification routes to the Chapters
-- tab (reported content panel).
select pg_temp.mz_patch('public.admin_remove_reported_content(uuid,text)', array[
  $p$\('manga', 'chapter', 'post'\)$p$,
  $p$  else\n    update public\.community_posts.*?v_label := 'Topluluk gonderisi';\n  end if;$p$,
  $p$/yonet#postlar$p$
], array[
  $r$('manga', 'chapter')$r$,
  '  end if;',
  '/yonet#bolumler'
]);

select pg_temp.mz_patch('public.fansub_submit_content_fix(uuid,text)', array[
  $p$  else\n    update public\.community_posts set is_active = true, status = 'pending' where id = v_target_id;\n$p$
], array['']);

select pg_temp.mz_patch('public.list_fansub_reported_content(uuid,text)', array[
  $p$\n          else coalesce\(nullif\(pp\.title, ''\), 'Basliksiz gonderi'\)$p$,
  $p$\n        'preview', case fr\.target_type when 'post' then pp\.body else null end,\n        'category', case fr\.target_type when 'post' then pp\.category else null end,$p$,
  $p$\n          else pp\.is_active$p$,
  $p$\n          else \(pp\.status = 'approved'\)$p$,
  $p$\n          else \(pp\.id is not null\)$p$,
  $p$\n  left join public\.community_posts pp on fr\.target_type = 'post' and pp\.id = fr\.target_id$p$
], array['', '', '', '', '', '']);

-- Expression usage: supporter emoji / stickers now count in manga and list
-- comments (match pattern same as the previous version).
create or replace function public.get_fansub_supporter_asset_usage(p_fansub_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_items jsonb;
begin
  if public.current_public_user_id() is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if not (public.is_admin() or app_private.fansub_staff_ifadeler(p_fansub_id)) then
    raise exception 'Bu fansubun ifade analitigini gorme yetkiniz yok.';
  end if;

  with raw_matches as (
    select regexp_matches(coalesce(mc.content, ''), '(:fse_|\\[\\[fss_)([a-z0-9][a-z0-9_-]*)@', 'g') as mm
    from public.manga_comments mc
    union all
    select regexp_matches(coalesce(lc.body, ''), '(:fse_|\\[\\[fss_)([a-z0-9][a-z0-9_-]*)@', 'g') as mm
    from public.user_manga_list_comments lc
  ),
  usage as (
    select
      case when mm[1] = ':fse_' then 'emoji' else 'sticker' end as asset_kind,
      lower(mm[2]) as shortcode,
      count(*)::int as uses
    from raw_matches
    group by 1, 2
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'shortcode', a.shortcode,
        'assetKind', a.asset_kind,
        'uses', coalesce(u.uses, 0)
      )
      order by coalesce(u.uses, 0) desc, a.shortcode asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.fansub_supporter_assets a
  left join usage u
    on u.shortcode = lower(a.shortcode)
    and u.asset_kind = a.asset_kind
  where a.fansub_id = p_fansub_id;

  return jsonb_build_object('items', v_items);
end;
$$;

-- Fansub duyuru hedefi: "postlar" kalkar.
select pg_temp.mz_patch('public.resolve_fansub_notice_target(uuid,text,uuid)', array[
  $p$\('mangalar', 'bolumler', 'postlar', 'listeler'\)$p$,
  $p$\n  elsif v_target = 'postlar' then.*?(?=\n  (elsif|else|end if))$p$
], array[
  $r$('mangalar', 'bolumler', 'listeler')$r$,
  ''
]);

-- ---------------------------------------------------------------------------
-- 3) Constraints: old target / tab values go away
-- ---------------------------------------------------------------------------
do $c$
declare
  item record;
  def text;
begin
  for item in
    select c.conrelid::regclass as tbl, c.conname, pg_get_constraintdef(c.oid) as d
    from pg_constraint c
    where c.contype = 'c'
      and (c.conrelid, c.conname) in (
        ('public.fansub_pinned_notices'::regclass, 'fansub_pinned_notices_action_target_check'),
        ('public.fansub_special_notification_broadcasts'::regclass, 'fansub_special_notification_broadcasts_route_target_check'),
        ('public.reports'::regclass, 'reports_target_type_check'),
        ('public.fansub_reported_content'::regclass, 'fansub_reported_content_target_type_check'),
        ('public.user_profile_layouts'::regclass, 'user_profile_layouts_tabs_check'),
        ('public.user_profile_layouts'::regclass, 'user_profile_layouts_slot_check')
      )
  loop
    def := replace(replace(replace(replace(replace(item.d,
      '''postlar''::text, ', ''),
      '''posts''::text, ', ''),
      '''post''::text, ', ''),
      '''comment''::text, ', ''),
      ', ''post''::text]', ']');
    if def = item.d then
      raise exception 'kisit degismedi: %', item.conname;
    end if;
    execute format('alter table %s drop constraint %I, add constraint %I %s', item.tbl, item.conname, item.conname, def);
  end loop;
end
$c$;

-- ---------------------------------------------------------------------------
-- 4) Old tables, view and functions
-- ---------------------------------------------------------------------------
drop view if exists public.admin_stats;

-- Old post image upload policy (store-assets/community/posts/*).
drop policy if exists "Community post image upload own pending posts" on storage.objects;

-- Triggers, policies and the activity_events.post_id foreign key
-- drop with the tables (data is deleted).
drop table if exists
  public.community_comment_reactions,
  public.community_post_view_events,
  public.community_post_reactions,
  public.community_post_poll_votes,
  public.community_post_poll_options,
  public.community_post_polls,
  public.community_post_assets,
  public.community_post_likes,
  public.community_comments,
  public.community_posts
cascade;

drop function if exists
  public.can_write_pending_community_poll_child(uuid),
  app_private.can_write_pending_community_poll_child(uuid),
  app_private.can_write_pending_community_post_child_from_jwt(uuid),
  public.can_write_pending_community_post_child(uuid),
  app_private.can_write_pending_community_post_child(uuid),
  public.create_fansub_community_post(uuid,text,text,text,uuid,integer,uuid[],text[],uuid[],uuid[]),
  app_private.create_fansub_community_post(uuid,text,text,text,uuid,integer,uuid[],text[],uuid[],uuid[]),
  public.get_community_post_reaction_summary(uuid),
  app_private.get_community_post_reaction_summary(uuid),
  public.list_my_community_post_like_states(uuid[]),
  app_private.list_my_community_post_like_states(uuid[]),
  public.set_community_comment_reaction(uuid,text),
  app_private.set_community_comment_reaction(uuid,text),
  public.set_community_post_reaction(uuid,text),
  app_private.set_community_post_reaction(uuid,text),
  public.toggle_community_post_like(uuid),
  app_private.toggle_community_post_like(uuid),
  public.track_community_post_share(uuid),
  app_private.track_community_post_share(uuid),
  public.track_community_post_view(uuid,text),
  app_private.track_community_post_view(uuid,text),
  public.update_fansub_post_for_review(uuid,uuid,text,text,text),
  app_private.update_fansub_post_for_review(uuid,uuid,text,text,text),
  public.vote_community_post_poll(uuid,uuid),
  app_private.vote_community_post_poll(uuid,uuid),
  public.capture_fansub_post_activity_event(),
  public.enforce_community_comment_integrity(),
  public.enforce_community_post_asset_child_guard(),
  public.enforce_community_post_poll_child_guard(),
  public.enforce_community_post_poll_option_child_guard(),
  public.enforce_community_posting_feature_flag(),
  public.fansub_fix_reported_post(uuid,text,text,text,uuid[],jsonb,text,jsonb,text),
  public.get_community_post_asset(uuid),
  public.get_community_post_assets(uuid),
  public.get_community_post_poll(uuid),
  public.get_fansub_manage_community_overview(uuid),
  public.get_fansub_reported_post_media(uuid),
  public.get_popular_community_tags(integer,integer),
  public.is_community_post_liked(uuid),
  public.list_fansub_tagged_community_feed(uuid,integer,integer,text,text),
  public.notify_community_comment_insert(),
  public.notify_community_post_mentions(),
  public.notify_community_post_reviewed(),
  public.prevent_mixed_community_post_asset_types(),
  public.sync_community_post_comments_count(uuid),
  public.sync_community_post_poll_counts(uuid),
  public.sync_community_post_reactions_count(uuid),
  public.tg_quest_community_comment(),
  public.tg_quest_community_post(),
  public.trg_sync_community_post_comments_count(),
  public.get_admin_comment_moderation_window(text,text,text,text,integer,integer),
  app_private.get_admin_comment_moderation_window(text,text,text,text,integer,integer),
  public.list_fansub_manage_posts(uuid,integer,integer,text,text),
  app_private.list_fansub_manage_posts(uuid,integer,integer,text,text);

-- ---------------------------------------------------------------------------
-- 5) Validation: no function reaches old tables
-- ---------------------------------------------------------------------------
do $v$
declare
  leftover text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into leftover
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prosrc ~ 'community_(posts|comments|post_likes|post_polls|post_poll_options|post_poll_votes|post_assets|post_reactions|post_view_events|comment_reactions)\M';
  if leftover is not null then
    raise exception 'eski topluluk tablosuna giden fonksiyon kaldi: %', leftover;
  end if;
end
$v$;
