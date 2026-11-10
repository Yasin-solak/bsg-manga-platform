-- Manageable special shop config for the test shop / future live showcase

alter table public.site_settings
  add column if not exists store_home_config jsonb not null default jsonb_build_object(
    'hero', jsonb_build_object(
      'badge', 'Sinirli sureligine',
      'title', 'Checkpoint Cache',
      'subtitle', 'Discord Shop benzeri merchandising akisini test etmek icin yonetilebilir ozel vitrin.',
      'cta_label', 'Koleksiyonu gor',
      'cta_target', 'vitrin-koleksiyonlar',
      'background_image_url', '/backgrounds/bg-city-glow.png'
    ),
    'featured_item_ids', jsonb_build_array(),
    'promo_tiles', jsonb_build_array(
      jsonb_build_object(
        'id', 'promo-1',
        'eyebrow', 'One cikan',
        'title', 'Avatar cercevelerine git',
        'description', 'Kisa sureli frame lansmanlari ve sezonluk setler.',
        'button_label', 'Beni oraya gotur',
        'target_section_id', 'vitrin-cerceveler',
        'image_url', '/backgrounds/bg-sky-temple.png'
      ),
      jsonb_build_object(
        'id', 'promo-2',
        'eyebrow', 'Yeni vitrin',
        'title', 'Arka plan koleksiyonu',
        'description', 'Profil ve hover sahnelerinde calisan arka plan serileri.',
        'button_label', 'Beni oraya gotur',
        'target_section_id', 'vitrin-arkaplanlar',
        'image_url', '/backgrounds/bg-night-alley.png'
      )
    ),
    'shelves', jsonb_build_array(
      jsonb_build_object(
        'id', 'shelf-frames',
        'title', 'Avatar cerceveleri',
        'description', 'Hover ile canlanan ve modal zinciri tamamlanan cerceve urunleri.',
        'cta_label', 'Tumunu satin al',
        'target_section_id', 'katalog-cerceveler',
        'item_ids', jsonb_build_array()
      ),
      jsonb_build_object(
        'id', 'shelf-backgrounds',
        'title', 'Profil arka planlari',
        'description', 'Poster + canli asset sozlesmesiyle yonetilen arka plan vitrinleri.',
        'cta_label', 'Tumunu satin al',
        'target_section_id', 'katalog-arkaplanlar',
        'item_ids', jsonb_build_array()
      )
    ),
    'bottom_cta', jsonb_build_object(
      'eyebrow', 'Cok daha fazlasi var',
      'title', 'Tum test magazasini gez',
      'description', 'Frame ve arka plan kataloglarini ayni yuzeyde filtreleyip satin alma ve hediye akisini dene.',
      'button_label', 'Tum magazayi gez',
      'target_section_id', 'vitrin-katalog'
    )
  );

comment on column public.site_settings.store_home_config is
  'Test magazasi ve ileride canli ozel vitrin icin hero, promo tile ve raf konfigrasyonu.';
