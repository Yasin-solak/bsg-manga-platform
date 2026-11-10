-- Pinned notice state: unpublishing (inactive) and deleting are always
-- free. In the old flow the only path was upsert; upsert wanted a boost level and a valid
-- target, so a fansub with a dropped boost or deleted target could not close its notice
-- . Republishing still wants boost + a valid target.
create or replace function app_private.set_fansub_pinned_notice_active(
  p_fansub_id uuid,
  p_slot_index smallint,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_notice public.fansub_pinned_notices%rowtype;
  v_action_label text;
  v_action_url text;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;
  if not (public.is_admin() or app_private.fansub_staff_duyurular(p_fansub_id)) then
    raise exception 'Bu fansubun duyurularini yonetme yetkiniz yok.';
  end if;

  select * into v_notice from public.fansub_pinned_notices
  where fansub_id = p_fansub_id and slot_index = p_slot_index
  for update;
  if v_notice.id is null then
    raise exception 'Duyuru bulunamadi.';
  end if;

  if coalesce(p_is_active, false) then
    if not public.fansub_has_boost_capability(p_fansub_id, 'canManagePinnedNotice') then
      raise exception 'Duyuruyu yeniden yayinlamak icin Seviye 1 takviye gerekir.';
    end if;
    -- If the target was deleted it errors here; edit and pick a new target.
    select resolved.target_label, resolved.route_hint into v_action_label, v_action_url
    from public.resolve_fansub_notice_target(p_fansub_id, v_notice.action_target, v_notice.target_entity_id) as resolved;
    if v_action_url is null then
      raise exception 'Duyurunun hedefi artik yok. Duzenleyip yeni bir hedef sec.';
    end if;
    update public.fansub_pinned_notices
    set is_active = true, action_label = v_action_label, action_url = v_action_url, updated_by = v_actor_id, updated_at = now()
    where id = v_notice.id;
  else
    update public.fansub_pinned_notices
    set is_active = false, updated_by = v_actor_id, updated_at = now()
    where id = v_notice.id;
  end if;

  return coalesce(p_is_active, false);
end;
$$;

create or replace function app_private.delete_fansub_pinned_notice(p_fansub_id uuid, p_slot_index smallint)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if public.current_public_user_id() is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;
  if not (public.is_admin() or app_private.fansub_staff_duyurular(p_fansub_id)) then
    raise exception 'Bu fansubun duyurularini yonetme yetkiniz yok.';
  end if;
  delete from public.fansub_pinned_notices where fansub_id = p_fansub_id and slot_index = p_slot_index;
end;
$$;

create or replace function public.set_fansub_pinned_notice_active(p_fansub_id uuid, p_slot_index smallint, p_is_active boolean)
returns boolean
language sql
set search_path = 'public'
as $$ select app_private.set_fansub_pinned_notice_active($1, $2, $3); $$;

create or replace function public.delete_fansub_pinned_notice(p_fansub_id uuid, p_slot_index smallint)
returns void
language sql
set search_path = 'public'
as $$ select app_private.delete_fansub_pinned_notice($1, $2); $$;

revoke all on function app_private.set_fansub_pinned_notice_active(uuid, smallint, boolean) from public, anon;
revoke all on function app_private.delete_fansub_pinned_notice(uuid, smallint) from public, anon;
grant execute on function app_private.set_fansub_pinned_notice_active(uuid, smallint, boolean) to authenticated;
grant execute on function app_private.delete_fansub_pinned_notice(uuid, smallint) to authenticated;
revoke all on function public.set_fansub_pinned_notice_active(uuid, smallint, boolean) from public, anon;
revoke all on function public.delete_fansub_pinned_notice(uuid, smallint) from public, anon;
grant execute on function public.set_fansub_pinned_notice_active(uuid, smallint, boolean) to authenticated;
grant execute on function public.delete_fansub_pinned_notice(uuid, smallint) to authenticated;
