begin;

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

commit;
