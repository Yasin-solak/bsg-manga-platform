begin;

insert into public.fansub_boost_capability_policies as policy (
  capability_key,
  label,
  summary,
  detail,
  placement_hint,
  surface_group,
  placement_type,
  tier_level,
  sort_order
)
values (
  'hasFansubIdentityTags',
  'Fansub etiketi',
  'Supporter ve uye etiketleri profil secimine acilir.',
  'Fansub Studio uzerinden destekci ve uye kimligi icin kisa etiket tanimlanir.',
  'Fansub Studio > Uyelik',
  'identity',
  'tier',
  1,
  135
)
on conflict (capability_key) do update
set
  label = excluded.label,
  summary = excluded.summary,
  detail = excluded.detail,
  placement_hint = excluded.placement_hint,
  surface_group = excluded.surface_group,
  placement_type = excluded.placement_type,
  tier_level = excluded.tier_level,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.fansub_identity_badge_catalog (
  badge_key text primary key,
  label text not null,
  sort_order integer not null default 100
);

insert into public.fansub_identity_badge_catalog (badge_key, label, sort_order)
values
  ('leaf', 'Yaprak', 10),
  ('blade', 'Kilic', 20),
  ('heart', 'Kalp', 30),
  ('flame', 'Alev', 40),
  ('drop', 'Damla', 50),
  ('moon', 'Ay', 60),
  ('bolt', 'Simsek', 70),
  ('gem', 'Kristal', 80)
on conflict (badge_key) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order;

create table if not exists public.fansub_identity_tags (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  audience text not null check (audience in ('member', 'supporter')),
  shortcode text not null,
  badge_key text not null references public.fansub_identity_badge_catalog(badge_key),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fansub_id, audience),
  constraint fansub_identity_tags_shortcode_valid check (shortcode ~ '^[A-Z0-9]{1,4}$')
);

create index if not exists fansub_identity_tags_fansub_idx
  on public.fansub_identity_tags (fansub_id, audience);

create index if not exists fansub_identity_tags_active_idx
  on public.fansub_identity_tags (is_active, updated_at desc);

create table if not exists public.user_selected_fansub_identity_tags (
  user_id uuid primary key references public.users(id) on delete cascade,
  fansub_identity_tag_id uuid not null references public.fansub_identity_tags(id) on delete cascade,
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_selected_fansub_identity_tags_tag_idx
  on public.user_selected_fansub_identity_tags (fansub_identity_tag_id);

create or replace function public.list_fansub_identity_badge_catalog()
returns table (
  badge_key text,
  label text,
  sort_order integer
)
language sql
stable
set search_path = public
as $$
  select
    catalog.badge_key,
    catalog.label,
    catalog.sort_order
  from public.fansub_identity_badge_catalog as catalog
  order by catalog.sort_order asc, catalog.badge_key asc;
$$;

create or replace function public.is_user_eligible_for_fansub_identity_tag(
  p_user_id uuid,
  p_tag_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fansub_identity_tags as tag
    join public.fansubs as fansub
      on fansub.id = tag.fansub_id
    where tag.id = p_tag_id
      and tag.is_active = true
      and fansub.is_active = true
      and public.fansub_has_boost_capability(tag.fansub_id, 'hasFansubIdentityTags')
      and (
        (
          tag.audience = 'member'
          and exists (
            select 1
            from public.fansub_members as member_row
            where member_row.fansub_id = tag.fansub_id
              and member_row.user_id = p_user_id
          )
        )
        or (
          tag.audience = 'supporter'
          and exists (
            select 1
            from public.fansub_boost_grants as grant_row
            where grant_row.fansub_id = tag.fansub_id
              and grant_row.supporter_user_id = p_user_id
              and grant_row.status = 'active'
              and grant_row.starts_at <= now()
              and grant_row.expires_at > now()
          )
        )
      )
  );
$$;

create or replace function public.resolve_user_active_fansub_identity_tag(
  p_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user_id is null then null
    else (
      select jsonb_build_object(
        'id', tag.id,
        'fansubId', tag.fansub_id,
        'fansubName', fansub.name,
        'fansubSlug', fansub.slug,
        'audience', tag.audience,
        'shortcode', tag.shortcode,
        'badgeKey', tag.badge_key
      )
      from public.user_selected_fansub_identity_tags as selected_tag
      join public.fansub_identity_tags as tag
        on tag.id = selected_tag.fansub_identity_tag_id
      join public.fansubs as fansub
        on fansub.id = tag.fansub_id
      where selected_tag.user_id = p_user_id
        and public.is_user_eligible_for_fansub_identity_tag(p_user_id, tag.id)
      limit 1
    )
  end;
$$;

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
  updated_at timestamptz
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
    tag.audience,
    tag.shortcode,
    tag.badge_key,
    tag.is_active,
    tag.created_at,
    tag.updated_at
  from public.fansub_identity_tags as tag
  where tag.fansub_id = p_fansub_id
  order by case tag.audience when 'member' then 0 else 1 end asc;
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
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_audience text := lower(trim(coalesce(p_audience, '')));
  v_shortcode text := upper(trim(coalesce(p_shortcode, '')));
  v_badge_key text := lower(trim(coalesce(p_badge_key, '')));
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

  if v_audience not in ('member', 'supporter') then
    raise exception 'Etiket hedefi gecersiz.';
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

  insert into public.fansub_identity_tags as tag (
    fansub_id,
    audience,
    shortcode,
    badge_key,
    is_active,
    created_by,
    updated_by
  )
  values (
    p_fansub_id,
    v_audience,
    v_shortcode,
    v_badge_key,
    coalesce(p_is_active, true),
    v_actor_id,
    v_actor_id
  )
  on conflict (fansub_id, audience) do update
  set
    shortcode = excluded.shortcode,
    badge_key = excluded.badge_key,
    is_active = excluded.is_active,
    updated_by = excluded.updated_by,
    updated_at = now();

  return query
  select
    tag.id,
    tag.fansub_id,
    tag.audience,
    tag.shortcode,
    tag.badge_key,
    tag.is_active,
    tag.created_at,
    tag.updated_at
  from public.fansub_identity_tags as tag
  where tag.fansub_id = p_fansub_id
    and tag.audience = v_audience
  limit 1;
end;
$$;

create or replace function public.list_my_selectable_fansub_identity_tags()
returns table (
  id uuid,
  fansub_id uuid,
  fansub_name text,
  fansub_slug text,
  audience text,
  shortcode text,
  badge_key text,
  is_selected boolean
)
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

  return query
  with eligible_tags as (
    select
      tag.id,
      tag.fansub_id,
      fansub.name as fansub_name,
      fansub.slug as fansub_slug,
      tag.audience,
      tag.shortcode,
      tag.badge_key
    from public.fansub_identity_tags as tag
    join public.fansubs as fansub
      on fansub.id = tag.fansub_id
    where fansub.is_active = true
      and tag.is_active = true
      and public.fansub_has_boost_capability(tag.fansub_id, 'hasFansubIdentityTags')
      and (
        (
          tag.audience = 'member'
          and exists (
            select 1
            from public.fansub_members as member_row
            where member_row.fansub_id = tag.fansub_id
              and member_row.user_id = v_user_id
          )
        )
        or (
          tag.audience = 'supporter'
          and exists (
            select 1
            from public.fansub_boost_grants as grant_row
            where grant_row.fansub_id = tag.fansub_id
              and grant_row.supporter_user_id = v_user_id
              and grant_row.status = 'active'
              and grant_row.starts_at <= now()
              and grant_row.expires_at > now()
          )
        )
      )
  )
  select
    tag.id,
    tag.fansub_id,
    tag.fansub_name,
    tag.fansub_slug,
    tag.audience,
    tag.shortcode,
    tag.badge_key,
    coalesce(selected_tag.fansub_identity_tag_id = tag.id, false) as is_selected
  from eligible_tags as tag
  left join public.user_selected_fansub_identity_tags as selected_tag
    on selected_tag.user_id = v_user_id
  order by tag.fansub_name asc, case tag.audience when 'member' then 0 else 1 end asc;
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

create or replace view public.public_user_directory as
select
  u.id,
  u.username,
  u.avatar_url,
  u.frame_type,
  u.background_type,
  public.resolve_user_active_fansub_identity_tag(u.id) as active_fansub_identity_tag
from public.users u
where coalesce(u.is_active, true) = true
  and coalesce(u.is_banned, false) = false;

create or replace function public.get_public_user_profile_by_id(
  p_user_id uuid,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.users%rowtype;
  v_access record;
  v_can_view_social_links boolean := false;
begin
  if p_user_id is null then
    return null;
  end if;

  select *
  into v_row
  from public.users
  where id = p_user_id
    and coalesce(is_active, true) = true
    and coalesce(is_banned, false) = false
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_access
  from public.get_profile_view_access(v_row.id)
  limit 1;

  if coalesce(v_access.profile_visible, false) = false then
    return null;
  end if;

  if p_include_social_links then
    v_can_view_social_links := coalesce(v_access.social_links_visible, false);
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', public.resolve_user_active_fansub_identity_tag(v_row.id),
    'social_links', case
      when v_can_view_social_links then coalesce(v_row.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.get_public_user_profile_by_username(
  p_username text,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized_username text := nullif(btrim(coalesce(p_username, '')), '');
  v_row public.users%rowtype;
  v_access record;
  v_can_view_social_links boolean := false;
begin
  if v_normalized_username is null then
    return null;
  end if;

  select *
  into v_row
  from public.users
  where username = v_normalized_username
    and coalesce(is_active, true) = true
    and coalesce(is_banned, false) = false
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_access
  from public.get_profile_view_access(v_row.id)
  limit 1;

  if coalesce(v_access.profile_visible, false) = false then
    return null;
  end if;

  if p_include_social_links then
    v_can_view_social_links := coalesce(v_access.social_links_visible, false);
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', public.resolve_user_active_fansub_identity_tag(v_row.id),
    'social_links', case
      when v_can_view_social_links then coalesce(v_row.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'created_at', v_row.created_at
  );
end;
$$;

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
    'active_fansub_identity_tag', public.resolve_user_active_fansub_identity_tag(v_row.id),
    'role', v_row.role,
    'profile_visibility', v_row.profile_visibility,
    'stats_visibility', v_row.stats_visibility,
    'social_links_visibility', v_row.social_links_visibility,
    'activity_visibility', v_row.activity_visibility
  );
end;
$$;

create or replace function public.get_my_private_user_profile()
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
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', public.resolve_user_active_fansub_identity_tag(v_row.id),
    'social_links', coalesce(v_row.social_links, '[]'::jsonb),
    'owned_items', coalesce(v_row.owned_items, '{}'::jsonb),
    'stones', v_row.stones,
    'premium_expires_at', v_row.premium_expires_at,
    'onboarding_completed_at', v_row.onboarding_completed_at,
    'profile_visibility', v_row.profile_visibility,
    'stats_visibility', v_row.stats_visibility,
    'social_links_visibility', v_row.social_links_visibility,
    'activity_visibility', v_row.activity_visibility,
    'created_at', v_row.created_at
  );
end;
$$;

grant select on public.fansub_identity_badge_catalog to anon, authenticated;
grant select on public.public_user_directory to anon, authenticated;
grant execute on function public.list_fansub_identity_badge_catalog() to anon, authenticated;
grant execute on function public.is_user_eligible_for_fansub_identity_tag(uuid, uuid) to authenticated;
grant execute on function public.resolve_user_active_fansub_identity_tag(uuid) to anon, authenticated;
grant execute on function public.list_fansub_identity_tags_for_management(uuid) to authenticated;
grant execute on function public.upsert_fansub_identity_tag(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.list_my_selectable_fansub_identity_tags() to authenticated;
grant execute on function public.set_my_active_fansub_identity_tag(uuid) to authenticated;

select public.refresh_all_fansub_boost_snapshot_capabilities();

commit;
