begin;

create table if not exists public.fansub_audit_logs (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text not null default 'system'
    check (char_length(actor_role) between 2 and 40),
  action text not null
    check (char_length(action) between 2 and 120),
  resource_type text not null
    check (char_length(resource_type) between 2 and 80),
  resource_id text,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fansub_audit_logs_fansub_created_idx
  on public.fansub_audit_logs (fansub_id, created_at desc);
create index if not exists fansub_audit_logs_fansub_action_idx
  on public.fansub_audit_logs (fansub_id, action);
create index if not exists fansub_audit_logs_actor_idx
  on public.fansub_audit_logs (actor_user_id, created_at desc);
create index if not exists fansub_audit_logs_metadata_gin_idx
  on public.fansub_audit_logs using gin (metadata);

alter table public.fansub_audit_logs enable row level security;

drop policy if exists fansub_audit_logs_select_rule on public.fansub_audit_logs;
create policy fansub_audit_logs_select_rule
  on public.fansub_audit_logs
  for select
  using (
    public.is_admin()
    or public.is_fansub_staff(fansub_id)
    or public.is_fansub_admin(fansub_id)
  );

grant select on public.fansub_audit_logs to authenticated;

create or replace function public.create_fansub_audit_log(
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
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not exists (
    select 1
    from public.fansubs f
    where f.id = p_fansub_id
  ) then
    raise exception 'Fansub bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id) or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu islem icin fansub yonetim yetkisi gerekir.';
  end if;

  if public.is_admin() then
    v_actor_role := 'site_admin';
  else
    select fm.role
    into v_membership_role
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and fm.user_id = v_actor_id
    limit 1;

    v_actor_role := case
      when v_membership_role = 'admin' then 'fansub_admin'
      when v_membership_role = 'moderator' then 'fansub_moderator'
      else 'fansub_staff'
    end;
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
    v_actor_role,
    trim(coalesce(p_action, '')),
    trim(coalesce(p_resource_type, '')),
    nullif(trim(coalesce(p_resource_id, '')), ''),
    left(coalesce(trim(p_summary), ''), 500),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.create_fansub_audit_log(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.create_fansub_audit_log(uuid, text, text, text, text, jsonb) to authenticated;

create or replace function public.upsert_fansub_profile(
  p_fansub_id uuid default null,
  p_name text default null,
  p_slug text default null,
  p_description text default null,
  p_discord_invite_url text default null,
  p_avatar_url text default null,
  p_primary_color text default null,
  p_secondary_color text default null,
  p_active_name_style jsonb default null,
  p_custom_background_asset_url text default null,
  p_active_background_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_is_insert boolean := p_fansub_id is null;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_discord_invite_url text := nullif(trim(coalesce(p_discord_invite_url, '')), '');
  v_avatar_url text := nullif(trim(coalesce(p_avatar_url, '')), '');
  v_primary_color text := nullif(trim(coalesce(p_primary_color, '')), '');
  v_secondary_color text := nullif(trim(coalesce(p_secondary_color, '')), '');
  v_row public.fansubs%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if v_is_insert then
    if not public.is_admin() then
      raise exception 'Yeni fansub kaydi sadece site admini tarafindan acilabilir.';
    end if;
  elsif not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansub profili icin guncelleme yetkiniz yok.';
  end if;

  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 32 then
    raise exception 'Fansub adi 3 ile 32 karakter arasinda olmali.';
  end if;

  if v_slug = '' then
    raise exception 'Fansub slug bos olamaz.';
  end if;

  if char_length(v_slug) < 3 or char_length(v_slug) > 40 then
    raise exception 'Fansub slug 3 ile 40 karakter arasinda olmali.';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Fansub slug yalnizca kucuk harf, rakam ve tire icerebilir.';
  end if;

  if v_slug = any (array['yonet', 'manga', 'bolum', 'ekle', 'tier']) then
    raise exception 'Bu slug ayrilmis rota tarafindan kullaniliyor.';
  end if;

  if v_description is not null and char_length(v_description) > 150 then
    raise exception 'Fansub aciklamasi en fazla 150 karakter olabilir.';
  end if;

  if v_discord_invite_url is not null and v_discord_invite_url !~* '^https?://' then
    raise exception 'Discord davet baglantisi gecerli bir URL olmali.';
  end if;

  if v_primary_color is not null and v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Ana renk hex formatinda olmali.';
  end if;

  if v_secondary_color is not null and v_secondary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Ikinci renk hex formatinda olmali.';
  end if;

  if p_active_name_style is not null and jsonb_typeof(p_active_name_style) <> 'object' then
    raise exception 'active_name_style object olmali.';
  end if;

  if p_custom_background_asset_url is not null and p_active_background_id is not null then
    raise exception 'Statik yukleme ve envanter arka plani ayni anda aktif olamaz.';
  end if;

  if v_is_insert then
    insert into public.fansubs (
      name,
      slug,
      description,
      discord_invite_url,
      avatar_url,
      primary_color,
      secondary_color,
      active_name_style,
      custom_background_asset_url,
      active_background_id
    )
    values (
      v_name,
      v_slug,
      v_description,
      v_discord_invite_url,
      v_avatar_url,
      v_primary_color,
      v_secondary_color,
      p_active_name_style,
      p_custom_background_asset_url,
      p_active_background_id
    )
    returning *
    into v_row;
  else
    select *
    into v_row
    from public.fansubs f
    where f.id = p_fansub_id
    for update;

    if not found then
      raise exception 'Fansub bulunamadi.';
    end if;

    update public.fansubs f
    set
      name = v_name,
      slug = v_slug,
      description = v_description,
      discord_invite_url = v_discord_invite_url,
      avatar_url = v_avatar_url,
      primary_color = v_primary_color,
      secondary_color = v_secondary_color,
      active_name_style = p_active_name_style,
      custom_background_asset_url = p_custom_background_asset_url,
      active_background_id = p_active_background_id,
      updated_at = now()
    where f.id = p_fansub_id
    returning *
    into v_row;
  end if;

  perform public.create_fansub_audit_log(
    v_row.id,
    'fansub.profile.upsert',
    'fansub',
    v_row.id::text,
    format('%s fansub profili merkezi RPC uzerinden kaydedildi.', v_row.name),
    jsonb_build_object(
      'fansubId', v_row.id,
      'slug', v_row.slug,
      'isInsert', v_is_insert
    )
  );

  if public.is_admin() then
    begin
      perform public.create_admin_audit_log(
        'fansub.profile.upsert',
        'fansub',
        v_row.id::text,
        format('%s fansub profili merkezi RPC uzerinden kaydedildi.', v_row.name),
        jsonb_build_object(
          'fansubId', v_row.id,
          'slug', v_row.slug,
          'isInsert', v_is_insert
        )
      );
    exception
      when others then
        null;
    end;
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_fansub_member_role(
  p_fansub_id uuid,
  p_member_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_current_role text;
  v_new_role text := lower(trim(coalesce(p_role, '')));
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null or p_member_user_id is null then
    raise exception 'Fansub ve uye bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu islem icin fansub admin yetkisi gerekli.';
  end if;

  if v_new_role not in ('member', 'moderator') then
    raise exception 'Bu akis yalnizca uye ve moderator rolunu destekler.';
  end if;

  if not exists (
    select 1
    from public.fansubs f
    where f.id = p_fansub_id
      and f.is_active = true
  ) then
    raise exception 'Fansub bulunamadi veya pasif durumda.';
  end if;

  select fm.role
  into v_current_role
  from public.fansub_members fm
  where fm.fansub_id = p_fansub_id
    and fm.user_id = p_member_user_id
  for update;

  if not found then
    raise exception 'Bu kullanici fansubun aktif uyesi degil.';
  end if;

  if v_current_role = 'admin' then
    raise exception 'Admin rolu tablo ici akistan guncellenemez. Devir akisni kullanin.';
  end if;

  update public.fansub_members fm
  set role = v_new_role
  where fm.fansub_id = p_fansub_id
    and fm.user_id = p_member_user_id;

  perform public.create_fansub_audit_log(
    p_fansub_id,
    'fansub.member.role.update',
    'fansub_member',
    p_fansub_id::text || ':' || p_member_user_id::text,
    format('Fansub uye rolu %s -> %s guncellendi.', v_current_role, v_new_role),
    jsonb_build_object(
      'fansubId', p_fansub_id,
      'memberUserId', p_member_user_id,
      'previousRole', v_current_role,
      'newRole', v_new_role
    )
  );

  if public.is_admin() then
    begin
      perform public.create_admin_audit_log(
        'fansub.member.role.update',
        'fansub_member',
        p_fansub_id::text || ':' || p_member_user_id::text,
        format('Fansub uye rolu %s -> %s guncellendi.', v_current_role, v_new_role),
        jsonb_build_object(
          'fansubId', p_fansub_id,
          'memberUserId', p_member_user_id,
          'previousRole', v_current_role,
          'newRole', v_new_role
        )
      );
    exception
      when others then
        null;
    end;
  end if;

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'member_user_id', p_member_user_id,
    'previous_role', v_current_role,
    'role', v_new_role
  );
end;
$$;

create or replace function public.remove_fansub_member(
  p_fansub_id uuid,
  p_member_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_current_role text;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null or p_member_user_id is null then
    raise exception 'Fansub ve uye bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu islem icin fansub admin yetkisi gerekli.';
  end if;

  if p_member_user_id = v_actor_id then
    raise exception 'Kendi uyeliginiz icin ayrilma akisni kullanin.';
  end if;

  select fm.role
  into v_current_role
  from public.fansub_members fm
  where fm.fansub_id = p_fansub_id
    and fm.user_id = p_member_user_id
  for update;

  if not found then
    raise exception 'Bu kullanici fansubun aktif uyesi degil.';
  end if;

  if v_current_role = 'admin' then
    raise exception 'Admin uyeligi tablo ici kaldirilamaz. Devir akisni kullanin.';
  end if;

  perform set_config('app.membership_exit_reason', 'removed', true);
  perform set_config('app.membership_ended_by', v_actor_id::text, true);

  delete from public.fansub_members fm
  where fm.fansub_id = p_fansub_id
    and fm.user_id = p_member_user_id;

  perform public.create_fansub_audit_log(
    p_fansub_id,
    'fansub.member.remove',
    'fansub_member',
    p_fansub_id::text || ':' || p_member_user_id::text,
    'Fansub uyeligi merkezi RPC uzerinden kaldirildi.',
    jsonb_build_object(
      'fansubId', p_fansub_id,
      'memberUserId', p_member_user_id,
      'previousRole', v_current_role
    )
  );

  if public.is_admin() then
    begin
      perform public.create_admin_audit_log(
        'fansub.member.remove',
        'fansub_member',
        p_fansub_id::text || ':' || p_member_user_id::text,
        'Fansub uyeligi merkezi RPC uzerinden kaldirildi.',
        jsonb_build_object(
          'fansubId', p_fansub_id,
          'memberUserId', p_member_user_id,
          'previousRole', v_current_role
        )
      );
    exception
      when others then
        null;
    end;
  end if;

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'member_user_id', p_member_user_id,
    'previous_role', v_current_role
  );
end;
$$;

create or replace function public.remove_fansub_chapter(
  p_chapter_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_fansub_id uuid;
  v_manga_id uuid;
  v_chapter_number numeric;
  v_chapter_title text;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_chapter_id is null then
    raise exception 'Bolum bilgisi zorunludur.';
  end if;

  select c.fansub_id, c.manga_id, c.chapter_number, c.title
  into v_fansub_id, v_manga_id, v_chapter_number, v_chapter_title
  from public.chapters c
  where c.id = p_chapter_id
  for update;

  if not found then
    raise exception 'Bolum bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(v_fansub_id)) then
    raise exception 'Bu bolumu silme yetkiniz yok.';
  end if;

  delete from public.chapters c
  where c.id = p_chapter_id;

  update public.mangas m
  set updated_at = now()
  where m.id = v_manga_id;

  perform public.create_fansub_audit_log(
    v_fansub_id,
    'fansub.chapter.remove',
    'chapter',
    p_chapter_id::text,
    format('Fansub bolumu silindi: %s', coalesce(v_chapter_title, v_chapter_number::text)),
    jsonb_build_object(
      'fansubId', v_fansub_id,
      'mangaId', v_manga_id,
      'chapterNumber', v_chapter_number
    )
  );

  if public.is_admin() then
    begin
      perform public.create_admin_audit_log(
        'fansub.chapter.remove',
        'chapter',
        p_chapter_id::text,
        format('Fansub bolumu silindi: %s', coalesce(v_chapter_title, v_chapter_number::text)),
        jsonb_build_object(
          'fansubId', v_fansub_id,
          'mangaId', v_manga_id,
          'chapterNumber', v_chapter_number
        )
      );
    exception
      when others then
        null;
    end;
  end if;

  return jsonb_build_object(
    'success', true,
    'chapter_id', p_chapter_id,
    'fansub_id', v_fansub_id,
    'manga_id', v_manga_id
  );
end;
$$;

revoke all on function public.upsert_fansub_profile(uuid, text, text, text, text, text, text, text, jsonb, text, uuid) from public;
revoke all on function public.set_fansub_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_fansub_member(uuid, uuid) from public;
revoke all on function public.remove_fansub_chapter(uuid) from public;

grant execute on function public.upsert_fansub_profile(uuid, text, text, text, text, text, text, text, jsonb, text, uuid) to authenticated;
grant execute on function public.set_fansub_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_fansub_member(uuid, uuid) to authenticated;
grant execute on function public.remove_fansub_chapter(uuid) to authenticated;

create or replace function public.get_fansub_manage_analytics_summary(
  p_fansub_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_payload jsonb;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not exists (
    select 1
    from public.fansubs
    where id = p_fansub_id
  ) then
    raise exception 'Fansub bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id) or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansubun istatistiklerini gorme yetkiniz yok.';
  end if;

  with fansub_base as (
    select
      f.id,
      coalesce(f.follower_count, 0)::bigint as follower_count
    from public.fansubs f
    where f.id = p_fansub_id
  ),
  manga_stats as (
    select
      count(*)::bigint as total_count,
      count(*) filter (where m.is_approved = true)::bigint as approved_count,
      count(*) filter (where m.is_approved = false)::bigint as pending_count,
      count(*) filter (where m.is_active = true)::bigint as active_count,
      count(*) filter (where m.is_active = false)::bigint as inactive_count,
      coalesce(sum(coalesce(m.total_views, 0)), 0)::bigint as total_views
    from public.mangas m
    where m.fansub_id = p_fansub_id
  ),
  chapter_stats as (
    select
      count(*)::bigint as total_count,
      count(*) filter (where c.is_approved = true)::bigint as approved_count,
      count(*) filter (where c.is_approved = false)::bigint as pending_count,
      count(*) filter (
        where c.is_approved = true
          and coalesce(c.publish_at, c.created_at, now()) > now()
      )::bigint as scheduled_count,
      count(*) filter (
        where coalesce(c.publish_at, c.created_at, now()) >= now() - interval '7 days'
      )::bigint as created_7d,
      count(*) filter (
        where coalesce(c.publish_at, c.created_at, now()) >= now() - interval '30 days'
      )::bigint as created_30d
    from public.chapters c
    where c.fansub_id = p_fansub_id
  ),
  post_stats as (
    select
      count(*) filter (where cp.is_active = true)::bigint as total_count,
      count(*) filter (where cp.is_active = true and cp.status = 'approved')::bigint as approved_count,
      count(*) filter (where cp.is_active = true and cp.status = 'pending')::bigint as pending_count,
      count(*) filter (where cp.is_active = true and cp.status = 'rejected')::bigint as rejected_count,
      count(*) filter (
        where cp.is_active = true
          and cp.created_at >= now() - interval '7 days'
      )::bigint as created_7d,
      count(*) filter (
        where cp.is_active = true
          and cp.created_at >= now() - interval '30 days'
      )::bigint as created_30d
    from public.community_posts cp
    where cp.related_fansub_id = p_fansub_id
  ),
  follow_stats as (
    select
      count(*) filter (where ff.created_at >= now() - interval '7 days')::bigint as new_7d,
      count(*) filter (where ff.created_at >= now() - interval '30 days')::bigint as new_30d
    from public.fansub_follows ff
    where ff.fansub_id = p_fansub_id
  ),
  donation_stats as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(greatest(ft.amount, 0)), 0)::bigint as total_amount,
      count(*) filter (where ft.created_at >= now() - interval '7 days')::bigint as count_7d,
      count(*) filter (where ft.created_at >= now() - interval '30 days')::bigint as count_30d,
      coalesce(sum(greatest(ft.amount, 0)) filter (
        where ft.created_at >= now() - interval '7 days'
      ), 0)::bigint as amount_7d,
      coalesce(sum(greatest(ft.amount, 0)) filter (
        where ft.created_at >= now() - interval '30 days'
      ), 0)::bigint as amount_30d,
      max(ft.created_at) as last_donation_at
    from public.fansub_transactions ft
    where ft.fansub_id = p_fansub_id
      and ft.type = 'donation'
  ),
  top_manga_rows as (
    select
      m.id,
      m.title,
      m.slug,
      coalesce(m.total_views, 0)::bigint as total_views,
      (
        select count(*)::bigint
        from public.manga_follows mf
        where mf.manga_id = m.id
      ) as follower_count,
      m.last_chapter_number,
      m.is_approved,
      m.is_active,
      m.updated_at
    from public.mangas m
    where m.fansub_id = p_fansub_id
    order by coalesce(m.total_views, 0) desc, m.updated_at desc
    limit 5
  ),
  top_mangas as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', tmr.id,
          'title', tmr.title,
          'slug', tmr.slug,
          'totalViews', tmr.total_views,
          'followerCount', coalesce(tmr.follower_count, 0),
          'lastChapterNumber', tmr.last_chapter_number,
          'isApproved', tmr.is_approved,
          'isActive', tmr.is_active
        )
        order by tmr.total_views desc, tmr.updated_at desc
      ),
      '[]'::jsonb
    ) as items
    from top_manga_rows tmr
  ),
  recent_activity_rows as (
    select
      fal.id,
      fal.action,
      fal.resource_type,
      fal.resource_id,
      fal.summary,
      fal.metadata,
      fal.created_at,
      fal.actor_role,
      u.id as actor_id,
      u.username as actor_username,
      u.avatar_url as actor_avatar_url
    from public.fansub_audit_logs fal
    left join public.users u
      on u.id = fal.actor_user_id
    where fal.fansub_id = p_fansub_id
    order by fal.created_at desc
    limit 8
  ),
  recent_activity as (
    -- Critical actions travel with the same payload in the stats load;
    -- this prevents an empty tracking panel from a separate fetch delay.
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rar.id,
          'action', rar.action,
          'resourceType', rar.resource_type,
          'resourceId', rar.resource_id,
          'summary', rar.summary,
          'metadata', rar.metadata,
          'createdAt', rar.created_at,
          'actor', jsonb_build_object(
            'id', rar.actor_id,
            'username', rar.actor_username,
            'avatarUrl', rar.actor_avatar_url,
            'role', rar.actor_role
          )
        )
        order by rar.created_at desc
      ),
      '[]'::jsonb
    ) as items
    from recent_activity_rows rar
  )
  select jsonb_build_object(
    'overview', jsonb_build_object(
      'followerCount', fb.follower_count,
      'totalViews', ms.total_views,
      'totalDonationAmount', ds.total_amount,
      'totalDonationCount', ds.total_count,
      'totalMangaCount', ms.total_count,
      'totalChapterCount', cs.total_count,
      'totalPostCount', ps.total_count,
      'lastDonationAt', ds.last_donation_at
    ),
    'momentum', jsonb_build_object(
      'newFollowers7d', fs.new_7d,
      'newFollowers30d', fs.new_30d,
      'newChapters7d', cs.created_7d,
      'newChapters30d', cs.created_30d,
      'newPosts7d', ps.created_7d,
      'newPosts30d', ps.created_30d,
      'donationCount7d', ds.count_7d,
      'donationCount30d', ds.count_30d,
      'donationAmount7d', ds.amount_7d,
      'donationAmount30d', ds.amount_30d
    ),
    'statuses', jsonb_build_object(
      'mangas', jsonb_build_object(
        'approved', ms.approved_count,
        'pending', ms.pending_count,
        'active', ms.active_count,
        'inactive', ms.inactive_count
      ),
      'chapters', jsonb_build_object(
        'approved', cs.approved_count,
        'pending', cs.pending_count,
        'scheduled', cs.scheduled_count
      ),
      'posts', jsonb_build_object(
        'approved', ps.approved_count,
        'pending', ps.pending_count,
        'rejected', ps.rejected_count
      )
    ),
    'topMangas', tm.items,
    'recentActivity', ra.items
  )
  into v_payload
  from fansub_base fb
  cross join manga_stats ms
  cross join chapter_stats cs
  cross join post_stats ps
  cross join follow_stats fs
  cross join donation_stats ds
  cross join top_mangas tm
  cross join recent_activity ra;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'overview', jsonb_build_object(
        'followerCount', 0,
        'totalViews', 0,
        'totalDonationAmount', 0,
        'totalDonationCount', 0,
        'totalMangaCount', 0,
        'totalChapterCount', 0,
        'totalPostCount', 0,
        'lastDonationAt', null
      ),
      'momentum', jsonb_build_object(
        'newFollowers7d', 0,
        'newFollowers30d', 0,
        'newChapters7d', 0,
        'newChapters30d', 0,
        'newPosts7d', 0,
        'newPosts30d', 0,
        'donationCount7d', 0,
        'donationCount30d', 0,
        'donationAmount7d', 0,
        'donationAmount30d', 0
      ),
      'statuses', jsonb_build_object(
        'mangas', jsonb_build_object('approved', 0, 'pending', 0, 'active', 0, 'inactive', 0),
        'chapters', jsonb_build_object('approved', 0, 'pending', 0, 'scheduled', 0),
        'posts', jsonb_build_object('approved', 0, 'pending', 0, 'rejected', 0)
      ),
      'topMangas', '[]'::jsonb,
      'recentActivity', '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.get_fansub_manage_analytics_summary(uuid) to authenticated;

commit;
