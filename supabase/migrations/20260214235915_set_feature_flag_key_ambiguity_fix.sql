-- ============================================
-- MangaZone | set_feature_flag key ambiguity fix
-- Date: 2026-02-14
-- ============================================

begin;

drop function if exists public.set_feature_flag(text, text, text, boolean, integer, boolean, jsonb);

create function public.set_feature_flag(
  p_key text,
  p_label text,
  p_description text default '',
  p_is_enabled boolean default false,
  p_rollout_percent integer default 100,
  p_is_public boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns public.feature_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_key text;
  v_row public.feature_flags%rowtype;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  v_key := lower(trim(coalesce(p_key, '')));
  if v_key = '' then
    raise exception 'Feature flag anahtari bos olamaz.';
  end if;

  insert into public.feature_flags (
    "key",
    label,
    description,
    is_enabled,
    rollout_percent,
    is_public,
    metadata,
    updated_by
  )
  values (
    v_key,
    trim(coalesce(p_label, '')),
    coalesce(trim(p_description), ''),
    coalesce(p_is_enabled, false),
    least(100, greatest(0, coalesce(p_rollout_percent, 0))),
    coalesce(p_is_public, false),
    coalesce(p_metadata, '{}'::jsonb),
    v_actor_id
  )
  on conflict ("key") do update
    set label = excluded.label,
        description = excluded.description,
        is_enabled = excluded.is_enabled,
        rollout_percent = excluded.rollout_percent,
        is_public = excluded.is_public,
        metadata = excluded.metadata,
        updated_by = v_actor_id
  returning * into v_row;

  perform public.create_admin_audit_log(
    'feature_flag.upsert',
    'feature_flag',
    v_row.id::text,
    format(
      '%s => %s (rollout=%s%%, public=%s)',
      v_row.key,
      case when v_row.is_enabled then 'on' else 'off' end,
      v_row.rollout_percent,
      case when v_row.is_public then 'yes' else 'no' end
    ),
    jsonb_build_object(
      'key', v_row.key,
      'label', v_row.label,
      'is_enabled', v_row.is_enabled,
      'rollout_percent', v_row.rollout_percent,
      'is_public', v_row.is_public
    )
  );

  return v_row;
end;
$$;

grant execute on function public.set_feature_flag(text, text, text, boolean, integer, boolean, jsonb) to authenticated;

commit;

