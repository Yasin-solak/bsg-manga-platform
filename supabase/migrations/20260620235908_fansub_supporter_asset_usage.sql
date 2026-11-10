-- Fansub support asset (emoji/sticker) USAGE analytics.
--
-- The Expressions tab reference shows how much each expression is used and the "most
-- used". There is no separate usage logging infrastructure; instead
-- tokens in existing community content (post title+body, comment body) are
-- scanned and counted per shortcode. Token format: :fse_<shortcode>@<rev>:
-- (emoji) and [[fss_<shortcode>@<rev>]] (sticker).
--
-- Note (scale): two full scans (posts + comments). The analytics tab is not a hot path;
-- if it grows it can move to a materialized view / counter table.

begin;

create or replace function public.get_fansub_supporter_asset_usage(p_fansub_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  if public.current_public_user_id() is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun ifade analitigini gorme yetkiniz yok.';
  end if;

  with raw_matches as (
    select regexp_matches(
      coalesce(cp.title, '') || ' ' || coalesce(cp.body, ''),
      '(:fse_|\[\[fss_)([a-z0-9][a-z0-9_-]*)@',
      'g'
    ) as mm
    from public.community_posts cp
    union all
    select regexp_matches(coalesce(cc.body, ''), '(:fse_|\[\[fss_)([a-z0-9][a-z0-9_-]*)@', 'g') as mm
    from public.community_comments cc
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

grant execute on function public.get_fansub_supporter_asset_usage(uuid) to authenticated;

commit;
