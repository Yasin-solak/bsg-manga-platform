-- ============================================
-- MangaZone | Quest Variety Expansion (Phase 4b)
-- Raises task variety: (a) 3 new event tasks for the Summer Festival
-- (depth + finale), (b) new daily/weekly cadence options.
-- All use ONLY windowed-fed counter metrics (chapters_read /
-- rating_count / manga_comment_count / total_comment_count /
-- community_post_count) -> progress flows right. Slugs do not clash with existing ones.
-- Idempotent. Date: 2026-07-06
-- ============================================

begin;

-- ---- (a) Summer Festival extra tasks (event, windowed) ----
insert into public.quests (
  slug, title, description, audience, kind, metric_key, target_value,
  reward_kind, coin_reward, task_group, tier_level, sort_order, is_active,
  starts_at, ends_at
)
values
  ('event-yaz26-read-200', 'Festival Efsanesi', 'Festival boyunca 200 bolum oku.',
    'user', 'event', 'chapters_read', 200, 'coin', 1200, 'yaz-festivali-2026', 4, 35, true,
    now(), now() + interval '30 days'),
  ('event-yaz26-comment-30', 'Festival Muhabbeti', 'Festival boyunca 30 yorum yap.',
    'user', 'event', 'total_comment_count', 30, 'coin', 320, 'yaz-festivali-2026', 1, 55, true,
    now(), now() + interval '30 days'),
  ('event-yaz26-rate-25', 'Festival Kurasyonu', 'Festival boyunca 25 manga puanla.',
    'user', 'event', 'rating_count', 25, 'coin', 380, 'yaz-festivali-2026', 1, 45, true,
    now(), now() + interval '30 days')
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  coin_reward = excluded.coin_reward,
  task_group = excluded.task_group,
  tier_level = excluded.tier_level,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  updated_at = now();

-- ---- (b) New daily/weekly cadence tasks (durable) ----
insert into public.quests (
  slug, title, description, audience, kind, metric_key, target_value,
  reward_kind, coin_reward, task_group, tier_level, sort_order, is_active
)
values
  -- Gunluk
  ('daily-post-1', 'Gunun Paylasimi', 'Bugun 1 topluluk gonderisi paylas.',
    'user', 'daily', 'community_post_count', 1, 'coin', 25, 'gunluk', 1, 40, true),
  -- Haftalik
  ('weekly-manga-comment-8', 'Haftanin Manga Yorumcusu', 'Bu hafta 8 manga yorumu yaz.',
    'user', 'weekly', 'manga_comment_count', 8, 'coin', 130, 'haftalik', 1, 50, true),
  ('weekly-read-60', 'Haftanin Buyuk Maratonu', 'Bu hafta 60 bolum oku.',
    'user', 'weekly', 'chapters_read', 60, 'coin', 350, 'haftalik', 2, 15, true)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  coin_reward = excluded.coin_reward,
  task_group = excluded.task_group,
  tier_level = excluded.tier_level,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

commit;
