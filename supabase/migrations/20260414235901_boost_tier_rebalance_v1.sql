begin;

-- Closing strip: core -> tier 1
update public.fansub_boost_capability_policies
set
  placement_type = 'tier',
  tier_level = 1,
  summary = 'Bolum sonu tesekkur ve yonlendirme seridi takviye ile acilir.',
  detail = 'Reader sonundaki kapanis alani seviye 1 takviye ile aktif olur.',
  sort_order = 115,
  updated_at = now()
where capability_key = 'hasChapterEndCredit';

-- Image background: label update
update public.fansub_boost_capability_policies
set
  label = 'Gorsel arka plan',
  detail = 'Gorsel arka plan ile profil kahramani daha ayirt edici olur.',
  sort_order = 110,
  updated_at = now()
where capability_key = 'canUploadStaticBackground';

-- Video background: tier 2 -> tier 1 (may already be tier 1 in SQL, for consistency)
update public.fansub_boost_capability_policies
set
  tier_level = 1,
  sort_order = 112,
  updated_at = now()
where capability_key = 'canUploadVideoBackground';

-- Custom notification: tier 2 -> tier 1
update public.fansub_boost_capability_policies
set
  tier_level = 1,
  sort_order = 140,
  updated_at = now()
where capability_key = 'canUseSpecialNotifications';

-- Support streak: tier 2 -> core
update public.fansub_boost_capability_policies
set
  placement_type = 'core',
  tier_level = null,
  sort_order = 48,
  updated_at = now()
where capability_key = 'hasSupporterStreak';

-- Founding supporter: tier 2 -> core (for consistency)
update public.fansub_boost_capability_policies
set
  placement_type = 'core',
  tier_level = null,
  sort_order = 47,
  updated_at = now()
where capability_key = 'hasFoundingSupporter';

-- Custom fansub address: label update (Vanity URL -> custom fansub address)
update public.fansub_boost_capability_policies
set
  label = 'Ozel fansub adresi',
  summary = 'Fansub icin kisa ve hatirlanabilir ozel URL kullanilir.',
  detail = 'Fansub kendi benzersiz ve daha kolay paylasilabilir public adresini belirler.',
  updated_at = now()
where capability_key = 'hasVanityUrl';

-- Takviye cercevesi stili: admin tarafindan secilir
alter table public.fansubs
  add column if not exists boost_frame_style text not null default 'gold';

commit;
