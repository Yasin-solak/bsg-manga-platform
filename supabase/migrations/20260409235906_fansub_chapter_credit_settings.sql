begin;

create table if not exists public.fansub_chapter_credit_settings (
  fansub_id uuid primary key references public.fansubs (id) on delete cascade,
  is_enabled boolean not null default false,
  title text,
  body text,
  cta_label text,
  cta_target text,
  show_metrics boolean not null default true,
  show_supporters boolean not null default true,
  max_supporter_count smallint not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fansub_chapter_credit_settings_title_check
    check (title is null or char_length(btrim(title)) between 1 and 96),
  constraint fansub_chapter_credit_settings_body_check
    check (body is null or char_length(btrim(body)) between 1 and 180),
  constraint fansub_chapter_credit_settings_cta_label_check
    check (cta_label is null or char_length(btrim(cta_label)) between 1 and 32),
  constraint fansub_chapter_credit_settings_cta_target_check
    check (cta_target is null or cta_target in ('fansub', 'takviye', 'mangalar')),
  constraint fansub_chapter_credit_settings_supporter_count_check
    check (max_supporter_count between 1 and 6)
);

create table if not exists public.fansub_chapter_credit_overrides (
  chapter_id uuid primary key references public.chapters (id) on delete cascade,
  fansub_id uuid not null references public.fansubs (id) on delete cascade,
  override_mode text not null,
  title text,
  body text,
  cta_label text,
  cta_target text,
  show_metrics boolean,
  show_supporters boolean,
  max_supporter_count smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fansub_chapter_credit_overrides_mode_check
    check (override_mode in ('disabled', 'custom')),
  constraint fansub_chapter_credit_overrides_title_check
    check (title is null or char_length(btrim(title)) between 1 and 96),
  constraint fansub_chapter_credit_overrides_body_check
    check (body is null or char_length(btrim(body)) between 1 and 180),
  constraint fansub_chapter_credit_overrides_cta_label_check
    check (cta_label is null or char_length(btrim(cta_label)) between 1 and 32),
  constraint fansub_chapter_credit_overrides_cta_target_check
    check (cta_target is null or cta_target in ('fansub', 'takviye', 'mangalar')),
  constraint fansub_chapter_credit_overrides_supporter_count_check
    check (max_supporter_count is null or max_supporter_count between 1 and 6)
);

create index if not exists fansub_chapter_credit_overrides_fansub_idx
  on public.fansub_chapter_credit_overrides (fansub_id, updated_at desc);

alter table public.fansub_chapter_credit_settings enable row level security;
alter table public.fansub_chapter_credit_overrides enable row level security;

drop policy if exists fansub_chapter_credit_settings_admin_write on public.fansub_chapter_credit_settings;
create policy fansub_chapter_credit_settings_admin_write
  on public.fansub_chapter_credit_settings
  for all
  using (public.is_admin() or public.is_fansub_staff(fansub_id))
  with check (public.is_admin() or public.is_fansub_staff(fansub_id));

drop policy if exists fansub_chapter_credit_overrides_admin_write on public.fansub_chapter_credit_overrides;
create policy fansub_chapter_credit_overrides_admin_write
  on public.fansub_chapter_credit_overrides
  for all
  using (public.is_admin() or public.is_fansub_staff(fansub_id))
  with check (public.is_admin() or public.is_fansub_staff(fansub_id));

create or replace function public.normalize_fansub_chapter_credit_cta_target(
  p_target text
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when nullif(lower(btrim(coalesce(p_target, ''))), '') in ('fansub', 'takviye', 'mangalar')
      then lower(btrim(p_target))
    else null
  end;
$$;

create or replace function public.get_fansub_manage_chapter_credit_settings(
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

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun kapanis kredisi ayarlarini gorme yetkiniz yok.';
  end if;

  select jsonb_build_object(
    'fansubId', p_fansub_id,
    'isEnabled', coalesce(settings.is_enabled, false),
    'title', settings.title,
    'body', settings.body,
    'ctaLabel', settings.cta_label,
    'ctaTarget', settings.cta_target,
    'showMetrics', coalesce(settings.show_metrics, true),
    'showSupporters', coalesce(settings.show_supporters, true),
    'maxSupporterCount', coalesce(settings.max_supporter_count, 2),
    'createdAt', settings.created_at,
    'updatedAt', settings.updated_at
  )
  into v_payload
  from public.fansubs fansub
  left join public.fansub_chapter_credit_settings settings
    on settings.fansub_id = fansub.id
  where fansub.id = p_fansub_id;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'fansubId', p_fansub_id,
      'isEnabled', false,
      'title', null,
      'body', null,
      'ctaLabel', null,
      'ctaTarget', null,
      'showMetrics', true,
      'showSupporters', true,
      'maxSupporterCount', 2,
      'createdAt', null,
      'updatedAt', null
    )
  );
end;
$$;

create or replace function public.upsert_fansub_chapter_credit_settings(
  p_fansub_id uuid,
  p_is_enabled boolean,
  p_title text default null,
  p_body text default null,
  p_cta_label text default null,
  p_cta_target text default null,
  p_show_metrics boolean default true,
  p_show_supporters boolean default true,
  p_max_supporter_count smallint default 2
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_cta_label text := nullif(btrim(coalesce(p_cta_label, '')), '');
  v_cta_target text := public.normalize_fansub_chapter_credit_cta_target(p_cta_target);
  v_max_supporter_count smallint := greatest(1, least(coalesce(p_max_supporter_count, 2), 6));
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

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun kapanis kredisi ayarlarini guncelleme yetkiniz yok.';
  end if;

  if not public.fansub_has_boost_capability(p_fansub_id, 'hasChapterEndCredit') then
    raise exception 'Bolum sonu kredisi icin Seviye 2 takviye gerekir.';
  end if;

  if v_cta_label is not null and v_cta_target is null then
    raise exception 'CTA metni girildiginde hedef secilmelidir.';
  end if;

  insert into public.fansub_chapter_credit_settings as settings (
    fansub_id,
    is_enabled,
    title,
    body,
    cta_label,
    cta_target,
    show_metrics,
    show_supporters,
    max_supporter_count
  )
  values (
    p_fansub_id,
    coalesce(p_is_enabled, false),
    v_title,
    v_body,
    v_cta_label,
    v_cta_target,
    coalesce(p_show_metrics, true),
    coalesce(p_show_supporters, true),
    v_max_supporter_count
  )
  on conflict (fansub_id) do update
  set
    is_enabled = excluded.is_enabled,
    title = excluded.title,
    body = excluded.body,
    cta_label = excluded.cta_label,
    cta_target = excluded.cta_target,
    show_metrics = excluded.show_metrics,
    show_supporters = excluded.show_supporters,
    max_supporter_count = excluded.max_supporter_count,
    updated_at = now();

  return public.get_fansub_manage_chapter_credit_settings(p_fansub_id);
end;
$$;

create or replace function public.list_fansub_manage_chapter_credit_overrides(
  p_fansub_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun kapanis kredisi override kayitlarini gorme yetkiniz yok.';
  end if;

  return (
    select jsonb_build_object(
      'items',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'chapterId', chapter.id,
            'fansubId', credit_override.fansub_id,
            'mangaId', manga.id,
            'mangaTitle', manga.title,
            'mangaSlug', manga.slug,
            'chapterNumber', chapter.chapter_number,
            'chapterTitle', chapter.title,
            'publishAt', chapter.publish_at,
            'chapterCreatedAt', chapter.created_at,
            'overrideMode', credit_override.override_mode,
            'title', credit_override.title,
            'body', credit_override.body,
            'ctaLabel', credit_override.cta_label,
            'ctaTarget', credit_override.cta_target,
            'showMetrics', credit_override.show_metrics,
            'showSupporters', credit_override.show_supporters,
            'maxSupporterCount', credit_override.max_supporter_count,
            'createdAt', credit_override.created_at,
            'updatedAt', credit_override.updated_at
          )
          order by coalesce(chapter.publish_at, chapter.created_at) desc, chapter.chapter_number desc
        ),
        '[]'::jsonb
      )
    )
    from public.fansub_chapter_credit_overrides credit_override
    join public.chapters chapter
      on chapter.id = credit_override.chapter_id
    join public.mangas manga
      on manga.id = chapter.manga_id
    where credit_override.fansub_id = p_fansub_id
  );
end;
$$;

create or replace function public.upsert_fansub_chapter_credit_override(
  p_fansub_id uuid,
  p_chapter_id uuid,
  p_override_mode text,
  p_title text default null,
  p_body text default null,
  p_cta_label text default null,
  p_cta_target text default null,
  p_show_metrics boolean default null,
  p_show_supporters boolean default null,
  p_max_supporter_count smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_override_mode text := lower(btrim(coalesce(p_override_mode, 'inherit')));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_cta_label text := nullif(btrim(coalesce(p_cta_label, '')), '');
  v_cta_target text := public.normalize_fansub_chapter_credit_cta_target(p_cta_target);
  v_max_supporter_count smallint;
  v_existing_fansub_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null or p_chapter_id is null then
    raise exception 'Fansub ve bolum bilgisi zorunludur.';
  end if;

  if not exists (
    select 1
    from public.fansubs
    where id = p_fansub_id
  ) then
    raise exception 'Fansub bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun kapanis kredisi override kayitlarini guncelleme yetkiniz yok.';
  end if;

  if not public.fansub_has_boost_capability(p_fansub_id, 'hasChapterEndCredit') then
    raise exception 'Bolum sonu kredisi icin Seviye 2 takviye gerekir.';
  end if;

  select c.fansub_id
  into v_existing_fansub_id
  from public.chapters c
  where c.id = p_chapter_id;

  if v_existing_fansub_id is null then
    raise exception 'Bolum bulunamadi.';
  end if;

  if v_existing_fansub_id <> p_fansub_id then
    raise exception 'Secilen bolum bu fansuba ait degil.';
  end if;

  if v_override_mode not in ('inherit', 'disabled', 'custom') then
    raise exception 'Override modu gecersiz.';
  end if;

  if v_cta_label is not null and v_cta_target is null then
    raise exception 'CTA metni girildiginde hedef secilmelidir.';
  end if;

  if p_max_supporter_count is not null then
    v_max_supporter_count := greatest(1, least(p_max_supporter_count, 6));
  else
    v_max_supporter_count := null;
  end if;

  if v_override_mode = 'inherit' then
    delete from public.fansub_chapter_credit_overrides
    where chapter_id = p_chapter_id
      and fansub_id = p_fansub_id;

    return jsonb_build_object(
      'chapterId', p_chapter_id,
      'fansubId', p_fansub_id,
      'overrideMode', 'inherit'
    );
  end if;

  if v_override_mode = 'custom'
    and v_title is null
    and v_body is null
    and v_cta_label is null
    and v_cta_target is null
    and p_show_metrics is null
    and p_show_supporters is null
    and v_max_supporter_count is null then
    raise exception 'Ozel override icin en az bir alan degistirilmelidir.';
  end if;

  insert into public.fansub_chapter_credit_overrides as credit_override (
    chapter_id,
    fansub_id,
    override_mode,
    title,
    body,
    cta_label,
    cta_target,
    show_metrics,
    show_supporters,
    max_supporter_count
  )
  values (
    p_chapter_id,
    p_fansub_id,
    v_override_mode,
    v_title,
    v_body,
    v_cta_label,
    v_cta_target,
    p_show_metrics,
    p_show_supporters,
    v_max_supporter_count
  )
  on conflict (chapter_id) do update
  set
    fansub_id = excluded.fansub_id,
    override_mode = excluded.override_mode,
    title = excluded.title,
    body = excluded.body,
    cta_label = excluded.cta_label,
    cta_target = excluded.cta_target,
    show_metrics = excluded.show_metrics,
    show_supporters = excluded.show_supporters,
    max_supporter_count = excluded.max_supporter_count,
    updated_at = now();

  return (
    select jsonb_build_object(
      'chapterId', chapter.id,
      'fansubId', credit_override.fansub_id,
      'mangaId', manga.id,
      'mangaTitle', manga.title,
      'mangaSlug', manga.slug,
      'chapterNumber', chapter.chapter_number,
      'chapterTitle', chapter.title,
      'publishAt', chapter.publish_at,
      'chapterCreatedAt', chapter.created_at,
      'overrideMode', credit_override.override_mode,
      'title', credit_override.title,
      'body', credit_override.body,
      'ctaLabel', credit_override.cta_label,
      'ctaTarget', credit_override.cta_target,
      'showMetrics', credit_override.show_metrics,
      'showSupporters', credit_override.show_supporters,
      'maxSupporterCount', credit_override.max_supporter_count,
      'createdAt', credit_override.created_at,
      'updatedAt', credit_override.updated_at
    )
    from public.fansub_chapter_credit_overrides credit_override
    join public.chapters chapter
      on chapter.id = credit_override.chapter_id
    join public.mangas manga
      on manga.id = chapter.manga_id
    where credit_override.chapter_id = p_chapter_id
      and credit_override.fansub_id = p_fansub_id
  );
end;
$$;

create or replace function public.get_effective_public_chapter_credit_config(
  p_fansub_id uuid,
  p_chapter_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.fansub_chapter_credit_settings%rowtype;
  v_override public.fansub_chapter_credit_overrides%rowtype;
  v_chapter record;
  v_manga record;
begin
  if p_fansub_id is null or p_chapter_id is null then
    return null;
  end if;

  if not public.is_feature_enabled('boost.system', false) then
    return null;
  end if;

  if not public.fansub_has_boost_capability(p_fansub_id, 'hasChapterEndCredit') then
    return null;
  end if;

  select
    c.id,
    c.fansub_id,
    c.manga_id,
    c.is_active,
    c.is_approved,
    c.publish_at,
    c.created_at
  into v_chapter
  from public.chapters c
  where c.id = p_chapter_id
    and c.fansub_id = p_fansub_id;

  if v_chapter.id is null then
    return null;
  end if;

  if coalesce(v_chapter.is_active, false) = false or coalesce(v_chapter.is_approved, false) = false then
    return null;
  end if;

  if not public.is_chapter_publicly_unlocked(v_chapter.publish_at) then
    return null;
  end if;

  select
    m.id,
    m.title,
    m.slug,
    m.is_active,
    m.is_approved
  into v_manga
  from public.mangas m
  where m.id = v_chapter.manga_id;

  if v_manga.id is null then
    return null;
  end if;

  if coalesce(v_manga.is_active, false) = false or coalesce(v_manga.is_approved, false) = false then
    return null;
  end if;

  select *
  into v_settings
  from public.fansub_chapter_credit_settings
  where fansub_id = p_fansub_id;

  if coalesce(v_settings.is_enabled, false) = false then
    return null;
  end if;

  select *
  into v_override
  from public.fansub_chapter_credit_overrides
  where chapter_id = p_chapter_id
    and fansub_id = p_fansub_id;

  if v_override.override_mode = 'disabled' then
    return null;
  end if;

  return jsonb_build_object(
    'fansubId', p_fansub_id,
    'chapterId', p_chapter_id,
    'overrideMode', coalesce(v_override.override_mode, 'inherit'),
    'source', case when v_override.override_mode = 'custom' then 'override' else 'default' end,
    'title', case when v_override.override_mode = 'custom' then coalesce(v_override.title, v_settings.title) else v_settings.title end,
    'body', case when v_override.override_mode = 'custom' then coalesce(v_override.body, v_settings.body) else v_settings.body end,
    'ctaLabel', case when v_override.override_mode = 'custom' then coalesce(v_override.cta_label, v_settings.cta_label) else v_settings.cta_label end,
    'ctaTarget', case when v_override.override_mode = 'custom' then coalesce(v_override.cta_target, v_settings.cta_target) else v_settings.cta_target end,
    'showMetrics', case when v_override.override_mode = 'custom' then coalesce(v_override.show_metrics, v_settings.show_metrics, true) else coalesce(v_settings.show_metrics, true) end,
    'showSupporters', case when v_override.override_mode = 'custom' then coalesce(v_override.show_supporters, v_settings.show_supporters, true) else coalesce(v_settings.show_supporters, true) end,
    'maxSupporterCount', greatest(
      1,
      least(
        coalesce(
          case when v_override.override_mode = 'custom' then v_override.max_supporter_count else null end,
          v_settings.max_supporter_count,
          2
        ),
        6
      )
    )
  );
end;
$$;

grant execute on function public.normalize_fansub_chapter_credit_cta_target(text) to anon, authenticated;
grant execute on function public.get_fansub_manage_chapter_credit_settings(uuid) to authenticated;
grant execute on function public.upsert_fansub_chapter_credit_settings(uuid, boolean, text, text, text, text, boolean, boolean, smallint) to authenticated;
grant execute on function public.list_fansub_manage_chapter_credit_overrides(uuid) to authenticated;
grant execute on function public.upsert_fansub_chapter_credit_override(uuid, uuid, text, text, text, text, text, boolean, boolean, smallint) to authenticated;
grant execute on function public.get_effective_public_chapter_credit_config(uuid, uuid) to anon, authenticated;

commit;
