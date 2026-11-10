-- These two policies, left on live by Studio or old migration drift,
-- read public.users directly inside storage.objects RLS.
-- Since the authenticated direct table grant is closed, when the planner evaluates these branches
-- they can poison other permissive policies too.
-- Current JWT helper-based admin policies already meet the same need.

begin;

drop policy if exists "store_assets_admin_insert" on storage.objects;
drop policy if exists "store_assets_admin_delete" on storage.objects;

notify pgrst, 'reload schema';

commit;
