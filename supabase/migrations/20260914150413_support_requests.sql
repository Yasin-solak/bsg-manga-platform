create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check(category in ('technical','account','content','payment','suggestion','other')),
  subject text not null check(char_length(btrim(subject)) between 5 and 120),
  message text not null check(char_length(btrim(message)) between 20 and 5000),
  status text not null default 'open' check(status in ('open','answered','closed')),
  admin_response text check(char_length(admin_response) <= 5000),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index support_requests_owner_created on public.support_requests(user_id,created_at desc,id);
create index support_requests_status_created on public.support_requests(status,created_at desc,id);
alter table public.support_requests enable row level security;
revoke all on public.support_requests from public, anon, authenticated;
grant select on public.support_requests to authenticated;
grant insert(id,category,subject,message) on public.support_requests to authenticated;
grant update(status,admin_response) on public.support_requests to authenticated;
create policy support_read on public.support_requests for select to authenticated
using(user_id=(select auth.uid()) or (select public.is_admin()));
create policy support_create on public.support_requests for insert to authenticated
with check(user_id=(select auth.uid()) and status='open' and admin_response is null);
create policy support_admin_reply on public.support_requests for update to authenticated
using((select public.is_admin())) with check((select public.is_admin()));

create schema if not exists support_internal;
revoke all on schema support_internal from public,anon,authenticated;
create function support_internal.guard_request() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if auth.uid() is null then raise exception 'Giriş yapmalısın.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,8149));
    -- A retry with the same request id does not use up the daily limit.
    if not exists(select 1 from public.support_requests where id=new.id and user_id=auth.uid())
      and (select count(*) from public.support_requests where user_id=auth.uid() and created_at>now()-interval '24 hours') >=5 then
      raise exception '24 saat içinde en fazla 5 destek talebi gönderebilirsin.' using errcode='P0001';
    end if;
  else
    if not public.is_admin() then raise exception 'Yetkisiz işlem.' using errcode='42501'; end if;
    new.responded_at=case when new.admin_response is distinct from old.admin_response then now() else old.responded_at end;
    if new.status='answered' and coalesce(char_length(btrim(new.admin_response)),0)<5 then
      raise exception 'Yanıt en az 5 karakter olmalı.';
    end if;
  end if;
  return new;
end $$;
revoke all on function support_internal.guard_request() from public,anon,authenticated;
create trigger support_request_guard before insert or update on public.support_requests
for each row execute function support_internal.guard_request();
