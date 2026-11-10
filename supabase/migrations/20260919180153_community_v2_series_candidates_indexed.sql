-- Candidate search scans the related fansub chapter index, not the shared catalog.
create or replace function community_v2.series_candidates(s uuid,search text,offn integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=community_v2.actor();
begin
  if not community_v2.has_permission(s,u,'channels.create') and not community_v2.has_permission(s,u,'channels.manage') then
    raise exception 'Seri bağlama iznin yok.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select m.id,m.title,m.slug,exists(select 1 from community_v2.channels where server_id=s and manga_id=m.id) as already_linked
    from (select distinct c.manga_id from public.chapters c join community_v2.servers v on v.fansub_id=c.fansub_id
      where v.id=s and c.is_active and c.is_approved and coalesce(c.publish_at,c.created_at)<=now()) linked
    join public.mangas m on m.id=linked.manga_id
    where m.is_active and m.is_approved and community_v2.series_audience(m.id,u)
    and m.title ilike '%'||left(coalesce(search,''),80)||'%'
    order by m.title,m.id limit 21 offset greatest(0,least(coalesce(offn,0),100000)))x),'[]'::jsonb);
end $$;
revoke all on function community_v2.series_candidates(uuid,text,integer) from public,anon,authenticated;
