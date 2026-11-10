begin;

create or replace function public.refresh_all_fansub_boost_snapshot_capabilities()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer := 0;
begin
  update public.fansub_boost_snapshots as snapshot
  set
    capabilities = public.build_fansub_boost_capabilities(snapshot.tier_level),
    updated_at = now()
  where snapshot.fansub_id is not null;

  get diagnostics v_affected = row_count;
  return coalesce(v_affected, 0);
end;
$$;

select public.refresh_all_fansub_boost_snapshot_capabilities();

commit;
