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
      'tierKey', 'prestige',
      'tierLabel', 'Prestij',
      'tierHeadline', 'Fansub prestij seviyesinde; gorunur kimlik, takviye cercevesi ve gelismis analytics birlikte acik.',
      'tierSummary', 'Bu kademe, boost sisteminin prestij ve ileri seviye icgorulerini ayni katta biriktirir.',
      'currentBenefits', jsonb_build_array(
        'Takviye cercevesi ve vanity URL aktif.',
        'Gelismis analytics ile ekip daha derin icgoruler alir.',
        'Topluluk destekli kimlik ve sinematik vitrin korunur.'
      ),
      'nextTierSummary', 'Maksimum seviyedesin.',
      'nextTierBenefits', jsonb_build_array(),
      'nextTierCallout', 'Bu fansub boost sisteminin en yuksek kademesinde.',
      'canUploadStaticBackground', true,
      'canUploadVideoBackground', true,
      'emojiSlotLimit', 8,
      'hasFullNameStyle', true,
      'canUsePolls', true,
      'hasAnalytics', true,
      'hasAdvancedAnalytics', true,
      'hasChapterEndCredit', true,
      'hasDiscoverBadge', true,
      'hasFansubProfileEffect', false,
      'hasGoldFrame', true,
      'hasShimmer', true,
      'hasVanityUrl', true,
      'hasHomepagePlacement', false,
      'hasAutoCommunityPosts', false,
      'hasInviteCard', false,
      'hasHonorWall', false,
      'canManagePinnedNotice', true,
      'canUseSupporterList', true,
      'canUseSpecialNotifications', true,
      'canShowcaseManga', true
    )
    when 2 then jsonb_build_object(
      'tierLevel', 2,
      'tierKey', 'community',
      'tierLabel', 'Topluluk etkisi',
      'tierHeadline', 'Fansub topluluk etkisi seviyesinde; isim kimligi, bildirim ve supporter ritmi burada guclenir.',
      'tierSummary', 'Bu kademe, topluluk akisina ve geri donen supporter davranisina odaklanir.',
      'currentBenefits', jsonb_build_array(
        'Gelismis isim stili katalog ve hover yuzeylerine tasinir.',
        'Ozel bildirim ile takipcilere tek amacli duyurular gonderilir.',
        'Core araclar ve Tier 1 vitrin katmanlari birlikte calismaya devam eder.'
      ),
      'nextTierSummary', 'Bir sonraki seviye prestij katmanini acar.',
      'nextTierBenefits', jsonb_build_array(
        'Takviye cercevesi aktif olur.',
        'Vanity URL ve gelismis analytics acilir.',
        'Fansub daha premium ve paylasilabilir bir kimlik kazanir.'
      ),
      'nextTierCallout', 'Seviye 3, destek etkisini prestij ve icgoru ile tamamlar.',
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
      'tierKey', 'visible-support',
      'tierLabel', 'Gorunur destek',
      'tierHeadline', 'Fansub ilk boost katmanini acti; vitrin artik daha hareketli ve daha gorunur.',
      'tierSummary', 'Bu kademe, supporter etkisinin sayfada ilk anda fark edildigi gorunur katmandir.',
      'currentBenefits', jsonb_build_array(
        'Statik ve video arka plan birlikte acilir.',
        'Topluluk destekli rozeti isim sonunda gorunur hale gelir.',
        'Core araclarin ustune ilk belirgin vitrin farki eklenir.'
      ),
      'nextTierSummary', 'Bir sonraki seviye topluluk etkisi katmanini acar.',
      'nextTierBenefits', jsonb_build_array(
        'Gelismis isim stili acilir.',
        'Ozel bildirim sistemi devreye girer.',
        'Supporter davranisi daha belirgin ve tekrarli hale gelir.'
      ),
      'nextTierCallout', 'Seviye 2, vitrin farkini topluluk davranisina cevirir.',
      'canUploadStaticBackground', true,
      'canUploadVideoBackground', true,
      'emojiSlotLimit', 3,
      'hasFullNameStyle', false,
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
      'canUseSpecialNotifications', false,
      'canShowcaseManga', true
    )
    else jsonb_build_object(
      'tierLevel', 0,
      'tierKey', 'core',
      'tierLabel', 'Core',
      'tierHeadline', 'Fansub temel araclara sahip; boost bu tabanin ustune gorunur katmanlar ekler.',
      'tierSummary', 'Temel analytics, mini anket, duyurular, basic supporter ozeti ve kapanis seridi acik kalir.',
      'currentBenefits', jsonb_build_array(
        'Temel analytics ve mini anket acik.',
        'Public duyurular, manga vitrini ve supporter ozeti core katmanda acik.',
        'Kapanis seridi temel tesekkur ve yonlendirme alani olarak calisir.'
      ),
      'nextTierSummary', 'Ilk boost katmani gorunur destek etkisini acar.',
      'nextTierBenefits', jsonb_build_array(
        'Statik ve video arka plan acilir.',
        'Topluluk destekli rozeti gorunur olur.',
        'Sayfa ilk defa belirgin sekilde daha premium his verir.'
      ),
      'nextTierCallout', 'Ilk takviyeler, boost sistemini hissedilir hale getirir.',
      'canUploadStaticBackground', false,
      'canUploadVideoBackground', false,
      'emojiSlotLimit', 0,
      'hasFullNameStyle', false,
      'canUsePolls', true,
      'hasAnalytics', true,
      'hasAdvancedAnalytics', false,
      'hasChapterEndCredit', true,
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
      'canUseSpecialNotifications', false,
      'canShowcaseManga', true
    )
  end;
$$;

grant execute on function public.build_fansub_boost_capabilities(integer) to anon, authenticated;

create or replace function public.equip_fansub_inventory_item(
  p_fansub_id uuid,
  p_item_id uuid,
  p_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fansubs%rowtype;
  v_item public.store_items%rowtype;
begin
  if p_fansub_id is null or p_item_id is null then
    raise exception 'Fansub ve urun kimligi zorunludur.';
  end if;

  if p_type not in ('frame', 'background', 'pattern', 'profile_effect') then
    raise exception 'Desteklenmeyen fansub kozmetik tipi.';
  end if;

  if not public.is_admin() and not public.is_fansub_admin(p_fansub_id) then
    raise exception 'Bu fansub icin yetkiniz yok.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Urun bulunamadi.';
  end if;

  if v_item.type <> p_type then
    raise exception 'Kozmetik tipi urun kaydi ile eslesmiyor.';
  end if;

  if not exists (
    select 1
    from public.fansub_inventory fi
    where fi.fansub_id = p_fansub_id
      and fi.store_item_id = p_item_id
  ) then
    raise exception 'Fansub envanterinde olmayan urun secilemez.';
  end if;

  update public.fansubs
  set active_frame_id = case when p_type = 'frame' then p_item_id else active_frame_id end,
      active_background_id = case when p_type = 'background' then p_item_id else active_background_id end,
      active_pattern_id = case when p_type = 'pattern' then p_item_id else active_pattern_id end,
      active_profile_effect_id = case when p_type = 'profile_effect' then p_item_id else active_profile_effect_id end
  where id = p_fansub_id
  returning *
  into v_row;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'active_frame_id', v_row.active_frame_id,
    'active_background_id', v_row.active_background_id,
    'active_pattern_id', v_row.active_pattern_id,
    'active_profile_effect_id', v_row.active_profile_effect_id
  );
end;
$$;

grant execute on function public.equip_fansub_inventory_item(uuid, uuid, text) to authenticated;

update public.fansub_boost_snapshots as snapshot
set capabilities = public.build_fansub_boost_capabilities(snapshot.tier_level);

commit;
