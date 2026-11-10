begin;

-- This layer ties public result surfaces that can also change outside RPCs to the audit chain.
create or replace function public.create_fansub_audit_log_from_trigger(
  p_fansub_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text default null,
  p_summary text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_actor_role text := 'system';
  v_membership_role text;
  v_log_id uuid;
begin
  if p_fansub_id is null then
    return null;
  end if;

  if v_actor_id is not null then
    if public.is_admin() then
      v_actor_role := 'site_admin';
    else
      select fm.role
      into v_membership_role
      from public.fansub_members as fm
      where fm.fansub_id = p_fansub_id
        and fm.user_id = v_actor_id
      limit 1;

      v_actor_role := case
        when v_membership_role = 'admin' then 'fansub_admin'
        when v_membership_role = 'moderator' then 'fansub_moderator'
        when v_membership_role is not null then 'fansub_staff'
        else 'system'
      end;
    end if;
  end if;

  insert into public.fansub_audit_logs (
    fansub_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    summary,
    metadata
  )
  values (
    p_fansub_id,
    v_actor_id,
    left(v_actor_role, 40),
    left(trim(coalesce(p_action, '')), 120),
    left(trim(coalesce(p_resource_type, '')), 80),
    nullif(trim(coalesce(p_resource_id, '')), ''),
    left(coalesce(trim(p_summary), ''), 500),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.create_fansub_audit_log_from_trigger(uuid, text, text, text, text, jsonb) from public;

create or replace function public.audit_fansub_supporter_asset_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_summary text;
  v_asset_kind text;
  v_shortcode text;
  v_fansub_id uuid;
  v_asset_id uuid;
  v_metadata jsonb;
begin
  if tg_op = 'INSERT' then
    v_fansub_id := new.fansub_id;
    v_asset_id := new.id;
    v_asset_kind := new.asset_kind;
    v_shortcode := new.shortcode;
    v_action := 'fansub.supporter_asset.create';
    v_summary := format('%s supporter asseti eklendi: %s', v_asset_kind, v_shortcode);
    v_metadata := jsonb_build_object(
      'fansubId', v_fansub_id,
      'assetKind', v_asset_kind,
      'shortcode', v_shortcode,
      'isActive', new.is_active,
      'sortOrder', new.sort_order,
      'currentRevisionId', new.current_revision_id,
      'previousRevisionId', null,
      'latestRevisionNumber', new.latest_revision_number,
      'deletedAt', new.deleted_at
    );
  elsif tg_op = 'UPDATE' then
    v_fansub_id := new.fansub_id;
    v_asset_id := new.id;
    v_asset_kind := new.asset_kind;
    v_shortcode := new.shortcode;
    if new.deleted_at is not null and old.deleted_at is null then
      v_action := 'fansub.supporter_asset.archive';
      v_summary := format('%s supporter asseti arsive alindi: %s', v_asset_kind, v_shortcode);
    elsif new.current_revision_id is distinct from old.current_revision_id then
      v_action := 'fansub.supporter_asset.presentation.update';
      v_summary := format('%s supporter asseti yeni revision ile guncellendi: %s', v_asset_kind, v_shortcode);
    elsif new.sort_order is distinct from old.sort_order then
      v_action := 'fansub.supporter_asset.sort.update';
      v_summary := format('%s supporter assetinin sirasi guncellendi: %s', v_asset_kind, v_shortcode);
    elsif new.is_active is distinct from old.is_active then
      v_action := 'fansub.supporter_asset.status.update';
      v_summary := format('%s supporter assetinin kullanim durumu guncellendi: %s', v_asset_kind, v_shortcode);
    else
      return new;
    end if;

    v_metadata := jsonb_build_object(
      'fansubId', v_fansub_id,
      'assetKind', v_asset_kind,
      'shortcode', v_shortcode,
      'isActive', new.is_active,
      'sortOrder', new.sort_order,
      'currentRevisionId', new.current_revision_id,
      'previousRevisionId', old.current_revision_id,
      'latestRevisionNumber', new.latest_revision_number,
      'deletedAt', new.deleted_at
    );
  else
    return coalesce(new, old);
  end if;

  perform public.create_fansub_audit_log_from_trigger(
    v_fansub_id,
    v_action,
    'supporter_asset',
    v_asset_id::text,
    v_summary,
    v_metadata
  );

  return new;
end;
$$;

drop trigger if exists trg_fansub_supporter_assets_audit on public.fansub_supporter_assets;
create trigger trg_fansub_supporter_assets_audit
  after insert or update on public.fansub_supporter_assets
  for each row
  execute function public.audit_fansub_supporter_asset_mutation();

create or replace function public.audit_fansub_identity_tag_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_summary text;
  v_fansub_id uuid;
  v_tag_id uuid;
  v_shortcode text;
  v_metadata jsonb;
begin
  if tg_op = 'INSERT' then
    v_fansub_id := new.fansub_id;
    v_tag_id := new.id;
    v_shortcode := new.shortcode;
    v_action := 'fansub.identity_tag.create';
    v_summary := format('Fansub etiketi olusturuldu: %s', v_shortcode);
    v_metadata := jsonb_build_object(
      'fansubId', v_fansub_id,
      'audience', new.audience,
      'shortcode', v_shortcode,
      'badgeKey', new.badge_key,
      'isActive', new.is_active,
      'governanceChangedAt', new.governance_changed_at
    );
  elsif tg_op = 'UPDATE' then
    v_fansub_id := new.fansub_id;
    v_tag_id := new.id;
    v_shortcode := new.shortcode;
    if new.shortcode is distinct from old.shortcode
      or new.badge_key is distinct from old.badge_key
      or new.governance_changed_at is distinct from old.governance_changed_at then
      v_action := 'fansub.identity_tag.visual.update';
      v_summary := format('Fansub etiketi gorsel olarak guncellendi: %s', v_shortcode);
    elsif new.is_active is distinct from old.is_active then
      v_action := 'fansub.identity_tag.status.update';
      v_summary := format('Fansub etiketi kullanim durumu guncellendi: %s', v_shortcode);
    else
      return new;
    end if;

    v_metadata := jsonb_build_object(
      'fansubId', v_fansub_id,
      'audience', new.audience,
      'shortcode', v_shortcode,
      'badgeKey', new.badge_key,
      'isActive', new.is_active,
      'governanceChangedAt', new.governance_changed_at
    );
  else
    return coalesce(new, old);
  end if;

  perform public.create_fansub_audit_log_from_trigger(
    v_fansub_id,
    v_action,
    'fansub_identity_tag',
    v_tag_id::text,
    v_summary,
    v_metadata
  );

  return new;
end;
$$;

drop trigger if exists trg_fansub_identity_tags_audit on public.fansub_identity_tags;
create trigger trg_fansub_identity_tags_audit
  after insert or update on public.fansub_identity_tags
  for each row
  execute function public.audit_fansub_identity_tag_mutation();

create or replace function public.audit_fansub_chapter_credit_settings_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.is_enabled is not distinct from old.is_enabled
      and new.title is not distinct from old.title
      and new.body is not distinct from old.body
      and new.cta_label is not distinct from old.cta_label
      and new.cta_target is not distinct from old.cta_target
      and new.show_metrics is not distinct from old.show_metrics
      and new.show_supporters is not distinct from old.show_supporters
      and new.max_supporter_count is not distinct from old.max_supporter_count then
      return new;
    end if;
  end if;

  perform public.create_fansub_audit_log_from_trigger(
    new.fansub_id,
    case when tg_op = 'INSERT' then 'fansub.chapter_credit.settings.create' else 'fansub.chapter_credit.settings.update' end,
    'chapter_credit_settings',
    new.fansub_id::text,
    'Kapanis kredisi varsayilan ayarlari kaydedildi.',
    jsonb_build_object(
      'fansubId', new.fansub_id,
      'isEnabled', new.is_enabled,
      'ctaTarget', new.cta_target,
      'showMetrics', new.show_metrics,
      'showSupporters', new.show_supporters,
      'maxSupporterCount', new.max_supporter_count
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_fansub_chapter_credit_settings_audit on public.fansub_chapter_credit_settings;
create trigger trg_fansub_chapter_credit_settings_audit
  after insert or update on public.fansub_chapter_credit_settings
  for each row
  execute function public.audit_fansub_chapter_credit_settings_mutation();

create or replace function public.audit_fansub_chapter_credit_override_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fansub_id uuid;
  v_chapter_id uuid;
  v_action text;
  v_summary text;
  v_metadata jsonb;
begin
  if tg_op = 'DELETE' then
    v_fansub_id := old.fansub_id;
    v_chapter_id := old.chapter_id;
    v_action := 'fansub.chapter_credit.override.remove';
    v_summary := 'Bolum bazli kapanis kredisi override kaydi kaldirildi.';
    v_metadata := jsonb_build_object(
      'fansubId', old.fansub_id,
      'chapterId', old.chapter_id,
      'overrideMode', old.override_mode,
      'ctaTarget', old.cta_target,
      'showMetrics', old.show_metrics,
      'showSupporters', old.show_supporters,
      'maxSupporterCount', old.max_supporter_count
    );
  elsif tg_op = 'INSERT' then
    v_fansub_id := new.fansub_id;
    v_chapter_id := new.chapter_id;
    v_action := 'fansub.chapter_credit.override.create';
    v_summary := 'Bolum bazli kapanis kredisi override kaydi olusturuldu.';
    v_metadata := jsonb_build_object(
      'fansubId', new.fansub_id,
      'chapterId', new.chapter_id,
      'overrideMode', new.override_mode,
      'ctaTarget', new.cta_target,
      'showMetrics', new.show_metrics,
      'showSupporters', new.show_supporters,
      'maxSupporterCount', new.max_supporter_count
    );
  else
    v_fansub_id := new.fansub_id;
    v_chapter_id := new.chapter_id;
    if new.override_mode is not distinct from old.override_mode
      and new.title is not distinct from old.title
      and new.body is not distinct from old.body
      and new.cta_label is not distinct from old.cta_label
      and new.cta_target is not distinct from old.cta_target
      and new.show_metrics is not distinct from old.show_metrics
      and new.show_supporters is not distinct from old.show_supporters
      and new.max_supporter_count is not distinct from old.max_supporter_count then
      return new;
    end if;
    v_action := 'fansub.chapter_credit.override.update';
    v_summary := 'Bolum bazli kapanis kredisi override kaydi guncellendi.';
    v_metadata := jsonb_build_object(
      'fansubId', new.fansub_id,
      'chapterId', new.chapter_id,
      'overrideMode', new.override_mode,
      'ctaTarget', new.cta_target,
      'showMetrics', new.show_metrics,
      'showSupporters', new.show_supporters,
      'maxSupporterCount', new.max_supporter_count
    );
  end if;

  perform public.create_fansub_audit_log_from_trigger(
    v_fansub_id,
    v_action,
    'chapter_credit_override',
    v_chapter_id::text,
    v_summary,
    v_metadata
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_fansub_chapter_credit_overrides_audit on public.fansub_chapter_credit_overrides;
create trigger trg_fansub_chapter_credit_overrides_audit
  after insert or update or delete on public.fansub_chapter_credit_overrides
  for each row
  execute function public.audit_fansub_chapter_credit_override_mutation();

create or replace function public.audit_fansub_pinned_notice_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.slot_index is not distinct from old.slot_index
      and new.title is not distinct from old.title
      and new.body is not distinct from old.body
      and new.action_target is not distinct from old.action_target
      and new.target_entity_id is not distinct from old.target_entity_id
      and new.is_active is not distinct from old.is_active then
      return new;
    end if;
  end if;

  perform public.create_fansub_audit_log_from_trigger(
    new.fansub_id,
    case when tg_op = 'INSERT' then 'fansub.notice.create' else 'fansub.notice.update' end,
    'fansub_notice',
    new.id::text,
    format('Fansub duyuru slotu kaydedildi: %s', new.slot_index),
    jsonb_build_object(
      'fansubId', new.fansub_id,
      'slotIndex', new.slot_index,
      'actionTarget', new.action_target,
      'targetEntityId', new.target_entity_id,
      'isActive', new.is_active
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_fansub_pinned_notices_audit on public.fansub_pinned_notices;
create trigger trg_fansub_pinned_notices_audit
  after insert or update on public.fansub_pinned_notices
  for each row
  execute function public.audit_fansub_pinned_notice_mutation();

create or replace function public.audit_fansub_special_notification_broadcast_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_fansub_audit_log_from_trigger(
    new.fansub_id,
    'fansub.special_notification.send',
    'fansub_special_notification',
    new.id::text,
    'Fansub ozel bildirimi gonderildi.',
    jsonb_build_object(
      'fansubId', new.fansub_id,
      'routeTarget', new.route_target,
      'targetEntityId', new.target_entity_id,
      'recipientCount', coalesce(new.recipient_count, 0)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_fansub_special_notification_broadcasts_audit on public.fansub_special_notification_broadcasts;
create trigger trg_fansub_special_notification_broadcasts_audit
  after insert on public.fansub_special_notification_broadcasts
  for each row
  execute function public.audit_fansub_special_notification_broadcast_mutation();

commit;
