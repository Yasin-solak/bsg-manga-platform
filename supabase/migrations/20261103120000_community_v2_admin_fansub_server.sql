-- Admin > Fansubs: community server summary of the selected fansub.
-- A 'fansub_server' action is added to community_v2.admin_api (site
-- admin only; gated by the admin check at the start of the same function). With no server returns
-- null.

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
    n := regexp_replace(d, patterns[i], replacements[i]);
    if n = d then
      raise exception 'mz_patch %: desen eslesmedi: %', fn, left(patterns[i], 80);
    end if;
    d := n;
  end loop;
  execute d;
end
$f$;

select pg_temp.mz_patch('community_v2.admin_api(text,jsonb)', array[
  $p$\n  elsif p_action = 'server' then\n$p$
], array[
  $r$
  elsif p_action = 'fansub_server' then
    select * into v from community_v2.servers where fansub_id = nullif(p->>'fansub_id', '')::uuid;
    if not found then return 'null'::jsonb; end if;
    return jsonb_build_object(
      'id', v.id,
      'name', coalesce(nullif(btrim(v.name), ''), (select f.name from public.fansubs as f where f.id = v.fansub_id), 'Adsız sunucu'),
      'join_mode', v.join_mode,
      'archived_at', v.archived_at,
      'created_at', v.created_at,
      'members_active', (select count(*) from community_v2.members as m where m.server_id = v.id and m.state = 'active'),
      'members_timeout', (select count(*) from community_v2.members as m where m.server_id = v.id and m.state = 'active' and m.timeout_until > now()),
      'members_banned', (select count(*) from community_v2.members as m where m.server_id = v.id and m.state = 'banned'),
      'channels', (select count(*) from community_v2.channels as c where c.server_id = v.id and c.archived_at is null),
      'messages_7d', (select count(*) from community_v2.messages ms join community_v2.channels c on c.id = ms.channel_id where c.server_id = v.id and ms.deleted_at is null and ms.created_at > now() - interval '7 days'),
      'last_message_at', (select max(ms.created_at) from community_v2.messages ms join community_v2.channels c on c.id = ms.channel_id where c.server_id = v.id),
      'reports_open', (select count(*) from community_v2.message_reports r where r.server_id = v.id and r.status = 'open'),
      'join_requests', (select count(*) from community_v2.join_requests jr where jr.server_id = v.id)
    );

  elsif p_action = 'server' then
$r$
]);
