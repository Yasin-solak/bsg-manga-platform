-- Storage policy expressions call current_auth_session_id and is_auth_session_revoked
-- helpers directly. If these helpers got no execute grant for the authenticated role
-- Storage RLS breaks internally with 42501.

begin;

grant execute on function public.current_auth_session_id() to anon, authenticated, service_role;
grant execute on function public.is_auth_session_revoked(uuid, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
