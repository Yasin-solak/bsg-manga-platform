-- EXECUTE permission on the `app_private` side of manga control RPCs.
--
-- BUG: earlier migrations wrote `revoke all on function app_private.X from public`
-- but did not grant it back to `authenticated`. `public.*` wrappers are NOT
-- `security definer` (on purpose: the permission check is inside the app_private function
-- itself); so the call runs with the caller rights and
-- `authenticated` could not reach the app_private function.
--
-- Result: all four RPCs gave "permission denied for function" even for a REAL ADMIN.
-- The panel showed summary metrics as a dash and the detail window as "Metrikler
-- yuklenemedi".
--
-- Why unnoticed: browser tests ran with no session and produced the same
-- "permission denied" message; it was read as "no session".
-- The reference function `app_private.get_admin_user_management_overview`
-- worked because it kept the default PUBLIC EXECUTE.
--
-- Security: this grant opens no permission. Inside the functions is an admin/service_role
-- gate (42501); the grant only lets the call reach the gate.

grant execute on function app_private.get_admin_manga_control_overview(timestamptz)
  to authenticated, service_role;

grant execute on function app_private.get_admin_manga_control_view_page(
  timestamptz, text, text, text, text, text, integer, integer
) to authenticated, service_role;

grant execute on function app_private.get_admin_manga_detail_metrics(timestamptz, uuid)
  to authenticated, service_role;

grant execute on function app_private.get_admin_manga_chapter_page_counts(uuid)
  to authenticated, service_role;
