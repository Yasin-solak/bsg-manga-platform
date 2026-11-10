-- A user can read their own community like state through RLS, so no definer permission is needed.

create or replace function public.is_community_post_liked(p_post_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $function$
  select exists (
    select 1
    from public.community_post_likes cpl
    where cpl.post_id = p_post_id
      and cpl.user_id = app_private.current_public_user_id()
  );
$function$;

grant execute on function public.is_community_post_liked(uuid) to authenticated;
