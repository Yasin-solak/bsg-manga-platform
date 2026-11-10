-- ============================================
-- MangaZone | Event Seed: Summer Reading Festival 2026
-- First live event campaign. kind='event' + starts_at/ends_at window.
-- The Phase 4 engine (255) feeds event progress WINDOWED: tasks start at 0 when the event
-- starts (existing users do not finish instantly).
--
-- Metric choice: ONLY counter metrics fed by record_quest_event triggers
-- (chapters_read / rating_count / total_comment_count /
-- community_post_count). Achievement metrics (unique_mangas_read etc.) are
-- NOT windowed, so they are not used in events.
--
-- Reward: coin (badge finale deliberately deferred -> the badge grant model needs separate
-- validation). Window: starts at apply time, lasts 30 days.
-- Idempotent (slug upsert); reapplying renews the window.
-- Date: 2026-07-06
-- ============================================

begin;

insert into public.quests (
  slug, title, description, audience, kind, metric_key, target_value,
  reward_kind, coin_reward, task_group, tier_level, sort_order, is_active,
  starts_at, ends_at
)
values
  -- ---- Okuma merdiveni (kademeli, ana eksen) ----
  ('event-yaz26-read-10', 'Festival Acilisi', 'Festival boyunca 10 bolum oku.',
    'user', 'event', 'chapters_read', 10, 'coin', 60, 'yaz-festivali-2026', 1, 10, true,
    now(), now() + interval '30 days'),
  ('event-yaz26-read-40', 'Yaz Maratonu', 'Festival boyunca 40 bolum oku.',
    'user', 'event', 'chapters_read', 40, 'coin', 220, 'yaz-festivali-2026', 2, 20, true,
    now(), now() + interval '30 days'),
  ('event-yaz26-read-100', 'Festival Sampiyonu', 'Festival boyunca 100 bolum oku.',
    'user', 'event', 'chapters_read', 100, 'coin', 600, 'yaz-festivali-2026', 3, 30, true,
    now(), now() + interval '30 days'),

  -- ---- Participation tasks (side axis) ----
  ('event-yaz26-rate-10', 'Festival Elestirmeni', 'Festival boyunca 10 manga puanla.',
    'user', 'event', 'rating_count', 10, 'coin', 160, 'yaz-festivali-2026', 1, 40, true,
    now(), now() + interval '30 days'),
  ('event-yaz26-comment-15', 'Festival Sohbeti', 'Festival boyunca 15 yorum yap.',
    'user', 'event', 'total_comment_count', 15, 'coin', 160, 'yaz-festivali-2026', 1, 50, true,
    now(), now() + interval '30 days'),
  ('event-yaz26-post-3', 'Festival Paylasimcisi', 'Festival boyunca 3 topluluk gonderisi paylas.',
    'user', 'event', 'community_post_count', 3, 'coin', 180, 'yaz-festivali-2026', 1, 60, true,
    now(), now() + interval '30 days')

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
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  updated_at = now();

commit;
