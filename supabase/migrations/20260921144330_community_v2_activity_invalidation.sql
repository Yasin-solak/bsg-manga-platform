-- Message activity refreshes server permissions/unread; it is not a member list change.
create or replace function community_v2.emit_activity(s uuid,c uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform realtime.send('{}'::jsonb,'refresh','community-v2:channel:'||c,true);
  perform realtime.send('{"scope":"activity"}'::jsonb,'refresh','community-v2:server:'||s,true);
end $$;
revoke all on function community_v2.emit_activity(uuid,uuid) from public,anon,authenticated;
do $$
declare source text:=pg_get_functiondef('community_v2.message_write(text,jsonb)'::regprocedure);
begin
  if strpos(source,'perform community_v2.emit(s,c);')=0 then raise exception 'Mesaj sinyali kaynak sözleşmesi değişmiş; migration yeniden incelenmeli.'; end if;
  execute replace(source,'perform community_v2.emit(s,c);','perform community_v2.emit_activity(s,c);');
end $$;
