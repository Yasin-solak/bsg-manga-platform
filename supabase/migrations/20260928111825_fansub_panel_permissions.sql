-- Fansub panel: tab permissions are enforced on the server too (Roles and Permissions, stage 3).
-- One single-argument permission function per tab; in related functions and policies
-- only the call name changes (arguments untouched). Shared surfaces such as cockpit, reports, audit
-- log stay at "panel.erisim" (is_fansub_staff) level.

-- The old public version was column based (admin/moderator); tied to the permission-based version.
create or replace function public.is_fansub_staff(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = 'public' as $function$
  select app_private.is_fansub_staff(p_fansub_id);
$function$;

create or replace function app_private.fansub_staff_perm(p_fansub_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select 'panel.erisim' = any(perms) and p_permission = any(perms)
  from (select app_private.fansub_user_permissions(p_fansub_id, p_user_id) as perms) s;
$function$;

do $wrappers$
declare
  v_tab text;
begin
  foreach v_tab in array array['uyelik', 'topluluk', 'ifadeler', 'kredi', 'bolumler', 'duyurular', 'gorevler', 'istatistik'] loop
    execute format($f$
      create or replace function app_private.fansub_staff_%1$s(p_fansub_id uuid)
      returns boolean language sql stable security definer set search_path = '' as $b$
        select app_private.fansub_staff_perm(p_fansub_id, app_private.current_public_user_id(), 'panel.%1$s');
      $b$;
      create or replace function app_private.fansub_staff_%1$s_jwt(p_fansub_id uuid)
      returns boolean language sql stable security definer set search_path = '' as $b$
        select app_private.fansub_staff_perm(p_fansub_id, app_private.current_public_user_id_from_jwt(), 'panel.%1$s');
      $b$;
      grant execute on function app_private.fansub_staff_%1$s(uuid), app_private.fansub_staff_%1$s_jwt(uuid) to authenticated;
    $f$, v_tab);
  end loop;
end
$wrappers$;
revoke all on function app_private.fansub_staff_perm(uuid, uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Functions: tab RPCs tie to the tab permission
-- ---------------------------------------------------------------------------
do $functions$
declare
  v_map jsonb := jsonb_build_object(
    'app_private.cancel_fansub_invite', 'uyelik',
    'app_private.send_fansub_invite', 'uyelik',
    'app_private.review_fansub_join_request', 'uyelik',
    'app_private.set_fansub_member_team_tag', 'uyelik',
    'app_private.claim_fansub_reward_task', 'gorevler',
    'app_private.create_fansub_community_post', 'topluluk',
    'app_private.list_fansub_manage_posts', 'topluluk',
    'app_private.update_fansub_post_for_review', 'topluluk',
    'public.get_fansub_manage_community_overview', 'topluluk',
    'public.list_fansub_tagged_community_feed', 'topluluk',
    'app_private.edit_fansub_supporter_asset_presentation', 'ifadeler',
    'app_private.get_fansub_manage_supporter_assets', 'ifadeler',
    'app_private.soft_delete_fansub_supporter_asset', 'ifadeler',
    'public.get_fansub_supporter_asset_usage', 'ifadeler',
    'app_private.list_fansub_identity_tags_for_management', 'ifadeler',
    'app_private.get_fansub_manage_chapter_credit_settings', 'kredi',
    'app_private.list_fansub_manage_chapter_credit_overrides', 'kredi',
    'app_private.upsert_fansub_chapter_credit_override', 'kredi',
    'app_private.upsert_fansub_chapter_credit_settings', 'kredi',
    'app_private.list_fansub_manage_chapters', 'bolumler',
    'app_private.update_fansub_chapter_for_review', 'bolumler',
    'app_private.send_fansub_special_notification', 'duyurular',
    'public.send_fansub_special_notification', 'duyurular',
    'app_private.upsert_fansub_pinned_notice', 'duyurular'
  );
  r record;
  v_def text;
  v_new text;
  v_done integer := 0;
begin
  for r in
    select p.oid, n.nspname || '.' || p.proname as qname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where v_map ? (n.nspname || '.' || p.proname) and p.prosrc ~ 'is_fansub_staff\('
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, '(app_private\.|public\.)?is_fansub_staff\(',
      'app_private.fansub_staff_' || (v_map->>r.qname) || '(', 'g');
    if v_new = v_def then
      raise exception 'degisiklik yok: %', r.qname;
    end if;
    execute v_new;
    v_done := v_done + 1;
  end loop;
  if v_done < 24 then
    raise exception 'beklenen 24 fonksiyon, guncellenen %', v_done;
  end if;
end
$functions$;

-- ---------------------------------------------------------------------------
-- Politikalar
-- ---------------------------------------------------------------------------
do $policies$
declare
  v_map jsonb := jsonb_build_object(
    'public.fansub_chapter_credit_overrides.fansub_chapter_credit_overrides_admin_write', 'kredi',
    'public.fansub_chapter_credit_settings.fansub_chapter_credit_settings_admin_write', 'kredi',
    'public.fansub_invites.fansub_invites_insert_staff_or_admin', 'uyelik',
    'public.fansub_invites.fansub_invites_select_rule', 'uyelik',
    'public.fansub_invites.fansub_invites_update_rule', 'uyelik',
    'public.fansub_join_requests.fansub_join_requests_select_rule', 'uyelik',
    'public.fansub_join_requests.fansub_join_requests_update_staff_or_admin', 'uyelik',
    'public.fansub_member_history.fansub_member_history_select_rule', 'uyelik',
    'public.fansub_pinned_notices.fansub_pinned_notices_select_public', 'duyurular',
    'public.fansub_special_notification_broadcasts.fansub_special_notification_broadcasts_select_staff', 'duyurular',
    'public.fansub_reward_task_claims.fansub_reward_task_claims_insert', 'gorevler',
    'public.fansub_reward_task_claims.fansub_reward_task_claims_select', 'gorevler',
    'public.fansub_supporter_asset_revisions.fansub_supporter_asset_revisions_staff_read', 'ifadeler',
    'public.fansub_supporter_assets.fansub_supporter_assets_staff_read', 'ifadeler',
    'public.fansub_supporter_assets.fansub_supporter_assets_staff_write_delete', 'ifadeler',
    'public.fansub_supporter_assets.fansub_supporter_assets_staff_write_insert', 'ifadeler',
    'public.fansub_supporter_assets.fansub_supporter_assets_staff_write_update', 'ifadeler',
    'public.manga_monthly_views.manga_monthly_views_select_admin_or_fansub_staff', 'istatistik',
    'public.community_posts.community_posts_insert_authenticated_pending', 'topluluk'
  );
  r record;
  v_tab text;
  v_qual text;
  v_check text;
  v_sql text;
  v_done integer := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where v_map ? (schemaname || '.' || tablename || '.' || policyname)
  loop
    v_tab := v_map->>(r.schemaname || '.' || r.tablename || '.' || r.policyname);
    v_qual := regexp_replace(regexp_replace(r.qual, '(app_private\.)?is_fansub_staff_from_jwt\(', 'app_private.fansub_staff_' || v_tab || '_jwt(', 'g'),
      '(app_private\.|public\.)?is_fansub_staff\(', 'app_private.fansub_staff_' || v_tab || '(', 'g');
    v_check := regexp_replace(regexp_replace(r.with_check, '(app_private\.)?is_fansub_staff_from_jwt\(', 'app_private.fansub_staff_' || v_tab || '_jwt(', 'g'),
      '(app_private\.|public\.)?is_fansub_staff\(', 'app_private.fansub_staff_' || v_tab || '(', 'g');
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_qual is not null then v_sql := v_sql || ' using (' || v_qual || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
    v_done := v_done + 1;
  end loop;
  if v_done < 19 then
    raise exception 'beklenen 19 politika, guncellenen %', v_done;
  end if;
end
$policies$;

-- Supporter assets (storage): the table owner may differ; skipped without permission,
-- table-side policies (above) still apply the tab permission.
do $storage$
declare
  r record;
  v_qual text;
  v_check text;
  v_sql text;
begin
  for r in
    select policyname, qual, with_check from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('Fansub upload supporter assets', 'Fansub update supporter assets', 'Fansub delete supporter assets')
  loop
    v_qual := regexp_replace(regexp_replace(r.qual, '(app_private\.)?is_fansub_staff_from_jwt\(', 'app_private.fansub_staff_ifadeler_jwt(', 'g'),
      '(app_private\.|public\.)?is_fansub_staff\(', 'app_private.fansub_staff_ifadeler(', 'g');
    v_check := regexp_replace(regexp_replace(r.with_check, '(app_private\.)?is_fansub_staff_from_jwt\(', 'app_private.fansub_staff_ifadeler_jwt(', 'g'),
      '(app_private\.|public\.)?is_fansub_staff\(', 'app_private.fansub_staff_ifadeler(', 'g');
    v_sql := format('alter policy %I on storage.objects', r.policyname);
    if v_qual is not null then v_sql := v_sql || ' using (' || v_qual || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    begin
      execute v_sql;
    exception when insufficient_privilege then
      raise notice 'storage politikasi atlandi (yetki): %', r.policyname;
    end;
  end loop;
end
$storage$;
