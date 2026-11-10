begin;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_selected_fansub_identity_tags'
  ) then
    delete from public.user_selected_fansub_identity_tags
    where fansub_identity_tag_id is null;

    alter table public.user_selected_fansub_identity_tags
      alter column fansub_identity_tag_id set not null;
  end if;
end
$$;

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
  v_active_tag_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'activeTagId', null,
      'lastChangedAt', null,
      'cooldownEndsAt', null,
      'canChange', true
    );
  end if;

  select selected_tag.fansub_identity_tag_id
  into v_active_tag_id
  from public.user_selected_fansub_identity_tags as selected_tag
  where selected_tag.user_id = p_user_id;

  return jsonb_build_object(
    'activeTagId', v_active_tag_id,
    'lastChangedAt', null,
    'cooldownEndsAt', null,
    'canChange', true
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
begin
  if v_user_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_tag_id is null then
    delete from public.user_selected_fansub_identity_tags
    where user_id = v_user_id;

    return jsonb_build_object(
      'success', true,
      'activeTag', null
    );
  end if;

  if not public.is_user_eligible_for_fansub_identity_tag(v_user_id, p_tag_id) then
    raise exception 'Secilen etiket bu hesap icin kullanilabilir degil.';
  end if;

  insert into public.user_selected_fansub_identity_tags as selected_tag (
    user_id,
    fansub_identity_tag_id
  )
  values (
    v_user_id,
    p_tag_id
  )
  on conflict (user_id) do update
  set
    fansub_identity_tag_id = excluded.fansub_identity_tag_id,
    updated_at = now(),
    selected_at = now();

  return jsonb_build_object(
    'success', true,
    'activeTag', public.resolve_user_active_fansub_identity_tag(v_user_id)
  );
end;
$$;

alter table if exists public.fansub_identity_tags
  add column if not exists governance_changed_at timestamptz;

update public.fansub_identity_tags
set governance_changed_at = coalesce(governance_changed_at, updated_at, created_at, now())
where governance_changed_at is null;

alter table if exists public.fansub_identity_tags
  alter column governance_changed_at set default now();

alter table if exists public.fansub_identity_tags
  alter column governance_changed_at set not null;

drop function if exists public.list_fansub_identity_tags_for_management(uuid);
drop function if exists public.upsert_fansub_identity_tag(uuid, text, text, boolean);
drop function if exists public.upsert_fansub_identity_tag(uuid, text, text, text, boolean);

create or replace function public.list_fansub_identity_tags_for_management(
  p_fansub_id uuid
)
returns table (
  id uuid,
  fansub_id uuid,
  audience text,
  shortcode text,
  badge_key text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  governance_changed_at timestamptz,
  cooldown_ends_at timestamptz,
  can_change_identity boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun etiketlerini gorme yetkiniz yok.';
  end if;

  return query
  select
    tag.id,
    tag.fansub_id,
    'shared'::text as audience,
    tag.shortcode,
    tag.badge_key,
    tag.is_active,
    tag.created_at,
    tag.updated_at,
    tag.governance_changed_at,
    tag.governance_changed_at + interval '7 days' as cooldown_ends_at,
    (tag.governance_changed_at + interval '7 days' <= now()) as can_change_identity
  from public.fansub_identity_tags as tag
  where tag.fansub_id = p_fansub_id
  order by tag.updated_at desc, tag.created_at desc
  limit 1;
end;
$$;

create or replace function public.upsert_fansub_identity_tag(
  p_fansub_id uuid,
  p_shortcode text,
  p_badge_key text,
  p_is_active boolean default true
)
returns table (
  id uuid,
  fansub_id uuid,
  audience text,
  shortcode text,
  badge_key text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  governance_changed_at timestamptz,
  cooldown_ends_at timestamptz,
  can_change_identity boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_shortcode text := upper(trim(coalesce(p_shortcode, '')));
  v_badge_key text := lower(trim(coalesce(p_badge_key, '')));
  v_existing public.fansub_identity_tags%rowtype;
  v_has_existing boolean := false;
  v_identity_changed_at timestamptz;
  v_is_visual_change boolean := false;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Fansub etiketi yalnizca admin tarafindan yonetilebilir.';
  end if;

  if not public.fansub_has_boost_capability(p_fansub_id, 'hasFansubIdentityTags') then
    raise exception 'Fansub etiketi icin en az Seviye 1 takviye gerekir.';
  end if;

  if v_shortcode = '' then
    raise exception 'Etiket kodu zorunludur.';
  end if;

  if v_shortcode !~ '^[A-Z0-9]{1,4}$' then
    raise exception 'Etiket kodu en fazla 4 karakter olmali ve yalnizca harf veya sayi icermelidir.';
  end if;

  if not exists (
    select 1
    from public.fansub_identity_badge_catalog as catalog
    where catalog.badge_key = v_badge_key
  ) then
    raise exception 'Secilen rozet bulunamadi.';
  end if;

  select *
  into v_existing
  from public.fansub_identity_tags as tag
  where tag.fansub_id = p_fansub_id
  for update;

  v_has_existing := found;

  if v_has_existing then
    v_identity_changed_at := coalesce(v_existing.governance_changed_at, v_existing.updated_at, v_existing.created_at, now());
    v_is_visual_change := v_existing.shortcode is distinct from v_shortcode
      or v_existing.badge_key is distinct from v_badge_key;

    if v_is_visual_change and v_identity_changed_at + interval '7 days' > now() then
      raise exception 'Fansub etiketi haftada bir degistirilebilir.';
    end if;

    update public.fansub_identity_tags as tag
    set
      shortcode = v_shortcode,
      badge_key = v_badge_key,
      is_active = coalesce(p_is_active, true),
      updated_by = v_actor_id,
      updated_at = now(),
      governance_changed_at = case
        when v_is_visual_change then now()
        else v_identity_changed_at
      end
    where tag.id = v_existing.id;
  else
    insert into public.fansub_identity_tags as tag (
      fansub_id,
      audience,
      shortcode,
      badge_key,
      is_active,
      created_by,
      updated_by,
      governance_changed_at
    )
    values (
      p_fansub_id,
      'shared',
      v_shortcode,
      v_badge_key,
      coalesce(p_is_active, true),
      v_actor_id,
      v_actor_id,
      now()
    );
  end if;

  return query
  select
    tag.id,
    tag.fansub_id,
    'shared'::text as audience,
    tag.shortcode,
    tag.badge_key,
    tag.is_active,
    tag.created_at,
    tag.updated_at,
    tag.governance_changed_at,
    tag.governance_changed_at + interval '7 days' as cooldown_ends_at,
    (tag.governance_changed_at + interval '7 days' <= now()) as can_change_identity
  from public.fansub_identity_tags as tag
  where tag.fansub_id = p_fansub_id
  limit 1;
end;
$$;

create or replace function public.upsert_fansub_identity_tag(
  p_fansub_id uuid,
  p_audience text,
  p_shortcode text,
  p_badge_key text,
  p_is_active boolean default true
)
returns table (
  id uuid,
  fansub_id uuid,
  audience text,
  shortcode text,
  badge_key text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  governance_changed_at timestamptz,
  cooldown_ends_at timestamptz,
  can_change_identity boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select *
  from public.upsert_fansub_identity_tag(
    p_fansub_id,
    p_shortcode,
    p_badge_key,
    p_is_active
  );
end;
$$;

grant execute on function public.get_my_fansub_identity_tag_selection_state() to authenticated;
grant execute on function public.set_my_active_fansub_identity_tag(uuid) to authenticated;
grant execute on function public.list_fansub_identity_tags_for_management(uuid) to authenticated;
grant execute on function public.upsert_fansub_identity_tag(uuid, text, text, boolean) to authenticated;
grant execute on function public.upsert_fansub_identity_tag(uuid, text, text, text, boolean) to authenticated;

commit;
