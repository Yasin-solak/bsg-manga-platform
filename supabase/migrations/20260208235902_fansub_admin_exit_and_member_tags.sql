-- Fansub admin exit flow + member task tag support

alter table public.fansub_members
  add column if not exists team_tag text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fansub_members_team_tag_length_chk'
      and conrelid = 'public.fansub_members'::regclass
  ) then
    alter table public.fansub_members
      add constraint fansub_members_team_tag_length_chk
      check (team_tag is null or char_length(trim(team_tag)) between 2 and 40);
  end if;
end $$;

create index if not exists fansub_members_team_tag_idx
  on public.fansub_members (fansub_id, team_tag);

create or replace function public.set_fansub_member_team_tag(
  p_fansub_id uuid,
  p_member_user_id uuid,
  p_team_tag text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_normalized_tag text;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null or p_member_user_id is null then
    raise exception 'Fansub ve uye bilgisi zorunludur.';
  end if;

  if not (
    public.is_admin()
    or public.is_fansub_staff(p_fansub_id)
  ) then
    raise exception 'Bu islem icin yetkiniz bulunmuyor.';
  end if;

  if not exists (
    select 1
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and fm.user_id = p_member_user_id
  ) then
    raise exception 'Belirtilen kullanici bu fansubun uyesi degil.';
  end if;

  v_normalized_tag := nullif(trim(coalesce(p_team_tag, '')), '');
  if v_normalized_tag is not null and char_length(v_normalized_tag) > 40 then
    raise exception 'Uye etiketi en fazla 40 karakter olabilir.';
  end if;

  update public.fansub_members
  set team_tag = v_normalized_tag
  where fansub_id = p_fansub_id
    and user_id = p_member_user_id;

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'member_user_id', p_member_user_id,
    'team_tag', v_normalized_tag
  );
end;
$$;

create or replace function public.admin_exit_fansub(
  p_fansub_id uuid,
  p_mode text,
  p_transfer_to_user_id uuid default null,
  p_confirmation_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_fansub_name text;
  v_target_role text;
  v_mode text;
  v_confirmation text;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  v_mode := lower(trim(coalesce(p_mode, '')));
  if v_mode not in ('transfer', 'deactivate') then
    raise exception 'Gecersiz cikis modu. transfer veya deactivate kullanin.';
  end if;

  select f.name
  into v_fansub_name
  from public.fansubs f
  where f.id = p_fansub_id
  for update;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  if not exists (
    select 1
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and fm.user_id = v_actor_id
      and fm.role = 'admin'
    for update
  ) then
    raise exception 'Bu islem yalnizca fansub admini tarafindan yapilabilir.';
  end if;

  v_confirmation := trim(coalesce(p_confirmation_name, ''));
  if v_confirmation = '' or lower(v_confirmation) <> lower(trim(v_fansub_name)) then
    raise exception 'Onay icin fansub adini birebir yazmalisiniz.';
  end if;

  if v_mode = 'transfer' then
    if p_transfer_to_user_id is null then
      raise exception 'Admin devri icin hedef uye secmelisiniz.';
    end if;

    if p_transfer_to_user_id = v_actor_id then
      raise exception 'Adminlik kendinize devredilemez.';
    end if;

    select fm.role
    into v_target_role
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and fm.user_id = p_transfer_to_user_id
    for update;

    if not found then
      raise exception 'Secilen kullanici bu fansubun aktif uyesi degil.';
    end if;

    update public.fansub_members
    set role = 'member'
    where fansub_id = p_fansub_id
      and user_id = v_actor_id;

    update public.fansub_members
    set role = 'admin'
    where fansub_id = p_fansub_id
      and user_id = p_transfer_to_user_id;

    delete from public.fansub_members
    where fansub_id = p_fansub_id
      and user_id = v_actor_id;

    insert into public.notifications (user_id, type, title, message, data)
    values
      (
        p_transfer_to_user_id,
        'system',
        'Fansub adminligi devredildi',
        v_fansub_name || ' fansubunun yeni admini oldunuz.',
        jsonb_build_object(
          'target', 'fansub',
          'fansub_id', p_fansub_id,
          'mode', 'transfer',
          'transferred_by', v_actor_id
        )
      ),
      (
        v_actor_id,
        'system',
        'Fansubdan ayrildiniz',
        v_fansub_name || ' adminligi devredildi ve uyeliginiz sonlandirildi.',
        jsonb_build_object(
          'target', 'fansub',
          'fansub_id', p_fansub_id,
          'mode', 'transfer',
          'new_admin_user_id', p_transfer_to_user_id
        )
      );

    return jsonb_build_object(
      'success', true,
      'action', 'transfer_and_leave',
      'fansub_id', p_fansub_id,
      'previous_admin_user_id', v_actor_id,
      'new_admin_user_id', p_transfer_to_user_id
    );
  end if;

  update public.fansubs
  set is_active = false,
      updated_at = now()
  where id = p_fansub_id;

  if to_regclass('public.fansub_invites') is not null then
    update public.fansub_invites
    set status = 'cancelled',
        is_active = false,
        responded_at = coalesce(responded_at, now())
    where fansub_id = p_fansub_id
      and status = 'pending'
      and is_active = true;
  end if;

  if to_regclass('public.fansub_join_requests') is not null then
    update public.fansub_join_requests
    set status = 'cancelled',
        is_active = false,
        reviewed_at = coalesce(reviewed_at, now()),
        reviewed_by = coalesce(reviewed_by, v_actor_id),
        review_note = coalesce(nullif(trim(coalesce(review_note, '')), ''), 'Fansub deaktif edildi.')
    where fansub_id = p_fansub_id
      and status = 'pending'
      and is_active = true;
  end if;

  delete from public.fansub_members
  where fansub_id = p_fansub_id
    and user_id = v_actor_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_actor_id,
    'system',
    'Fansub deaktif edildi',
    v_fansub_name || ' deaktif edildi ve uyeliginiz sonlandirildi.',
    jsonb_build_object(
      'target', 'fansub',
      'fansub_id', p_fansub_id,
      'mode', 'deactivate'
    )
  );

  return jsonb_build_object(
    'success', true,
    'action', 'deactivate_and_leave',
    'fansub_id', p_fansub_id,
    'previous_admin_user_id', v_actor_id,
    'fansub_is_active', false
  );
end;
$$;

grant execute on function public.set_fansub_member_team_tag(uuid, uuid, text) to authenticated;
grant execute on function public.admin_exit_fansub(uuid, text, uuid, text) to authenticated;
