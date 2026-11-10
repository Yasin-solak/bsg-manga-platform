-- Block-based runtime config for an event-focused test/live shop showcase

alter table public.site_settings
  add column if not exists storefront_runtime_config jsonb;

update public.site_settings
set storefront_runtime_config = jsonb_build_object(
  'version', 1,
  'surfaces', jsonb_build_object(
    'test_store_home', jsonb_build_object(
      'activeCampaignId', 'campaign-standart-test',
      'campaigns', jsonb_build_array(
        jsonb_build_object(
          'id', 'campaign-standart-test',
          'slug', 'standart-test-vitrini',
          'name', 'Standart test vitrini',
          'status', 'active',
          'startAt', null,
          'endAt', null,
          'themeKey', 'default-dark',
          'navigation', jsonb_build_array(
            jsonb_build_object('id', 'nav-featured', 'label', 'One Cikanlar', 'targetBlockId', 'featured-rail'),
            jsonb_build_object('id', 'nav-frames', 'label', 'Cerceveler', 'targetBlockId', 'frames-rail'),
            jsonb_build_object('id', 'nav-backgrounds', 'label', 'Arka planlar', 'targetBlockId', 'backgrounds-rail'),
            jsonb_build_object('id', 'nav-premium', 'label', 'Premium', 'targetBlockId', 'premium-spotlight')
          ),
          'blocks', jsonb_build_array(
            jsonb_build_object(
              'id', 'hero',
              'type', 'hero',
              'eyebrow', 'Sinirli sureligine',
              'title', 'Checkpoint Cache',
              'description', 'Event odakli test vitrini icin yonetilebilir hero bolumu.',
              'ctaLabel', 'Koleksiyonu gor',
              'ctaHref', 'section:featured-rail',
              'desktopImageUrl', '/backgrounds/bg-city-glow.png',
              'mobileImageUrl', '/backgrounds/bg-city-glow.png',
              'countdownMode', 'campaign_end',
              'countdownTargetAt', null
            ),
            jsonb_build_object(
              'id', 'featured-rail',
              'type', 'featured_rail',
              'title', 'One cikan urunler',
              'subtitle', 'Hero altinda gorunen ilk raf. Eventin odagini burada topluyoruz.',
              'ctaLabel', 'Tumunu gor',
              'ctaHref', 'section:katalog-cerceveler',
              'itemIds', jsonb_build_array(),
              'showCountdown', true
            ),
            jsonb_build_object(
              'id', 'promo-pair',
              'type', 'promo_tiles',
              'title', 'Promo secimleri',
              'subtitle', 'Iki farkli event veya koleksiyon karti.',
              'tiles', jsonb_build_array(
                jsonb_build_object(
                  'id', 'promo-1',
                  'title', 'Avatar cercevelerine git',
                  'subtitle', 'Kisa sureli frame lansmanlari ve sezonluk setler.',
                  'imageUrl', '/backgrounds/bg-sky-temple.png',
                  'mobileImageUrl', '/backgrounds/bg-sky-temple.png',
                  'ctaLabel', 'Beni oraya gotur',
                  'ctaTarget', 'section:katalog-cerceveler'
                ),
                jsonb_build_object(
                  'id', 'promo-2',
                  'title', 'Arka plan koleksiyonu',
                  'subtitle', 'Profil ve hover sahnelerinde calisan arka plan serileri.',
                  'imageUrl', '/backgrounds/bg-night-alley.png',
                  'mobileImageUrl', '/backgrounds/bg-night-alley.png',
                  'ctaLabel', 'Beni oraya gotur',
                  'ctaTarget', 'section:katalog-arkaplanlar'
                )
              )
            ),
            jsonb_build_object(
              'id', 'frames-rail',
              'type', 'product_rail',
              'title', 'Avatar cerceveleri',
              'subtitle', 'Hover ile canlanan ve modal zinciri tamamlanan cerceve urunleri.',
              'ctaLabel', 'Tumunu satin al',
              'ctaHref', 'section:katalog-cerceveler',
              'itemIds', jsonb_build_array()
            ),
            jsonb_build_object(
              'id', 'backgrounds-rail',
              'type', 'product_rail',
              'title', 'Profil arka planlari',
              'subtitle', 'Poster + canli asset sozlesmesiyle yonetilen arka plan vitrinleri.',
              'ctaLabel', 'Tumunu satin al',
              'ctaHref', 'section:katalog-arkaplanlar',
              'itemIds', jsonb_build_array()
            ),
            jsonb_build_object(
              'id', 'premium-spotlight',
              'type', 'premium_spotlight',
              'eyebrow', 'Premium',
              'title', 'Premium gecis',
              'description', 'Erken erisim ve rastgele odul kurallarini ayni vitrinde anlatan spot.',
              'ctaLabel', 'Premium detaylarini gor',
              'ctaHref', 'section:vitrin-premium'
            ),
            jsonb_build_object(
              'id', 'bottom-cta',
              'type', 'bottom_cta',
              'eyebrow', 'Cok daha fazlasi var',
              'title', 'Tum test magazasini gez',
              'description', 'Frame ve arka plan kataloglarini ayni yuzeyde filtreleyip satin alma ve hediye akisini dene.',
              'ctaLabel', 'Tum magazayi gez',
              'ctaHref', 'section:vitrin-katalog',
              'decorMode', 'orbs'
            )
          )
        )
      )
    ),
    'live_store_home', jsonb_build_object(
      'activeCampaignId', null,
      'campaigns', jsonb_build_array()
    )
  )
)
where id = 1
  and storefront_runtime_config is null;

comment on column public.site_settings.storefront_runtime_config is
  'Event/campaign odakli test ve ileride canli magaza vitrini icin block tabanli runtime config.';
