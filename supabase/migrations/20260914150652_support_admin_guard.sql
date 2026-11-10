-- The admin check uses the existing role resolver in the private schema.
create function support_internal.is_support_admin() returns boolean
language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and public.is_admin() $$;
revoke all on function support_internal.is_support_admin() from public,anon;
grant usage on schema support_internal to authenticated;
grant execute on function support_internal.is_support_admin() to authenticated;
alter policy support_read on public.support_requests
using(user_id=(select auth.uid()) or (select support_internal.is_support_admin()));
alter policy support_admin_reply on public.support_requests
using((select support_internal.is_support_admin())) with check((select support_internal.is_support_admin()));


create or replace function support_internal.guard_request() returns trigger
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
    if not support_internal.is_support_admin() then raise exception 'Yetkisiz işlem.' using errcode='42501'; end if;
    new.responded_at=case when new.admin_response is distinct from old.admin_response then now() else old.responded_at end;
    if new.status='answered' and coalesce(char_length(btrim(new.admin_response)),0)<5 then
      raise exception 'Yanıt en az 5 karakter olmalı.';
    end if;
  end if;
  return new;
end $$;
