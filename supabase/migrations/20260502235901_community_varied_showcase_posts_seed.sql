-- Showcase seed to test the community feed with different post scenarios.
-- This migration uses sample user/fansub/manga records from the 20260429_191 seed.
-- Runs idempotently; reapplying updates the same records.

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
  ('72000000-0000-0000-0000-000000000020', '55555555-5555-5555-5555-555555555555', 'Tartisma', 'Kizil Safak final teorisi: Kara Lord dondu mu?', 'Son bolumdeki golge isareti bence tesaduf degil. Kalkan kirildiktan sonra arka planda beliren sembol onceki sezondaki rituel sahnesiyle ayni. Sizce bu sahne final savasina hazirlik mi, yoksa sadece ters kose mi?', '70000000-0000-0000-0000-000000000001', null, array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1']::uuid[], array['70000000-0000-0000-0000-000000000001']::uuid[], '{}'::uuid[], array['tartisma','teori','kizil-safak','uzun-metin'], 'neon', '#ef4444', '#111827', false, 'approved', now() - interval '1 minute', '22222222-2222-2222-2222-222222222222', 184, 37, 6200, 18, 12, 0, true, now() - interval '1 minute'),
  ('72000000-0000-0000-0000-000000000021', '33333333-3333-3333-3333-333333333333', 'Fan Art', 'Gece pazari arka plan denemesi', 'Isik, sis ve tabela yogunlugunu manga paneli gibi kurmaya calistim. Renk dengesi sizce fazla parlak mi?', null, null, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array['fan-art','arka-plan','gece-pazari'], 'avatarframe3', '#ec4899', '#8b5cf6', false, 'approved', now() - interval '2 minutes', '22222222-2222-2222-2222-222222222222', 226, 49, 7400, 21, 17, 0, true, now() - interval '2 minutes'),
  ('72000000-0000-0000-0000-000000000022', '44444444-4444-4444-4444-444444444444', 'Inceleme', 'Aksiyon sahnesi karsilastirmasi', 'Iki paneldeki tempo birbirinden cok farkli. Birinde karakter odagi guclu, digerinde hareket cizgileri sahneyi tasiyor. Hangisi sizce daha iyi calisiyor?', '70000000-0000-0000-0000-000000000001', null, '{}'::uuid[], array['70000000-0000-0000-0000-000000000001']::uuid[], '{}'::uuid[], array['inceleme','aksiyon','panel-karsilastirma'], 'fire', '#f97316', '#ef4444', false, 'approved', now() - interval '3 minutes', '22222222-2222-2222-2222-222222222222', 168, 28, 5100, 15, 9, 0, true, now() - interval '3 minutes'),
  ('72000000-0000-0000-0000-000000000023', '33333333-3333-3333-3333-333333333333', 'Fan Art', 'Renk paleti denemeleri', 'Ayni sahne icin uc farkli duygu denedim: romantik, dramatik ve daha sakin bir tapinak tonu. Feed gridinin bu uc gorselde nasil davrandigini da gorebiliriz.', null, null, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array['fan-art','renk-paleti','romantik','dram'], 'avatarframe3', '#f472b6', '#7c3aed', false, 'approved', now() - interval '4 minutes', '22222222-2222-2222-2222-222222222222', 301, 64, 9100, 33, 22, 0, true, now() - interval '4 minutes'),
  ('72000000-0000-0000-0000-000000000024', '66666666-6666-6666-6666-666666666666', 'Liste', 'Hafta sonu okunacaklar listem', 'Dort seri secimi yaptim. Biri karanlik fantezi, biri saray entrikasi, biri lonca aksiyonu, biri de ruzgar temali macera. Siralamayi yorumlarda tartisalim.', null, null, '{}'::uuid[], array['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003']::uuid[], '{}'::uuid[], array['liste','hafta-sonu','oneri'], 'ice', '#60a5fa', '#22d3ee', false, 'approved', now() - interval '5 minutes', '22222222-2222-2222-2222-222222222222', 142, 31, 4300, 12, 8, 0, true, now() - interval '5 minutes'),
  ('72000000-0000-0000-0000-000000000025', '44444444-4444-4444-4444-444444444444', 'Anket', 'Bir sonraki topluluk etkinligi ne olsun?', 'Hafta sonu icin topluluk etkinligi planlayalim. Sadece oy vermek yetmez, seciminizin nedenini yorumlara da yazin.', null, null, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array['anket','etkinlik','topluluk'], 'fire', '#f97316', '#ef4444', false, 'approved', now() - interval '6 minutes', '22222222-2222-2222-2222-222222222222', 96, 44, 3900, 10, 7, 368, true, now() - interval '6 minutes'),
  ('72000000-0000-0000-0000-000000000026', '22222222-2222-2222-2222-222222222222', 'Anket', 'Yeni sezon kapagi hangi tona gitmeli?', 'Kapak rengi icin ekipte iki farkli fikir var. Gorsel ile anket ayni kartta nasil duruyor onu da bu postla test ediyoruz.', '70000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1']::uuid[], array['70000000-0000-0000-0000-000000000003']::uuid[], '{}'::uuid[], array['anket','kapak','fansub','golgelerin-dirilisi'], 'gold', '#f59e0b', '#ef4444', true, 'approved', now() - interval '7 minutes', '22222222-2222-2222-2222-222222222222', 119, 35, 4700, 16, 11, 242, true, now() - interval '7 minutes'),
  ('72000000-0000-0000-0000-000000000027', '22222222-2222-2222-2222-222222222222', 'Haber', 'MangaZone ceviri takvimi guncellendi', 'Bu hafta uc seri icin yeni bolum plani netlesti. Duyuru gibi hisseden ama community category kuralini bozmayan haber karti olarak durmasi gerekiyor.', null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1']::uuid[], '{}'::uuid[], '{}'::uuid[], array['duyuru','fansub','takvim','yeni-bolum'], 'gold', '#f59e0b', '#ef4444', true, 'approved', now() - interval '8 minutes', '22222222-2222-2222-2222-222222222222', 155, 22, 4100, 14, 10, 0, true, now() - interval '8 minutes')
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
  ('72500000-0000-0000-0000-000000000021', '72000000-0000-0000-0000-000000000021', 'image', 'r2', 'showcase/varied/gece-pazari.webp', '/backgrounds/optimized/bg-city-glow.webp', '/backgrounds/optimized/bg-city-glow.webp', 1280, 720, 'Gece pazari arka plan denemesi', 1, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000022', '72000000-0000-0000-0000-000000000022', 'image', 'r2', 'showcase/varied/aksiyon-panel.webp', '/assets/explore/collections/aksiyon.webp', '/assets/explore/collections/aksiyon.webp', 1280, 720, 'Aksiyon paneli', 1, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000023', '72000000-0000-0000-0000-000000000022', 'image', 'r2', 'showcase/varied/iron-blood.webp', '/covers/optimized/iron-blood.webp', '/covers/optimized/iron-blood.webp', 768, 1152, 'Dikey aksiyon kapagi', 2, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000024', '72000000-0000-0000-0000-000000000023', 'image', 'r2', 'showcase/varied/romantik.webp', '/assets/explore/collections/romantik.webp', '/assets/explore/collections/romantik.webp', 1280, 720, 'Romantik renk paleti', 1, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000025', '72000000-0000-0000-0000-000000000023', 'image', 'r2', 'showcase/varied/dram.webp', '/assets/explore/collections/dram.webp', '/assets/explore/collections/dram.webp', 1280, 720, 'Dram renk paleti', 2, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000026', '72000000-0000-0000-0000-000000000023', 'image', 'r2', 'showcase/varied/sky-temple.webp', '/backgrounds/optimized/bg-sky-temple.webp', '/backgrounds/optimized/bg-sky-temple.webp', 1280, 720, 'Tapinak renk paleti', 3, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000027', '72000000-0000-0000-0000-000000000024', 'image', 'r2', 'showcase/varied/cursed-sword.webp', '/covers/optimized/cursed-sword.webp', '/covers/optimized/cursed-sword.webp', 768, 1152, 'Karanlik fantezi kapagi', 1, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000028', '72000000-0000-0000-0000-000000000024', 'image', 'r2', 'showcase/varied/dragon-court.webp', '/covers/optimized/dragon-court.webp', '/covers/optimized/dragon-court.webp', 768, 1152, 'Saray entrikasi kapagi', 2, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000029', '72000000-0000-0000-0000-000000000024', 'image', 'r2', 'showcase/varied/phantom-guild.webp', '/covers/optimized/phantom-guild.webp', '/covers/optimized/phantom-guild.webp', 768, 1152, 'Lonca aksiyonu kapagi', 3, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000030', '72000000-0000-0000-0000-000000000024', 'image', 'r2', 'showcase/varied/wind-chronicle.webp', '/covers/optimized/wind-chronicle.webp', '/covers/optimized/wind-chronicle.webp', 768, 1152, 'Ruzgar temali macera kapagi', 4, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000031', '72000000-0000-0000-0000-000000000026', 'image', 'r2', 'showcase/varied/dragon-hall.webp', '/backgrounds/optimized/bg-dragon-hall.webp', '/backgrounds/optimized/bg-dragon-hall.webp', 1280, 720, 'Yeni sezon kapak tonu', 1, '{"source":"varied-showcase"}'::jsonb),
  ('72500000-0000-0000-0000-000000000032', '72000000-0000-0000-0000-000000000027', 'image', 'r2', 'showcase/varied/mangazone-logo.webp', '/assets/promo/logo.png', '/assets/promo/logo.png', 512, 512, 'MangaZone haber gorseli', 1, '{"source":"varied-showcase"}'::jsonb)
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
  ('72600000-0000-0000-0000-000000000025', '72000000-0000-0000-0000-000000000025', now() + interval '4 days', 368),
  ('72600000-0000-0000-0000-000000000026', '72000000-0000-0000-0000-000000000026', now() + interval '2 days', 242)
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
  ('72700000-0000-0000-0000-000000000041', '72600000-0000-0000-0000-000000000025', 1, 'Fan art yarismasi', 132),
  ('72700000-0000-0000-0000-000000000042', '72600000-0000-0000-0000-000000000025', 2, 'Teori maratonu', 96),
  ('72700000-0000-0000-0000-000000000043', '72600000-0000-0000-0000-000000000025', 3, 'Okuma kulubu', 84),
  ('72700000-0000-0000-0000-000000000044', '72600000-0000-0000-0000-000000000025', 4, 'Canli sohbet', 56),
  ('72700000-0000-0000-0000-000000000045', '72600000-0000-0000-0000-000000000026', 1, 'Karanlik aksiyon', 88),
  ('72700000-0000-0000-0000-000000000046', '72600000-0000-0000-0000-000000000026', 2, 'Guc fantezi', 72),
  ('72700000-0000-0000-0000-000000000047', '72600000-0000-0000-0000-000000000026', 3, 'Dram', 51),
  ('72700000-0000-0000-0000-000000000048', '72600000-0000-0000-0000-000000000026', 4, 'Romantik', 31)
on conflict (id) do update
set
  poll_id = excluded.poll_id,
  position = excluded.position,
  label = excluded.label,
  votes_count = excluded.votes_count;
