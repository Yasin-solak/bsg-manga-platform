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
  'Fansubun tek kimlik etiketi uye ve destekci icin ortak acilir.',
  'Fansub Studio > Emoji ve Cikartma alanindan tek bir etiket ve rozet yonetilir.',
  'Fansub Studio > Emoji ve Cikartma',
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

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'fansub_identity_tags'
  ) then
    create temporary table tmp_fansub_identity_tag_rank
    on commit drop
    as
    with ranked as (
      select
        tag.id,
        tag.fansub_id,
        first_value(tag.id) over (
          partition by tag.fansub_id
          order by tag.is_active desc, tag.updated_at desc, tag.created_at desc, tag.id desc
        ) as keep_id,
        row_number() over (
          partition by tag.fansub_id
          order by tag.is_active desc, tag.updated_at desc, tag.created_at desc, tag.id desc
        ) as row_number
      from public.fansub_identity_tags as tag
    )
    select *
    from ranked;

    update public.user_selected_fansub_identity_tags as selected_tag
    set
      fansub_identity_tag_id = ranked.keep_id,
      updated_at = now()
    from tmp_fansub_identity_tag_rank as ranked
    where ranked.id = selected_tag.fansub_identity_tag_id
      and ranked.keep_id <> ranked.id;

    delete from public.fansub_identity_tags as tag
    using tmp_fansub_identity_tag_rank as ranked
    where ranked.id = tag.id
      and ranked.row_number > 1;

    alter table public.fansub_identity_tags
      drop constraint if exists fansub_identity_tags_fansub_id_audience_key;

    alter table public.fansub_identity_tags
      drop constraint if exists fansub_identity_tags_audience_check;

    update public.fansub_identity_tags
    set audience = 'shared'
    where audience is distinct from 'shared';

    alter table public.fansub_identity_tags
      alter column audience set default 'shared';

    begin
      alter table public.fansub_identity_tags
        add constraint fansub_identity_tags_audience_check
        check (audience = 'shared');
    exception
      when duplicate_object then null;
    end;

    begin
      alter table public.fansub_identity_tags
        add constraint fansub_identity_tags_fansub_id_unique
        unique (fansub_id);
    exception
      when duplicate_object then null;
    end;

    drop index if exists public.fansub_identity_tags_fansub_idx;
    create index if not exists fansub_identity_tags_fansub_idx
      on public.fansub_identity_tags (fansub_id);
  end if;
end
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
        exists (
          select 1
          from public.fansub_members as member_row
          where member_row.fansub_id = tag.fansub_id
            and member_row.user_id = p_user_id
        )
        or exists (
          select 1
          from public.fansub_boost_grants as grant_row
          where grant_row.fansub_id = tag.fansub_id
            and grant_row.supporter_user_id = p_user_id
            and grant_row.status = 'active'
            and grant_row.starts_at <= now()
            and grant_row.expires_at > now()
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
        'audience', 'shared',
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
    'shared'::text as audience,
    tag.shortcode,
    tag.badge_key,
    tag.is_active,
    tag.created_at,
    tag.updated_at
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
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
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
    'shared',
    v_shortcode,
    v_badge_key,
    coalesce(p_is_active, true),
    v_actor_id,
    v_actor_id
  )
  on conflict on constraint fansub_identity_tags_fansub_id_unique do update
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
    'shared'::text as audience,
    tag.shortcode,
    tag.badge_key,
    tag.is_active,
    tag.created_at,
    tag.updated_at
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
  updated_at timestamptz
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
  select
    tag.id,
    tag.fansub_id,
    fansub.name as fansub_name,
    fansub.slug as fansub_slug,
    'shared'::text as audience,
    tag.shortcode,
    tag.badge_key,
    coalesce(selected_tag.fansub_identity_tag_id = tag.id, false) as is_selected
  from public.fansub_identity_tags as tag
  join public.fansubs as fansub
    on fansub.id = tag.fansub_id
  left join public.user_selected_fansub_identity_tags as selected_tag
    on selected_tag.user_id = v_user_id
  where fansub.is_active = true
    and tag.is_active = true
    and public.fansub_has_boost_capability(tag.fansub_id, 'hasFansubIdentityTags')
    and (
      exists (
        select 1
        from public.fansub_members as member_row
        where member_row.fansub_id = tag.fansub_id
          and member_row.user_id = v_user_id
      )
      or exists (
        select 1
        from public.fansub_boost_grants as grant_row
        where grant_row.fansub_id = tag.fansub_id
          and grant_row.supporter_user_id = v_user_id
          and grant_row.status = 'active'
          and grant_row.starts_at <= now()
          and grant_row.expires_at > now()
      )
    )
  order by fansub.name asc;
end;
$$;

grant execute on function public.upsert_fansub_identity_tag(uuid, text, text, boolean) to authenticated;
grant execute on function public.upsert_fansub_identity_tag(uuid, text, text, text, boolean) to authenticated;

select public.refresh_all_fansub_boost_snapshot_capabilities();

commit;
