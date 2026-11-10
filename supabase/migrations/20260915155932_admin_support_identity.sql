create function support_internal.admin_support_identities(owner_ids uuid[]) returns table(user_id uuid,username text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not support_internal.is_support_admin() or coalesce(cardinality(owner_ids),0)>20 then raise exception 'forbidden' using errcode='42501'; end if;
 return query select u.auth_user_id,u.username::text from public.users u where u.auth_user_id=any(owner_ids) and exists(select 1 from public.support_requests r where r.user_id=u.auth_user_id);
end $$;
revoke all on function support_internal.admin_support_identities(uuid[]) from public,anon;
grant execute on function support_internal.admin_support_identities(uuid[]) to authenticated;
create function public.admin_support_identities(owner_ids uuid[]) returns table(user_id uuid,username text) language sql security invoker set search_path='' as $$select * from support_internal.admin_support_identities(owner_ids)$$;
revoke all on function public.admin_support_identities(uuid[]) from public,anon;
grant execute on function public.admin_support_identities(uuid[]) to authenticated;

-- The default the site owner wanted. Existing off preferences do not change.
create function support_internal.get_diagnostic_preference() returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
 insert into public.diagnostic_preferences(user_id,enabled,version) values(auth.uid(),true,2) on conflict(user_id) do nothing;
 return (select enabled and version=2 from public.diagnostic_preferences where user_id=auth.uid());
end $$;
revoke all on function support_internal.get_diagnostic_preference() from public,anon;
grant execute on function support_internal.get_diagnostic_preference() to authenticated;
create function public.get_diagnostic_preference() returns boolean language sql security invoker set search_path='' as $$select support_internal.get_diagnostic_preference()$$;
revoke all on function public.get_diagnostic_preference() from public,anon;
grant execute on function public.get_diagnostic_preference() to authenticated;
