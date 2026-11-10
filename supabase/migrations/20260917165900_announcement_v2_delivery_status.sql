-- A notification error is separate from a preference skip. The view counter does not wait for the reward lock.
create or replace function announcement_internal.notify(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a announcement_internal.entries; uid uuid; sent integer:=0; skipped integer:=0; failed integer:=0;
begin
 perform announcement_internal.require_admin();
 select * into a from announcement_internal.entries where id=p_id for update;
 if a.id is null or a.status<>'published' or a.starts_at>now() or (a.ends_at is not null and a.ends_at<=now()) or a.audience<>'selected' then
  raise exception 'Bildirim yalnız şu anda yayındaki özel alıcılı duyurularda gönderilebilir.';
 end if;
 for uid in select user_id from announcement_internal.recipients where announcement_id=p_id loop
  if exists(select 1 from announcement_internal.deliveries where announcement_id=p_id and user_id=uid)
   or not public.is_notification_type_enabled(uid,'system') then skipped:=skipped+1; continue; end if;
  -- No private content goes to the lock screen; title and text are read in the app with permission.
  perform public.push_notification(uid,'system','Yeni bir duyurun var','Duyuruyu görmek için aç.',
   jsonb_build_object('event_key','announcement:'||p_id::text,'url','/duyurular/'||p_id::text),null);
  if exists(select 1 from public.notifications where user_id=uid and data->>'event_key'='announcement:'||p_id::text) then
   insert into announcement_internal.deliveries values(p_id,uid,now()) on conflict do nothing; sent:=sent+1;
  else failed:=failed+1;
  end if;
 end loop;
 return jsonb_build_object('sent',sent,'skipped',skipped,'failed',failed);
end $$;
create or replace function announcement_internal.respond(p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_private.current_public_user_id(); a announcement_internal.entries; code text; result jsonb; claimed boolean; amount integer;
begin
 if uid is null then raise exception 'Devam etmek için giriş yap.' using errcode='42501'; end if;
 if p_action='view' then
  select * into a from announcement_internal.entries where id=p_id;
 else
  select * into a from announcement_internal.entries where id=p_id for update;
 end if;
 if a.id is null or not announcement_internal.visible(a,uid) then raise exception 'Duyuru sona erdi veya bu hesaba açık değil.' using errcode='42501'; end if;
 if p_action='view' then
  insert into announcement_internal.responses(announcement_id,user_id) values(p_id,uid) on conflict do nothing;
  return jsonb_build_object('success',true);
 elsif p_action='claim' and a.action->>'type'='reward' then
  select c.code,p.value,exists(select 1 from public.user_code_redemptions x where x.code_id=c.id and x.user_id=uid) into code,amount,claimed
  from announcement_internal.reward_pools p join public.redeem_codes c on c.id=p.code_id where p.announcement_id=p_id;
  if code is null then raise exception 'Ödül henüz hazır değil.'; end if;
  if claimed then return jsonb_build_object('success',true,'alreadyClaimed',true); end if;
  insert into announcement_internal.wallet_permits values(txid_current(),uid,amount);
  result:=app_private.redeem_coin_code(code,'user',null);
  if exists(select 1 from announcement_internal.wallet_permits where transaction_id=txid_current() and user_id=uid) then raise exception 'Ödül bakiyeye işlenemedi.'; end if;
  return (result-array['code','code_id'])||jsonb_build_object('alreadyClaimed',false);
 elsif p_action in ('accepted','declined') and a.action->>'type'='rsvp' then
  insert into announcement_internal.responses(announcement_id,user_id,response,responded_at) values(p_id,uid,p_action,now())
  on conflict(announcement_id,user_id) do update set response=excluded.response,responded_at=excluded.responded_at;
  return jsonb_build_object('success',true,'response',p_action);
 end if;
 raise exception 'Bu duyuru için geçersiz işlem.';
end $$;
