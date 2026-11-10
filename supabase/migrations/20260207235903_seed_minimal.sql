-- ============================================
-- MangaZone | Minimal Seed Data (V2)
-- Date: 2026-02-07
-- ============================================

-- Temporary/fallback development user
insert into public.users (
  id,
  auth_user_id,
  username,
  username_slug,
  avatar_url,
  role,
  stones,
  frame_type
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'kullanici',
  'kullanici',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=kullanici',
  'admin',
  1000,
  'default'
)
on conflict (auth_user_id) do update
set
  username = excluded.username,
  username_slug = excluded.username_slug,
  avatar_url = excluded.avatar_url,
  role = excluded.role;

-- Ornek store itemlari
insert into public.store_items (
  name,
  description,
  identifier,
  type,
  price,
  currency,
  image_key,
  is_active
)
values
  ('Klasik Cerceve', 'Varsayilan profil cercevesi.', 'default', 'frame', 0, 'Coin', 'default', true),
  ('Alev Cerceve', 'Ates efekti cerceve.', 'fire', 'frame', 500, 'Coin', 'fire', true),
  ('Buz Cerceve', 'Buz efekti cerceve.', 'ice', 'frame', 500, 'Coin', 'ice', true),
  ('Halftone Pattern', 'Manga stili noktalama pattern.', 'halftone', 'pattern', 300, 'Coin', 'halftone', true),
  ('Neon Arka Plan', 'Neon tonlu profil arka plani.', 'neon', 'background', 450, 'Coin', 'neon', true)
on conflict (type, identifier) do update
set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  currency = excluded.currency,
  image_key = excluded.image_key,
  is_active = excluded.is_active;

-- Ornek rozetler
insert into public.badges (
  name,
  description,
  image_url,
  category,
  subcategory,
  price,
  rarity,
  is_active,
  target_type
)
values
  ('Ilk Adim', 'Ilk bolumunu okuyan kullanicilar icin.', '/badges/ilk-adim.png', 'achievement', 'user_achievement', null, 'common', true, 'user'),
  ('Yorum Kahramani', 'Topluluga aktif katkida bulunanlar icin.', '/badges/yorum-kahramani.png', 'achievement', 'user_achievement', null, 'rare', true, 'user'),
  ('Topluluk Destekcisi', 'Magazadan satin alinabilen destek rozeti.', '/badges/topluluk-destekcisi.png', 'purchasable', 'supporter', 350, 'epic', true, 'both')
on conflict (name) do update
set
  description = excluded.description,
  image_url = excluded.image_url,
  category = excluded.category,
  subcategory = excluded.subcategory,
  price = excluded.price,
  rarity = excluded.rarity,
  is_active = excluded.is_active,
  target_type = excluded.target_type;

-- Ornek redeem code
insert into public.redeem_codes (
  code,
  value,
  max_uses,
  used_count,
  expires_at,
  target_type,
  is_active
)
values (
  'WELCOME2026',
  200,
  10000,
  0,
  now() + interval '365 days',
  'both',
  true
)
on conflict (code) do update
set
  value = excluded.value,
  max_uses = excluded.max_uses,
  expires_at = excluded.expires_at,
  target_type = excluded.target_type,
  is_active = excluded.is_active;
