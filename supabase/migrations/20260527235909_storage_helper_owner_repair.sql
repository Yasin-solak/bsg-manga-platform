-- SECURITY DEFINER semantics only help if the function owner holds the needed table
-- permissions. CREATE OR REPLACE FUNCTION does not change the owner;
-- if the owner drifted on live a helper can still yield an invoker-like
-- permission denied. This migration forces the owner of the storage helper chain
-- to postgres.

begin;

alter function public.current_auth_session_id() owner to postgres;
alter function public.is_auth_session_revoked(uuid, uuid) owner to postgres;

alter function app_private.current_auth_user_id_from_jwt() owner to postgres;
alter function app_private.current_public_user_id_from_jwt() owner to postgres;
alter function app_private.current_app_role_from_jwt() owner to postgres;
alter function app_private.is_admin_from_jwt() owner to postgres;
alter function app_private.is_fansub_staff_from_jwt(uuid) owner to postgres;
alter function app_private.can_write_pending_community_post_child_from_jwt(uuid) owner to postgres;

notify pgrst, 'reload schema';

commit;
