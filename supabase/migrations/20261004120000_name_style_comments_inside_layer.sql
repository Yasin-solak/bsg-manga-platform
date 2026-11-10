-- Name style: comments and the "inside" effect layer.
--
-- 1) A third layer for name effects: 'inside'. The image paints not behind / in front of the name but inside the
-- letters (background-clip: text). Existing 'back' / 'front' effects stay as is.
-- 2) public_user_directory also carries name style. Comments (manga detail, reader, community, list)
-- read author info from this view; with no style names drew plain. The Premium gate
-- matches get_public_user_profile_by_id: an expired premium style does not leak out.

alter table public.name_effects drop constraint if exists name_effects_layer_check;
alter table public.name_effects
  add constraint name_effects_layer_check check (layer in ('back', 'front', 'inside'));

-- Public style for a name in a comment row: only active premium, passed through perk gates.
-- An old single-field effect (active_name_effect) completes the style object when it has no effectId.
create or replace function app_private.public_user_name_style(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.premium_expires_at is null or u.premium_expires_at <= pg_catalog.now() then null
    else (
      with visible as (
        select
          app_private.premium_visible_name_style(u.owned_items -> 'active_name_style') as style,
          app_private.premium_visible_name_effect(u.owned_items ->> 'active_name_effect') as legacy_effect
      )
      select case
        when jsonb_typeof(v.style) = 'object' and coalesce(v.style ->> 'effectId', '') = '' and v.legacy_effect is not null
          then v.style || pg_catalog.jsonb_build_object('effectId', v.legacy_effect)
        when jsonb_typeof(v.style) = 'object' then v.style
        when v.legacy_effect is not null then pg_catalog.jsonb_build_object('effectId', v.legacy_effect)
        else null
      end
      from visible v
    )
  end
  from public.users u
  where u.id = p_user_id
$$;

revoke all on function app_private.public_user_name_style(uuid) from public;
grant execute on function app_private.public_user_name_style(uuid) to anon, authenticated, service_role;

-- Note: the body is the same as the live definition (private account / block gates from
-- 20261001160000_private_accounts_follow_requests are kept); only active_name_style is added at the end.
create or replace view public.public_user_directory
with (security_invoker = true)
as
select
  u.id,
  u.username,
  u.avatar_url,
  u.frame_type,
  case
    when app_private.can_manage_moderation_state() or coalesce(access.profile_visible, false)
      then app_private.visible_profile_background_for_user(u.id, u.background_type)
    else null::text
  end as background_type,
  app_private.resolve_user_active_fansub_identity_tag(u.id) as active_fansub_identity_tag,
  coalesce(nullif(pg_catalog.btrim(u.display_name), ''), u.username) as display_name,
  app_private.public_user_name_style(u.id) as active_name_style
from public.users as u
cross join lateral app_private.get_profile_view_access(u.id) as access(
  is_owner,
  viewer_is_follower,
  profile_visible,
  stats_visible,
  social_links_visible,
  activity_visible,
  profile_visibility,
  stats_visibility,
  social_links_visibility,
  activity_visibility
)
where coalesce(u.is_active, true) = true
  and coalesce(u.is_banned, false) = false
  and (
    app_private.can_manage_moderation_state()
    or not app_private.is_blocked_with_viewer(u.id)
  );

grant select on public.public_user_directory to anon, authenticated;
