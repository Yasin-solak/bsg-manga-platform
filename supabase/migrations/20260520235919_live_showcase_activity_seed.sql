-- Live showcase seed: clean, traceable and rerunnable sample data.
-- Goal: show community, manga, chapter, premium, follow and fansub support surfaces not as an empty demo
-- but as an active community.

select set_config('request.jwt.claim.role', 'service_role', false);

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
  background_type,
  premium_expires_at,
  owned_items,
  social_links,
  is_active,
  onboarding_completed_at,
  profile_visibility,
  stats_visibility,
  social_links_visibility,
  activity_visibility
)
values
  (
    '21900000-0000-4000-8000-000000000001',
    '21900000-0000-4000-8000-000000000001',
    'panelustasi',
    'panelustasi',
    'https://api.dicebear.com/7.x/notionists/svg?seed=panelustasi',
    'moderator',
    'Panel temposu, sayfa akisi ve final teorileri uzerine yazar.',
    'Topluluk Rehberi',
    18420,
    'gold',
    'bg-city-glow',
    now() + interval '64 days',
    '{"frames":["default","gold","neon"],"backgrounds":["bg-city-glow","anime-neon-loop"],"patterns":["deneme-pattern-mm2z9mbt"],"badges":[],"premium":["namefx-pass"],"profile_effects":["deneme-effect-mn92xglv"]}'::jsonb,
    '[{"platform":"discord","username":"panelustasi"}]'::jsonb,
    true,
    now() - interval '38 days',
    'public',
    'public',
    'public',
    'public'
  ),
  (
    '21900000-0000-4000-8000-000000000002',
    '21900000-0000-4000-8000-000000000002',
    'cevirinora',
    'cevirinora',
    'https://api.dicebear.com/7.x/notionists/svg?seed=cevirinora',
    'user',
    'Ceviri notlari ve karakter dili uzerine uzun yorumlar birakir.',
    'Ceviri Avcisi',
    12880,
    'avatarframe1',
    'bg-sky-temple',
    now() + interval '42 days',
    '{"frames":["default","avatarframe1","gold"],"backgrounds":["bg-sky-temple"],"patterns":["deneme-pattern-mm2z9mbt"],"badges":[],"premium":["namefx-pass"],"profile_effects":["deneme-effect-deneme-mn908cg0"]}'::jsonb,
    '[{"platform":"x","username":"cevirinora"}]'::jsonb,
    true,
    now() - interval '31 days',
    'public',
    'public',
    'followers',
    'public'
  ),
  (
    '21900000-0000-4000-8000-000000000003',
    '21900000-0000-4000-8000-000000000003',
    'okurdeniz',
    'okurdeniz',
    'https://api.dicebear.com/7.x/notionists/svg?seed=okurdeniz',
    'user',
    'Haftalik okuma planlarini ve kisa incelemeleri paylasir.',
    'Maraton Okuru',
    9340,
    'neon',
    null,
    null,
    '{"frames":["default","neon"],"backgrounds":["bg-night-alley"],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb,
    '[{"platform":"instagram","username":"okurdeniz"}]'::jsonb,
    true,
    now() - interval '24 days',
    'public',
    'public',
    'public',
    'public'
  ),
  (
    '21900000-0000-4000-8000-000000000004',
    '21900000-0000-4000-8000-000000000004',
    'fanartmira',
    'fanartmira',
    'https://api.dicebear.com/7.x/notionists/svg?seed=fanartmira',
    'user',
    'Fan art, kapak paleti ve sahne eskizleriyle topluluga katilir.',
    'Gorsel Koleksiyoner',
    15110,
    'rainbow',
    'anime-neon-loop',
    now() + interval '29 days',
    '{"frames":["default","rainbow","avatarframe3"],"backgrounds":["anime-neon-loop","bg-dragon-hall"],"patterns":["deneme-pattern-mm2z9mbt"],"badges":[],"premium":["namefx-pass"],"profile_effects":["profile-effect-deneme-mn00fp3d"]}'::jsonb,
    '[{"platform":"artstation","username":"fanartmira"}]'::jsonb,
    true,
    now() - interval '22 days',
    'public',
    'followers',
    'public',
    'public'
  ),
  (
    '21900000-0000-4000-8000-000000000005',
    '21900000-0000-4000-8000-000000000005',
    'nighteditor',
    'nighteditor',
    'https://api.dicebear.com/7.x/notionists/svg?seed=nighteditor',
    'user',
    'Redaksiyon ve balon temizleme akislarinda aktif bir ekip uyesi.',
    'Editor',
    7020,
    'ice',
    null,
    null,
    '{"frames":["default","ice"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb,
    '[]'::jsonb,
    true,
    now() - interval '17 days',
    'public',
    'public',
    'private',
    'followers'
  ),
  (
    '21900000-0000-4000-8000-000000000006',
    '21900000-0000-4000-8000-000000000006',
    'takvimbaran',
    'takvimbaran',
    'https://api.dicebear.com/7.x/notionists/svg?seed=takvimbaran',
    'user',
    'Yeni bolum takvimlerini takip eder ve hatirlatma listeleri olusturur.',
    'Takvimci',
    11150,
    'halloween',
    'bg-dragon-hall',
    null,
    '{"frames":["default","halloween"],"backgrounds":["bg-dragon-hall"],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb,
    '[{"platform":"discord","username":"takvimbaran"}]'::jsonb,
    true,
    now() - interval '12 days',
    'public',
    'public',
    'followers',
    'public'
  )
on conflict (id) do nothing;

insert into public.user_notification_preferences (
  user_id,
  follow_enabled,
  comment_enabled,
  mention_enabled,
  badge_enabled,
  level_up_enabled,
  system_enabled
)
values
  ('21900000-0000-4000-8000-000000000001', true, true, true, true, true, true),
  ('21900000-0000-4000-8000-000000000002', true, true, true, true, true, true),
  ('21900000-0000-4000-8000-000000000003', true, true, false, true, true, true),
  ('21900000-0000-4000-8000-000000000004', true, true, true, true, true, true),
  ('21900000-0000-4000-8000-000000000005', true, false, true, true, true, true),
  ('21900000-0000-4000-8000-000000000006', true, true, true, true, false, true)
on conflict (user_id) do update
set
  follow_enabled = excluded.follow_enabled,
  comment_enabled = excluded.comment_enabled,
  mention_enabled = excluded.mention_enabled,
  badge_enabled = excluded.badge_enabled,
  level_up_enabled = excluded.level_up_enabled,
  system_enabled = excluded.system_enabled,
  updated_at = now();

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
  manga_count,
  follower_count,
  is_active,
  discord_invite_url,
  boost_frame_style
)
values
  (
    '21910000-0000-4000-8000-000000000001',
    'Kuzey Panel',
    'kuzey-panel',
    '/assets/promo/logo.png',
    'Aksiyon, politik fantazi ve haftalik teori basliklarinda aktif ekip.',
    'gold',
    '#0f172a',
    '#38bdf8',
    32500,
    0,
    0,
    true,
    'https://discord.gg/kuzey-panel',
    'gold'
  ),
  (
    '21910000-0000-4000-8000-000000000002',
    'Luna Fansub',
    'luna-fansub',
    '/assets/promo/logo.png',
    'Romantik dram, okul ve slice-of-life serilerinde temiz redaksiyon odakli ekip.',
    'rainbow',
    '#312e81',
    '#f9a8d4',
    28600,
    0,
    0,
    true,
    'https://discord.gg/luna-fansub',
    'gold'
  ),
  (
    '21910000-0000-4000-8000-000000000003',
    'Kara Kule Ceviri',
    'kara-kule-ceviri',
    '/assets/promo/logo.png',
    'Gizem, korku ve karanlik macera serilerinde bolum sonu notlariyla bilinir.',
    'neon',
    '#111827',
    '#f97316',
    24100,
    0,
    0,
    true,
    'https://discord.gg/kara-kule',
    'gold'
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
  is_active = excluded.is_active,
  discord_invite_url = excluded.discord_invite_url,
  boost_frame_style = excluded.boost_frame_style,
  updated_at = now();

insert into public.fansub_members (fansub_id, user_id, role, team_tag)
values
  ('21910000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000001', 'admin', 'Kurucu'),
  ('21910000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000002', 'moderator', 'Ceviri'),
  ('21910000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000006', 'member', 'Takvim'),
  ('21910000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000004', 'admin', 'Gorsel'),
  ('21910000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000005', 'moderator', 'Edit'),
  ('21910000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000003', 'member', 'Okur'),
  ('21910000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000005', 'admin', 'Redaktor'),
  ('21910000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000006', 'moderator', 'Takvim'),
  ('21910000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000001', 'member', 'Teori')
on conflict (fansub_id, user_id) do update
set role = excluded.role,
    team_tag = excluded.team_tag;

insert into public.fansub_identity_tags (id, fansub_id, audience, shortcode, badge_key, created_by, updated_by)
values
  ('21911000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000001', 'shared', 'KP', 'blade', '21900000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000001'),
  ('21911000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000002', 'shared', 'LUNA', 'moon', '21900000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000004'),
  ('21911000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000003', 'shared', 'KK', 'flame', '21900000-0000-4000-8000-000000000005', '21900000-0000-4000-8000-000000000005')
on conflict (fansub_id) do update
set
  shortcode = excluded.shortcode,
  badge_key = excluded.badge_key,
  updated_by = excluded.updated_by,
  updated_at = now(),
  governance_changed_at = now();

insert into public.user_selected_fansub_identity_tags (user_id, fansub_identity_tag_id)
values
  ('21900000-0000-4000-8000-000000000001', '21911000-0000-4000-8000-000000000001'),
  ('21900000-0000-4000-8000-000000000002', '21911000-0000-4000-8000-000000000001'),
  ('21900000-0000-4000-8000-000000000004', '21911000-0000-4000-8000-000000000002'),
  ('21900000-0000-4000-8000-000000000005', '21911000-0000-4000-8000-000000000003'),
  ('21900000-0000-4000-8000-000000000006', '21911000-0000-4000-8000-000000000003')
on conflict (user_id) do update
set fansub_identity_tag_id = excluded.fansub_identity_tag_id,
    updated_at = now();

insert into public.user_follows (follower_id, following_id, created_at)
values
  ('21900000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000001', now() - interval '21 days'),
  ('21900000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000001', now() - interval '18 days'),
  ('21900000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000002', now() - interval '16 days'),
  ('21900000-0000-4000-8000-000000000005', '21900000-0000-4000-8000-000000000004', now() - interval '13 days'),
  ('21900000-0000-4000-8000-000000000006', '21900000-0000-4000-8000-000000000003', now() - interval '11 days'),
  ('21900000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000004', now() - interval '9 days'),
  ('21900000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000006', now() - interval '7 days'),
  ('21900000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000005', now() - interval '5 days')
on conflict (follower_id, following_id) do nothing;

insert into public.fansub_follows (user_id, fansub_id, created_at)
values
  ('21900000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000002', now() - interval '20 days'),
  ('21900000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000001', now() - interval '19 days'),
  ('21900000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000003', now() - interval '12 days'),
  ('21900000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000001', now() - interval '15 days'),
  ('21900000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000002', now() - interval '14 days'),
  ('21900000-0000-4000-8000-000000000004', '21910000-0000-4000-8000-000000000002', now() - interval '12 days'),
  ('21900000-0000-4000-8000-000000000004', '21910000-0000-4000-8000-000000000003', now() - interval '10 days'),
  ('21900000-0000-4000-8000-000000000005', '21910000-0000-4000-8000-000000000003', now() - interval '8 days'),
  ('21900000-0000-4000-8000-000000000006', '21910000-0000-4000-8000-000000000001', now() - interval '7 days'),
  ('21900000-0000-4000-8000-000000000006', '21910000-0000-4000-8000-000000000003', now() - interval '6 days')
on conflict (user_id, fansub_id) do nothing;

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
  ('21920000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000001', 'Kuzey Kalesi Gunlukleri', 'kuzey-kalesi-gunlukleri', '/covers/optimized/dragon-court.webp', 'Sinir kalesinde gecen politik fantazi ve savas gunlukleri.', 'Arin Koru', 'Mete Panel', 'ongoing', 0, 0, 18420, true, true, true, 4, array['Fantastik','Aksiyon','Politik'], 'ko', current_date - interval '90 days'),
  ('21920000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000002', 'Luna Cicekleri', 'luna-cicekleri', '/covers/optimized/starlight-academy.webp', 'Okul kulubu, mektup defteri ve yavas yanan romantik dram.', 'Sera Moon', 'Ilke Tone', 'ongoing', 0, 0, 13760, true, true, true, 4, array['Romantizm','Dram','Okul'], 'ja', current_date - interval '74 days'),
  ('21920000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000003', 'Kara Kule Arsivi', 'kara-kule-arsivi', '/covers/optimized/deep-abyss.webp', 'Eski kule kayitlarindan cikan gizemli olay dosyalari.', 'N. Kadir', 'Kule Studio', 'ongoing', 0, 0, 16480, true, true, true, 4, array['Gizem','Korku','Macera'], 'ko', current_date - interval '65 days'),
  ('21920000-0000-4000-8000-000000000004', '21910000-0000-4000-8000-000000000001', 'Ruzgar Loncasinin Son Isi', 'ruzgar-loncasinin-son-isi', '/covers/optimized/wind-chronicle.webp', 'Lonca kontratlari, sahte kimlikler ve hizli aksiyon uzerine bir macera.', 'Deren Ay', 'PanelWorks', 'hiatus', 0, 0, 11990, false, true, true, 4, array['Macera','Aksiyon','Komedi'], 'zh', current_date - interval '110 days')
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
  total_views = excluded.total_views,
  is_new = excluded.is_new,
  is_approved = excluded.is_approved,
  is_active = excluded.is_active,
  last_chapter_number = excluded.last_chapter_number,
  genres = excluded.genres,
  original_lang = excluded.original_lang,
  release_date = excluded.release_date,
  updated_at = now();

insert into public.chapters (
  id,
  manga_id,
  fansub_id,
  chapter_number,
  title,
  pages,
  is_approved,
  is_active,
  publish_at,
  notes
)
values
  ('21930000-0000-4000-8000-000000000101', '21920000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000001', 1, 'Kale Kapisi', '["https://placehold.co/1200x1800/0f172a/f8fafc?text=KKG-1-1","https://placehold.co/1200x1800/111827/f8fafc?text=KKG-1-2","https://placehold.co/1200x1800/1e293b/f8fafc?text=KKG-1-3"]'::jsonb, true, true, now() - interval '28 days', 'Seri acilis notu ve karakter listesi eklendi.'),
  ('21930000-0000-4000-8000-000000000102', '21920000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000001', 2, 'Kar NÃ¶beti', '["https://placehold.co/1200x1800/0f172a/f8fafc?text=KKG-2-1","https://placehold.co/1200x1800/111827/f8fafc?text=KKG-2-2","https://placehold.co/1200x1800/1e293b/f8fafc?text=KKG-2-3"]'::jsonb, true, true, now() - interval '21 days', 'Bolum sonu terim sozlugu guncellendi.'),
  ('21930000-0000-4000-8000-000000000103', '21920000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000001', 3, 'Kirik Muhur', '["https://placehold.co/1200x1800/0f172a/f8fafc?text=KKG-3-1","https://placehold.co/1200x1800/111827/f8fafc?text=KKG-3-2","https://placehold.co/1200x1800/1e293b/f8fafc?text=KKG-3-3"]'::jsonb, true, true, now() - interval '14 days', 'Ceviri notlari kontrol edildi.'),
  ('21930000-0000-4000-8000-000000000104', '21920000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000001', 4, 'Kuzey Mesaji', '["https://placehold.co/1200x1800/0f172a/f8fafc?text=KKG-4-1","https://placehold.co/1200x1800/111827/f8fafc?text=KKG-4-2","https://placehold.co/1200x1800/1e293b/f8fafc?text=KKG-4-3"]'::jsonb, true, true, now() + interval '2 days', 'Planli yayin icin hazir.'),
  ('21930000-0000-4000-8000-000000000201', '21920000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000002', 1, 'Ay Isigi Kulubu', '["https://placehold.co/1200x1800/312e81/fdf2f8?text=LC-1-1","https://placehold.co/1200x1800/4c1d95/fdf2f8?text=LC-1-2","https://placehold.co/1200x1800/831843/fdf2f8?text=LC-1-3"]'::jsonb, true, true, now() - interval '24 days', 'Acilis bolumu.'),
  ('21930000-0000-4000-8000-000000000202', '21920000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000002', 2, 'Cati Katinda Mektup', '["https://placehold.co/1200x1800/312e81/fdf2f8?text=LC-2-1","https://placehold.co/1200x1800/4c1d95/fdf2f8?text=LC-2-2","https://placehold.co/1200x1800/831843/fdf2f8?text=LC-2-3"]'::jsonb, true, true, now() - interval '17 days', 'Redaksiyon kontrolu tamam.'),
  ('21930000-0000-4000-8000-000000000203', '21920000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000002', 3, 'Sessiz Bahce', '["https://placehold.co/1200x1800/312e81/fdf2f8?text=LC-3-1","https://placehold.co/1200x1800/4c1d95/fdf2f8?text=LC-3-2","https://placehold.co/1200x1800/831843/fdf2f8?text=LC-3-3"]'::jsonb, true, true, now() - interval '10 days', 'Karakter isimleri standartlastirildi.'),
  ('21930000-0000-4000-8000-000000000204', '21920000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000002', 4, 'Defterin Son Sayfasi', '["https://placehold.co/1200x1800/312e81/fdf2f8?text=LC-4-1","https://placehold.co/1200x1800/4c1d95/fdf2f8?text=LC-4-2","https://placehold.co/1200x1800/831843/fdf2f8?text=LC-4-3"]'::jsonb, true, true, now() + interval '5 days', 'Planli yayin icin bekliyor.'),
  ('21930000-0000-4000-8000-000000000301', '21920000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000003', 1, 'Tozlu Katalog', '["https://placehold.co/1200x1800/111827/fef3c7?text=KKA-1-1","https://placehold.co/1200x1800/1f2937/fef3c7?text=KKA-1-2","https://placehold.co/1200x1800/431407/fef3c7?text=KKA-1-3"]'::jsonb, true, true, now() - interval '26 days', 'Korku tonu icin dusuk kontrast kontrol edildi.'),
  ('21930000-0000-4000-8000-000000000302', '21920000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000003', 2, 'Yedinci Raf', '["https://placehold.co/1200x1800/111827/fef3c7?text=KKA-2-1","https://placehold.co/1200x1800/1f2937/fef3c7?text=KKA-2-2","https://placehold.co/1200x1800/431407/fef3c7?text=KKA-2-3"]'::jsonb, true, true, now() - interval '18 days', 'Sifreli metinler icin not eklendi.'),
  ('21930000-0000-4000-8000-000000000303', '21920000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000003', 3, 'Bos Oda', '["https://placehold.co/1200x1800/111827/fef3c7?text=KKA-3-1","https://placehold.co/1200x1800/1f2937/fef3c7?text=KKA-3-2","https://placehold.co/1200x1800/431407/fef3c7?text=KKA-3-3"]'::jsonb, true, true, now() - interval '9 days', 'Balon akisi yeniden kontrol edildi.'),
  ('21930000-0000-4000-8000-000000000304', '21920000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000003', 4, 'Kuleden Gelen Ses', '["https://placehold.co/1200x1800/111827/fef3c7?text=KKA-4-1","https://placehold.co/1200x1800/1f2937/fef3c7?text=KKA-4-2","https://placehold.co/1200x1800/431407/fef3c7?text=KKA-4-3"]'::jsonb, true, true, now() + interval '1 day', 'Planli yayin icin bekliyor.'),
  ('21930000-0000-4000-8000-000000000401', '21920000-0000-4000-8000-000000000004', '21910000-0000-4000-8000-000000000001', 1, 'Lonca Masasi', '["https://placehold.co/1200x1800/0f766e/ecfeff?text=RLSI-1-1","https://placehold.co/1200x1800/0e7490/ecfeff?text=RLSI-1-2","https://placehold.co/1200x1800/155e75/ecfeff?text=RLSI-1-3"]'::jsonb, true, true, now() - interval '34 days', 'Komedi tonu icin ekstra not.'),
  ('21930000-0000-4000-8000-000000000402', '21920000-0000-4000-8000-000000000004', '21910000-0000-4000-8000-000000000001', 2, 'Sahte Harita', '["https://placehold.co/1200x1800/0f766e/ecfeff?text=RLSI-2-1","https://placehold.co/1200x1800/0e7490/ecfeff?text=RLSI-2-2","https://placehold.co/1200x1800/155e75/ecfeff?text=RLSI-2-3"]'::jsonb, true, true, now() - interval '25 days', 'Ses efektleri sade tutuldu.'),
  ('21930000-0000-4000-8000-000000000403', '21920000-0000-4000-8000-000000000004', '21910000-0000-4000-8000-000000000001', 3, 'Kacis Plani', '["https://placehold.co/1200x1800/0f766e/ecfeff?text=RLSI-3-1","https://placehold.co/1200x1800/0e7490/ecfeff?text=RLSI-3-2","https://placehold.co/1200x1800/155e75/ecfeff?text=RLSI-3-3"]'::jsonb, true, true, now() - interval '15 days', 'Aksiyon gecisi test edildi.'),
  ('21930000-0000-4000-8000-000000000404', '21920000-0000-4000-8000-000000000004', '21910000-0000-4000-8000-000000000001', 4, 'Son Is', '["https://placehold.co/1200x1800/0f766e/ecfeff?text=RLSI-4-1","https://placehold.co/1200x1800/0e7490/ecfeff?text=RLSI-4-2","https://placehold.co/1200x1800/155e75/ecfeff?text=RLSI-4-3"]'::jsonb, true, true, now() - interval '3 days', 'Sezon arasi notu eklendi.')
on conflict (id) do update
set
  title = excluded.title,
  pages = excluded.pages,
  is_approved = excluded.is_approved,
  is_active = excluded.is_active,
  publish_at = excluded.publish_at,
  notes = excluded.notes,
  updated_at = now();

insert into public.manga_follows (user_id, manga_id, created_at)
values
  ('21900000-0000-4000-8000-000000000001', '21920000-0000-4000-8000-000000000002', now() - interval '18 days'),
  ('21900000-0000-4000-8000-000000000001', '21920000-0000-4000-8000-000000000003', now() - interval '9 days'),
  ('21900000-0000-4000-8000-000000000002', '21920000-0000-4000-8000-000000000001', now() - interval '21 days'),
  ('21900000-0000-4000-8000-000000000002', '21920000-0000-4000-8000-000000000003', now() - interval '12 days'),
  ('21900000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000001', now() - interval '17 days'),
  ('21900000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000004', now() - interval '8 days'),
  ('21900000-0000-4000-8000-000000000004', '21920000-0000-4000-8000-000000000002', now() - interval '15 days'),
  ('21900000-0000-4000-8000-000000000004', '21920000-0000-4000-8000-000000000003', now() - interval '11 days'),
  ('21900000-0000-4000-8000-000000000005', '21920000-0000-4000-8000-000000000003', now() - interval '10 days'),
  ('21900000-0000-4000-8000-000000000006', '21920000-0000-4000-8000-000000000001', now() - interval '7 days'),
  ('21900000-0000-4000-8000-000000000006', '21920000-0000-4000-8000-000000000004', now() - interval '5 days')
on conflict (user_id, manga_id) do nothing;

insert into public.manga_ratings (manga_id, user_id, rating, created_at, updated_at)
values
  ('21920000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000001', 5, now() - interval '17 days', now()),
  ('21920000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000002', 5, now() - interval '16 days', now()),
  ('21920000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000003', 4, now() - interval '14 days', now()),
  ('21920000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000006', 4, now() - interval '8 days', now()),
  ('21920000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000001', 4, now() - interval '13 days', now()),
  ('21920000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000002', 5, now() - interval '12 days', now()),
  ('21920000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000004', 5, now() - interval '10 days', now()),
  ('21920000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000005', 4, now() - interval '8 days', now()),
  ('21920000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000001', 5, now() - interval '11 days', now()),
  ('21920000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000003', 4, now() - interval '10 days', now()),
  ('21920000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000004', 5, now() - interval '9 days', now()),
  ('21920000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000005', 5, now() - interval '6 days', now()),
  ('21920000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000001', 4, now() - interval '9 days', now()),
  ('21920000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000003', 4, now() - interval '7 days', now()),
  ('21920000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000006', 5, now() - interval '5 days', now())
on conflict (manga_id, user_id) do update
set rating = excluded.rating,
    updated_at = now();

update public.mangas m
set rating = r.avg_rating,
    total_ratings = r.rating_count,
    updated_at = now()
from (
  select manga_id, round(avg(rating)::numeric, 2) as avg_rating, count(*)::integer as rating_count
  from public.manga_ratings
  where manga_id in (
    '21920000-0000-4000-8000-000000000001',
    '21920000-0000-4000-8000-000000000002',
    '21920000-0000-4000-8000-000000000003',
    '21920000-0000-4000-8000-000000000004'
  )
  group by manga_id
) r
where m.id = r.manga_id;

insert into public.reading_history (id, user_id, manga_id, chapter_id, chapter_number, read_at)
values
  ('21932000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000001', '21920000-0000-4000-8000-000000000002', '21930000-0000-4000-8000-000000000203', 3, now() - interval '2 days'),
  ('21932000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000001', '21920000-0000-4000-8000-000000000003', '21930000-0000-4000-8000-000000000303', 3, now() - interval '8 hours'),
  ('21932000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000002', '21920000-0000-4000-8000-000000000001', '21930000-0000-4000-8000-000000000103', 3, now() - interval '1 day'),
  ('21932000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000002', '21920000-0000-4000-8000-000000000003', '21930000-0000-4000-8000-000000000302', 2, now() - interval '5 days'),
  ('21932000-0000-4000-8000-000000000005', '21900000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000001', '21930000-0000-4000-8000-000000000102', 2, now() - interval '4 days'),
  ('21932000-0000-4000-8000-000000000006', '21900000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000004', '21930000-0000-4000-8000-000000000404', 4, now() - interval '7 hours'),
  ('21932000-0000-4000-8000-000000000007', '21900000-0000-4000-8000-000000000004', '21920000-0000-4000-8000-000000000002', '21930000-0000-4000-8000-000000000203', 3, now() - interval '3 days'),
  ('21932000-0000-4000-8000-000000000008', '21900000-0000-4000-8000-000000000004', '21920000-0000-4000-8000-000000000003', '21930000-0000-4000-8000-000000000303', 3, now() - interval '4 hours'),
  ('21932000-0000-4000-8000-000000000009', '21900000-0000-4000-8000-000000000005', '21920000-0000-4000-8000-000000000003', '21930000-0000-4000-8000-000000000303', 3, now() - interval '2 days'),
  ('21932000-0000-4000-8000-000000000010', '21900000-0000-4000-8000-000000000006', '21920000-0000-4000-8000-000000000001', '21930000-0000-4000-8000-000000000103', 3, now() - interval '1 hour'),
  ('21932000-0000-4000-8000-000000000011', '21900000-0000-4000-8000-000000000006', '21920000-0000-4000-8000-000000000004', '21930000-0000-4000-8000-000000000404', 4, now() - interval '6 hours')
on conflict (user_id, manga_id) do update
set chapter_id = excluded.chapter_id,
    chapter_number = excluded.chapter_number,
    read_at = excluded.read_at;

insert into public.user_manga_lists (
  id,
  owner_id,
  title,
  description,
  is_public,
  cover_manga_id,
  items_count,
  ratings_count,
  rating_avg,
  comments_count,
  category_id
)
values
  ('21980000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000003', 'Hafta Sonu Maratonu', 'Kisa surede yetismesi gereken aksiyon ve gizem serileri.', true, '21920000-0000-4000-8000-000000000001', 0, 7, 4.6, 3, 'action'),
  ('21980000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000004', 'Renk Paleti Ilhamlari', 'Kapak ve sahne paleti acisindan takip ettigim seriler.', true, '21920000-0000-4000-8000-000000000002', 0, 5, 4.8, 2, 'romance'),
  ('21980000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000006', 'Takvimde Bekleyenler', 'Yayin gunu yaklasan bolumleri takip listem.', true, '21920000-0000-4000-8000-000000000003', 0, 4, 4.5, 1, 'mystery')
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  is_public = excluded.is_public,
  cover_manga_id = excluded.cover_manga_id,
  ratings_count = excluded.ratings_count,
  rating_avg = excluded.rating_avg,
  comments_count = excluded.comments_count,
  category_id = excluded.category_id,
  updated_at = now();

insert into public.user_manga_list_items (id, list_id, manga_id, position, note)
values
  ('21981000-0000-4000-8000-000000000001', '21980000-0000-4000-8000-000000000001', '21920000-0000-4000-8000-000000000001', 1, 'Politik savas teorileri icin.'),
  ('21981000-0000-4000-8000-000000000002', '21980000-0000-4000-8000-000000000001', '21920000-0000-4000-8000-000000000003', 2, 'Gec okunacak gizem.'),
  ('21981000-0000-4000-8000-000000000003', '21980000-0000-4000-8000-000000000001', '21920000-0000-4000-8000-000000000004', 3, 'Ara sezon icin hafif tempo.'),
  ('21981000-0000-4000-8000-000000000004', '21980000-0000-4000-8000-000000000002', '21920000-0000-4000-8000-000000000002', 1, 'Pastel kapak dili.'),
  ('21981000-0000-4000-8000-000000000005', '21980000-0000-4000-8000-000000000002', '21920000-0000-4000-8000-000000000003', 2, 'Koyu ton dengesi.'),
  ('21981000-0000-4000-8000-000000000006', '21980000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000001', 1, 'Iki gun sonra yayin.'),
  ('21981000-0000-4000-8000-000000000007', '21980000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000002', 2, 'Bes gun sonra yayin.'),
  ('21981000-0000-4000-8000-000000000008', '21980000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000003', 3, 'Yarin yayin.')
on conflict (id) do update
set list_id = excluded.list_id,
    manga_id = excluded.manga_id,
    position = excluded.position,
    note = excluded.note,
    updated_at = now();

update public.user_manga_lists l
set items_count = i.item_count,
    updated_at = now()
from (
  select list_id, count(*)::integer as item_count
  from public.user_manga_list_items
  where list_id in (
    '21980000-0000-4000-8000-000000000001',
    '21980000-0000-4000-8000-000000000002',
    '21980000-0000-4000-8000-000000000003'
  )
  group by list_id
) i
where l.id = i.list_id;

insert into public.release_schedule_reminders (
  id,
  user_id,
  target_kind,
  target_id,
  manga_id,
  chapter_id,
  reminder_text,
  notification_due_at,
  notification_status
)
values
  ('21933000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000006', 'chapter', '21930000-0000-4000-8000-000000000104', '21920000-0000-4000-8000-000000000001', '21930000-0000-4000-8000-000000000104', 'Yayinlaninca yorum basligini ac.', now() + interval '2 days', 'queued'),
  ('21933000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000003', 'chapter', '21930000-0000-4000-8000-000000000204', '21920000-0000-4000-8000-000000000002', '21930000-0000-4000-8000-000000000204', 'Okuma listesine ekle.', now() + interval '5 days', 'queued'),
  ('21933000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000004', 'next_chapter', '21920000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000003', null, 'Yeni bolum geldikce haber ver.', null, 'queued'),
  ('21933000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000001', 'next_chapter', '21920000-0000-4000-8000-000000000004', '21920000-0000-4000-8000-000000000004', null, 'Ara sezon donusunu takip et.', null, 'queued')
on conflict (user_id, target_kind, target_id) do update
set reminder_text = excluded.reminder_text,
    notification_due_at = excluded.notification_due_at,
    notification_status = excluded.notification_status,
    updated_at = now();

insert into public.user_reading_plan_items (
  id,
  user_id,
  manga_id,
  chapter_id,
  source,
  status,
  release_publish_at
)
values
  ('21934000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000006', '21920000-0000-4000-8000-000000000001', '21930000-0000-4000-8000-000000000104', 'release_schedule', 'planned', now() + interval '2 days'),
  ('21934000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000002', '21930000-0000-4000-8000-000000000204', 'release_schedule', 'planned', now() + interval '5 days'),
  ('21934000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000004', '21920000-0000-4000-8000-000000000003', '21930000-0000-4000-8000-000000000304', 'release_schedule', 'planned', now() + interval '1 day'),
  ('21934000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000001', '21920000-0000-4000-8000-000000000004', '21930000-0000-4000-8000-000000000404', 'manual', 'done', now() - interval '3 days')
on conflict (user_id, chapter_id) do update
set source = excluded.source,
    status = excluded.status,
    release_publish_at = excluded.release_publish_at,
    updated_at = now();

insert into public.manga_comments (id, manga_id, user_id, parent_id, content, likes, is_active, chapter_id, dislikes, is_spoiler, created_at)
values
  ('21935000-0000-4000-8000-000000000001', '21920000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000002', null, 'Bolum 3 sonundaki muhur sahnesi sonraki savasi hazirliyor gibi.', 8, true, '21930000-0000-4000-8000-000000000103', 0, true, now() - interval '6 days'),
  ('21935000-0000-4000-8000-000000000002', '21920000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000006', null, 'Takvimdeki yeni bolum icin hatirlatma kurdum, onceki bolum notlari guzel duruyor.', 5, true, '21930000-0000-4000-8000-000000000103', 0, false, now() - interval '2 days'),
  ('21935000-0000-4000-8000-000000000003', '21920000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000004', null, 'Kapak paleti ve okul sahneleri feed kartlarinda cok iyi okunuyor.', 10, true, '21930000-0000-4000-8000-000000000203', 0, false, now() - interval '5 days'),
  ('21935000-0000-4000-8000-000000000004', '21920000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000001', null, 'Kule arsivindeki bos oda detayi bence ana gizemin anahtari.', 11, true, '21930000-0000-4000-8000-000000000303', 1, true, now() - interval '3 days'),
  ('21935000-0000-4000-8000-000000000005', '21920000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000003', null, 'Ara sezon olsa da son bolum tempoyu guzel kapatti.', 4, true, '21930000-0000-4000-8000-000000000404', 0, false, now() - interval '18 hours')
on conflict (id) do update
set content = excluded.content,
    likes = excluded.likes,
    is_active = excluded.is_active,
    chapter_id = excluded.chapter_id,
    dislikes = excluded.dislikes,
    is_spoiler = excluded.is_spoiler,
    updated_at = now();

