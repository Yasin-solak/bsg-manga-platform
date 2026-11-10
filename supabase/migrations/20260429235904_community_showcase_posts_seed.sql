-- Sample content that makes the community page design showcase meaningful on an empty database too.
-- Since "Duyuru" is forbidden for community_posts.category the announcement look comes through a tag.

insert into public.users (
  id,
  auth_user_id,
  username,
  username_slug,
  avatar_url,
  bio,
  level,
  role,
  stones,
  frame_type,
  is_banned,
  is_active
)
values
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'akira99', 'akira99', 'https://api.dicebear.com/7.x/avataaars/svg?seed=akira99', 'Teori ve bolum tartismalarini sever.', 'Moderator', 'user', 1200, 'avatarframe1', false, true),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'lunachan', 'lunachan', 'https://api.dicebear.com/7.x/avataaars/svg?seed=lunachan', 'Fan art ve romantik seri okuru.', 'Sanatci', 'user', 980, 'avatarframe3', false, true),
  ('44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'soulreaper', 'soulreaper', 'https://api.dicebear.com/7.x/avataaars/svg?seed=soulreaper', 'Anket ve aksiyon serileri takipcisi.', 'Aktif Uye', 'user', 720, 'fire', false, true),
  ('55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 'otakutrend', 'otakutrend', 'https://api.dicebear.com/7.x/avataaars/svg?seed=otakutrend', 'Inceleme ve sezon takibi.', 'Kritik', 'user', 640, 'neon', false, true),
  ('66666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 'kuroneko', 'kuroneko', 'https://api.dicebear.com/7.x/avataaars/svg?seed=kuroneko', 'Yeni baslayanlara seri onerir.', 'Rehber', 'user', 520, 'ice', false, true)
on conflict (id) do nothing;

insert into public.fansubs (
  id,
  name,
  slug,
  avatar_url,
  description,
  frame_type,
  primary_color,
  secondary_color,
  manga_count,
  follower_count,
  is_active
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'MangaZone', 'mangazone', '/assets/promo/logo.png', 'Topluluk ve proje duyurulari.', 'gold', '#f97316', '#ef4444', 12, 24800, true)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  avatar_url = excluded.avatar_url,
  description = excluded.description,
  frame_type = excluded.frame_type,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  manga_count = excluded.manga_count,
  follower_count = excluded.follower_count,
  is_active = excluded.is_active;

insert into public.mangas (
  id,
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
  original_lang
)
values
  ('70000000-0000-0000-0000-000000000001', 'Kizil Safak Efsanesi', 'kizil-safak-efsanesi', '/covers/optimized/shadow-warrior.webp', 'Intikam, klan savasi ve kadim gucler.', 'MangaZone Studio', 'MangaZone Studio', 'ongoing', 4.8, 128, 245000, false, true, true, 125, array['Aksiyon','Fantastik','Macera'], 'tr'),
  ('70000000-0000-0000-0000-000000000003', 'Golgelerin Dirilisi', 'golgelerin-dirilisi', '/covers/optimized/deep-abyss.webp', 'Golge gucuyle yeniden dogan bir savascinin hikayesi.', 'MangaZone Studio', 'MangaZone Studio', 'ongoing', 4.7, 96, 188000, false, true, true, 112, array['Aksiyon','Gizem'], 'tr')
on conflict (id) do update
set
  title = excluded.title,
  slug = excluded.slug,
  cover_image_url = excluded.cover_image_url,
  description = excluded.description,
  status = excluded.status,
  rating = excluded.rating,
  total_ratings = excluded.total_ratings,
  total_views = excluded.total_views,
  is_approved = excluded.is_approved,
  is_active = excluded.is_active,
  last_chapter_number = excluded.last_chapter_number,
  genres = excluded.genres;

insert into public.community_posts (
  id,
  author_id,
  category,
  title,
  body,
  related_manga_id,
  related_fansub_id,
  related_fansub_ids,
  mentioned_manga_ids,
  mentioned_user_ids,
  tags,
  frame_type,
  primary_color,
  secondary_color,
  is_verified,
  status,
  approved_at,
  approved_by,
  likes_count,
  comments_count,
  views_count,
  shares_count,
  reactions_count,
  poll_votes_count,
  is_active,
  created_at
)
values
  ('72000000-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222', 'Tartisma', 'Kizil Safak 125. bolum teorileri', 'Son sahnedeki siluetin kim oldugu hakkinda ne dusunuyorsunuz? Benim tahminim Kara Lordun geri donusu olabilir.', '70000000-0000-0000-0000-000000000001', null, array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1']::uuid[], array['70000000-0000-0000-0000-000000000001']::uuid[], '{}'::uuid[], array['tartisma','teori','spoilerli-tartisma','kizil-safak'], 'avatarframe1', '#ef4444', '#111827', true, 'approved', now() - interval '2 hours', '22222222-2222-2222-2222-222222222222', 245, 98, 12800, 42, 21, 0, true, now() - interval '2 hours'),
  ('72000000-0000-0000-0000-000000000011', '33333333-3333-3333-3333-333333333333', 'Fan Art', 'Eternal Dream fan artim', 'Uzun zaman sonra cizim yaptim, begenirseniz cok mutlu olurum. Yorumlarinizi bekliyorum!', null, null, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array['fan-art','eternal-dream','romantik'], 'avatarframe3', '#ec4899', '#8b5cf6', false, 'approved', now() - interval '3 hours', '22222222-2222-2222-2222-222222222222', 312, 76, 9400, 31, 18, 0, true, now() - interval '3 hours'),
  ('72000000-0000-0000-0000-000000000012', '44444444-4444-4444-4444-444444444444', 'Anket', 'En iyi manhwa hangisi?', 'Sizce su an en iyi manhwa hangisi? Oylarinizi kullanin, yorumlarda nedenini de yazin.', null, null, '{}'::uuid[], array['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003']::uuid[], '{}'::uuid[], array['anket','solo-leveling','yeni-bolum'], 'fire', '#f97316', '#ef4444', false, 'approved', now() - interval '4 hours', '22222222-2222-2222-2222-222222222222', 412, 152, 18400, 64, 29, 412, true, now() - interval '4 hours'),
  ('72000000-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222', 'Haber', 'Yeni proje: Ay Isiginin Mirasi', 'Cevirisine basladigimiz yeni projemiz cok yakinda sizlerle. Ilk bolum icin takipte kalin.', null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array['duyuru','yeni-bolum','fansub'], 'gold', '#f59e0b', '#ef4444', true, 'approved', now() - interval '5 hours', '22222222-2222-2222-2222-222222222222', 198, 64, 7600, 22, 11, 0, true, now() - interval '5 hours'),
  ('72000000-0000-0000-0000-000000000014', '55555555-5555-5555-5555-555555555555', 'Inceleme', 'Golgelerin Dirilisi 112. bolum incelemesi', 'Bu bolumdeki savas sahneleri ve animasyon kalitesi inanilmazdi. Dusuncelerimi yazdim, yorumlarinizi bekliyorum.', '70000000-0000-0000-0000-000000000003', null, '{}'::uuid[], array['70000000-0000-0000-0000-000000000003']::uuid[], '{}'::uuid[], array['inceleme','golgelerin-dirilisi','teori'], 'neon', '#38bdf8', '#6366f1', false, 'approved', now() - interval '6 hours', '22222222-2222-2222-2222-222222222222', 112, 38, 5400, 12, 9, 0, true, now() - interval '6 hours'),
  ('72000000-0000-0000-0000-000000000015', '66666666-6666-6666-6666-666666666666', 'Soru & Cevap', 'Yeni baslayanlar icin 5 seri onerisi?', 'Arkadasimi platforma davet ettim. Baslangic icin temposu iyi, cok uzun olmayan seri onerileriniz var mi?', null, null, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array['soru-cevap','oneri','yeni-baslayan'], 'ice', '#60a5fa', '#22d3ee', false, 'approved', now() - interval '8 hours', '22222222-2222-2222-2222-222222222222', 87, 54, 3900, 8, 7, 0, true, now() - interval '8 hours')
on conflict (id) do update
set
  category = excluded.category,
  title = excluded.title,
  body = excluded.body,
  related_manga_id = excluded.related_manga_id,
  related_fansub_id = excluded.related_fansub_id,
  related_fansub_ids = excluded.related_fansub_ids,
  mentioned_manga_ids = excluded.mentioned_manga_ids,
  mentioned_user_ids = excluded.mentioned_user_ids,
  tags = excluded.tags,
  frame_type = excluded.frame_type,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  is_verified = excluded.is_verified,
  status = excluded.status,
  approved_at = excluded.approved_at,
  approved_by = excluded.approved_by,
  likes_count = excluded.likes_count,
  comments_count = excluded.comments_count,
  views_count = excluded.views_count,
  shares_count = excluded.shares_count,
  reactions_count = excluded.reactions_count,
  poll_votes_count = excluded.poll_votes_count,
  is_active = excluded.is_active,
  created_at = excluded.created_at;

insert into public.community_post_assets (
  id,
  post_id,
  asset_type,
  provider,
  provider_asset_id,
  original_url,
  preview_url,
  width,
  height,
  alt_text,
  position,
  metadata
)
values
  ('72500000-0000-0000-0000-000000000010', '72000000-0000-0000-0000-000000000010', 'image', 'r2', 'showcase/community/kizil-safak.webp', '/covers/optimized/shadow-warrior.webp', '/covers/optimized/shadow-warrior.webp', 1280, 720, 'Kizil Safak aksiyon sahnesi', 1, '{"source":"showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000011', '72000000-0000-0000-0000-000000000011', 'image', 'r2', 'showcase/community/eternal-dream-1.webp', '/assets/explore/collections/romantik.webp', '/assets/explore/collections/romantik.webp', 1280, 720, 'Eternal Dream fan art calismasi', 1, '{"source":"showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000012', '72000000-0000-0000-0000-000000000011', 'image', 'r2', 'showcase/community/eternal-dream-2.webp', '/covers/optimized/starlight-academy.webp', '/covers/optimized/starlight-academy.webp', 1280, 720, 'Karakter portresi', 2, '{"source":"showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000013', '72000000-0000-0000-0000-000000000011', 'image', 'r2', 'showcase/community/eternal-dream-3.webp', '/backgrounds/optimized/bg-sky-temple.webp', '/backgrounds/optimized/bg-sky-temple.webp', 1280, 720, 'Cizim sureci arka plani', 3, '{"source":"showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000014', '72000000-0000-0000-0000-000000000013', 'image', 'r2', 'showcase/community/ay-isigi.webp', '/covers/optimized/deep-abyss.webp', '/covers/optimized/deep-abyss.webp', 1280, 720, 'Ay Isiginin Mirasi duyuru gorseli', 1, '{"source":"showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000015', '72000000-0000-0000-0000-000000000014', 'image', 'r2', 'showcase/community/golgeler.webp', '/backgrounds/optimized/bg-night-alley.webp', '/backgrounds/optimized/bg-night-alley.webp', 1280, 720, 'Golge temali inceleme gorseli', 1, '{"source":"showcase"}'::jsonb)
on conflict (id) do update
set
  post_id = excluded.post_id,
  asset_type = excluded.asset_type,
  provider = excluded.provider,
  provider_asset_id = excluded.provider_asset_id,
  original_url = excluded.original_url,
  preview_url = excluded.preview_url,
  width = excluded.width,
  height = excluded.height,
  alt_text = excluded.alt_text,
  position = excluded.position,
  metadata = excluded.metadata;

insert into public.community_post_polls (
  id,
  post_id,
  closes_at,
  total_votes_count
)
values
  ('72600000-0000-0000-0000-000000000012', '72000000-0000-0000-0000-000000000012', now() + interval '3 days', 412)
on conflict (id) do update
set
  post_id = excluded.post_id,
  closes_at = excluded.closes_at,
  total_votes_count = excluded.total_votes_count;

insert into public.community_post_poll_options (
  id,
  poll_id,
  position,
  label,
  votes_count
)
values
  ('72700000-0000-0000-0000-000000000001', '72600000-0000-0000-0000-000000000012', 1, 'Solo Leveling', 173),
  ('72700000-0000-0000-0000-000000000002', '72600000-0000-0000-0000-000000000012', 2, 'Kizil Safak Efsanesi', 115),
  ('72700000-0000-0000-0000-000000000003', '72600000-0000-0000-0000-000000000012', 3, 'Golgelerin Dirilisi', 74),
  ('72700000-0000-0000-0000-000000000004', '72600000-0000-0000-0000-000000000012', 4, 'Diger', 50)
on conflict (id) do update
set
  poll_id = excluded.poll_id,
  position = excluded.position,
  label = excluded.label,
  votes_count = excluded.votes_count;
