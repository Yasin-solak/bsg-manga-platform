-- Admin > Comments v2 (comment moderation desk).
--
-- The old get_admin_comment_moderation_window scanned only the LAST ~140 comments in each source:
-- search and the "Riskli" filter never found older comments,
-- "Toplam" showed the scanned window; with no risky comments it silently returned to the latest
-- comments. The new function:
-- - searches / filters all comments, pages on the server (real total),
-- - a cross-source "Tumu" view and per-source counts,
-- - strip counts (active / removed / risky) for the selected source + search,
-- - signals only from comment text (formerly "final" in a post title
-- made every comment under it a spoiler),
-- - Turkish letter-insensitive matching ("gerizekalı", "piç" now get caught) and
-- inline spoiler marks (||...||),
-- - per-row reply count and the author removed comment count.
-- The old function stays in place for rollback.

create or replace function app_private.comment_moderation_fold(p_text text)
returns text
language sql
immutable
set search_path to ''
as $$
  select lower(translate(coalesce(p_text, ''), 'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu'))
$$;

create or replace function app_private.comment_moderation_signals(p_body text, p_is_spoiler boolean)
returns text[]
language sql
immutable
set search_path to ''
as $$
  with folded as (
    select app_private.comment_moderation_fold(p_body) as h, coalesce(p_body, '') as raw
  )
  -- Long roots can take suffixes (gerizekalisin, finali, indirimli): only a start
  -- boundary. Short / ambiguous words (mal, pic, sonu, olum) are whole words:
  -- "sonuc", "olumlu", "malzeme" must not get caught.
  select array_remove(array[
    case when f.h ~ '(https?://|www\.|t\.me/|discord\.gg/|bit\.ly/)' then 'links' end,
    case when coalesce(p_is_spoiler, false) or position('||' in f.raw) > 0
      or f.h ~ '\m(spoil|final)' or f.h ~ '\m(sonu|olum)\M' then 'spoiler' end,
    case when f.h ~ '\m(bedava|cekilis|promo|indirim|satilik|coin|telegram|discord)' then 'spam' end,
    case when f.h ~ '\m(aptal|salak|gerizekal|orospu|siktir|sikerim|sikeyim|amina|pezevenk|kahpe|serefsiz|yarrak)'
      or f.h ~ '\m(mal|pic|amk|aq|ibne)\M' then 'abuse' end
  ], null)
  from folded as f
$$;

create or replace function public.admin_list_moderation_comments(
  p_source text default 'all',
  p_status text default 'active',
  p_signal text default 'all',
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_source text := lower(btrim(coalesce(p_source, 'all')));
  v_status text := lower(btrim(coalesce(p_status, 'active')));
  v_signal text := lower(btrim(coalesce(p_signal, 'all')));
  v_search text := nullif(app_private.comment_moderation_fold(btrim(coalesce(p_search, ''))), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not app_private.can_manage_moderation_state() then
    raise exception 'Bu işlem için yönetici yetkisi gerekir.' using errcode = '42501';
  end if;
  if v_source not in ('all', 'community', 'chapter', 'manga', 'list') then
    raise exception 'Geçersiz yorum kaynağı.' using errcode = '22023';
  end if;
  if v_status not in ('all', 'active', 'removed') then
    raise exception 'Geçersiz yorum durumu.' using errcode = '22023';
  end if;
  if v_signal not in ('all', 'flagged', 'links', 'spoiler', 'spam', 'abuse') then
    raise exception 'Geçersiz yorum sinyali.' using errcode = '22023';
  end if;
  if length(coalesce(p_search, '')) > 120 then
    raise exception 'Arama metni çok uzun.' using errcode = '22023';
  end if;

  return (
    with base as (
      select
        'community'::text as source, cc.id, cc.post_id as entity_id, null::uuid as manga_id,
        '/discussion/' || cc.post_id::text as route_hint,
        coalesce(nullif(btrim(cp.title), ''), 'Topluluk gönderisi') as context_title,
        'Topluluk yorumu'::text as context_subtitle,
        cc.author_id as author_user_id, cc.parent_id, coalesce(cc.body, '') as body,
        coalesce(cc.is_spoiler, false) as is_spoiler, coalesce(cc.is_active, true) as is_active,
        coalesce(cc.is_pinned, false) as is_pinned,
        coalesce(cc.likes_count, 0)::integer as likes_count, coalesce(cc.dislikes_count, 0)::integer as dislikes_count,
        cc.created_at, cc.updated_at
      from public.community_comments as cc
      join public.community_posts as cp on cp.id = cc.post_id
      union all
      select
        case when mc.chapter_id is null then 'manga' else 'chapter' end, mc.id,
        coalesce(mc.chapter_id, mc.manga_id), mc.manga_id,
        case
          when ch.chapter_number is not null then '/manga/' || mc.manga_id::text || '/bolum/' || trim_scale(ch.chapter_number)::text
          else '/manga/' || mc.manga_id::text
        end,
        coalesce(nullif(btrim(m.title), ''), 'Manga'),
        case
          when mc.chapter_id is null then 'Manga yorumu'
          else 'Bölüm ' || coalesce(trim_scale(ch.chapter_number)::text, '-')
            || case when nullif(btrim(ch.title), '') is not null then ' · ' || btrim(ch.title) else '' end
        end,
        mc.user_id, mc.parent_id, coalesce(mc.content, ''),
        coalesce(mc.is_spoiler, false), coalesce(mc.is_active, true), coalesce(mc.is_pinned, false),
        coalesce(mc.likes, 0)::integer, coalesce(mc.dislikes, 0)::integer, mc.created_at, mc.updated_at
      from public.manga_comments as mc
      join public.mangas as m on m.id = mc.manga_id
      left join public.chapters as ch on ch.id = mc.chapter_id
      union all
      select
        'list', umc.id, umc.list_id, null::uuid, '/listeler/' || umc.list_id::text,
        coalesce(nullif(btrim(uml.title), ''), 'Manga listesi'), 'Liste yorumu'::text,
        umc.author_id, umc.parent_id, coalesce(umc.body, ''),
        coalesce(umc.is_spoiler, false), coalesce(umc.is_active, true), false,
        coalesce(umc.likes_count, 0)::integer, coalesce(umc.dislikes_count, 0)::integer, umc.created_at, umc.updated_at
      from public.user_manga_list_comments as umc
      join public.user_manga_lists as uml on uml.id = umc.list_id
    ),
    enriched as (
      select b.*, app_private.comment_moderation_signals(b.body, b.is_spoiler) as signals,
        pud.username as author_username, pud.avatar_url as author_avatar_url,
        pud.active_fansub_identity_tag
      from base as b
      left join public.public_user_directory as pud on pud.id = b.author_user_id
    ),
    searched as (
      select e.* from enriched as e
      where v_search is null
        or app_private.comment_moderation_fold(e.body) like '%' || v_search || '%'
        or app_private.comment_moderation_fold(coalesce(e.author_username, '')) like '%' || v_search || '%'
        or app_private.comment_moderation_fold(e.context_title) like '%' || v_search || '%'
    ),
    filtered as (
      select s.* from searched as s
      where (v_status = 'all' or (v_status = 'active' and s.is_active) or (v_status = 'removed' and not s.is_active))
        and (
          v_signal = 'all'
          or (v_signal = 'flagged' and cardinality(s.signals) > 0)
          or s.signals @> array[v_signal]
        )
    ),
    scoped as (
      select f.* from filtered as f where v_source = 'all' or f.source = v_source
    ),
    page as (
      select sc.* from scoped as sc
      order by sc.created_at desc, sc.id desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'source', p.source,
          'entityId', p.entity_id,
          'mangaId', p.manga_id,
          'routeHint', p.route_hint,
          'contextTitle', p.context_title,
          'contextSubtitle', p.context_subtitle,
          'authorUserId', p.author_user_id,
          'authorUsername', coalesce(nullif(btrim(p.author_username), ''), 'Bilinmeyen kullanıcı'),
          'authorAvatarUrl', p.author_avatar_url,
          'activeFansubIdentityTag', p.active_fansub_identity_tag,
          'parentId', p.parent_id,
          'body', p.body,
          'isSpoiler', p.is_spoiler,
          'isActive', p.is_active,
          'isPinned', p.is_pinned,
          'likesCount', p.likes_count,
          'dislikesCount', p.dislikes_count,
          'createdAt', p.created_at,
          'updatedAt', p.updated_at,
          'signals', to_jsonb(p.signals),
          'replyCount', case p.source
            when 'community' then (select count(*) from public.community_comments as r where r.parent_id = p.id)
            when 'list' then (select count(*) from public.user_manga_list_comments as r where r.parent_id = p.id)
            else (select count(*) from public.manga_comments as r where r.parent_id = p.id)
          end,
          'authorRemovedCount',
            (select count(*) from public.community_comments as x where x.author_id = p.author_user_id and not coalesce(x.is_active, true))
            + (select count(*) from public.manga_comments as x where x.user_id = p.author_user_id and not coalesce(x.is_active, true))
            + (select count(*) from public.user_manga_list_comments as x where x.author_id = p.author_user_id and not coalesce(x.is_active, true))
        ) order by p.created_at desc, p.id desc)
        from page as p
      ), '[]'::jsonb),
      'total', (select count(*) from scoped),
      'sources', (
        select jsonb_build_object(
          'all', count(*),
          'community', count(*) filter (where f.source = 'community'),
          'chapter', count(*) filter (where f.source = 'chapter'),
          'manga', count(*) filter (where f.source = 'manga'),
          'list', count(*) filter (where f.source = 'list')
        ) from filtered as f
      ),
      'counts', (
        select jsonb_build_object(
          'active', count(*) filter (where s.is_active),
          'removed', count(*) filter (where not s.is_active),
          'flagged', count(*) filter (where s.is_active and cardinality(s.signals) > 0)
        ) from searched as s
        where v_source = 'all' or s.source = v_source
      ),
      'fetchedAt', now()
    )
  );
end;
$$;

revoke all on function public.admin_list_moderation_comments(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_moderation_comments(text, text, text, text, integer, integer) to authenticated;
