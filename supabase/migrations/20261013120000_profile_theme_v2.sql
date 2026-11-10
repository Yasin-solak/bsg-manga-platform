begin;
-- Profile theme v2: color + scene style + pattern.
--
-- The UI in #240 moved the theme to v2 (style: aurora/gradient/spotlight/mesh, pattern: none/dots/grid/
-- stars/waves/noise) but save functions still wrote only two colors (version 1):
-- when a user picked a patterned theme like "Neon Uzay", on refresh style / pattern fell back
-- to default. The same validator is now also used for the fansub theme (the fansub showcase moved to the same
-- theme picker as the profile). Unknown style / pattern falls to the default; the color rule did not change.

create or replace function app_private.normalize_profile_theme(p_theme jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'version', 2,
    'mainColor', lower(p_theme ->> 'mainColor'),
    'accentColor', lower(p_theme ->> 'accentColor'),
    'style', case when p_theme ->> 'style' in ('aurora', 'gradient', 'spotlight', 'mesh') then p_theme ->> 'style' else 'aurora' end,
    'pattern', case when p_theme ->> 'pattern' in ('none', 'dots', 'grid', 'stars', 'waves', 'noise') then p_theme ->> 'pattern' else 'none' end
  )
$$;

revoke all on function app_private.normalize_profile_theme(jsonb) from public, anon, authenticated;

-- The v1 object builder in save functions is replaced with normalize_profile_theme (the rest of the body
-- is kept as is). If the pattern is not found the migration stops: the old behavior does not stay silently.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.update_my_profile_customization(boolean,text,boolean,text,boolean,uuid,jsonb)'::regprocedure);
  v_new := regexp_replace(
    v_def,
    'jsonb_build_object\(\s*''version'', 1,\s*''mainColor'', lower\(v_patch_active_hover_theme ->> ''mainColor''\),\s*''accentColor'', lower\(v_patch_active_hover_theme ->> ''accentColor''\)\s*\)',
    'app_private.normalize_profile_theme(v_patch_active_hover_theme)'
  );
  if v_new = v_def then
    raise exception 'update_my_profile_customization: v1 tema kurucusu bulunamadi';
  end if;
  execute v_new;

  v_def := pg_get_functiondef('public.upsert_fansub_profile(uuid,text,text,text,text,text,text,text,jsonb,text,uuid,jsonb)'::regprocedure);
  v_new := regexp_replace(
    v_def,
    'jsonb_build_object\(\s*''version'', 1,\s*''mainColor'', lower\(p_hover_theme ->> ''mainColor''\),\s*''accentColor'', lower\(p_hover_theme ->> ''accentColor''\)\s*\)',
    'app_private.normalize_profile_theme(p_hover_theme)'
  );
  if v_new = v_def then
    raise exception 'upsert_fansub_profile: v1 tema kurucusu bulunamadi';
  end if;
  execute v_new;
end;
$$;
commit;
