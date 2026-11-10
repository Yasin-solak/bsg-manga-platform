-- A target with a closed/banned site account cannot be tagged even with server membership standing.
create or replace function community_v2.parse_mentions(s uuid,c uuid,u uuid,bodyv text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare token text[]; target uuid; kindv text; result jsonb:='[]'; countv integer:=0;
begin
  for token in select regexp_matches(bodyv,'<@(&?)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>','g') loop
    countv:=countv+1; target:=token[2]::uuid; kindv:=case when token[1]='&' then 'role' else 'user' end;
    if countv>20 then raise exception 'Bir mesajda en fazla 20 etiket kullanabilirsin.'; end if;
    if kindv='user' then
      if not community_v2.has_permission(s,u,'mentions.users') or not exists(select 1 from public.users usr where usr.id=target and usr.is_active and not usr.is_banned and community_v2.can_read(c,target)) then
        raise exception 'Kullanıcı etiketi için izin ve aynı kanala okuma erişimi gerekli.' using errcode='42501';
      end if;
    else
      if not community_v2.has_permission(s,u,'mentions.roles') or not exists(
        select 1 from community_v2.roles r where r.id=target and r.server_id=s and r.mentionable and not r.is_default
      ) then raise exception 'Bu rol etiketlenemez veya rol etiketleme iznin yok.' using errcode='42501'; end if;
    end if;
    if not result @> jsonb_build_array(jsonb_build_object('kind',kindv,'id',target)) then
      result:=result||jsonb_build_array(jsonb_build_object('kind',kindv,'id',target));
    end if;
    if jsonb_array_length(result)>10 then raise exception 'Bir mesajda en fazla 10 farklı hedef etiketleyebilirsin.'; end if;
  end loop;
  return result;
end $$;

create or replace function community_v2.message_read(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=community_v2.actor(); c uuid:=(p->>'channel_id')::uuid; s uuid; seqn bigint; ids uuid[]; searchv text:=left(coalesce(p->>'search',''),60);
begin
  select server_id into s from community_v2.channels where id=c;
  if not community_v2.can_read(c,u) then raise exception 'Bu kanalın mesajlarını okuma iznin yok.' using errcode='42501'; end if;
  if p_action='mention_candidates' then
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      (select 'user'::text as kind,usr.id,usr.username as label,usr.username,null::text as color
       from community_v2.members mem join public.users usr on usr.id=mem.user_id
       where mem.server_id=s and mem.state='active' and usr.is_active and not usr.is_banned and community_v2.has_permission(s,u,'mentions.users')
       and strpos(lower(usr.username),lower(searchv))>0 and community_v2.can_read(c,usr.id)
       order by usr.username,usr.id limit 10)
      union all
      (select 'role',r.id,r.name,null::text,r.color from community_v2.roles r
       where r.server_id=s and r.mentionable and not r.is_default and community_v2.has_permission(s,u,'mentions.roles')
       and strpos(lower(r.name),lower(searchv))>0 order by r.position,r.id limit 10)
    )x),'[]'::jsonb);
  elsif p_action='message_snapshot' then
    if jsonb_typeof(p->'ids') is distinct from 'array' or jsonb_array_length(p->'ids')>250 then raise exception 'En fazla 250 mesaj yenilenebilir.'; end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p->'ids');
    return coalesce((select jsonb_agg(community_v2.message_json(m,u) order by m.seq) from community_v2.messages m where m.channel_id=c and m.id=any(ids)),'[]'::jsonb);
  elsif p_action='message_context' then
    select seq into seqn from community_v2.messages where id=(p->>'message_id')::uuid and channel_id=c;
    if not found then raise exception 'Mesaj bu kanalda bulunamadı.'; end if;
    return coalesce((select jsonb_agg(community_v2.message_json(m,u) order by m.seq) from (
      (select * from community_v2.messages where channel_id=c and seq<seqn order by seq desc limit 25)
      union all (select * from community_v2.messages where channel_id=c and seq>=seqn order by seq limit 25)
    )m),'[]'::jsonb);
  elsif p_action='pins' then
    return coalesce((select jsonb_agg(community_v2.message_json(m,u) order by m.pinned_at desc) from (
      select * from community_v2.messages where channel_id=c and pinned_at is not null and deleted_at is null order by pinned_at desc limit 50)m),'[]'::jsonb);
  elsif p_action='messages' then
    return coalesce((select jsonb_agg(community_v2.message_json(m,u) order by m.seq) from (
      select * from community_v2.messages where channel_id=c and (p->>'before' is null or seq<(p->>'before')::bigint) order by seq desc limit 50)m),'[]'::jsonb);
  end if;
  raise exception 'Bilinmeyen mesaj sorgusu.';
end $$;

revoke all on function community_v2.parse_mentions(uuid,uuid,uuid,text),community_v2.message_read(text,jsonb) from public,anon,authenticated;
