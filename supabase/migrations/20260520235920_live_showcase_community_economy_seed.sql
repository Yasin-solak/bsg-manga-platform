-- Live showcase seed continued: community, premium, boost and notification data.
-- Uses fixed user/fansub/manga ids from the 20260520_219 migration.

select set_config('request.jwt.claim.role', 'service_role', false);

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
  ('21940000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000001', 'Tartisma', 'Kuzey Kalesi 4. bolum teorileri', 'Planli bolum gelmeden once muhur ve kuzey mesaji hakkinda teorileri toparlayalim. Komutanin mektubu bence sadece savas emri degil.', '21920000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000001', array['21910000-0000-4000-8000-000000000001']::uuid[], array['21920000-0000-4000-8000-000000000001']::uuid[], array['21900000-0000-4000-8000-000000000002','21900000-0000-4000-8000-000000000006']::uuid[], array['teori','kuzey-kalesi','yeni-bolum'], 'gold', '#0f172a', '#38bdf8', true, 'approved', now() - interval '2 days', '21900000-0000-4000-8000-000000000001', 0, 0, 2380, 14, 0, 0, true, now() - interval '2 days'),
  ('21940000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000004', 'Fan Art', 'Luna Cicekleri icin kapak paleti', 'Pastel mor ile pembe arasinda iki varyasyon denedim. Mobil kartta hangisi daha iyi okunuyor?', '21920000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000002', array['21910000-0000-4000-8000-000000000002']::uuid[], array['21920000-0000-4000-8000-000000000002']::uuid[], array['21900000-0000-4000-8000-000000000005']::uuid[], array['fan-art','kapak','renk-paleti'], 'rainbow', '#7c3aed', '#f9a8d4', true, 'approved', now() - interval '42 hours', '21900000-0000-4000-8000-000000000001', 0, 0, 3120, 18, 0, 0, true, now() - interval '42 hours'),
  ('21940000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000005', 'Haber', 'Kara Kule 4. bolum yayin sirasina girdi', 'Kuleden Gelen Ses bolumu yarin gece yayinlanacak. Korku tonu daha dusuk kontrastla korunmaya calisildi.', '21920000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000003', array['21910000-0000-4000-8000-000000000003']::uuid[], array['21920000-0000-4000-8000-000000000003']::uuid[], array['21900000-0000-4000-8000-000000000006']::uuid[], array['haber','takvim','kara-kule'], 'neon', '#111827', '#f97316', true, 'approved', now() - interval '35 hours', '21900000-0000-4000-8000-000000000001', 0, 0, 1960, 9, 0, 0, true, now() - interval '35 hours'),
  ('21940000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000003', 'Liste', 'Bu hafta bitirilecek bolumler', 'Kuzey Kalesi, Kara Kule ve Ruzgar Loncasini ayni listede tutuyorum. Kisa notlarla hangi bolumden devam ettigimi yazdim.', null, null, array['21910000-0000-4000-8000-000000000001','21910000-0000-4000-8000-000000000003']::uuid[], array['21920000-0000-4000-8000-000000000001','21920000-0000-4000-8000-000000000003','21920000-0000-4000-8000-000000000004']::uuid[], '{}'::uuid[], array['liste','okuma-plani','haftalik'], 'neon', '#0ea5e9', '#22c55e', false, 'approved', now() - interval '28 hours', '21900000-0000-4000-8000-000000000001', 0, 0, 1740, 7, 0, 0, true, now() - interval '28 hours'),
  ('21940000-0000-4000-8000-000000000005', '21900000-0000-4000-8000-000000000006', 'Anket', 'Planli bolum hatirlatmalari nasil gelsin?', 'Takvim sayfasinda hatirlatma akisini canli kullananlar icin iki secenek arasinda kaldim. Hangisi daha az gurultu yapar?', null, null, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array['anket','takvim','hatirlatma'], 'halloween', '#f97316', '#111827', false, 'approved', now() - interval '21 hours', '21900000-0000-4000-8000-000000000001', 0, 0, 1290, 5, 0, 0, true, now() - interval '21 hours'),
  ('21940000-0000-4000-8000-000000000006', '21900000-0000-4000-8000-000000000002', 'Inceleme', 'Ceviri notu: kuzey lehcesi nasil aktarilmali?', 'Kuzey Kalesi karakterlerinde sert ve kisa cumleler var. Turkceye aktarirken fazla resmi durmamasi icin hangi tonu tercih ederdiniz?', '21920000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000001', array['21910000-0000-4000-8000-000000000001']::uuid[], array['21920000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[], array['ceviri','not','dil'], 'avatarframe1', '#1d4ed8', '#eab308', false, 'approved', now() - interval '18 hours', '21900000-0000-4000-8000-000000000001', 0, 0, 1560, 6, 0, 0, true, now() - interval '18 hours'),
  ('21940000-0000-4000-8000-000000000007', '21900000-0000-4000-8000-000000000001', 'Haber', 'Kuzey Panel haftalik akis ozeti', 'Bu hafta bir planli bolum, bir teori basligi ve bir okuma listesi yayinladik. Fansub sayfasindaki takim etiketleri de guncellendi.', null, '21910000-0000-4000-8000-000000000001', array['21910000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[], array['21900000-0000-4000-8000-000000000002','21900000-0000-4000-8000-000000000006']::uuid[], array['haber','fansub','haftalik-ozet'], 'gold', '#0f172a', '#38bdf8', true, 'approved', now() - interval '9 hours', '21900000-0000-4000-8000-000000000001', 0, 0, 980, 4, 0, 0, true, now() - interval '9 hours'),
  ('21940000-0000-4000-8000-000000000008', '21900000-0000-4000-8000-000000000004', 'Anket', 'Luna Cicekleri sonraki kapak tonu', 'Yeni kapak icin iki ton hazirladim. Bolum yayinindan once topluluk fikrini almak istiyorum.', '21920000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000002', array['21910000-0000-4000-8000-000000000002']::uuid[], array['21920000-0000-4000-8000-000000000002']::uuid[], '{}'::uuid[], array['anket','kapak','luna'], 'rainbow', '#7c3aed', '#f9a8d4', true, 'approved', now() - interval '5 hours', '21900000-0000-4000-8000-000000000001', 0, 0, 880, 3, 0, 0, true, now() - interval '5 hours')
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
  views_count = excluded.views_count,
  shares_count = excluded.shares_count,
  poll_votes_count = excluded.poll_votes_count,
  is_active = excluded.is_active,
  created_at = excluded.created_at,
  updated_at = now();

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
  ('21960000-0000-4000-8000-000000000001', '21940000-0000-4000-8000-000000000002', 'image', 'r2', 'showcase/live/luna-palette.webp', '/assets/explore/collections/romantik.webp', '/assets/explore/collections/romantik.webp', 1280, 720, 'Luna Cicekleri kapak paleti', 1, '{"source":"live-showcase-20260520"}'::jsonb),
  ('21960000-0000-4000-8000-000000000002', '21940000-0000-4000-8000-000000000003', 'image', 'r2', 'showcase/live/kara-kule.webp', '/covers/optimized/deep-abyss.webp', '/covers/optimized/deep-abyss.webp', 768, 1152, 'Kara Kule bolum kapagi', 1, '{"source":"live-showcase-20260520"}'::jsonb),
  ('21960000-0000-4000-8000-000000000003', '21940000-0000-4000-8000-000000000004', 'image', 'r2', 'showcase/live/weekly-list.webp', '/covers/optimized/wind-chronicle.webp', '/covers/optimized/wind-chronicle.webp', 768, 1152, 'Haftalik okuma listesi kapagi', 1, '{"source":"live-showcase-20260520"}'::jsonb),
  ('21960000-0000-4000-8000-000000000004', '21940000-0000-4000-8000-000000000008', 'image', 'r2', 'showcase/live/luna-cover-poll.webp', '/covers/optimized/starlight-academy.webp', '/covers/optimized/starlight-academy.webp', 768, 1152, 'Luna Cicekleri kapak anketi', 1, '{"source":"live-showcase-20260520"}'::jsonb)
on conflict (id) do update
set
  post_id = excluded.post_id,
  original_url = excluded.original_url,
  preview_url = excluded.preview_url,
  alt_text = excluded.alt_text,
  position = excluded.position,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.community_post_polls (id, post_id, closes_at, total_votes_count)
values
  ('21970000-0000-4000-8000-000000000001', '21940000-0000-4000-8000-000000000005', now() + interval '3 days', 0),
  ('21970000-0000-4000-8000-000000000002', '21940000-0000-4000-8000-000000000008', now() + interval '2 days', 0)
on conflict (post_id) do update
set closes_at = excluded.closes_at,
    updated_at = now();

insert into public.community_post_poll_options (id, poll_id, position, label, votes_count)
values
  ('21971000-0000-4000-8000-000000000001', '21970000-0000-4000-8000-000000000001', 1, 'Sadece favori seriler', 0),
  ('21971000-0000-4000-8000-000000000002', '21970000-0000-4000-8000-000000000001', 2, 'Tum takip edilenler', 0),
  ('21971000-0000-4000-8000-000000000003', '21970000-0000-4000-8000-000000000001', 3, 'Gunluk ozet', 0),
  ('21971000-0000-4000-8000-000000000004', '21970000-0000-4000-8000-000000000001', 4, 'Sessiz liste', 0),
  ('21971000-0000-4000-8000-000000000005', '21970000-0000-4000-8000-000000000002', 1, 'Pastel mor', 0),
  ('21971000-0000-4000-8000-000000000006', '21970000-0000-4000-8000-000000000002', 2, 'Gece pembesi', 0),
  ('21971000-0000-4000-8000-000000000007', '21970000-0000-4000-8000-000000000002', 3, 'Acik okul tonu', 0),
  ('21971000-0000-4000-8000-000000000008', '21970000-0000-4000-8000-000000000002', 4, 'Koyu drama tonu', 0)
on conflict (poll_id, position) do update
set label = excluded.label,
    updated_at = now();

insert into public.community_post_poll_votes (poll_id, option_id, user_id, created_at)
values
  ('21970000-0000-4000-8000-000000000001', '21971000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000001', now() - interval '20 hours'),
  ('21970000-0000-4000-8000-000000000001', '21971000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000002', now() - interval '19 hours'),
  ('21970000-0000-4000-8000-000000000001', '21971000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000003', now() - interval '18 hours'),
  ('21970000-0000-4000-8000-000000000001', '21971000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000004', now() - interval '17 hours'),
  ('21970000-0000-4000-8000-000000000001', '21971000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000006', now() - interval '16 hours'),
  ('21970000-0000-4000-8000-000000000002', '21971000-0000-4000-8000-000000000005', '21900000-0000-4000-8000-000000000001', now() - interval '4 hours'),
  ('21970000-0000-4000-8000-000000000002', '21971000-0000-4000-8000-000000000006', '21900000-0000-4000-8000-000000000002', now() - interval '4 hours'),
  ('21970000-0000-4000-8000-000000000002', '21971000-0000-4000-8000-000000000005', '21900000-0000-4000-8000-000000000003', now() - interval '3 hours'),
  ('21970000-0000-4000-8000-000000000002', '21971000-0000-4000-8000-000000000008', '21900000-0000-4000-8000-000000000005', now() - interval '3 hours'),
  ('21970000-0000-4000-8000-000000000002', '21971000-0000-4000-8000-000000000006', '21900000-0000-4000-8000-000000000006', now() - interval '2 hours')
on conflict (poll_id, user_id) do update
set option_id = excluded.option_id,
    updated_at = now();

update public.community_post_poll_options o
set votes_count = v.vote_count,
    updated_at = now()
from (
  select option_id, count(*)::bigint as vote_count
  from public.community_post_poll_votes
  where poll_id in ('21970000-0000-4000-8000-000000000001', '21970000-0000-4000-8000-000000000002')
  group by option_id
) v
where o.id = v.option_id;

update public.community_post_poll_options o
set votes_count = 0,
    updated_at = now()
where o.poll_id in ('21970000-0000-4000-8000-000000000001', '21970000-0000-4000-8000-000000000002')
  and not exists (
    select 1
    from public.community_post_poll_votes v
    where v.option_id = o.id
  );

update public.community_post_polls p
set total_votes_count = v.vote_count,
    updated_at = now()
from (
  select poll_id, count(*)::bigint as vote_count
  from public.community_post_poll_votes
  where poll_id in ('21970000-0000-4000-8000-000000000001', '21970000-0000-4000-8000-000000000002')
  group by poll_id
) v
where p.id = v.poll_id;

insert into public.community_comments (id, post_id, author_id, parent_id, body, likes_count, dislikes_count, is_pinned, is_active, is_spoiler, created_at)
values
  ('21950000-0000-4000-8000-000000000001', '21940000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000002', null, 'Mektuptaki kuzey muhru daha once 2. bolumde gecmisti, tesaduf gibi durmuyor.', 6, 0, false, true, true, now() - interval '47 hours'),
  ('21950000-0000-4000-8000-000000000002', '21940000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000006', null, 'Yayin gunu gelince bu basligi ustte tutmak iyi olur.', 4, 0, false, true, false, now() - interval '45 hours'),
  ('21950000-0000-4000-8000-000000000003', '21940000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000005', null, 'Mobilde koyu mor daha net ama acik ton feed icinde daha sicak duruyor.', 7, 0, false, true, false, now() - interval '40 hours'),
  ('21950000-0000-4000-8000-000000000004', '21940000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000003', null, 'Kapak kartinda baslik icin bosluk birakirsan cok iyi calisir.', 5, 0, false, true, false, now() - interval '38 hours'),
  ('21950000-0000-4000-8000-000000000005', '21940000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000006', null, 'Hatirlatmayi kurdum. Yayin saati geceyse bildirim sessiz moda dusmeli.', 3, 0, false, true, false, now() - interval '34 hours'),
  ('21950000-0000-4000-8000-000000000006', '21940000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000001', null, 'Listeye Ruzgar Loncasini eklemek iyi fikir, final bolumu tempo kapatiyor.', 5, 0, false, true, false, now() - interval '24 hours'),
  ('21950000-0000-4000-8000-000000000007', '21940000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000004', null, 'Gorsel palet icin Kara Kule de referans olabilir.', 4, 0, false, true, false, now() - interval '23 hours'),
  ('21950000-0000-4000-8000-000000000008', '21940000-0000-4000-8000-000000000005', '21900000-0000-4000-8000-000000000003', null, 'Sadece favori seriler daha az gurultu yapar.', 6, 0, false, true, false, now() - interval '20 hours'),
  ('21950000-0000-4000-8000-000000000009', '21940000-0000-4000-8000-000000000006', '21900000-0000-4000-8000-000000000005', null, 'Kisa cumleler karakteri koruyor ama arada yerel deyim iyi gider.', 7, 1, false, true, false, now() - interval '15 hours'),
  ('21950000-0000-4000-8000-000000000010', '21940000-0000-4000-8000-000000000007', '21900000-0000-4000-8000-000000000002', null, 'Takim etiketleri profil kartinda cok daha anlasilir oldu.', 4, 0, false, true, false, now() - interval '8 hours'),
  ('21950000-0000-4000-8000-000000000011', '21940000-0000-4000-8000-000000000008', '21900000-0000-4000-8000-000000000001', null, 'Pastel mor serinin tonuna daha yakin.', 5, 0, false, true, false, now() - interval '4 hours'),
  ('21950000-0000-4000-8000-000000000012', '21940000-0000-4000-8000-000000000008', '21900000-0000-4000-8000-000000000006', null, 'Gece pembesi mobilde daha guclu gorunuyor.', 3, 0, false, true, false, now() - interval '3 hours')
on conflict (id) do update
set body = excluded.body,
    likes_count = excluded.likes_count,
    dislikes_count = excluded.dislikes_count,
    is_pinned = excluded.is_pinned,
    is_active = excluded.is_active,
    is_spoiler = excluded.is_spoiler,
    updated_at = now();

insert into public.community_post_likes (post_id, user_id, created_at)
select p.post_id, u.user_id, now() - (u.offset_hours || ' hours')::interval
from (
  values
    ('21940000-0000-4000-8000-000000000001'::uuid),
    ('21940000-0000-4000-8000-000000000002'::uuid),
    ('21940000-0000-4000-8000-000000000003'::uuid),
    ('21940000-0000-4000-8000-000000000004'::uuid),
    ('21940000-0000-4000-8000-000000000005'::uuid),
    ('21940000-0000-4000-8000-000000000006'::uuid),
    ('21940000-0000-4000-8000-000000000007'::uuid),
    ('21940000-0000-4000-8000-000000000008'::uuid)
) as p(post_id)
join (
  values
    ('21900000-0000-4000-8000-000000000001'::uuid, 7),
    ('21900000-0000-4000-8000-000000000002'::uuid, 6),
    ('21900000-0000-4000-8000-000000000003'::uuid, 5),
    ('21900000-0000-4000-8000-000000000004'::uuid, 4),
    ('21900000-0000-4000-8000-000000000005'::uuid, 3),
    ('21900000-0000-4000-8000-000000000006'::uuid, 2)
) as u(user_id, offset_hours) on true
where not (p.post_id = '21940000-0000-4000-8000-000000000001'::uuid and u.user_id = '21900000-0000-4000-8000-000000000001'::uuid)
  and not (p.post_id = '21940000-0000-4000-8000-000000000002'::uuid and u.user_id = '21900000-0000-4000-8000-000000000004'::uuid)
  and not (p.post_id = '21940000-0000-4000-8000-000000000003'::uuid and u.user_id = '21900000-0000-4000-8000-000000000005'::uuid)
on conflict (post_id, user_id) do nothing;

insert into public.community_post_reactions (post_id, user_id, emoji, created_at, updated_at)
values
  ('21940000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000002', '🔥', now() - interval '46 hours', now()),
  ('21940000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000006', '👏', now() - interval '45 hours', now()),
  ('21940000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000001', '👏', now() - interval '39 hours', now()),
  ('21940000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000005', '🔥', now() - interval '38 hours', now()),
  ('21940000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000006', '😮', now() - interval '33 hours', now()),
  ('21940000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000003', '👏', now() - interval '24 hours', now()),
  ('21940000-0000-4000-8000-000000000005', '21900000-0000-4000-8000-000000000001', '🔥', now() - interval '20 hours', now()),
  ('21940000-0000-4000-8000-000000000006', '21900000-0000-4000-8000-000000000005', '😂', now() - interval '15 hours', now()),
  ('21940000-0000-4000-8000-000000000007', '21900000-0000-4000-8000-000000000002', '👏', now() - interval '8 hours', now()),
  ('21940000-0000-4000-8000-000000000008', '21900000-0000-4000-8000-000000000006', '🔥', now() - interval '3 hours', now())
on conflict (post_id, user_id) do update
set emoji = excluded.emoji,
    updated_at = now();

update public.community_posts p
set likes_count = coalesce(l.like_count, 0),
    comments_count = coalesce(c.comment_count, 0),
    reactions_count = coalesce(r.reaction_count, 0),
    poll_votes_count = case
      when p.id in ('21940000-0000-4000-8000-000000000005', '21940000-0000-4000-8000-000000000008')
        then coalesce(v.vote_count, 0)
      else p.poll_votes_count
    end,
    updated_at = now()
from (
  select id
  from public.community_posts
  where id between '21940000-0000-4000-8000-000000000001'::uuid and '21940000-0000-4000-8000-000000000008'::uuid
) seed
left join (
  select post_id, count(*)::bigint as like_count
  from public.community_post_likes
  group by post_id
) l on l.post_id = seed.id
left join (
  select post_id, count(*)::bigint as comment_count
  from public.community_comments
  where is_active
  group by post_id
) c on c.post_id = seed.id
left join (
  select post_id, count(*)::bigint as reaction_count
  from public.community_post_reactions
  group by post_id
) r on r.post_id = seed.id
left join (
  select poll.post_id, count(vote.*)::bigint as vote_count
  from public.community_post_polls poll
  left join public.community_post_poll_votes vote on vote.poll_id = poll.id
  group by poll.post_id
) v on v.post_id = seed.id
where p.id = seed.id;

with pkg as (
  select *
  from public.premium_monthly_packages
  where month_key = '2026-03'
  limit 1
),
seed_premium as (
  select *
  from (
    values
      ('21990000-0000-4000-8000-000000000001'::uuid, '21900000-0000-4000-8000-000000000001'::uuid, now() - interval '6 days', now() + interval '64 days', 70),
      ('21990000-0000-4000-8000-000000000002'::uuid, '21900000-0000-4000-8000-000000000002'::uuid, now() - interval '4 days', now() + interval '42 days', 46),
      ('21990000-0000-4000-8000-000000000003'::uuid, '21900000-0000-4000-8000-000000000004'::uuid, now() - interval '1 day', now() + interval '29 days', 30)
  ) as v(id, user_id, started_at, expires_at, days)
)
insert into public.user_premium_subscriptions (
  id,
  user_id,
  package_id,
  premium_store_item_id,
  purchased_at,
  extension_started_at,
  extension_expires_at,
  extension_days,
  source
)
select
  seed_premium.id,
  seed_premium.user_id,
  pkg.id,
  pkg.premium_store_item_id,
  seed_premium.started_at,
  seed_premium.started_at,
  seed_premium.expires_at,
  seed_premium.days,
  'live_showcase_seed'
from seed_premium
cross join pkg
on conflict (id) do update
set extension_started_at = excluded.extension_started_at,
    extension_expires_at = excluded.extension_expires_at,
    extension_days = excluded.extension_days,
    source = excluded.source;

with pkg as (
  select *
  from public.premium_monthly_packages
  where month_key = '2026-03'
  limit 1
),
seed_users as (
  select *
  from (
    values
      ('21990100-0000-4000-8000-000000000001'::uuid, '21900000-0000-4000-8000-000000000001'::uuid),
      ('21990100-0000-4000-8000-000000000002'::uuid, '21900000-0000-4000-8000-000000000002'::uuid),
      ('21990100-0000-4000-8000-000000000003'::uuid, '21900000-0000-4000-8000-000000000004'::uuid)
  ) as v(id, user_id)
)
insert into public.user_premium_grants (
  id,
  user_id,
  package_id,
  premium_store_item_id,
  frame_store_item_id,
  background_store_item_id,
  pattern_store_item_id,
  badge_id,
  granted_at
)
select
  seed_users.id,
  seed_users.user_id,
  pkg.id,
  pkg.premium_store_item_id,
  pkg.frame_store_item_id,
  pkg.background_store_item_id,
  pkg.pattern_store_item_id,
  pkg.badge_id,
  now() - interval '1 day'
from seed_users
cross join pkg
on conflict (user_id, package_id) do update
set premium_store_item_id = excluded.premium_store_item_id,
    frame_store_item_id = excluded.frame_store_item_id,
    background_store_item_id = excluded.background_store_item_id,
    pattern_store_item_id = excluded.pattern_store_item_id,
    badge_id = excluded.badge_id,
    granted_at = excluded.granted_at;

with pkg as (
  select *
  from public.premium_monthly_packages
  where month_key = '2026-03'
  limit 1
),
seed_events as (
  select *
  from (
    values
      ('21990200-0000-4000-8000-000000000001'::uuid, '21900000-0000-4000-8000-000000000001'::uuid, now() - interval '6 days', now() + interval '64 days'),
      ('21990200-0000-4000-8000-000000000002'::uuid, '21900000-0000-4000-8000-000000000002'::uuid, now() - interval '4 days', now() + interval '42 days'),
      ('21990200-0000-4000-8000-000000000003'::uuid, '21900000-0000-4000-8000-000000000004'::uuid, now() - interval '1 day', now() + interval '29 days')
  ) as v(id, user_id, started_at, expires_at)
)
insert into public.user_premium_reward_events (
  id,
  user_id,
  premium_store_item_id,
  rewarded_store_item_id,
  rewarded_store_item_type,
  rewarded_store_item_identifier,
  premium_badge_id,
  compensation_coins,
  premium_started_at,
  premium_expires_at,
  source
)
select
  seed_events.id,
  seed_events.user_id,
  pkg.premium_store_item_id,
  pkg.frame_store_item_id,
  'frame',
  si.identifier,
  pkg.badge_id,
  0,
  seed_events.started_at,
  seed_events.expires_at,
  'live_showcase_seed'
from seed_events
cross join pkg
join public.store_items si on si.id = pkg.frame_store_item_id
on conflict (id) do update
set premium_expires_at = excluded.premium_expires_at,
    rewarded_store_item_id = excluded.rewarded_store_item_id,
    rewarded_store_item_identifier = excluded.rewarded_store_item_identifier,
    source = excluded.source;

insert into public.user_badges (user_id, badge_id, obtained_at, is_displayed, display_order)
select v.user_id, b.id, now() - (v.days_ago || ' days')::interval, true, v.display_order
from (
  values
    ('21900000-0000-4000-8000-000000000001'::uuid, 'Topluluk Destekcisi', 13, 0),
    ('21900000-0000-4000-8000-000000000002'::uuid, 'VIP Altin', 9, 0),
    ('21900000-0000-4000-8000-000000000004'::uuid, 'Artist Master', 5, 0),
    ('21900000-0000-4000-8000-000000000006'::uuid, 'Reader Gumus', 7, 0)
) as v(user_id, badge_name, days_ago, display_order)
join public.badges b on b.name = v.badge_name
on conflict (user_id, badge_id) do update
set is_displayed = excluded.is_displayed,
    display_order = excluded.display_order;

update public.store_items si
set purchase_count = greatest(si.purchase_count, v.minimum_purchase_count),
    updated_at = now()
from (
  values
    ('premium'::text, 'namefx-pass'::text, 15),
    ('frame', 'gold', 24),
    ('frame', 'neon', 33),
    ('frame', 'rainbow', 22),
    ('background', 'bg-city-glow', 24),
    ('background', 'anime-neon-loop', 13),
    ('pattern', 'deneme-pattern-mm2z9mbt', 7)
) as v(item_type, identifier, minimum_purchase_count)
where si.type = v.item_type
  and si.identifier = v.identifier;

with plan as (
  select *
  from public.fansub_boost_plans
  where code = 'monthly'
  limit 1
),
seed_grants as (
  select *
  from (
    values
      ('21991000-0000-4000-8000-000000000001'::uuid, '21910000-0000-4000-8000-000000000001'::uuid, '21900000-0000-4000-8000-000000000002'::uuid, 'Kuzey ekibi bolum notlarini duzenli tutuyor.', false, now() - interval '11 days'),
      ('21991000-0000-4000-8000-000000000002'::uuid, '21910000-0000-4000-8000-000000000001'::uuid, '21900000-0000-4000-8000-000000000006'::uuid, 'Takvim akisi icin destek.', false, now() - interval '5 days'),
      ('21991000-0000-4000-8000-000000000003'::uuid, '21910000-0000-4000-8000-000000000002'::uuid, '21900000-0000-4000-8000-000000000004'::uuid, 'Kapak ve renk calismalarina destek.', true, now() - interval '4 days'),
      ('21991000-0000-4000-8000-000000000004'::uuid, '21910000-0000-4000-8000-000000000003'::uuid, '21900000-0000-4000-8000-000000000001'::uuid, 'Kara Kule teorileri icin.', false, now() - interval '3 days'),
      ('21991000-0000-4000-8000-000000000005'::uuid, '21910000-0000-4000-8000-000000000003'::uuid, '21900000-0000-4000-8000-000000000005'::uuid, 'Redaksiyon ekibinden self boost.', true, now() - interval '2 days')
  ) as v(id, fansub_id, supporter_user_id, supporter_note, is_self_boost, granted_at)
)
insert into public.fansub_boost_grants (
  id,
  fansub_id,
  supporter_user_id,
  plan_id,
  plan_code,
  coin_cost,
  boost_power,
  duration_days,
  supporter_reward_tier,
  status,
  supporter_note,
  is_self_boost,
  granted_at,
  starts_at,
  expires_at,
  metadata
)
select
  seed_grants.id,
  seed_grants.fansub_id,
  seed_grants.supporter_user_id,
  plan.id,
  plan.code,
  plan.coin_cost,
  plan.boost_power,
  plan.duration_days,
  plan.supporter_reward_tier,
  'active',
  seed_grants.supporter_note,
  seed_grants.is_self_boost,
  seed_grants.granted_at,
  seed_grants.granted_at,
  seed_grants.granted_at + (plan.duration_days || ' days')::interval,
  '{"source":"live-showcase-20260520"}'::jsonb
from seed_grants
cross join plan
on conflict (id) do update
set status = excluded.status,
    supporter_note = excluded.supporter_note,
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    metadata = excluded.metadata,
    updated_at = now();

select public.refresh_fansub_boost_supporter_state(v.fansub_id, v.supporter_user_id)
from (
  values
    ('21910000-0000-4000-8000-000000000001'::uuid, '21900000-0000-4000-8000-000000000002'::uuid),
    ('21910000-0000-4000-8000-000000000001'::uuid, '21900000-0000-4000-8000-000000000006'::uuid),
    ('21910000-0000-4000-8000-000000000002'::uuid, '21900000-0000-4000-8000-000000000004'::uuid),
    ('21910000-0000-4000-8000-000000000003'::uuid, '21900000-0000-4000-8000-000000000001'::uuid),
    ('21910000-0000-4000-8000-000000000003'::uuid, '21900000-0000-4000-8000-000000000005'::uuid)
) as v(fansub_id, supporter_user_id);

select public.refresh_fansub_boost_snapshot(v.fansub_id)
from (
  values
    ('21910000-0000-4000-8000-000000000001'::uuid),
    ('21910000-0000-4000-8000-000000000002'::uuid),
    ('21910000-0000-4000-8000-000000000003'::uuid)
) as v(fansub_id);

insert into public.fansub_transactions (id, fansub_id, amount, type, description, related_item_id, created_by, created_at, donation_note)
values
  ('21994000-0000-4000-8000-000000000001', '21910000-0000-4000-8000-000000000001', 600, 'donation', 'Topluluk destek bagisi', null, '21900000-0000-4000-8000-000000000002', now() - interval '6 days', 'Kuzey notlari icin.'),
  ('21994000-0000-4000-8000-000000000002', '21910000-0000-4000-8000-000000000002', 420, 'donation', 'Kapak paleti destek bagisi', null, '21900000-0000-4000-8000-000000000003', now() - interval '4 days', 'Luna kapaklari icin.'),
  ('21994000-0000-4000-8000-000000000003', '21910000-0000-4000-8000-000000000003', 500, 'reward_task', 'Ilk ceviri gorevi odulu', null, '21900000-0000-4000-8000-000000000005', now() - interval '3 days', null),
  ('21994000-0000-4000-8000-000000000004', '21910000-0000-4000-8000-000000000001', -300, 'purchase', 'Aylik fansub takviyesi', null, '21900000-0000-4000-8000-000000000006', now() - interval '2 days', null)
on conflict (id) do update
set amount = excluded.amount,
    type = excluded.type,
    description = excluded.description,
    created_by = excluded.created_by,
    donation_note = excluded.donation_note;

insert into public.fansub_reward_task_claims (id, fansub_id, task_id, claimed_by, credited_coin, badge_id, claimed_at)
select v.id, v.fansub_id, t.id, v.claimed_by, t.coin_reward, null, v.claimed_at
from (
  values
    ('21995000-0000-4000-8000-000000000001'::uuid, '21910000-0000-4000-8000-000000000001'::uuid, 'fansub-chapters-3', '21900000-0000-4000-8000-000000000001'::uuid, now() - interval '7 days'),
    ('21995000-0000-4000-8000-000000000002'::uuid, '21910000-0000-4000-8000-000000000001'::uuid, 'fansub-manga-1', '21900000-0000-4000-8000-000000000001'::uuid, now() - interval '7 days'),
    ('21995000-0000-4000-8000-000000000003'::uuid, '21910000-0000-4000-8000-000000000002'::uuid, 'fansub-chapters-3', '21900000-0000-4000-8000-000000000004'::uuid, now() - interval '6 days'),
    ('21995000-0000-4000-8000-000000000004'::uuid, '21910000-0000-4000-8000-000000000003'::uuid, 'fansub-chapters-3', '21900000-0000-4000-8000-000000000005'::uuid, now() - interval '5 days')
) as v(id, fansub_id, task_slug, claimed_by, claimed_at)
join public.fansub_reward_tasks t on t.slug = v.task_slug
on conflict (fansub_id, task_id) do update
set claimed_by = excluded.claimed_by,
    credited_coin = excluded.credited_coin,
    claimed_at = excluded.claimed_at;

insert into public.reading_streak_reward_claims (
  id,
  user_id,
  rule_id,
  trigger_type,
  period_start,
  progress_value,
  streak_days,
  active_days_this_week,
  credited_coin,
  metadata,
  claimed_at
)
select
  v.id,
  v.user_id,
  r.id,
  r.trigger_type,
  v.period_start,
  v.progress_value,
  v.streak_days,
  v.active_days_this_week,
  r.coin_reward,
  '{"source":"live-showcase-20260520"}'::jsonb,
  v.claimed_at
from (
  values
    ('21993000-0000-4000-8000-000000000001'::uuid, '21900000-0000-4000-8000-000000000001'::uuid, 'streak-7', current_date - 7, 7, 7, 5, now() - interval '1 day'),
    ('21993000-0000-4000-8000-000000000002'::uuid, '21900000-0000-4000-8000-000000000003'::uuid, 'weekly-5-days', date_trunc('week', current_date)::date, 5, 5, 5, now() - interval '2 days'),
    ('21993000-0000-4000-8000-000000000003'::uuid, '21900000-0000-4000-8000-000000000006'::uuid, 'daily-read', current_date, 1, 1, 1, now() - interval '5 hours')
) as v(id, user_id, rule_slug, period_start, progress_value, streak_days, active_days_this_week, claimed_at)
join public.reading_streak_reward_rules r on r.slug = v.rule_slug
on conflict (id) do update
set progress_value = excluded.progress_value,
    streak_days = excluded.streak_days,
    active_days_this_week = excluded.active_days_this_week,
    credited_coin = excluded.credited_coin,
    metadata = excluded.metadata,
    claimed_at = excluded.claimed_at;

insert into public.notifications (id, user_id, type, title, message, icon, data, is_read, created_at)
values
  ('21992000-0000-4000-8000-000000000001', '21900000-0000-4000-8000-000000000002', 'mention', 'Kuzey teorisinde adin geciyor', 'panelustasi seni yeni teori basliginda etiketledi.', 'MessageCircle', '{"postId":"21940000-0000-4000-8000-000000000001"}'::jsonb, false, now() - interval '2 days'),
  ('21992000-0000-4000-8000-000000000002', '21900000-0000-4000-8000-000000000006', 'comment', 'Takvim basligina yorum geldi', 'Hatirlatma anketinde yeni yanit var.', 'Bell', '{"postId":"21940000-0000-4000-8000-000000000005"}'::jsonb, false, now() - interval '19 hours'),
  ('21992000-0000-4000-8000-000000000003', '21900000-0000-4000-8000-000000000004', 'badge_earned', 'Yeni rozet gorunuyor', 'Artist Master rozeti profilinde aktif.', 'Badge', '{"badge":"Artist Master"}'::jsonb, true, now() - interval '5 days'),
  ('21992000-0000-4000-8000-000000000004', '21900000-0000-4000-8000-000000000001', 'system', 'Premium vitrin yenilendi', 'Aylik premium envanterin ve profil efektin aktif.', 'Sparkles', '{"source":"live_showcase_seed"}'::jsonb, false, now() - interval '6 days')
on conflict (id) do update
set title = excluded.title,
    message = excluded.message,
    data = excluded.data,
    is_read = excluded.is_read,
    created_at = excluded.created_at;

update public.fansubs f
set follower_count = coalesce(ff.follower_count, 0),
    manga_count = coalesce(mm.manga_count, 0),
    updated_at = now()
from (
  select id
  from public.fansubs
  where id in (
    '21910000-0000-4000-8000-000000000001',
    '21910000-0000-4000-8000-000000000002',
    '21910000-0000-4000-8000-000000000003'
  )
) seed
left join (
  select fansub_id, count(*)::integer as follower_count
  from public.fansub_follows
  group by fansub_id
) ff on ff.fansub_id = seed.id
left join (
  select fansub_id, count(*)::integer as manga_count
  from public.mangas
  where is_active and is_approved
  group by fansub_id
) mm on mm.fansub_id = seed.id
where f.id = seed.id;
