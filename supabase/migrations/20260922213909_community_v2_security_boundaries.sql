-- Change applied API bodies within a narrow limit; signature and existing ACL are kept.
-- If the expected source is missing stop rather than silently applying a partial fix.
do $patch$
declare
  manage_source text:=pg_get_functiondef('community_v2.manage_api(text,jsonb)'::regprocedure);
  room_source text:=pg_get_functiondef('community_v2.room_api(text,jsonb)'::regprocedure);
  old_control text:=$old$    if p->>'operation'='timeout' then$old$;
  new_control text:=$new$    -- Atma izni yalnız aktif üyede geçerlidir; yasağı yalnız unban kaldırabilir.
    if p->>'operation'='kick' and not exists(
      select 1 from community_v2.members where server_id=s and user_id=target and state='active'
    ) then
      raise exception 'Yalnız aktif bir üyeyi sunucudan çıkarabilirsin.' using errcode='42501';
    end if;
    if p->>'operation'='timeout' then$new$;
  old_request text:=$old$      insert into community_v2.join_requests(server_id,user_id) values(s,u) on conflict do nothing;
      perform community_v2.emit(s); return jsonb_build_object('pending',true);$old$;
  new_request text:=$new$      insert into community_v2.join_requests(server_id,user_id) values(s,u) on conflict do nothing;
      -- A repeat of the same reference must not cause rereads on all connected members.
      if found then perform community_v2.emit(s); end if;
      return jsonb_build_object('pending',true);$new$;
begin
  if array_length(string_to_array(manage_source,old_control),1)<>2
    or array_length(string_to_array(room_source,old_request),1)<>2 then
    raise exception 'Topluluk API kaynak sözleşmesi değişmiş; güvenlik migrationı yeniden incelenmeli.';
  end if;
  execute replace(manage_source,old_control,new_control);
  execute replace(room_source,old_request,new_request);
end $patch$;
