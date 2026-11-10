-- Premium page: the fansub expressions perk shows with real content. A mixed selection of active emoji / stickers
-- uploaded by fansubs (with the fansub name). The per-fansub list
-- (list_public_fansub_supporter_assets) is already public; this is only a cross-fansub summary.

create or replace function public.premium_showcase_expressions(p_limit integer default 12)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  from (
    select a.id, a.asset_kind as "assetKind", coalesce(r.asset_ref, a.asset_ref) as "assetRef",
           coalesce(r.label, a.label) as label, coalesce(r.presentation, a.presentation) as presentation,
           f.name as "fansubName", f.slug as "fansubSlug"
    from public.fansub_supporter_assets a
    join public.fansubs f on f.id = a.fansub_id
    left join public.fansub_supporter_asset_revisions r on r.id = a.current_revision_id
    where a.is_active and a.deleted_at is null and f.is_active
    order by a.asset_kind, a.updated_at desc
    limit least(greatest(coalesce(p_limit, 12), 1), 24)
  ) x;
$$;

revoke all on function public.premium_showcase_expressions(integer) from public;
grant execute on function public.premium_showcase_expressions(integer) to anon, authenticated;
