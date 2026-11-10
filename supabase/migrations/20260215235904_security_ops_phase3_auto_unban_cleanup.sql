-- ============================================
-- BSG Manga | Security Ops Faz-3 (Auto Unban Cleanup)
-- Date: 2026-02-15
-- ============================================

begin;

-- --------------------------------------------
-- Self: suresi dolan bani giriste otomatik temizle
-- --------------------------------------------
create or replace function public.release_my_expired_ban()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_user public.users%rowtype;
  v_has_security_events boolean := to_regclass('public.security_events') is not null;
begin
  if v_auth_user_id is null then
    return false;
  end if;

  select *
  into v_user
  from public.users u
  where u.auth_user_id = v_auth_user_id
  limit 1
  for update;

  if not found then
    return false;
  end if;

  if not (
    coalesce(v_user.is_banned, false) = true
    and v_user.ban_until is not null
    and v_user.ban_until <= now()
  ) then
    return false;
  end if;

  update public.users
  set
    is_banned = false,
    ban_reason = null,
    ban_until = null,
    banned_by = null,
    banned_at = null,
    updated_at = now()
  where id = v_user.id;

  if v_has_security_events then
    insert into public.security_events (
      source,
      event_type,
      severity,
      message,
      metadata,
      actor_user_id,
      target_user_id
    )
    values (
      'system',
      'self_auto_unban_expired',
      'low',
      'Suresi dolan ban, kullanici girisinde otomatik temizlendi.',
      jsonb_build_object(
        'previousBanUntil', v_user.ban_until,
        'userId', v_user.id
      ),
      null,
      v_user.id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.release_my_expired_ban() from public;
grant execute on function public.release_my_expired_ban() to authenticated;

-- --------------------------------------------
-- Admin: toplu suresi dolan ban temizleme
-- --------------------------------------------
create or replace function public.release_expired_bans(
  p_limit int default 500
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 500), 5000));
  v_cleaned int := 0;
  v_has_security_events boolean := to_regclass('public.security_events') is not null;
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  for v_row in
    select
      u.id,
      u.username,
      u.ban_until
    from public.users u
    where coalesce(u.is_banned, false) = true
      and u.ban_until is not null
      and u.ban_until <= now()
    order by u.ban_until asc
    limit v_limit
    for update of u skip locked
  loop
    update public.users
    set
      is_banned = false,
      ban_reason = null,
      ban_until = null,
      banned_by = null,
      banned_at = null,
      updated_at = now()
    where id = v_row.id;

    v_cleaned := v_cleaned + 1;

    if v_has_security_events then
      insert into public.security_events (
        source,
        event_type,
        severity,
        message,
        metadata,
        actor_user_id,
        target_user_id
      )
      values (
        'system',
        'auto_unban_expired',
        'medium',
        format('Suresi dolan ban otomatik temizlendi: %s', coalesce(v_row.username, v_row.id::text)),
        jsonb_build_object(
          'previousBanUntil', v_row.ban_until
        ),
        null,
        v_row.id
      );
    end if;
  end loop;

  begin
    perform public.create_admin_audit_log(
      'security.ban.cleanup',
      'user',
      null,
      format('Suresi dolan ban temizligi tamamlandi (%s kayit).', v_cleaned),
      jsonb_build_object(
        'cleanedCount', v_cleaned,
        'limit', v_limit
      )
    );
  exception
    when others then
      null;
  end;

  return v_cleaned;
end;
$$;

revoke all on function public.release_expired_bans(int) from public;
grant execute on function public.release_expired_bans(int) to authenticated;

commit;
