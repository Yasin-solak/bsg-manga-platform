begin;

create or replace function public.get_my_user_identity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_row public.users%rowtype;
begin
  if v_user_id is null then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  select *
  into v_row
  from public.users
  where id = v_user_id
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'role', v_row.role,
    'profile_visibility', v_row.profile_visibility,
    'stats_visibility', v_row.stats_visibility,
    'social_links_visibility', v_row.social_links_visibility,
    'activity_visibility', v_row.activity_visibility
  );
end;
$$;

grant execute on function public.get_my_user_identity() to authenticated;

comment on function public.get_my_user_identity()
  is 'Aktif kullanicinin kendi public/safe kimlik snapshotini dondurur; self resolver yuzeylerinde users tablosuna dogrudan auth_user_id lookup ihtiyacini azaltir.';

commit;
