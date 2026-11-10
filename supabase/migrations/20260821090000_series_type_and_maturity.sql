-- Series type + mature content (18+) age gate.
--
-- Two separate gaps close:
--
-- 1) SERIES TYPE. The prototype "Reading preference" filter asks WHAT the series IS
-- (manga / manhwa / manhua / webtoon / local). The schema had no such
-- column. `original_lang` EXISTS but it is the SOURCE LANGUAGE, not the type: a Korean
-- webtoon and a Korean manhwa are both 'ko'. Also the data is dirty
-- (ja 54, jp 1). Deriving type from language would be a guess; a real column opens
-- and language is used only for the INITIAL VALUE.
--
-- 2) MATURE CONTENT. Product decision: 18+ series are NOT SHOWN to users under 18;
-- when the user turns 18 they appear by themselves.
-- So the gate is an age check, not a PREFERENCE. Hiding in the UI is not enough:
-- without RLS it could be read with a direct query.

alter table public.mangas
  add column if not exists series_type text not null default 'manga',
  add column if not exists is_mature boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mangas_series_type_check'
  ) then
    alter table public.mangas
      add constraint mangas_series_type_check
      check (series_type in ('manga', 'manhwa', 'manhua', 'webtoon', 'yerli'));
  end if;
end $$;

-- The initial value derives from the source language; afterward the uploader picks by hand.
-- 'tr' means local production, not translation.
-- Fresh install: the approval guard rejects a session with no admin, so it pauses for this backfill.
alter table public.mangas disable trigger trg_enforce_manga_approval_guard;
update public.mangas
set series_type = case
  when original_lang in ('ja', 'jp') then 'manga'
  when original_lang = 'ko' then 'manhwa'
  when original_lang = 'zh' then 'manhua'
  when original_lang = 'tr' then 'yerli'
  else 'manga'
end
where series_type = 'manga';
alter table public.mangas enable trigger trg_enforce_manga_approval_guard;

create index if not exists mangas_series_type_idx on public.mangas (series_type);
create index if not exists mangas_is_mature_idx on public.mangas (is_mature) where is_mature;

-- Birth date is the only input of the age gate. A confirm box like "I am over 13"
-- was not enough: the 18+ gate needs a REAL age.
alter table public.users
  add column if not exists birth_date date;

/*
  Yas kontrolu.

  SECURITY DEFINER: cagiran rolun users tablosunda okuma yetkisi olmayabilir,
  ama kendi yasini bilmek zorunda. Yalnizca boolean doner -- dogum tarihi
  disari sizmaz.

  Dogum tarihi BILINMIYORSA yetiskin SAYILMAZ. Ters varsayim, yasi bilinmeyen
  herkese 18+ icerik acardi.
*/
create or replace function app_private.current_user_is_adult()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (
      select u.birth_date is not null
         and u.birth_date <= (current_date - interval '18 years')
      from public.users u
      where u.id = app_private.current_public_user_id()
      limit 1
    ),
    false
  );
$function$;

revoke all on function app_private.current_user_is_adult() from public;
grant execute on function app_private.current_user_is_adult() to anon, authenticated, service_role;

/*
  Katalog kapisi.

  Yonetici ve seriyi yukleyen fansub yetkilisi kendi icerigini gormeye devam
  eder: aksi halde 18+ bir seriyi yukleyen kisi kendi yuklemesini duzenleyemez
  hale gelirdi.

  NOT (migration 208 kurali): policy govdesinde `public.*` helper'lari DEGIL
  `app_private.*` sarmalayicilari kullanilir -- public olanlarin EXECUTE
  yetkisi anon/authenticated'tan alinmis durumda.
*/
drop policy if exists mangas_select_public on public.mangas;
create policy mangas_select_public on public.mangas
for select
using (
  (
    is_active = true
    and is_approved = true
    and (is_mature = false or app_private.current_user_is_adult())
  )
  or app_private.is_admin()
  or (fansub_id is not null and app_private.is_fansub_admin(fansub_id))
);

/*
  Bolum kapisi.

  Manga'yi gizleyip bolumu acik birakmak kapiyi delik birakirdi: bolum id'sini
  bilen biri sayfalari dogrudan cekebilirdi. Kosul yalnizca 18+ seriler icin
  calisir (`m.is_mature`), yani normal katalogda ek maliyet uretmez.
*/
drop policy if exists chapters_select_public on public.chapters;
create policy chapters_select_public on public.chapters
for select
using (
  (
    is_active = true
    and is_approved = true
    and app_private.can_current_user_access_chapter(publish_at)
    and not exists (
      select 1 from public.mangas m
      where m.id = chapters.manga_id
        and m.is_mature
        and not app_private.current_user_is_adult()
    )
  )
  or (select app_private.is_admin())
  or (fansub_id is not null and app_private.is_fansub_admin(fansub_id))
);
