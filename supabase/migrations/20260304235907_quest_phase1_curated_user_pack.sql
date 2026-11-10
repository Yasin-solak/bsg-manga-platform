-- ============================================
-- User Quest Phase 1 Curated Pack (22 tasks)
-- Date: 2026-03-04
-- Goal:
-- 1) Deactivate irregular/abusable tasks
-- 2) Build a 22-task chain pack that gives users a sense of purpose
-- 3) Make linear chain dependencies explicit with unlock_requires_task_id
-- ============================================

begin;

-- ============================================
-- 1) Old slug -> new slug mapping (task_id and claim history are kept)
-- ============================================

update public.user_reward_tasks t
set slug = 'read-3-manga', updated_at = now()
where t.slug = 'unique-3-manga'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'read-3-manga');

update public.user_reward_tasks t
set slug = 'read-25-manga', updated_at = now()
where t.slug = 'unique-25-manga'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'read-25-manga');

update public.user_reward_tasks t
set slug = 'first-fansub-follow', updated_at = now()
where t.slug = 'fansub-3-follow'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'first-fansub-follow');

update public.user_reward_tasks t
set slug = 'first-rating', updated_at = now()
where t.slug = 'qualified-5-ratings'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'first-rating');

update public.user_reward_tasks t
set slug = 'profile-ready', updated_at = now()
where t.slug = 'profile-complete'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'profile-ready');

update public.user_reward_tasks t
set slug = 'comment-5-unique', updated_at = now()
where t.slug = 'qualified-unique-25'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'comment-5-unique');

update public.user_reward_tasks t
set slug = 'favorites-25', updated_at = now()
where t.slug = 'favorites-50'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'favorites-25');

update public.user_reward_tasks t
set slug = 'genre-6', updated_at = now()
where t.slug = 'genres-7'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'genre-6');

update public.user_reward_tasks t
set slug = 'streak-7', updated_at = now()
where t.slug = 'consecutive-7'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'streak-7');

update public.user_reward_tasks t
set slug = 'post-3-quality', updated_at = now()
where t.slug = 'qualified-10-posts'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'post-3-quality');

update public.user_reward_tasks t
set slug = 'list-curator', updated_at = now()
where t.slug = 'qualified-3-lists'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'list-curator');

update public.user_reward_tasks t
set slug = 'follow-5', updated_at = now()
where t.slug = 'follow-5-manga'
  and not exists (select 1 from public.user_reward_tasks x where x.slug = 'follow-5');

-- ============================================
-- 2) Deactivate low-value / broken / legacy tasks
-- ============================================

update public.user_reward_tasks
set is_active = false,
    unlock_requires_task_id = null,
    updated_at = now()
where slug in (
  -- Legacy 20260214
  'read-5-manga',
  'follow-5-manga',
  'write-10-comments',
  'rate-5-manga',
  'post-3-community',
  -- Old slug names (no duplicate left if a rename is skipped)
  'unique-3-manga',
  'unique-25-manga',
  'fansub-3-follow',
  'qualified-5-ratings',
  'profile-complete',
  'qualified-unique-25',
  'favorites-50',
  'genres-7',
  'consecutive-7',
  'qualified-10-posts',
  'qualified-3-lists',
  -- Semantically broken / abusable tasks
  'qualified-5-comments',
  'upvotes-25',
  'marathon-30',
  'night-10',
  'completed-100',
  'qualified-200-comments',
  'leader-250',
  'genres-10',
  'consecutive-30',
  'chapters-1000',
  'upvotes-100'
);

-- ============================================
-- 3) Phase 1: upsert the 22-task curated pack
-- ============================================

insert into public.user_reward_tasks (
  slug,
  title,
  description,
  metric_key,
  target_value,
  coin_reward,
  badge_id,
  sort_order,
  is_active,
  task_group,
  tier_level,
  unlock_requires_task_id
)
values
  -- 1) Profil vitrini (1)
  ('profile-ready', 'Vitrini Ac', 'Profilini tamamla ve kendini tanit.', 'profile_completed', 1, 70, null, 100, true, 'profil', 1, null),

  -- 2) Kutuphane zinciri (3)
  ('first-follow', 'Takibe Basla', 'Ilk mangani takip et.', 'manga_follow_count', 1, 50, null, 110, true, 'kutuphane', 1, null),
  ('follow-5', 'Rafimi Dolduruyorum', 'Toplam 5 manga takip et.', 'manga_follow_count', 5, 110, null, 120, true, 'kutuphane', 2, null),
  ('favorites-25', 'Favori Koleksiyonu', '25 mangayi favorilere ekle.', 'favorites_count', 25, 240, null, 130, true, 'kutuphane', 3, null),

  -- 3) Fansub zinciri (1)
  ('first-fansub-follow', 'Ekip Secimi', 'Ilk fansubunu takip et.', 'fansub_follow_count', 1, 60, null, 140, true, 'fansub', 1, null),

  -- 4) Degerlendirme zinciri (2)
  ('first-rating', 'Ilk Puanim', 'Ilk nitelikli puanini ver.', 'qualified_ratings', 1, 60, null, 150, true, 'degerlendirme', 1, null),
  ('rate-10', 'Elestirmen Baslangici', 'Toplam 10 nitelikli puan ver.', 'qualified_ratings', 10, 200, null, 160, true, 'degerlendirme', 2, null),

  -- 5) Liste zinciri (3)
  ('first-list', 'Ilk Liste', 'Iceriginde manga olan ilk listeni olustur.', 'lists_with_items', 1, 70, null, 170, true, 'liste', 1, null),
  ('list-3', 'Liste Kurucusu', 'Iceriginde manga olan 3 listeye ulas.', 'lists_with_items', 3, 200, null, 180, true, 'liste', 2, null),
  ('list-curator', 'Liste Ustasi', '3 nitelikli liste (10+ manga) olustur.', 'qualified_lists', 3, 360, null, 190, true, 'liste', 3, null),

  -- 6) Okuma rotasi zinciri (3)
  ('read-3-manga', 'Ilk Adim', '3 farkli manga oku.', 'unique_mangas_read', 3, 60, null, 200, true, 'okuma_yolu', 1, null),
  ('read-10-manga', 'Kesif Basladi', '10 farkli manga oku.', 'unique_mangas_read', 10, 140, null, 210, true, 'okuma_yolu', 2, null),
  ('read-25-manga', 'Kitap Kurdu', '25 farkli manga oku.', 'unique_mangas_read', 25, 320, null, 220, true, 'okuma_yolu', 3, null),

  -- 7) Okuma hacmi zinciri (2)
  ('chapters-20', 'Bolum Avcisi', 'Toplam 20 bolum oku.', 'chapters_read', 20, 120, null, 230, true, 'okuma_hacmi', 1, null),
  ('chapters-75', 'Hacim Kazandi', 'Toplam 75 bolum oku.', 'chapters_read', 75, 280, null, 240, true, 'okuma_hacmi', 2, null),

  -- 8) Kesif zinciri (2)
  ('genre-3', 'Uc Tur Denedim', '3 farkli turde manga oku.', 'genres_explored', 3, 100, null, 250, true, 'kesif', 1, null),
  ('genre-6', 'Tur Kasifi', '6 farkli turde manga oku.', 'genres_explored', 6, 220, null, 260, true, 'kesif', 2, null),

  -- 9) Sadakat zinciri (3)
  ('streak-2', 'Ertesi Gun Geri Don', '2 gun ust uste aktif ol.', 'consecutive_days', 2, 90, null, 270, true, 'sadakat', 1, null),
  ('streak-4', 'Mini Seri', '4 gun ust uste aktif ol.', 'consecutive_days', 4, 140, null, 280, true, 'sadakat', 2, null),
  ('streak-7', 'Haftalik Sadakat', '7 gun ust uste aktif ol.', 'consecutive_days', 7, 220, null, 290, true, 'sadakat', 3, null),

  -- 10) Topluluk katkisi zinciri (2)
  ('comment-5-unique', 'Sesi Duyuldu', '5 farkli mangaya nitelikli yorum yap.', 'qualified_unique_comments', 5, 160, null, 300, true, 'topluluk', 1, null),
  ('post-3-quality', 'Toplulukta Gorundum', '3 nitelikli topluluk postu paylas.', 'qualified_posts', 3, 210, null, 310, true, 'topluluk', 2, null)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  coin_reward = excluded.coin_reward,
  badge_id = excluded.badge_id,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  task_group = excluded.task_group,
  tier_level = excluded.tier_level,
  unlock_requires_task_id = null,
  updated_at = now();

-- ============================================
-- 4) Zincir bagimliliklari (unlock_requires_task_id)
-- ============================================

-- Kutuphane
update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'first-follow'),
    updated_at = now()
where slug = 'follow-5';

update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'follow-5'),
    updated_at = now()
where slug = 'favorites-25';

-- Degerlendirme
update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'first-rating'),
    updated_at = now()
where slug = 'rate-10';

-- Liste
update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'first-list'),
    updated_at = now()
where slug = 'list-3';

update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'list-3'),
    updated_at = now()
where slug = 'list-curator';

-- Okuma rotasi
update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'read-3-manga'),
    updated_at = now()
where slug = 'read-10-manga';

update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'read-10-manga'),
    updated_at = now()
where slug = 'read-25-manga';

-- Okuma hacmi
update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'chapters-20'),
    updated_at = now()
where slug = 'chapters-75';

-- Kesif
update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'genre-3'),
    updated_at = now()
where slug = 'genre-6';

-- Sadakat
update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'streak-2'),
    updated_at = now()
where slug = 'streak-4';

update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'streak-4'),
    updated_at = now()
where slug = 'streak-7';

-- Topluluk katkisi
update public.user_reward_tasks
set unlock_requires_task_id = (select id from public.user_reward_tasks where slug = 'comment-5-unique'),
    updated_at = now()
where slug = 'post-3-quality';

-- Zincirin ilk adimlari kilitsiz kalmali
update public.user_reward_tasks
set unlock_requires_task_id = null,
    updated_at = now()
where slug in (
  'profile-ready',
  'first-follow',
  'first-fansub-follow',
  'first-rating',
  'first-list',
  'read-3-manga',
  'chapters-20',
  'genre-3',
  'streak-2',
  'comment-5-unique'
);

-- ============================================
-- 5) Kisa butunluk kontrolu
-- ============================================

do $$
declare
  v_curated_count integer;
begin
  select count(*)
    into v_curated_count
  from public.user_reward_tasks
  where is_active = true
    and slug in (
      'profile-ready',
      'first-follow',
      'follow-5',
      'favorites-25',
      'first-fansub-follow',
      'first-rating',
      'rate-10',
      'first-list',
      'list-3',
      'list-curator',
      'read-3-manga',
      'read-10-manga',
      'read-25-manga',
      'chapters-20',
      'chapters-75',
      'genre-3',
      'genre-6',
      'streak-2',
      'streak-4',
      'streak-7',
      'comment-5-unique',
      'post-3-quality'
    );

  if v_curated_count <> 22 then
    raise exception 'Curated user quest paketi eksik. Beklenen: 22, bulunan: %', v_curated_count;
  end if;
end $$;

commit;
