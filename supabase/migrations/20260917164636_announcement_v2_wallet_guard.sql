-- No client GUC or URL exception: permission only on the server, for the same transaction and exact amount.
create table announcement_internal.wallet_permits (
 transaction_id bigint not null,
 user_id uuid not null references public.users(id) on delete cascade,
 value integer not null check(value>0),
 primary key(transaction_id,user_id)
);
create index wallet_permits_user_idx on announcement_internal.wallet_permits(user_id);
alter table announcement_internal.wallet_permits enable row level security;
revoke all on announcement_internal.wallet_permits from public,anon,authenticated;

create function announcement_internal.consume_wallet_permit(before_row public.users, after_row public.users) returns boolean
language plpgsql security definer set search_path='' as $$
declare permitted integer;
begin
 if before_row.id is distinct from app_private.current_public_user_id()
  or (to_jsonb(before_row)-'stones'-'updated_at') is distinct from (to_jsonb(after_row)-'stones'-'updated_at') then return false; end if;
 delete from announcement_internal.wallet_permits p where p.transaction_id=txid_current() and p.user_id=before_row.id
  and after_row.stones::bigint=before_row.stones::bigint+p.value returning value into permitted;
 return permitted is not null;
end $$;
revoke all on function announcement_internal.consume_wallet_permit(public.users,public.users) from public,anon,authenticated;

do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.prevent_non_admin_sensitive_user_updates()'::regprocedure);
 if strpos(definition,'consume_wallet_permit')>0 then raise exception 'Ödül koruması zaten ekli.'; end if;
 definition:=regexp_replace(definition,'\mbegin\M',E'begin\n  if announcement_internal.consume_wallet_permit(old,new) then return new; end if;', 'i');
 if strpos(definition,'consume_wallet_permit')=0 then raise exception 'Mevcut bakiye koruması bulunamadı.'; end if;
 execute definition;
end $$;

create or replace function announcement_internal.respond(p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_private.current_public_user_id(); a announcement_internal.entries; code text; result jsonb; claimed boolean; amount integer;
begin
 if uid is null then raise exception 'Devam etmek için giriş yap.' using errcode='42501'; end if;
 select * into a from announcement_internal.entries where id=p_id for update;
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
