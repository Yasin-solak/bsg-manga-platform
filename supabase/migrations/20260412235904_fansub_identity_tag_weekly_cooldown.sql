begin;

alter table if exists public.user_selected_fansub_identity_tags
  alter column fansub_identity_tag_id drop not null;

create or replace function public.resolve_fansub_identity_tag_selection_state(
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_selected_tag_id uuid;
  v_selected_at timestamptz;
  v_has_row boolean := false;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'activeTagId', null,
      'lastChangedAt', null,
      'cooldownEndsAt', null,
      'canChange', true
    );
  end if;

  select
    selected_tag.fansub_identity_tag_id,
    selected_tag.selected_at
  into
    v_selected_tag_id,
    v_selected_at
  from public.user_selected_fansub_identity_tags as selected_tag
  where selected_tag.user_id = p_user_id;

  v_has_row := found;

  if not v_has_row then
    return jsonb_build_object(
      'activeTagId', null,
      'lastChangedAt', null,
      'cooldownEndsAt', null,
      'canChange', true
    );
  end if;

  if v_selected_tag_id is not null
    and not public.is_user_eligible_for_fansub_identity_tag(p_user_id, v_selected_tag_id) then
    return jsonb_build_object(
      'activeTagId', null,
      'lastChangedAt', null,
      'cooldownEndsAt', null,
      'canChange', true
    );
  end if;

  return jsonb_build_object(
    'activeTagId', v_selected_tag_id,
    'lastChangedAt', v_selected_at,
    'cooldownEndsAt', case
      when v_selected_at is null then null
      else v_selected_at + interval '7 days'
    end,
    'canChange', (
      v_selected_at is null
      or v_selected_at + interval '7 days' <= now()
    )
  );
end;
$$;

create or replace function public.get_my_fansub_identity_tag_selection_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
begin
  if v_user_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  return public.resolve_fansub_identity_tag_selection_state(v_user_id);
end;
$$;

create or replace function public.set_my_active_fansub_identity_tag(
  p_tag_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_current_tag_id uuid;
  v_current_selected_at timestamptz;
  v_current_has_row boolean := false;
begin
  if v_user_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  select
    selected_tag.fansub_identity_tag_id,
    selected_tag.selected_at
  into
    v_current_tag_id,
    v_current_selected_at
  from public.user_selected_fansub_identity_tags as selected_tag
  where selected_tag.user_id = v_user_id;

  v_current_has_row := found;

  if v_current_has_row
    and v_current_tag_id is not null
    and not public.is_user_eligible_for_fansub_identity_tag(v_user_id, v_current_tag_id) then
    delete from public.user_selected_fansub_identity_tags
    where user_id = v_user_id;

    v_current_has_row := false;
    v_current_tag_id := null;
    v_current_selected_at := null;
  end if;

  if p_tag_id is not null
    and not public.is_user_eligible_for_fansub_identity_tag(v_user_id, p_tag_id) then
    raise exception 'Secilen etiket bu hesap icin kullanilabilir degil.';
  end if;

  if (
    v_current_has_row
    and v_current_tag_id is not distinct from p_tag_id
  ) or (
    not v_current_has_row
    and p_tag_id is null
  ) then
    return jsonb_build_object(
      'success', true,
      'activeTag', public.resolve_user_active_fansub_identity_tag(v_user_id),
      'selectionState', public.resolve_fansub_identity_tag_selection_state(v_user_id)
    );
  end if;

  if v_current_has_row
    and v_current_selected_at is not null
    and v_current_selected_at + interval '7 days' > now() then
    raise exception 'Fansub etiketi haftada bir degistirilebilir.';
  end if;

  if v_current_has_row then
    update public.user_selected_fansub_identity_tags as selected_tag
    set
      fansub_identity_tag_id = p_tag_id,
      updated_at = now(),
      selected_at = now()
    where selected_tag.user_id = v_user_id;
  else
    insert into public.user_selected_fansub_identity_tags (
      user_id,
      fansub_identity_tag_id,
      selected_at,
      updated_at
    )
    values (
      v_user_id,
      p_tag_id,
      now(),
      now()
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'activeTag', public.resolve_user_active_fansub_identity_tag(v_user_id),
    'selectionState', public.resolve_fansub_identity_tag_selection_state(v_user_id)
  );
end;
$$;

grant execute on function public.get_my_fansub_identity_tag_selection_state() to authenticated;
grant execute on function public.set_my_active_fansub_identity_tag(uuid) to authenticated;

commit;
