begin;

create or replace function public.build_fansub_boost_capabilities(
  p_tier_level integer
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_tier_level, 0), 0)
    when 3 then jsonb_build_object(
      'tierLevel', 3,
      'tierKey', 'legend',
      'tierLabel', 'Efsane',
      'tierHeadline', 'Fansub efsane seviyede ve tum vitrin gucunu acmis durumda.',
      'tierSummary', 'Bu kademe, en gorunur fansub kimligini, ust seviye vitrin araclarini ve kalici topluluk hissini temsil eder.',
      'currentBenefits', jsonb_build_array(
        'Video arka plan ve tam vitrin kimligi acik.',
        'Vanity URL, ana sayfa yerlesimi ve gelismis analizler acik.',
        'Profil efekti, shimmer, altin cerceve ve supporter onur duvari aktif.'
      ),
      'nextTierSummary', 'Maksimum seviyedesin.',
      'nextTierBenefits', jsonb_build_array(),
      'nextTierCallout', 'Bu fansub su anda boost sisteminin en yuksek kademesinde.',
      'canUploadStaticBackground', true,
      'canUploadVideoBackground', true,
      'emojiSlotLimit', 8,
      'hasFullNameStyle', true,
      'canUsePolls', true,
      'hasAnalytics', true,
      'hasAdvancedAnalytics', true,
      'hasChapterEndCredit', true,
      'hasDiscoverBadge', true,
      'hasFansubProfileEffect', true,
      'hasGoldFrame', true,
      'hasShimmer', true,
      'hasVanityUrl', true,
      'hasHomepagePlacement', true,
      'hasAutoCommunityPosts', true,
      'hasInviteCard', true,
      'hasHonorWall', true,
      'canManagePinnedNotice', true,
      'canUseSupporterList', true,
      'canUseSpecialNotifications', true,
      'canShowcaseManga', true
    )
    when 2 then jsonb_build_object(
      'tierLevel', 2,
      'tierKey', 'empowered',
      'tierLabel', 'Guclenmis',
      'tierHeadline', 'Fansub guclenmis seviyede ve orta-ust kademe avantajlarin cogunu acmis durumda.',
      'tierSummary', 'Bu kademe, video vitrin, analiz ve daha zengin kimlik katmanlariyla fansubu belirgin sekilde one cikarir.',
      'currentBenefits', jsonb_build_array(
        'Video arka plan ve zengin isim stili acik.',
        'Anket, analiz ve bolum sonu kredi yuzeyleri kullanilabilir.',
        'Destekci listesi, ozel bildirimler ve manga vitrini aktif.'
      ),
      'nextTierSummary', 'Bir sonraki seviye, fansubu efsane kademeye tasir.',
      'nextTierBenefits', jsonb_build_array(
        'Vanity URL ve ana sayfa yerlesimi acilir.',
        'Fansub profil efekti, shimmer ve altin cerceve aktif olur.',
        'Onur duvari, gelismis analizler ve otomatik topluluk akislarina gecilir.'
      ),
      'nextTierCallout', 'Seviye 3, discover hissi ve premium vitrin etkisini gorunur sekilde guclendirir.',
      'canUploadStaticBackground', true,
      'canUploadVideoBackground', true,
      'emojiSlotLimit', 5,
      'hasFullNameStyle', true,
      'canUsePolls', true,
      'hasAnalytics', true,
      'hasAdvancedAnalytics', false,
      'hasChapterEndCredit', true,
      'hasDiscoverBadge', true,
      'hasFansubProfileEffect', false,
      'hasGoldFrame', false,
      'hasShimmer', false,
      'hasVanityUrl', false,
      'hasHomepagePlacement', false,
      'hasAutoCommunityPosts', false,
      'hasInviteCard', false,
      'hasHonorWall', false,
      'canManagePinnedNotice', true,
      'canUseSupporterList', true,
      'canUseSpecialNotifications', true,
      'canShowcaseManga', true
    )
    when 1 then jsonb_build_object(
      'tierLevel', 1,
      'tierKey', 'rising',
      'tierLabel', 'Yukselen',
      'tierHeadline', 'Fansub yukselen seviyede ve ilk vitrin katmanlarini acmis durumda.',
      'tierSummary', 'Bu kademe, boost sisteminin ilk gorunur etkilerini acarak fansuba temel kimlik ve supporter hissi kazandirir.',
      'currentBenefits', jsonb_build_array(
        'Statik arka plan vitrinine gecis acilir.',
        'Temel supporter listesi ve ozel bildirimler aktif olur.',
        'Manga vitrini ve pinned notice gibi ilk kimlik araclari acilir.'
      ),
      'nextTierSummary', 'Bir sonraki seviye, daha sinematik ve guclu vitrin araclarini acar.',
      'nextTierBenefits', jsonb_build_array(
        'Video arka plan ve tam isim stili acilir.',
        'Anketler, analizler ve bolum sonu kredi yuzeyi aktif olur.',
        'Discover rozeti ve daha guclu supporter etkisi kazanilir.'
      ),
      'nextTierCallout', 'Seviye 2, fansubun gorunurlugunu ve profesyonel hissini belirgin sekilde arttirir.',
      'canUploadStaticBackground', true,
      'canUploadVideoBackground', false,
      'emojiSlotLimit', 3,
      'hasFullNameStyle', false,
      'canUsePolls', false,
      'hasAnalytics', false,
      'hasAdvancedAnalytics', false,
      'hasChapterEndCredit', false,
      'hasDiscoverBadge', false,
      'hasFansubProfileEffect', false,
      'hasGoldFrame', false,
      'hasShimmer', false,
      'hasVanityUrl', false,
      'hasHomepagePlacement', false,
      'hasAutoCommunityPosts', false,
      'hasInviteCard', false,
      'hasHonorWall', false,
      'canManagePinnedNotice', true,
      'canUseSupporterList', true,
      'canUseSpecialNotifications', true,
      'canShowcaseManga', true
    )
    else jsonb_build_object(
      'tierLevel', 0,
      'tierKey', 'base',
      'tierLabel', 'Temel',
      'tierHeadline', 'Fansub henuz boost seviyesini acmamis durumda.',
      'tierSummary', 'Takviye, bu fansubun vitrinini ve supporter katmanlarini asama asama guclendirir.',
      'currentBenefits', jsonb_build_array(),
      'nextTierSummary', 'Ilk seviye, boost sisteminin gorunur hale geldigi temel kademedir.',
      'nextTierBenefits', jsonb_build_array(
        'Statik arka plan vitrini acilir.',
        'Destekci listesi ve ozel bildirimler aktif olur.',
        'Manga vitrini ve ilk kimlik araclari kullanilabilir hale gelir.'
      ),
      'nextTierCallout', 'Ilk boostlar, fansubun kimlik hissini ve supporter gorunurlugunu baslatir.',
      'canUploadStaticBackground', false,
      'canUploadVideoBackground', false,
      'emojiSlotLimit', 0,
      'hasFullNameStyle', false,
      'canUsePolls', false,
      'hasAnalytics', false,
      'hasAdvancedAnalytics', false,
      'hasChapterEndCredit', false,
      'hasDiscoverBadge', false,
      'hasFansubProfileEffect', false,
      'hasGoldFrame', false,
      'hasShimmer', false,
      'hasVanityUrl', false,
      'hasHomepagePlacement', false,
      'hasAutoCommunityPosts', false,
      'hasInviteCard', false,
      'hasHonorWall', false,
      'canManagePinnedNotice', false,
      'canUseSupporterList', false,
      'canUseSpecialNotifications', false,
      'canShowcaseManga', false
    )
  end;
$$;

grant execute on function public.build_fansub_boost_capabilities(integer) to anon, authenticated;

create or replace function public.build_fansub_boost_supporter_capabilities(
  p_reward_tier integer
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_reward_tier, 0), 0)
    when 3 then jsonb_build_object(
      'rewardTier', 3,
      'rewardLabel', 'Spotlight Supporter',
      'rewardSummary', 'En yuksek supporter kademesi; ozel kimlik kozmetikleri ve gorunur spotlight hissi verir.',
      'rewardHighlights', jsonb_build_array(
        'Aktif supporter rozeti ve supporter emoji seti.',
        'Supporter notu, liste ve kredi sayfasinda one cikma.',
        'Ozel supporter frame, profil efekti ve spotlight gorunurlugu.'
      ),
      'supporterPitch', 'Bu kademe, hem fansuba en guclu katkidir hem de kullaniciya en gorunur supporter kimligini verir.',
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', true,
      'hasSupporterProfileEffect', true,
      'hasSupporterSpotlight', true
    )
    when 2 then jsonb_build_object(
      'rewardTier', 2,
      'rewardLabel', 'Elite Supporter',
      'rewardSummary', 'Orta-ust supporter kademesi; supporter kimligini daha zengin ve koleksiyonluk hale getirir.',
      'rewardHighlights', jsonb_build_array(
        'Aktif supporter rozeti ve supporter emoji seti.',
        'Supporter notu ve supporter listesinde gorunurluk.',
        'Ozel supporter frame ile profil kimligi guclenir.'
      ),
      'supporterPitch', 'Bu kademe, rozetten fazlasini isteyen ve profilinde supporter etkisi gostermek isteyen kullanici icindir.',
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', true,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
    when 1 then jsonb_build_object(
      'rewardTier', 1,
      'rewardLabel', 'Supporter',
      'rewardSummary', 'Temel supporter kademesi; destegin gorunur hale gelmesini ve isimle anilmani saglar.',
      'rewardHighlights', jsonb_build_array(
        'Aktif supporter rozeti acilir.',
        'Supporter emojileri ve destek notu kullanilabilir.',
        'Supporter listesi ve kredi sayfasinda gorunebilirsin.'
      ),
      'supporterPitch', 'Bu kademe, fansuba destek verirken kendine de gorunur bir supporter kimligi kazandirir.',
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', false,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
    else jsonb_build_object(
      'rewardTier', 0,
      'rewardLabel', 'Henuz supporter degilsin',
      'rewardSummary', 'Takviye verdiginde supporter rozetleri, not gorunurlugu ve liste alanlari acilir.',
      'rewardHighlights', jsonb_build_array(),
      'supporterPitch', 'Ilk takviyeyle birlikte hem fansuba guc katarsin hem de supporter kimligin gorunur olur.',
      'hasActiveSupporterBadge', false,
      'canUseSupporterEmojis', false,
      'canShowSupporterNote', false,
      'canAppearInSupporterList', false,
      'canAppearInCreditPage', false,
      'hasSupporterFrame', false,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
  end;
$$;

grant execute on function public.build_fansub_boost_supporter_capabilities(integer) to anon, authenticated;

update public.fansub_boost_snapshots s
set capabilities = public.build_fansub_boost_capabilities(s.tier_level);

update public.fansub_boost_supporter_states s
set reward_capabilities = public.build_fansub_boost_supporter_capabilities(s.supporter_reward_tier);

update public.fansub_boost_plans
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'accent', 'violet',
  'eyebrow', 'Temel destek',
  'summary', 'Fansubun ilk boost seviyesini acmaya yardim eden hafif ama surekli paket.',
  'fansubBenefitSummary', 'Ilk tier gucunu biriktirir ve supporter gorunurlugunu baslatir.',
  'supporterBenefitSummary', 'Temel supporter rozeti ve gorunurluk odakli.',
  'badgeLabel', 'Baslangic',
  'ctaLabel', 'Aylik takviye ver'
)
where code = 'monthly';

update public.fansub_boost_plans
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'accent', 'purple',
  'eyebrow', 'Seviye atlatir',
  'summary', 'Fansubu orta-ust kademe gorunurluge tasiyan, daha guclu ve stratejik paket.',
  'fansubBenefitSummary', 'Video vitrin, analiz ve zengin kimlik araclarina yaklastirir.',
  'supporterBenefitSummary', 'Supporter frame ve daha gorunur supporter kimligi odakli.',
  'badgeLabel', 'En cok tercih edilen',
  'ctaLabel', 'Mega takviye ver'
)
where code = 'mega';

update public.fansub_boost_plans
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'accent', 'amber',
  'eyebrow', 'Efsanevi katki',
  'summary', 'Fansubu dogrudan en guclu vitrin seviyelerine yaklastiran uzun sureli premium paket.',
  'fansubBenefitSummary', 'Homepage placement, vanity URL ve efsane seviye unlocklarini hedefler.',
  'supporterBenefitSummary', 'Spotlight, supporter profile effect ve en gorunur supporter kimligi odakli.',
  'badgeLabel', 'En guclu paket',
  'ctaLabel', 'Top takviye ver'
)
where code = 'top';

commit;
