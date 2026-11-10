-- ============================================
-- MangaZone | Quest Daily/Weekly Seed (Phase 2)
-- Cadence tasks: daily (00:00 TR reset) + weekly (Monday reset).
-- All use event-triggered counter metrics (chapters_read, rating_count,
-- total_comment_count, community_post_count) -> fed by Phase 1c hooks.
-- Reward: coin (by cosmetic philosophy kept not for cadence but for high-threshold
-- achievements/gates). Slugs do not clash with imported achievements.
-- Date: 2026-06-25
-- ============================================

begin;

insert into public.quests (
  slug, title, description, audience, kind, metric_key, target_value,
  reward_kind, coin_reward, task_group, tier_level, sort_order, is_active
)
values
  -- ---- GUNLUK (reset her gece 00:00 Europe/Istanbul) ----
  ('daily-read-3', 'Gunun Okumasi', 'Bugun 3 bolum oku.',
    'user', 'daily', 'chapters_read', 3, 'coin', 30, 'gunluk', 1, 10, true),
  ('daily-rate-1', 'Gunun Puani', 'Bugun 1 manga puanla.',
    'user', 'daily', 'rating_count', 1, 'coin', 20, 'gunluk', 1, 20, true),
  ('daily-comment-1', 'Gunun Yorumu', 'Bugun 1 yorum yap.',
    'user', 'daily', 'total_comment_count', 1, 'coin', 20, 'gunluk', 1, 30, true),

  -- ---- HAFTALIK (reset Pazartesi, ISO hafta) ----
  ('weekly-read-30', 'Haftanin Maratonu', 'Bu hafta 30 bolum oku.',
    'user', 'weekly', 'chapters_read', 30, 'coin', 200, 'haftalik', 1, 10, true),
  ('weekly-rate-5', 'Haftanin Elestirmeni', 'Bu hafta 5 manga puanla.',
    'user', 'weekly', 'rating_count', 5, 'coin', 120, 'haftalik', 1, 20, true),
  ('weekly-comment-10', 'Haftanin Sesi', 'Bu hafta 10 yorum yap.',
    'user', 'weekly', 'total_comment_count', 10, 'coin', 150, 'haftalik', 1, 30, true),
  ('weekly-post-2', 'Haftanin Paylasimcisi', 'Bu hafta 2 topluluk gonderisi paylas.',
    'user', 'weekly', 'community_post_count', 2, 'coin', 150, 'haftalik', 1, 40, true)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  audience = excluded.audience,
  kind = excluded.kind,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  reward_kind = excluded.reward_kind,
  coin_reward = excluded.coin_reward,
  task_group = excluded.task_group,
  tier_level = excluded.tier_level,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

commit;
