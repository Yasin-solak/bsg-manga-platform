begin;

create or replace function public.get_fansub_boost_tier_floor_power(
  p_tier_level integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_tier_level, 0), 0)
    when 3 then 12
    when 2 then 6
    when 1 then 3
    else 0
  end;
$$;

grant execute on function public.get_fansub_boost_tier_floor_power(integer) to anon, authenticated;

create or replace function public.get_fansub_boost_next_tier_level(
  p_tier_level integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_tier_level, 0), 0)
    when 0 then 1
    when 1 then 2
    when 2 then 3
    else null
  end;
$$;

grant execute on function public.get_fansub_boost_next_tier_level(integer) to anon, authenticated;

create or replace function public.get_fansub_boost_next_tier_required_power(
  p_tier_level integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_tier_level, 0), 0)
    when 0 then 3
    when 1 then 6
    when 2 then 12
    else null
  end;
$$;

grant execute on function public.get_fansub_boost_next_tier_required_power(integer) to anon, authenticated;

create or replace function public.resolve_fansub_boost_tier(
  p_active_power integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_active_power, 0) >= 12 then 3
    when coalesce(p_active_power, 0) >= 6 then 2
    when coalesce(p_active_power, 0) >= 3 then 1
    else 0
  end;
$$;

grant execute on function public.resolve_fansub_boost_tier(integer) to anon, authenticated;

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
      'hasFansubProfileEffect', true,
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

create or replace function public.send_fansub_special_notification(
  p_fansub_id uuid,
  p_title text,
  p_message text,
  p_route_target text,
  p_target_entity_id uuid
)
returns table (
  success boolean,
  broadcast_id uuid,
  fansub_id uuid,
  title text,
  message text,
  route_target text,
  target_entity_id uuid,
  route_label text,
  route_hint text,
  recipient_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_route_target text := lower(trim(coalesce(p_route_target, 'mangalar')));
  v_target_entity_id uuid := p_target_entity_id;
  v_route_label text;
  v_route_hint text;
  v_fansub_name text := 'Fansub';
  v_broadcast_id uuid;
  v_created_at timestamptz;
  v_recipient_count integer := 0;
  v_follower_user_id uuid;
  v_last_broadcast_at timestamptz;
  v_recent_broadcast_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun takipcilerine bildirim gonderme yetkiniz yok.';
  end if;

  if not public.fansub_has_boost_capability(p_fansub_id, 'canUseSpecialNotifications') then
    raise exception 'Ozel bildirim gonderimi icin Seviye 2 takviye gerekir.';
  end if;

  if v_title is null then
    raise exception 'Bildirim basligi bos olamaz.';
  end if;

  if v_message is null then
    raise exception 'Bildirim metni bos olamaz.';
  end if;

  select resolved.target_label, resolved.route_hint
  into v_route_label, v_route_hint
  from public.resolve_fansub_notice_target(p_fansub_id, v_route_target, v_target_entity_id) as resolved;

  select coalesce(f.name, v_fansub_name)
  into v_fansub_name
  from public.fansubs f
  where f.id = p_fansub_id;

  select max(broadcast.created_at)
  into v_last_broadcast_at
  from public.fansub_special_notification_broadcasts as broadcast
  where broadcast.fansub_id = p_fansub_id;

  if v_last_broadcast_at is not null and v_last_broadcast_at > now() - interval '15 minutes' then
    raise exception 'Yeni bildirim icin 15 dakika beklemelisiniz.';
  end if;

  select count(*)
  into v_recent_broadcast_count
  from public.fansub_special_notification_broadcasts as broadcast
  where broadcast.fansub_id = p_fansub_id
    and broadcast.created_at > now() - interval '24 hours';

  if v_recent_broadcast_count >= 6 then
    raise exception 'Son 24 saatte maksimum 6 ozel bildirim gonderebilirsiniz.';
  end if;

  if exists (
    select 1
    from public.fansub_special_notification_broadcasts as broadcast
    where broadcast.fansub_id = p_fansub_id
      and lower(trim(broadcast.title)) = lower(v_title)
      and lower(trim(broadcast.message)) = lower(v_message)
      and broadcast.route_target = v_route_target
      and coalesce(broadcast.target_entity_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_target_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and broadcast.created_at > now() - interval '12 hours'
  ) then
    raise exception 'Ayni baslik, metin ve hedef kombinasyonu 12 saat icinde tekrar gonderilemez.';
  end if;

  insert into public.fansub_special_notification_broadcasts as broadcast (
    fansub_id,
    title,
    message,
    route_target,
    target_entity_id,
    route_label,
    route_hint,
    recipient_count,
    created_by
  )
  values (
    p_fansub_id,
    v_title,
    v_message,
    v_route_target,
    v_target_entity_id,
    v_route_label,
    v_route_hint,
    0,
    v_actor_id
  )
  returning broadcast.id, broadcast.created_at
  into v_broadcast_id, v_created_at;

  for v_follower_user_id in
    select ff.user_id
    from public.fansub_follows as ff
    join public.users as u
      on u.id = ff.user_id
    where ff.fansub_id = p_fansub_id
      and u.is_active = true
  loop
    if public.is_notification_type_enabled(v_follower_user_id, 'system') then
      perform public.push_notification(
        v_follower_user_id,
        'system',
        v_title,
        v_message,
        jsonb_build_object(
          'event', 'fansub_special_notification',
          'fansub_id', p_fansub_id,
          'fansub_name', v_fansub_name,
          'broadcast_id', v_broadcast_id,
          'route_target', v_route_target,
          'target_entity_id', v_target_entity_id,
          'route_label', v_route_label,
          'route_hint', v_route_hint,
          'event_key', format('fansub-special-notification:%s:%s', v_broadcast_id::text, v_follower_user_id::text)
        )
      );
      v_recipient_count := v_recipient_count + 1;
    end if;
  end loop;

  update public.fansub_special_notification_broadcasts as broadcast
  set recipient_count = v_recipient_count
  where broadcast.id = v_broadcast_id;

  return query
  select
    true,
    v_broadcast_id,
    p_fansub_id,
    v_title,
    v_message,
    v_route_target,
    v_target_entity_id,
    v_route_label,
    v_route_hint,
    v_recipient_count,
    v_created_at;
end;
$$;

with recomputed as (
  select
    s.fansub_id,
    coalesce(s.active_power, 0) as active_power,
    public.resolve_fansub_boost_tier(coalesce(s.active_power, 0)) as tier_level,
    public.get_fansub_boost_tier_floor_power(public.resolve_fansub_boost_tier(coalesce(s.active_power, 0))) as current_tier_floor_power,
    public.get_fansub_boost_next_tier_level(public.resolve_fansub_boost_tier(coalesce(s.active_power, 0))) as next_tier_level,
    public.get_fansub_boost_next_tier_required_power(public.resolve_fansub_boost_tier(coalesce(s.active_power, 0))) as next_tier_required_power
  from public.fansub_boost_snapshots s
)
update public.fansub_boost_snapshots as snapshot
set
  tier_level = recalculated.tier_level,
  current_tier_floor_power = recalculated.current_tier_floor_power,
  next_tier_level = recalculated.next_tier_level,
  next_tier_required_power = recalculated.next_tier_required_power,
  next_tier_remaining_power = case
    when recalculated.next_tier_required_power is null then 0
    else greatest(recalculated.next_tier_required_power - recalculated.active_power, 0)
  end,
  tier_progress_percent = case
    when recalculated.next_tier_required_power is null then 100
    when recalculated.next_tier_required_power <= recalculated.current_tier_floor_power then 0
    else round(
      least(
        greatest(
          ((recalculated.active_power - recalculated.current_tier_floor_power)::numeric
            / (recalculated.next_tier_required_power - recalculated.current_tier_floor_power)::numeric
          ) * 100,
          0
        ),
        100
      ),
      2
    )
  end,
  capabilities = public.build_fansub_boost_capabilities(recalculated.tier_level)
from recomputed as recalculated
where recalculated.fansub_id = snapshot.fansub_id;

commit;
