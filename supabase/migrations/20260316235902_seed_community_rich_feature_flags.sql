-- MangaZone | Community rich feature flag bootstrap fix
-- Makes community rich-detail flags added in the registry
-- also appear in the feature_flags table.

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values
  (
    'community.rich_detail',
    'Topluluk Zengin Detay',
    'Topluluk detay sayfasindaki zengin article, medya, anket ve baglam modullerini kontrol eder.',
    true,
    100,
    false,
    jsonb_build_object(
      'owner', 'topluluk',
      'registry_seed', true,
      'cleanupNotu', 'Detay yenilemesi kalici oldugunda tek route davranisina gomulecek.'
    )
  ),
  (
    'community.polls',
    'Topluluk Anketleri',
    'Topluluk postlarinda tek secimli anket olusturma ve oy verme akislarini kontrol eder.',
    true,
    100,
    false,
    jsonb_build_object(
      'owner', 'topluluk',
      'registry_seed', true,
      'cleanupNotu', 'Anket altyapisi default oldugunda rollout flag sadeleştirilecek.'
    )
  ),
  (
    'community.gifs',
    'Topluluk GIF',
    'Provider tabanli GIF arama, secme ve detay render akislarini kontrol eder.',
    true,
    100,
    false,
    jsonb_build_object(
      'owner', 'topluluk',
      'registry_seed', true,
      'cleanupNotu', 'GIF provider karari kalici oldugunda rollout bayragi kaldirilabilir.'
    )
  ),
  (
    'community.emoji_reactions',
    'Topluluk Emoji Reaksiyonlari',
    'Topluluk post ve yorum deneyimindeki emoji reaction yardimlarini ve post railini kontrol eder.',
    true,
    100,
    false,
    jsonb_build_object(
      'owner', 'topluluk',
      'registry_seed', true,
      'cleanupNotu', 'Reaction rail tum kullanicilara acildiginda yalniz acil-kapatma amacli tutulur.'
    )
  )
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  metadata = public.feature_flags.metadata || excluded.metadata,
  updated_at = timezone('utc', now());
