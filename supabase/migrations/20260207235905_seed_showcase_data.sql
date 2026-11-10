-- ============================================
-- MangaZone | Showcase Seed Data
-- Date: 2026-02-07
-- ============================================

-- This seed file:
-- 1) Adds sample user + fansub + manga data
-- 2) Fills the shop with frame / pattern / background products
-- 3) Maps badges to public/badges files
-- 4) Assigns inventory / badges to users and fansubs

-- --------------------------------------------
-- USERS
-- --------------------------------------------
insert into public.users (
  id,
  auth_user_id,
  username,
  username_slug,
  avatar_url,
  role,
  bio,
  level,
  stones,
  frame_type,
  owned_items,
  social_links,
  is_active
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'mangamaster',
    'mangamaster',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=mangamaster',
    'admin',
    'Topluluk yonetimi ve editorluk.',
    'Efsane',
    8500,
    'avatarframe2',
    '{"frames":["default","avatarframe2","gold"],"backgrounds":["bg-city-glow"],"patterns":["halftone"],"badges":[],"premium":[]}'::jsonb,
    '[{"platform":"discord","username":"mangamaster#1977"}]'::jsonb,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    'aylinnova',
    'aylinnova',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=aylinnova',
    'moderator',
    'Aksiyon ve fantezi serilerinin surekli okuyucusu.',
    'Elit Okur',
    4300,
    'avatarframe1',
    '{"frames":["default","avatarframe1","fire"],"backgrounds":["bg-sky-temple"],"patterns":["grid"],"badges":[],"premium":[]}'::jsonb,
    '[{"platform":"x","username":"@aylinnova"}]'::jsonb,
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '33333333-3333-3333-3333-333333333333',
    'kenanrift',
    'kenanrift',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=kenanrift',
    'user',
    'Gece yayini ve yorum maratonu seven bir okuyucu.',
    'Usta Okur',
    2600,
    'halloween',
    '{"frames":["default","halloween","ice"],"backgrounds":["bg-night-alley"],"patterns":["stripes"],"badges":[],"premium":[]}'::jsonb,
    '[{"platform":"youtube","username":"KenanRift"}]'::jsonb,
    true
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '44444444-4444-4444-4444-444444444444',
    'senacloud',
    'senacloud',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=senacloud',
    'user',
    'Slice-of-life ve okul temali serilerde aktif.',
    'Koleksiyoner',
    3100,
    'christmas',
    '{"frames":["default","christmas","avatarframe3"],"backgrounds":["bg-dragon-hall"],"patterns":["dots"],"badges":[],"premium":[]}'::jsonb,
    '[{"platform":"instagram","username":"sena.cloud"}]'::jsonb,
    true
  )
on conflict (id) do update
set
  username = excluded.username,
  username_slug = excluded.username_slug,
  avatar_url = excluded.avatar_url,
  role = excluded.role,
  bio = excluded.bio,
  level = excluded.level,
  stones = excluded.stones,
  frame_type = excluded.frame_type,
  owned_items = excluded.owned_items,
  social_links = excluded.social_links,
  is_active = excluded.is_active;

-- --------------------------------------------
-- FANSUBS
-- --------------------------------------------
insert into public.fansubs (
  id,
  name,
  slug,
  avatar_url,
  description,
  frame_type,
  primary_color,
  secondary_color,
  coin_balance,
  is_active
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'Gecekusu Ceviri',
    'gecekusu-ceviri',
    '/fansub/owl-avatar.png',
    'Aksiyon/fantastik agirlikli yayin cizgisi.',
    'avatarframe1',
    '#101828',
    '#FFD600',
    28000,
    true
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'Ates Manga',
    'ates-manga',
    '/fansub/fire-avatar.png',
    'Hizli bolum cikaran, topluluk odakli ekip.',
    'fire',
    '#3B0A0A',
    '#FF6B35',
    19000,
    true
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'Bulut Fansub',
    'bulut-fansub',
    '/fansub/cloud-avatar.png',
    'Romantik ve drama serilerinde guclu arsiv.',
    'avatarframe3',
    '#112D4E',
    '#A8DADC',
    23500,
    true
  )
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  avatar_url = excluded.avatar_url,
  description = excluded.description,
  frame_type = excluded.frame_type,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  coin_balance = excluded.coin_balance,
  is_active = excluded.is_active;

insert into public.fansub_members (fansub_id, user_id, role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '22222222-2222-2222-2222-222222222222', 'moderator'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '33333333-3333-3333-3333-333333333333', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'moderator'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '44444444-4444-4444-4444-444444444444', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '22222222-2222-2222-2222-222222222222', 'moderator')
on conflict (fansub_id, user_id) do update
set role = excluded.role;

-- --------------------------------------------
-- STORE ITEMS (FRAME / PATTERN / BACKGROUND)
-- --------------------------------------------
insert into public.store_items (
  name,
  description,
  identifier,
  type,
  price,
  original_price,
  currency,
  image_key,
  custom_asset_url,
  is_active,
  purchase_count
)
values
  ('Noel Cercevesi', 'Kis sezonu cercevesi.', 'christmas', 'frame', 420, 520, 'Coin', 'christmas', null, true, 24),
  ('Cadilar Bayrami Cercevesi', 'Halloween temali cerceve.', 'halloween', 'frame', 430, 540, 'Coin', 'halloween', null, true, 21),
  ('Animasyonlu Cerceve I', 'Discord stilinde animasyonlu cerceve.', 'avatarframe1', 'frame', 900, 1200, 'Coin', 'avatarframe1', null, true, 47),
  ('Animasyonlu Cerceve II', 'Parlayan premium cerceve.', 'avatarframe2', 'frame', 930, 1240, 'Coin', 'avatarframe2', null, true, 40),
  ('Animasyonlu Cerceve III', 'Nadir koleksiyon cercevesi.', 'avatarframe3', 'frame', 960, 1290, 'Coin', 'avatarframe3', null, true, 35),
  ('Animasyonlu Cerceve IV', 'Efsanevi seri cercevesi.', 'avatarframe4', 'frame', 1000, 1390, 'Coin', 'avatarframe4', null, true, 33),
  ('Ates Aura Cercevesi', 'Ates efektli klasik cerceve.', 'fire', 'frame', 560, 690, 'Coin', 'fire', null, true, 26),
  ('Buz Aura Cercevesi', 'Buz efektli klasik cerceve.', 'ice', 'frame', 560, 690, 'Coin', 'ice', null, true, 22),
  ('Neon Cerceve', 'Neon parlamali cerceve.', 'neon', 'frame', 610, 760, 'Coin', 'neon', null, true, 31),
  ('Altin Cerceve', 'Koleksiyonluk altin cerceve.', 'gold', 'frame', 780, 980, 'Coin', 'gold', null, true, 19),
  ('Gokkusagi Cerceve', 'Renk gecisli premium cerceve.', 'rainbow', 'frame', 840, 1090, 'Coin', 'rainbow', null, true, 17),

  ('Halftone Pattern', 'Manga dokulu nokta pattern.', 'halftone', 'pattern', 280, 360, 'Coin', 'halftone', null, true, 28),
  ('Grid Pattern', 'Temiz izgara pattern.', 'grid', 'pattern', 250, 330, 'Coin', 'grid', null, true, 16),
  ('Dots Pattern', 'Minimal nokta pattern.', 'dots', 'pattern', 220, 290, 'Coin', 'dots', null, true, 12),
  ('Stripes Pattern', 'Dinamik cizgi pattern.', 'stripes', 'pattern', 240, 320, 'Coin', 'stripes', null, true, 14),

  ('City Glow Background', 'Dosyadan yuklenen sehir fonu.', 'bg-city-glow', 'background', 520, 690, 'Coin', 'bg-city-glow', '/backgrounds/bg-city-glow.png', true, 18),
  ('Night Alley Background', 'Dosyadan yuklenen gece fonu.', 'bg-night-alley', 'background', 520, 690, 'Coin', 'bg-night-alley', '/backgrounds/bg-night-alley.png', true, 16),
  ('Sky Temple Background', 'Dosyadan yuklenen gok tapinagi fonu.', 'bg-sky-temple', 'background', 540, 720, 'Coin', 'bg-sky-temple', '/backgrounds/bg-sky-temple.png', true, 15),
  ('Dragon Hall Background', 'Dosyadan yuklenen ejder salonu fonu.', 'bg-dragon-hall', 'background', 560, 760, 'Coin', 'bg-dragon-hall', '/backgrounds/bg-dragon-hall.png', true, 13),
  ('Neon Video Background', 'Dosyadan yuklenen hareketli arka plan.', 'anime-neon-loop', 'background', 700, 920, 'Coin', 'anime-neon-loop', '/backgrounds/anime-neon-loop.webm', true, 9)
on conflict (type, identifier) do update
set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  original_price = excluded.original_price,
  currency = excluded.currency,
  image_key = excluded.image_key,
  custom_asset_url = excluded.custom_asset_url,
  is_active = excluded.is_active,
  purchase_count = excluded.purchase_count;

-- --------------------------------------------
-- BADGES (mapped to public/badges)
-- --------------------------------------------
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
  ('Ilk Adim', 'Ilk bolum okuma basarimi.', '/badges/achievement_first_step.png', 'achievement', 'user_achievement', null, 'common', true, 'user'),
  ('Kitap Kurdu', '100+ bolum okuma basarimi.', '/badges/achievement_bookworm.png', 'achievement', 'user_achievement', null, 'rare', true, 'user'),
  ('Manga Ustasi', '500+ bolum okuma basarimi.', '/badges/achievement_manga_master.png', 'achievement', 'user_achievement', null, 'epic', true, 'user'),
  ('Yorum Kahramani', 'Topluluga aktif yorum katkisi.', '/badges/achievement_comment_hero.png', 'achievement', 'user_achievement', null, 'rare', true, 'user'),
  ('Topluluk Destekcisi', 'Magazadan satin alinabilen destek rozeti.', '/badges/supporter_level2.png', 'purchasable', 'supporter', 350, 'epic', true, 'both'),

  ('Destekci Seviye 1', 'Topluluga destek rozeti.', '/badges/supporter_level1.png', 'purchasable', 'supporter', 190, 'common', true, 'both'),
  ('Destekci Seviye 2', 'Topluluga orta seviye destek rozeti.', '/badges/supporter_level2.png', 'purchasable', 'supporter', 320, 'rare', true, 'both'),
  ('Destekci Seviye 3', 'Topluluga premium destek rozeti.', '/badges/supporter_level3.png', 'purchasable', 'supporter', 540, 'epic', true, 'both'),

  ('VIP Bronz', 'VIP baslangic rozeti.', '/badges/vip_bronze.png', 'purchasable', 'vip', 260, 'rare', true, 'both'),
  ('VIP Gumus', 'VIP orta seviye rozeti.', '/badges/vip_silver.png', 'purchasable', 'vip', 420, 'epic', true, 'both'),
  ('VIP Altin', 'VIP ust seviye rozeti.', '/badges/vip_gold.png', 'purchasable', 'vip', 760, 'legendary', true, 'both'),

  ('Reader Bronz', 'Okur bronz sezon rozeti.', '/badges/reader_bronze.png', 'purchasable', 'reader', 280, 'rare', true, 'user'),
  ('Reader Gumus', 'Okur gumus sezon rozeti.', '/badges/reader_silver.png', 'purchasable', 'reader', 460, 'epic', true, 'user'),
  ('Reader Altin', 'Okur altin sezon rozeti.', '/badges/reader_gold.png', 'purchasable', 'reader', 820, 'legendary', true, 'user'),

  ('Artist Beginner', 'Cizim toplulugu baslangic rozeti.', '/badges/artist_beginner.png', 'purchasable', 'artist', 230, 'common', true, 'user'),
  ('Artist Intermediate', 'Cizim toplulugu orta seviye rozeti.', '/badges/artist_intermediate.png', 'purchasable', 'artist', 390, 'rare', true, 'user'),
  ('Artist Master', 'Cizim toplulugu ust seviye rozeti.', '/badges/artist_master.png', 'purchasable', 'artist', 700, 'legendary', true, 'user')
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

-- --------------------------------------------
-- FANSUB ACTIVE ITEMS + INVENTORY
-- --------------------------------------------
with cfg as (
  select * from (values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'avatarframe1'::text, 'bg-city-glow'::text, 'halftone'::text, 'avatarframe1'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'fire'::text, 'bg-night-alley'::text, 'stripes'::text, 'fire'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'avatarframe3'::text, 'bg-sky-temple'::text, 'grid'::text, 'avatarframe3'::text)
  ) as v(fansub_id, frame_identifier, background_identifier, pattern_identifier, frame_type)
)
update public.fansubs f
set
  active_frame_id = sf.id,
  active_background_id = sb.id,
  active_pattern_id = sp.id,
  frame_type = cfg.frame_type
from cfg
left join public.store_items sf on sf.type = 'frame' and sf.identifier = cfg.frame_identifier
left join public.store_items sb on sb.type = 'background' and sb.identifier = cfg.background_identifier
left join public.store_items sp on sp.type = 'pattern' and sp.identifier = cfg.pattern_identifier
where f.id = cfg.fansub_id;

insert into public.fansub_inventory (fansub_id, store_item_id)
select cfg.fansub_id, si.id
from (
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'avatarframe1'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'gold'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'bg-city-glow'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'halftone'::text),

    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'fire'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'avatarframe2'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'bg-night-alley'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'stripes'::text),

    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'avatarframe3'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'christmas'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'bg-sky-temple'::text),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'grid'::text)
) as cfg(fansub_id, item_identifier)
join public.store_items si on si.identifier = cfg.item_identifier
on conflict (fansub_id, store_item_id) do nothing;

-- --------------------------------------------
-- MANGAS
-- --------------------------------------------
insert into public.mangas (
  id,
  fansub_id,
  title,
  slug,
  cover_image_url,
  description,
  author,
  artist,
  status,
  rating,
  total_ratings,
  total_views,
  is_new,
  is_approved,
  is_active,
  last_chapter_number,
  genres,
  original_lang,
  release_date
)
values
  ('70000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Shadow Warrior', 'shadow-warrior', '/covers/shadow-warrior.png', 'Karanlik bir lonca savasinin ortasinda hayatta kalma hikayesi.', 'R. Kaito', 'N. Min', 'ongoing', 4.7, 1298, 624000, true, true, true, 128, array['Aksiyon', 'Fantezi'], 'jp', '2021-03-05'),
  ('70000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Deep Abyss', 'deep-abyss', '/covers/deep-abyss.png', 'Gizemli bir denizalti kralliginin sirri.', 'L. Haru', 'M. Sora', 'ongoing', 4.5, 990, 410000, false, true, true, 92, array['Macera', 'Gizem'], 'jp', '2020-08-11'),
  ('70000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Cursed Sword', 'cursed-sword', '/covers/cursed-sword.png', 'Lanetli bir kilicin secilen tasiyicisi olmanin bedeli.', 'T. Reina', 'K. Volt', 'ongoing', 4.6, 845, 358000, true, true, true, 76, array['Aksiyon', 'Karanlik Fantazi'], 'jp', '2022-01-18'),
  ('70000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Iron Blood Battalion', 'iron-blood-battalion', '/covers/iron-blood.png', 'Savas alaninda kurulan kardeslik ve ihanet oyunu.', 'Y. Arata', 'S. Jun', 'completed', 4.4, 1250, 510000, false, true, true, 140, array['Askeri', 'Dram'], 'jp', '2019-05-26'),
  ('70000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Wind Chronicle', 'wind-chronicle', '/covers/wind-chronicle.png', 'Ruzgar ruhlariyla bag kuran bir ogrencinin yolculugu.', 'A. Mizu', 'F. Yori', 'ongoing', 4.3, 670, 280000, false, true, true, 54, array['Fantazi', 'Okul'], 'jp', '2023-09-02'),
  ('70000000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Starlight Academy', 'starlight-academy', '/covers/starlight-academy.png', 'Yildiz enerjisiyle calisan bir akademide rekabet.', 'E. Kira', 'P. Han', 'ongoing', 4.8, 1560, 742000, true, true, true, 33, array['Okul', 'Bilim Kurgu'], 'kr', '2024-02-14')
on conflict (id) do update
set
  fansub_id = excluded.fansub_id,
  title = excluded.title,
  slug = excluded.slug,
  cover_image_url = excluded.cover_image_url,
  description = excluded.description,
  author = excluded.author,
  artist = excluded.artist,
  status = excluded.status,
  rating = excluded.rating,
  total_ratings = excluded.total_ratings,
  total_views = excluded.total_views,
  is_new = excluded.is_new,
  is_approved = excluded.is_approved,
  is_active = excluded.is_active,
  last_chapter_number = excluded.last_chapter_number,
  genres = excluded.genres,
  original_lang = excluded.original_lang,
  release_date = excluded.release_date;

-- --------------------------------------------
-- CHAPTERS
-- --------------------------------------------
insert into public.chapters (
  id,
  manga_id,
  fansub_id,
  chapter_number,
  title,
  pages,
  is_approved,
  is_active,
  created_at
)
values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 127, 'Golgeyi Yar', '["/covers/shadow-warrior.png","/covers/deep-abyss.png"]'::jsonb, true, true, now() - interval '15 days'),
  ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 128, 'Son Kapinin Anahtari', '["/covers/shadow-warrior.png","/covers/cursed-sword.png"]'::jsonb, true, true, now() - interval '2 days'),
  ('71000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 75, 'Lanetin Bedeli', '["/covers/cursed-sword.png","/covers/iron-blood.png"]'::jsonb, true, true, now() - interval '8 days'),
  ('71000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 76, 'Kilic Uyanisi', '["/covers/cursed-sword.png","/covers/dragon-court.png"]'::jsonb, true, true, now() - interval '1 day'),
  ('71000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 32, 'Yildiz Turuvasi', '["/covers/starlight-academy.png","/covers/wind-chronicle.png"]'::jsonb, true, true, now() - interval '6 days'),
  ('71000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 33, 'Sifir Noktasi', '["/covers/starlight-academy.png","/covers/dragon-court.png"]'::jsonb, true, true, now() - interval '1 day')
on conflict (id) do update
set
  manga_id = excluded.manga_id,
  fansub_id = excluded.fansub_id,
  chapter_number = excluded.chapter_number,
  title = excluded.title,
  pages = excluded.pages,
  is_approved = excluded.is_approved,
  is_active = excluded.is_active,
  created_at = excluded.created_at;

-- --------------------------------------------
-- FOLLOWS + HISTORY
-- --------------------------------------------
insert into public.user_follows (follower_id, following_id)
values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222'),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444')
on conflict (follower_id, following_id) do nothing;

insert into public.manga_follows (user_id, manga_id)
values
  ('22222222-2222-2222-2222-222222222222', '70000000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', '70000000-0000-0000-0000-000000000006'),
  ('33333333-3333-3333-3333-333333333333', '70000000-0000-0000-0000-000000000003'),
  ('44444444-4444-4444-4444-444444444444', '70000000-0000-0000-0000-000000000005')
on conflict (user_id, manga_id) do nothing;

insert into public.fansub_follows (user_id, fansub_id)
values
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2')
on conflict (user_id, fansub_id) do nothing;

insert into public.reading_history (user_id, manga_id, chapter_id, chapter_number, read_at)
values
  ('22222222-2222-2222-2222-222222222222', '70000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 128, now() - interval '3 hours'),
  ('33333333-3333-3333-3333-333333333333', '70000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000004', 76, now() - interval '9 hours'),
  ('44444444-4444-4444-4444-444444444444', '70000000-0000-0000-0000-000000000006', '71000000-0000-0000-0000-000000000006', 33, now() - interval '1 hour')
on conflict (user_id, manga_id) do update
set
  chapter_id = excluded.chapter_id,
  chapter_number = excluded.chapter_number,
  read_at = excluded.read_at;

-- --------------------------------------------
-- COMMUNITY POSTS + COMMENTS + MANGA COMMENTS
-- --------------------------------------------
insert into public.community_posts (
  id,
  author_id,
  category,
  title,
  body,
  related_manga_id,
  related_fansub_id,
  frame_type,
  primary_color,
  secondary_color,
  is_verified,
  status,
  likes_count,
  comments_count,
  is_active,
  created_at
)
values
  ('72000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Bolum Tartismasi', 'Shadow Warrior 128 Teori', 'Son paneldeki sembol yeni bir dusmanin habercisi olabilir.', '70000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'avatarframe1', '#1A237E', '#3949AB', true, 'approved', 184, 2, true, now() - interval '2 days'),
  ('72000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'Duyuru', 'Ates Manga Haftalik Takvim', 'Bu hafta iki bolum birden yayinlayacagiz.', null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'fire', '#B71C1C', '#FF7043', false, 'approved', 95, 1, true, now() - interval '1 day')
on conflict (id) do update
set
  category = excluded.category,
  title = excluded.title,
  body = excluded.body,
  related_manga_id = excluded.related_manga_id,
  related_fansub_id = excluded.related_fansub_id,
  frame_type = excluded.frame_type,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  is_verified = excluded.is_verified,
  status = excluded.status,
  likes_count = excluded.likes_count,
  comments_count = excluded.comments_count,
  is_active = excluded.is_active;

insert into public.community_comments (
  id,
  post_id,
  author_id,
  body,
  likes_count,
  dislikes_count,
  is_pinned,
  is_active,
  created_at
)
values
  ('73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sembol teorisine katiliyorum, 94. bolumde benzeri vardi.', 42, 0, true, true, now() - interval '36 hours'),
  ('73000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Ben de ayni detayi yakaladim, guzel analiz.', 15, 0, false, true, now() - interval '20 hours'),
  ('73000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Takvim icin tesekkurler, beklemedeyiz.', 8, 0, false, true, now() - interval '12 hours')
on conflict (id) do update
set
  body = excluded.body,
  likes_count = excluded.likes_count,
  dislikes_count = excluded.dislikes_count,
  is_pinned = excluded.is_pinned,
  is_active = excluded.is_active;

insert into public.manga_comments (
  id,
  manga_id,
  user_id,
  content,
  likes,
  is_active,
  created_at
)
values
  ('74000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '128. bolum finali inanilmazdi.', 33, true, now() - interval '14 hours'),
  ('74000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Kilic tasarimi cok iyi, cizim kalitesi yukseldi.', 21, true, now() - interval '9 hours'),
  ('74000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000006', '44444444-4444-4444-4444-444444444444', 'Akademi turnuvasi arc''i guzel acildi.', 18, true, now() - interval '4 hours')
on conflict (id) do update
set
  content = excluded.content,
  likes = excluded.likes,
  is_active = excluded.is_active;

-- --------------------------------------------
-- BADGE OWNERSHIP (USER + FANSUB)
-- --------------------------------------------
insert into public.user_badges (user_id, badge_id, is_displayed, display_order)
select cfg.user_id, b.id, cfg.is_displayed, cfg.display_order
from (
  values
    ('11111111-1111-1111-1111-111111111111'::uuid, 'VIP Altin'::text, true, 1),
    ('11111111-1111-1111-1111-111111111111'::uuid, 'Manga Ustasi'::text, true, 2),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'Ilk Adim'::text, true, 1),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'Kitap Kurdu'::text, true, 2),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'Yorum Kahramani'::text, true, 1),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'Reader Gumus'::text, true, 1)
) as cfg(user_id, badge_name, is_displayed, display_order)
join public.badges b on b.name = cfg.badge_name
on conflict (user_id, badge_id) do update
set
  is_displayed = excluded.is_displayed,
  display_order = excluded.display_order;

update public.users u
set active_badge_id = b.id
from public.badges b
where
  (u.id = '11111111-1111-1111-1111-111111111111' and b.name = 'VIP Altin')
  or (u.id = '22222222-2222-2222-2222-222222222222' and b.name = 'Kitap Kurdu')
  or (u.id = '33333333-3333-3333-3333-333333333333' and b.name = 'Yorum Kahramani')
  or (u.id = '44444444-4444-4444-4444-444444444444' and b.name = 'Reader Gumus');

insert into public.fansub_badges (fansub_id, badge_id, is_displayed, display_order)
select cfg.fansub_id, b.id, cfg.is_displayed, cfg.display_order
from (
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'VIP Gumus'::text, true, 1),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'Destekci Seviye 2'::text, true, 2),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'VIP Bronz'::text, true, 1),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'Destekci Seviye 3'::text, true, 1)
) as cfg(fansub_id, badge_name, is_displayed, display_order)
join public.badges b on b.name = cfg.badge_name
on conflict (fansub_id, badge_id) do update
set
  is_displayed = excluded.is_displayed,
  display_order = excluded.display_order;

-- --------------------------------------------
-- STATS RECALC
-- --------------------------------------------
update public.fansubs f
set
  manga_count = (
    select count(*)
    from public.mangas m
    where m.fansub_id = f.id
      and m.is_active = true
  ),
  follower_count = (
    select count(*)
    from public.fansub_follows ff
    where ff.fansub_id = f.id
  );
