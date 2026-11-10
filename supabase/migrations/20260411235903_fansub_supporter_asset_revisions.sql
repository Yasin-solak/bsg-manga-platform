begin;

create table if not exists public.fansub_supporter_asset_revisions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.fansub_supporter_assets (id) on delete cascade,
  revision_number integer not null check (revision_number between 1 and 9999),
  shortcode text not null
    check (
      shortcode = lower(shortcode)
      and shortcode ~ '^[a-z0-9][a-z0-9_-]{1,15}$'
    ),
  label text not null
    check (char_length(btrim(label)) between 1 and 20),
  asset_ref text not null
    check (char_length(btrim(asset_ref)) between 1 and 240),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  width integer null check (width is null or width between 1 and 4096),
  height integer null check (height is null or height between 1 and 4096),
  size_bytes integer null check (size_bytes is null or size_bytes between 1 and 10485760),
  presentation jsonb not null default '{}'::jsonb,
  created_by uuid null references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fansub_supporter_asset_revisions_unique_number
    unique (asset_id, revision_number),
  constraint fansub_supporter_asset_revisions_presentation_valid
    check (public.is_valid_fansub_supporter_asset_presentation(presentation))
);

create index if not exists idx_fansub_supporter_asset_revisions_asset
  on public.fansub_supporter_asset_revisions (asset_id, revision_number desc, created_at desc);

alter table public.fansub_supporter_asset_revisions enable row level security;

drop policy if exists fansub_supporter_asset_revisions_staff_read on public.fansub_supporter_asset_revisions;
create policy fansub_supporter_asset_revisions_staff_read
  on public.fansub_supporter_asset_revisions
  for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.fansub_supporter_assets as asset
      where asset.id = fansub_supporter_asset_revisions.asset_id
        and public.is_fansub_staff(asset.fansub_id)
    )
  );

alter table public.fansub_supporter_assets
  add column if not exists current_revision_id uuid null,
  add column if not exists legacy_revision_id uuid null,
  add column if not exists latest_revision_number integer not null default 0
    check (latest_revision_number between 0 and 9999),
  add column if not exists deleted_at timestamptz null;

create or replace function public.create_initial_fansub_supporter_asset_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision_id uuid;
begin
  if new.current_revision_id is not null then
    return new;
  end if;

  insert into public.fansub_supporter_asset_revisions (
    asset_id,
    revision_number,
    shortcode,
    label,
    asset_ref,
    mime_type,
    width,
    height,
    size_bytes,
    presentation,
    created_by,
    created_at
  )
  values (
    new.id,
    1,
    new.shortcode,
    new.label,
    new.asset_ref,
    new.mime_type,
    new.width,
    new.height,
    new.size_bytes,
    coalesce(new.presentation, '{}'::jsonb),
    new.created_by,
    coalesce(new.created_at, now())
  )
  returning id into v_revision_id;

  update public.fansub_supporter_assets
  set
    current_revision_id = v_revision_id,
    legacy_revision_id = v_revision_id,
    latest_revision_number = 1
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_fansub_supporter_assets_initial_revision on public.fansub_supporter_assets;
create trigger trg_fansub_supporter_assets_initial_revision
  after insert on public.fansub_supporter_assets
  for each row
  execute function public.create_initial_fansub_supporter_asset_revision();

lock table public.fansub_supporter_assets in share row exclusive mode;
lock table public.fansub_supporter_asset_revisions in share row exclusive mode;

insert into public.fansub_supporter_asset_revisions (
  asset_id,
  revision_number,
  shortcode,
  label,
  asset_ref,
  mime_type,
  width,
  height,
  size_bytes,
  presentation,
  created_by,
  created_at
)
select
  asset.id,
  1,
  asset.shortcode,
  asset.label,
  asset.asset_ref,
  asset.mime_type,
  asset.width,
  asset.height,
  asset.size_bytes,
  coalesce(asset.presentation, '{}'::jsonb),
  asset.created_by,
  asset.created_at
from public.fansub_supporter_assets as asset
where not exists (
  select 1
  from public.fansub_supporter_asset_revisions as revision
  where revision.asset_id = asset.id
    and revision.revision_number = 1
)
on conflict (asset_id, revision_number) do nothing;

with first_revisions as (
  select distinct on (revision.asset_id)
    revision.asset_id,
    revision.id as revision_id,
    revision.revision_number
  from public.fansub_supporter_asset_revisions as revision
  order by
    revision.asset_id asc,
    revision.revision_number asc,
    revision.created_at asc,
    revision.id asc
),
latest_revisions as (
  select distinct on (revision.asset_id)
    revision.asset_id,
    revision.id as revision_id,
    revision.revision_number
  from public.fansub_supporter_asset_revisions as revision
  order by
    revision.asset_id asc,
    revision.revision_number desc,
    revision.created_at desc,
    revision.id desc
),
resolved_revisions as (
  select
    first_revision.asset_id,
    first_revision.revision_id as legacy_revision_id,
    latest_revision.revision_id as current_revision_id,
    latest_revision.revision_number as latest_revision_number
  from first_revisions as first_revision
  join latest_revisions as latest_revision
    on latest_revision.asset_id = first_revision.asset_id
)
update public.fansub_supporter_assets as asset
set
  current_revision_id = resolved.current_revision_id,
  legacy_revision_id = resolved.legacy_revision_id,
  latest_revision_number = greatest(coalesce(asset.latest_revision_number, 0), resolved.latest_revision_number)
from resolved_revisions as resolved
where asset.id = resolved.asset_id;

do $$
declare
  v_missing_count integer;
  v_missing_assets text;
begin
  select
    count(*)::integer,
    string_agg(asset.id::text, ', ' order by asset.created_at asc, asset.id asc)
  into v_missing_count, v_missing_assets
  from public.fansub_supporter_assets as asset
  where asset.current_revision_id is null
     or asset.legacy_revision_id is null;

  if coalesce(v_missing_count, 0) > 0 then
    raise exception 'Supporter asset revision backfill eksik kaldi. Eksik satir: %. Assetler: %',
      v_missing_count,
      coalesce(v_missing_assets, '-');
  end if;
end;
$$;

alter table public.fansub_supporter_assets
  alter column current_revision_id set not null;

alter table public.fansub_supporter_assets
  alter column legacy_revision_id set not null;

alter table public.fansub_supporter_assets
  drop constraint if exists fansub_supporter_assets_current_revision_fkey,
  drop constraint if exists fansub_supporter_assets_legacy_revision_fkey,
  drop constraint if exists fansub_supporter_assets_unique_shortcodes;

alter table public.fansub_supporter_assets
  add constraint fansub_supporter_assets_current_revision_fkey
    foreign key (current_revision_id) references public.fansub_supporter_asset_revisions (id),
  add constraint fansub_supporter_assets_legacy_revision_fkey
    foreign key (legacy_revision_id) references public.fansub_supporter_asset_revisions (id);

create unique index if not exists idx_fansub_supporter_assets_unique_live_shortcode
  on public.fansub_supporter_assets (fansub_id, asset_kind, shortcode)
  where deleted_at is null;

drop function if exists public.list_public_fansub_supporter_assets(uuid, text);

create function public.list_public_fansub_supporter_assets(
  p_fansub_id uuid,
  p_asset_kind text default null
)
returns table (
  id uuid,
  fansub_id uuid,
  asset_kind text,
  shortcode text,
  label text,
  asset_ref text,
  mime_type text,
  width integer,
  height integer,
  size_bytes integer,
  is_active boolean,
  sort_order integer,
  quota_limit integer,
  quota_rank integer,
  is_within_quota boolean,
  is_usable boolean,
  presentation jsonb,
  current_revision_id uuid,
  current_revision_number integer,
  legacy_revision_id uuid,
  legacy_revision_number integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  with snapshot_caps as (
    select coalesce(snapshot.capabilities, public.build_fansub_boost_capabilities(0)) as capabilities
    from public.fansubs as fansub
    left join public.fansub_boost_snapshots as snapshot
      on snapshot.fansub_id = fansub.id
    where fansub.id = p_fansub_id
      and coalesce(fansub.is_active, true) = true
  ),
  ranked_assets as (
    select
      asset.*,
      row_number() over (
        partition by asset.asset_kind
        order by asset.sort_order asc, asset.created_at asc, asset.id asc
      )::integer as quota_rank
    from public.fansub_supporter_assets as asset
    where asset.fansub_id = p_fansub_id
      and asset.deleted_at is null
      and (
        nullif(lower(trim(coalesce(p_asset_kind, ''))), '') is null
        or asset.asset_kind = lower(trim(p_asset_kind))
      )
  )
  select
    asset.id,
    asset.fansub_id,
    asset.asset_kind,
    current_revision.shortcode,
    current_revision.label,
    current_revision.asset_ref,
    current_revision.mime_type,
    current_revision.width,
    current_revision.height,
    current_revision.size_bytes,
    asset.is_active,
    asset.sort_order,
    public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind) as quota_limit,
    asset.quota_rank,
    asset.quota_rank <= public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind) as is_within_quota,
    (
      asset.is_active
      and public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind) > 0
      and asset.quota_rank <= public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind)
    ) as is_usable,
    coalesce(current_revision.presentation, '{}'::jsonb) as presentation,
    current_revision.id as current_revision_id,
    current_revision.revision_number as current_revision_number,
    legacy_revision.id as legacy_revision_id,
    legacy_revision.revision_number as legacy_revision_number,
    asset.created_at,
    asset.updated_at
  from ranked_assets as asset
  join public.fansub_supporter_asset_revisions as current_revision
    on current_revision.id = asset.current_revision_id
  join public.fansub_supporter_asset_revisions as legacy_revision
    on legacy_revision.id = asset.legacy_revision_id
  cross join snapshot_caps
  order by
    case asset.asset_kind when 'emoji' then 0 else 1 end asc,
    asset.sort_order asc,
    asset.created_at asc,
    asset.id asc;
$$;

grant execute on function public.list_public_fansub_supporter_assets(uuid, text) to anon, authenticated;

drop function if exists public.get_public_fansub_supporter_asset_render_catalog(uuid[]);

create function public.get_public_fansub_supporter_asset_render_catalog(
  p_revision_ids uuid[]
)
returns table (
  revision_id uuid,
  asset_id uuid,
  fansub_id uuid,
  asset_kind text,
  shortcode text,
  label text,
  asset_ref text,
  mime_type text,
  width integer,
  height integer,
  size_bytes integer,
  presentation jsonb,
  revision_number integer,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    revision.id as revision_id,
    asset.id as asset_id,
    asset.fansub_id,
    asset.asset_kind,
    revision.shortcode,
    revision.label,
    revision.asset_ref,
    revision.mime_type,
    revision.width,
    revision.height,
    revision.size_bytes,
    coalesce(revision.presentation, '{}'::jsonb) as presentation,
    revision.revision_number,
    revision.created_at
  from unnest(coalesce(p_revision_ids, '{}'::uuid[])) with ordinality as requested(revision_id, ordinality)
  join public.fansub_supporter_asset_revisions as revision
    on revision.id = requested.revision_id
  join public.fansub_supporter_assets as asset
    on asset.id = revision.asset_id
  order by requested.ordinality asc;
$$;

grant execute on function public.get_public_fansub_supporter_asset_render_catalog(uuid[]) to anon, authenticated;

drop function if exists public.edit_fansub_supporter_asset_presentation(uuid, uuid, jsonb);

create function public.edit_fansub_supporter_asset_presentation(
  p_asset_id uuid,
  p_fansub_id uuid,
  p_presentation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.fansub_supporter_assets%rowtype;
  v_new_revision_id uuid;
  v_new_revision_number integer;
  v_result jsonb;
begin
  if p_asset_id is null or p_fansub_id is null then
    raise exception 'Asset ve fansub kimligi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu supporter assetini duzenleme yetkiniz yok.';
  end if;

  if not public.is_valid_fansub_supporter_asset_presentation(coalesce(p_presentation, '{}'::jsonb)) then
    raise exception 'Supporter asset sunumu gecersiz.';
  end if;

  select *
  into v_asset
  from public.fansub_supporter_assets as asset
  where asset.id = p_asset_id
    and asset.fansub_id = p_fansub_id
    and asset.deleted_at is null
  for update;

  if not found then
    raise exception 'Supporter asset bulunamadi.';
  end if;

  v_new_revision_number := greatest(coalesce(v_asset.latest_revision_number, 0), 0) + 1;

  insert into public.fansub_supporter_asset_revisions (
    asset_id,
    revision_number,
    shortcode,
    label,
    asset_ref,
    mime_type,
    width,
    height,
    size_bytes,
    presentation,
    created_by
  )
  values (
    v_asset.id,
    v_new_revision_number,
    v_asset.shortcode,
    v_asset.label,
    v_asset.asset_ref,
    v_asset.mime_type,
    v_asset.width,
    v_asset.height,
    v_asset.size_bytes,
    coalesce(p_presentation, '{}'::jsonb),
    public.current_public_user_id()
  )
  returning id into v_new_revision_id;

  update public.fansub_supporter_assets
  set
    current_revision_id = v_new_revision_id,
    latest_revision_number = v_new_revision_number,
    updated_at = now()
  where id = v_asset.id;

  select to_jsonb(asset_row)
  into v_result
  from public.list_public_fansub_supporter_assets(p_fansub_id, v_asset.asset_kind) as asset_row
  where asset_row.id = v_asset.id
  limit 1;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

grant execute on function public.edit_fansub_supporter_asset_presentation(uuid, uuid, jsonb) to authenticated;

drop function if exists public.soft_delete_fansub_supporter_asset(uuid, uuid);

create function public.soft_delete_fansub_supporter_asset(
  p_asset_id uuid,
  p_fansub_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_asset_id is null or p_fansub_id is null then
    raise exception 'Asset ve fansub kimligi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu supporter assetini silme yetkiniz yok.';
  end if;

  update public.fansub_supporter_assets
  set
    is_active = false,
    deleted_at = now(),
    updated_at = now()
  where id = p_asset_id
    and fansub_id = p_fansub_id
    and deleted_at is null;

  if not found then
    raise exception 'Supporter asset bulunamadi veya zaten silinmis.';
  end if;
end;
$$;

grant execute on function public.soft_delete_fansub_supporter_asset(uuid, uuid) to authenticated;

drop function if exists public.get_fansub_manage_supporter_assets(uuid);

create function public.get_fansub_manage_supporter_assets(
  p_fansub_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capabilities jsonb := public.build_fansub_boost_capabilities(0);
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun supporter assetlerini gorme yetkiniz yok.';
  end if;

  perform public.maybe_refresh_fansub_boost_snapshot(p_fansub_id);

  select coalesce(snapshot.capabilities, v_capabilities)
  into v_capabilities
  from public.fansub_boost_snapshots as snapshot
  where snapshot.fansub_id = p_fansub_id;

  return jsonb_build_object(
    'fansubId', p_fansub_id,
    'supporterEmojiSlotLimit', public.resolve_fansub_supporter_asset_limit(v_capabilities, 'emoji'),
    'supporterStickerSlotLimit', public.resolve_fansub_supporter_asset_limit(v_capabilities, 'sticker'),
    'items',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', asset_row.id,
            'fansubId', asset_row.fansub_id,
            'assetKind', asset_row.asset_kind,
            'shortcode', asset_row.shortcode,
            'label', asset_row.label,
            'assetRef', asset_row.asset_ref,
            'mimeType', asset_row.mime_type,
            'width', asset_row.width,
            'height', asset_row.height,
            'sizeBytes', asset_row.size_bytes,
            'isActive', asset_row.is_active,
            'sortOrder', asset_row.sort_order,
            'quotaLimit', asset_row.quota_limit,
            'quotaRank', asset_row.quota_rank,
            'isWithinQuota', asset_row.is_within_quota,
            'isUsable', asset_row.is_usable,
            'presentation', asset_row.presentation,
            'currentRevisionId', asset_row.current_revision_id,
            'currentRevisionNumber', asset_row.current_revision_number,
            'legacyRevisionId', asset_row.legacy_revision_id,
            'legacyRevisionNumber', asset_row.legacy_revision_number,
            'createdAt', asset_row.created_at,
            'updatedAt', asset_row.updated_at
          )
          order by
            case asset_row.asset_kind when 'emoji' then 0 else 1 end asc,
            asset_row.sort_order asc,
            asset_row.created_at asc
        )
        from public.list_public_fansub_supporter_assets(p_fansub_id, null) as asset_row
      ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_fansub_manage_supporter_assets(uuid) to authenticated;

commit;
