-- Community mention extension:
-- - mentioned_user_ids and mentioned_manga_ids fields on community_posts
-- - mentioned user + manga parameters for the fansub post RPC

alter table public.community_posts
  add column if not exists mentioned_user_ids uuid[],
  add column if not exists mentioned_manga_ids uuid[];

update public.community_posts
set mentioned_user_ids = '{}'::uuid[]
where mentioned_user_ids is null;

update public.community_posts
set mentioned_manga_ids = '{}'::uuid[]
where mentioned_manga_ids is null;

alter table public.community_posts
  alter column mentioned_user_ids set default '{}'::uuid[],
  alter column mentioned_user_ids set not null,
  alter column mentioned_manga_ids set default '{}'::uuid[],
  alter column mentioned_manga_ids set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_posts_mentioned_user_ids_count_check'
  ) then
    alter table public.community_posts
      add constraint community_posts_mentioned_user_ids_count_check
      check (cardinality(mentioned_user_ids) <= 20);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_posts_mentioned_manga_ids_count_check'
  ) then
    alter table public.community_posts
      add constraint community_posts_mentioned_manga_ids_count_check
      check (cardinality(mentioned_manga_ids) <= 10);
  end if;
end;
$$;

create index if not exists community_posts_mentioned_user_ids_gin
  on public.community_posts using gin (mentioned_user_ids);

create index if not exists community_posts_mentioned_manga_ids_gin
  on public.community_posts using gin (mentioned_manga_ids);

drop function if exists public.create_fansub_community_post(uuid, text, text, text, uuid, integer, uuid[], text[]);
drop function if exists public.create_fansub_community_post(uuid, text, text, text, uuid, integer, uuid[], text[], uuid[]);
drop function if exists public.create_fansub_community_post(uuid, text, text, text, uuid, integer, uuid[], text[], uuid[], uuid[]);

create or replace function public.create_fansub_community_post(
  p_fansub_id uuid,
  p_title text,
  p_body text,
  p_category text default null,
  p_related_manga_id uuid default null,
  p_chapter_number integer default null,
  p_related_fansub_ids uuid[] default null,
  p_tags text[] default null,
  p_mentioned_user_ids uuid[] default null,
  p_mentioned_manga_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_title text;
  v_body text;
  v_category text;
  v_post_id uuid;
  v_related_fansub_ids uuid[];
  v_tags text[];
  v_mentioned_user_ids uuid[];
  v_mentioned_manga_ids uuid[];
  v_related_fansub_count integer;
  v_active_fansub_count integer;
  v_mentioned_user_count integer;
  v_active_user_count integer;
  v_mentioned_manga_count integer;
  v_active_manga_count integer;
  v_manga_exists boolean;
  v_chapter_exists boolean;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansub adina post olusturma yetkiniz yok.';
  end if;

  v_title := nullif(trim(coalesce(p_title, '')), '');
  v_body := nullif(trim(coalesce(p_body, '')), '');
  v_category := nullif(trim(coalesce(p_category, '')), '');

  if v_title is null or char_length(v_title) < 2 then
    raise exception 'Post basligi en az 2 karakter olmali.';
  end if;
  if char_length(v_title) > 160 then
    raise exception 'Post basligi en fazla 160 karakter olabilir.';
  end if;

  if v_body is null or char_length(v_body) < 2 then
    raise exception 'Post icerigi en az 2 karakter olmali.';
  end if;
  if char_length(v_body) > 5000 then
    raise exception 'Post icerigi en fazla 5000 karakter olabilir.';
  end if;

  if v_category is not null and lower(v_category) = 'duyuru' then
    raise exception 'Duyuru kategorisi topluluk postlari icin kapatilmis durumda.';
  end if;

  if p_related_manga_id is not null then
    select exists (
      select 1
      from public.mangas m
      where m.id = p_related_manga_id
        and m.is_active = true
        and m.is_approved = true
    )
    into v_manga_exists;

    if not coalesce(v_manga_exists, false) then
      raise exception 'Secilen manga bulunamadi veya aktif degil.';
    end if;
  end if;

  if p_related_manga_id is null and p_chapter_number is not null then
    raise exception 'Bolum secimi icin once manga secmelisiniz.';
  end if;

  if p_chapter_number is not null then
    if p_chapter_number < 1 or p_chapter_number > 5000 then
      raise exception 'Bolum numarasi 1 ile 5000 arasinda olmalidir.';
    end if;

    select exists (
      select 1
      from public.chapters c
      where c.manga_id = p_related_manga_id
        and c.is_active = true
        and c.is_approved = true
        and c.chapter_number = p_chapter_number::numeric
    )
    into v_chapter_exists;

    if not coalesce(v_chapter_exists, false) then
      raise exception 'Secilen manga icin belirtilen bolum bulunamadi.';
    end if;
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
  into v_related_fansub_ids
  from unnest(coalesce(p_related_fansub_ids, '{}'::uuid[])) as x
  where x is not null
    and x <> p_fansub_id;

  v_related_fansub_count := coalesce(cardinality(v_related_fansub_ids), 0);
  if v_related_fansub_count > 5 then
    raise exception 'En fazla 5 ilgili fansub secilebilir.';
  end if;

  if v_related_fansub_count > 0 then
    select count(*)
    into v_active_fansub_count
    from public.fansubs f
    where f.id = any(v_related_fansub_ids)
      and f.is_active = true;

    if v_active_fansub_count <> v_related_fansub_count then
      raise exception 'Secilen ilgili fansublardan biri gecerli degil.';
    end if;
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
  into v_mentioned_user_ids
  from unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) as x
  where x is not null
    and x <> v_actor_id;

  v_mentioned_user_count := coalesce(cardinality(v_mentioned_user_ids), 0);
  if v_mentioned_user_count > 20 then
    raise exception 'En fazla 20 kullanici etiketlenebilir.';
  end if;

  if v_mentioned_user_count > 0 then
    select count(*)
    into v_active_user_count
    from public.users u
    where u.id = any(v_mentioned_user_ids)
      and u.is_active = true;

    if v_active_user_count <> v_mentioned_user_count then
      raise exception 'Etiketlenen kullanicilardan biri gecerli degil.';
    end if;
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
  into v_mentioned_manga_ids
  from unnest(coalesce(p_mentioned_manga_ids, '{}'::uuid[])) as x
  where x is not null;

  v_mentioned_manga_count := coalesce(cardinality(v_mentioned_manga_ids), 0);
  if v_mentioned_manga_count > 10 then
    raise exception 'En fazla 10 manga mention edilebilir.';
  end if;

  if v_mentioned_manga_count > 0 then
    select count(*)
    into v_active_manga_count
    from public.mangas m
    where m.id = any(v_mentioned_manga_ids)
      and m.is_active = true
      and m.is_approved = true;

    if v_active_manga_count <> v_mentioned_manga_count then
      raise exception 'Mention edilen mangalardan biri gecerli degil.';
    end if;
  end if;

  select coalesce(array_agg(distinct normalized_tag), '{}'::text[])
  into v_tags
  from (
    select lower(regexp_replace(btrim(raw_tag), '\s+', ' ', 'g')) as normalized_tag
    from unnest(coalesce(p_tags, '{}'::text[])) as raw_tag
  ) t
  where normalized_tag <> ''
    and char_length(normalized_tag) between 2 and 30;

  if coalesce(cardinality(v_tags), 0) > 8 then
    raise exception 'En fazla 8 etiket eklenebilir.';
  end if;

  insert into public.community_posts (
    author_id,
    category,
    title,
    body,
    related_manga_id,
    chapter_number,
    related_fansub_id,
    related_fansub_ids,
    mentioned_user_ids,
    mentioned_manga_ids,
    tags,
    status,
    is_active
  )
  values (
    v_actor_id,
    v_category,
    v_title,
    v_body,
    p_related_manga_id,
    p_chapter_number,
    p_fansub_id,
    v_related_fansub_ids,
    v_mentioned_user_ids,
    v_mentioned_manga_ids,
    v_tags,
    'pending',
    true
  )
  returning id into v_post_id;

  return jsonb_build_object(
    'success', true,
    'post_id', v_post_id,
    'fansub_id', p_fansub_id,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.create_fansub_community_post(uuid, text, text, text, uuid, integer, uuid[], text[], uuid[], uuid[]) from public;
grant execute on function public.create_fansub_community_post(uuid, text, text, text, uuid, integer, uuid[], text[], uuid[], uuid[]) to authenticated;
