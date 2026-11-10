-- With the flag off only site admins use the studio; if the assignee is a site
-- admin the flag is not required (otherwise an admin could not even self-assign).
create or replace function app_private.tl_user_can_stage(p_fansub_id uuid, p_user_id uuid, p_stage text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select (app_private.is_feature_enabled('translation.studio_v3', false)
      or exists (select 1 from public.users u where u.id = p_user_id and u.role = 'admin'))
    and 'ceviri.gor' = any(perms)
    and perms && app_private.tl_stage_permissions(p_stage)
  from (select app_private.fansub_user_permissions(p_fansub_id, p_user_id) as perms) s;
$function$;
