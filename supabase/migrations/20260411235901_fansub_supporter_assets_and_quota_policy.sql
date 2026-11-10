begin;

insert into public.fansub_boost_capability_policies as policy (
  capability_key,
  label,
  summary,
  detail,
  placement_hint,
  surface_group,
  placement_type,
  tier_level,
  sort_order
)
values
  (
    'canUseSupporterEmojiAssets',
    'Supporter emojileri',
    'Fansubun yukledigi ozel emoji seti aktif destekcilere acilir.',
    'Yorum ve topluluk alanlarinda kullanilan kisisel emoji seti boost katmanina gore genisler.',
    'Yorumlar ve topluluk alanlari',
    'supporters',
    'core',
    null,
    45
  ),
  (
    'canUseSupporterStickerAssets',
    'Supporter cikartmalari',
    'Fansubun yukledigi ozel cikartma seti aktif destekcilere acilir.',
    'Yorum ve topluluk alanlarinda kullanilan cikartma seti boost katmanina gore genisler.',
    'Yorumlar ve topluluk alanlari',
    'supporters',
    'core',
    null,
    46
  )
on conflict (capability_key) do update
set
  label = excluded.label,
  summary = excluded.summary,
  detail = excluded.detail,
  placement_hint = excluded.placement_hint,
  surface_group = excluded.surface_group,
  placement_type = excluded.placement_type,
  tier_level = excluded.tier_level,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.fansub_supporter_assets (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs (id) on delete cascade,
  asset_kind text not null check (asset_kind in ('emoji', 'sticker')),
  shortcode text not null
    check (
      shortcode = lower(shortcode)
      and shortcode ~ '^[a-z0-9][a-z0-9_-]{1,31}$'
    ),
  label text not null default ''
    check (char_length(btrim(label)) between 1 and 48),
  asset_ref text not null
    check (char_length(btrim(asset_ref)) between 1 and 240),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  width integer null check (width is null or width between 1 and 4096),
  height integer null check (height is null or height between 1 and 4096),
  size_bytes integer null check (size_bytes is null or size_bytes between 1 and 10485760),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid null references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fansub_supporter_assets_unique_shortcodes
    unique (fansub_id, asset_kind, shortcode)
);

create index if not exists idx_fansub_supporter_assets_sort
  on public.fansub_supporter_assets (fansub_id, asset_kind, sort_order asc, created_at asc);

drop trigger if exists trg_fansub_supporter_assets_updated_at on public.fansub_supporter_assets;
create trigger trg_fansub_supporter_assets_updated_at
  before update on public.fansub_supporter_assets
  for each row
  execute function public.set_updated_at();

alter table public.fansub_supporter_assets enable row level security;

drop policy if exists fansub_supporter_assets_staff_read on public.fansub_supporter_assets;
create policy fansub_supporter_assets_staff_read
  on public.fansub_supporter_assets
  for select
  using (public.is_admin() or public.is_fansub_staff(fansub_id));

drop policy if exists fansub_supporter_assets_staff_write on public.fansub_supporter_assets;
create policy fansub_supporter_assets_staff_write
  on public.fansub_supporter_assets
  for all
  using (public.is_admin() or public.is_fansub_staff(fansub_id))
  with check (public.is_admin() or public.is_fansub_staff(fansub_id));

drop policy if exists "Fansub upload supporter assets" on storage.objects;
create policy "Fansub upload supporter assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'fansubs'
    and (storage.foldername(name))[3] = 'supporter-assets'
    and (
      public.is_admin()
      or public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
    )
  );

drop policy if exists "Fansub update supporter assets" on storage.objects;
create policy "Fansub update supporter assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'fansubs'
    and (storage.foldername(name))[3] = 'supporter-assets'
    and (
      public.is_admin()
      or public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
    )
  )
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'fansubs'
    and (storage.foldername(name))[3] = 'supporter-assets'
    and (
      public.is_admin()
      or public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
    )
  );

drop policy if exists "Fansub delete supporter assets" on storage.objects;
create policy "Fansub delete supporter assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'fansubs'
    and (storage.foldername(name))[3] = 'supporter-assets'
    and (
      public.is_admin()
      or public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
    )
  );

create or replace function public.get_fansub_supporter_asset_tier_quota(
  p_asset_kind text,
  p_tier_level integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_asset_kind, '')))
    when 'emoji' then case greatest(coalesce(p_tier_level, 0), 0)
      when 3 then 50
      when 2 then 30
      when 1 then 15
      else 5
    end
    when 'sticker' then case greatest(coalesce(p_tier_level, 0), 0)
      when 3 then 30
      when 2 then 15
      when 1 then 10
      else 5
    end
    else 0
  end;
$$;

grant execute on function public.get_fansub_supporter_asset_tier_quota(text, integer) to anon, authenticated;

create or replace function public.resolve_fansub_supporter_asset_limit(
  p_capabilities jsonb,
  p_asset_kind text
)
returns integer
language sql
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_asset_kind, '')))
    when 'emoji' then greatest(
      coalesce((p_capabilities ->> 'supporterEmojiSlotLimit')::integer, null),
      coalesce((p_capabilities ->> 'emojiSlotLimit')::integer, 0)
    )
    when 'sticker' then coalesce((p_capabilities ->> 'supporterStickerSlotLimit')::integer, 0)
    else 0
  end;
$$;

grant execute on function public.resolve_fansub_supporter_asset_limit(jsonb, text) to anon, authenticated;

create or replace function public.build_fansub_boost_capabilities(
  p_tier_level integer
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tier_level integer := greatest(coalesce(p_tier_level, 0), 0);
  v_tier_key text := case
    when v_tier_level >= 3 then 'prestige'
    when v_tier_level = 2 then 'community'
    when v_tier_level = 1 then 'visible-support'
    else 'core'
  end;
  v_tier_label text := case
    when v_tier_level >= 3 then 'Prestij'
    when v_tier_level = 2 then 'Topluluk etkisi'
    when v_tier_level = 1 then 'Gorunur destek'
    else 'Core'
  end;
  v_next_tier_level integer := public.get_fansub_boost_next_tier_level(v_tier_level);
  v_next_tier_label text := case
    when v_next_tier_level = 1 then 'Gorunur destek'
    when v_next_tier_level = 2 then 'Topluluk etkisi'
    when v_next_tier_level = 3 then 'Prestij'
    else null
  end;
  v_current_labels text[] := array[]::text[];
  v_next_labels text[] := array[]::text[];
  v_result jsonb := jsonb_build_object(
    'tierLevel', v_tier_level,
    'tierKey', v_tier_key,
    'tierLabel', v_tier_label,
    'tierHeadline', '',
    'tierSummary', '',
    'currentBenefits', '[]'::jsonb,
    'nextTierSummary', '',
    'nextTierBenefits', '[]'::jsonb,
    'nextTierCallout', '',
    'canUploadStaticBackground', false,
    'canUploadVideoBackground', false,
    'hasFullNameStyle', false,
    'canUsePolls', false,
    'hasAnalytics', false,
    'hasAdvancedAnalytics', false,
    'hasChapterEndCredit', false,
    'hasDiscoverBadge', false,
    'hasGoldFrame', false,
    'hasVanityUrl', false,
    'canManagePinnedNotice', false,
    'canUseSupporterList', false,
    'canUseSpecialNotifications', false,
    'canShowcaseManga', false,
    'hasSupporterStreak', false,
    'hasFoundingSupporter', false,
    'canUseSupporterEmojiAssets', false,
    'canUseSupporterStickerAssets', false,
    'emojiSlotLimit', 0,
    'supporterEmojiSlotLimit', 0,
    'supporterStickerSlotLimit', 0,
    'hasFansubProfileEffect', false,
    'hasShimmer', v_tier_level >= 3,
    'hasHomepagePlacement', false,
    'hasAutoCommunityPosts', false,
    'hasInviteCard', false,
    'hasHonorWall', false
  );
  v_policy record;
  v_emoji_limit integer := 0;
  v_sticker_limit integer := 0;
begin
  for v_policy in
    select
      policy.capability_key,
      policy.placement_type,
      policy.tier_level
    from public.fansub_boost_capability_policies as policy
    order by policy.sort_order asc, policy.capability_key asc
  loop
    if v_policy.placement_type = 'core' then
      v_result := jsonb_set(v_result, array[v_policy.capability_key], 'true'::jsonb, true);
    elsif v_policy.placement_type = 'tier' and v_tier_level >= coalesce(v_policy.tier_level, 99) then
      v_result := jsonb_set(v_result, array[v_policy.capability_key], 'true'::jsonb, true);
    else
      v_result := jsonb_set(v_result, array[v_policy.capability_key], 'false'::jsonb, true);
    end if;
  end loop;

  if coalesce((v_result ->> 'canUseSupporterEmojiAssets')::boolean, false) then
    v_emoji_limit := public.get_fansub_supporter_asset_tier_quota('emoji', v_tier_level);
  end if;

  if coalesce((v_result ->> 'canUseSupporterStickerAssets')::boolean, false) then
    v_sticker_limit := public.get_fansub_supporter_asset_tier_quota('sticker', v_tier_level);
  end if;

  v_result := v_result || jsonb_build_object(
    'emojiSlotLimit', v_emoji_limit,
    'supporterEmojiSlotLimit', v_emoji_limit,
    'supporterStickerSlotLimit', v_sticker_limit
  );

  if v_tier_level = 0 then
    select coalesce(array_agg(policy.label order by policy.sort_order asc), array[]::text[])
    into v_current_labels
    from public.fansub_boost_capability_policies as policy
    where policy.placement_type = 'core';
  else
    select coalesce(array_agg(policy.label order by policy.sort_order asc), array[]::text[])
    into v_current_labels
    from public.fansub_boost_capability_policies as policy
    where policy.placement_type = 'tier'
      and policy.tier_level = v_tier_level;
  end if;

  if v_next_tier_level is not null then
    select coalesce(array_agg(policy.label order by policy.sort_order asc), array[]::text[])
    into v_next_labels
    from public.fansub_boost_capability_policies as policy
    where policy.placement_type = 'tier'
      and policy.tier_level = v_next_tier_level;
  end if;

  v_result := v_result || jsonb_build_object(
    'tierHeadline',
      case
        when v_tier_level = 0 then 'Fansub temel katmanda. Boost, core araclarin ustune gorunur katmanlar ekler.'
        else format('Fansub %s katmaninda. Bu seviyedeki yerlesim policy ile canli olarak yonetilir.', lower(v_tier_label))
      end,
    'tierSummary',
      case
        when coalesce(array_length(v_current_labels, 1), 0) > 0 then format('Bu katmanda: %s.', array_to_string(v_current_labels, ', '))
        when v_tier_level = 0 then 'Core katman temel urun haklarini acik tutar.'
        else 'Bu katmanda su an aktif feature yok.'
      end,
    'currentBenefits', to_jsonb(v_current_labels),
    'nextTierSummary',
      case
        when v_next_tier_level is null then 'Maksimum seviyedesin.'
        else format('Siradaki katman: %s', v_next_tier_label)
      end,
    'nextTierBenefits', to_jsonb(v_next_labels),
    'nextTierCallout',
      case
        when v_next_tier_level is null then 'Yeni takviyeler mevcut prestiji ve supporter ritmini korur.'
        when coalesce(array_length(v_next_labels, 1), 0) > 0 then format('Siradaki acilimlar: %s.', array_to_string(v_next_labels, ', '))
        else 'Siradaki katman su an bos; policy editorunden doldurulabilir.'
      end
  );

  return v_result;
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
      'rewardLabel', 'Efsane destekci',
      'rewardSummary', 'En yuksek supporter kademesi; gorunur destek kimligini en guclu noktaya tasir.',
      'rewardHighlights', jsonb_build_array(
        'Aktif supporter rozeti, supporter emojileri ve cikartmalari acik kalir.',
        'Supporter notu ve gorunurlugu public yuzeylerde daha belirgin olur.',
        'Kurucu destekci ve destek serisi kimligi daha premium sunulur.'
      ),
      'supporterPitch', 'Bu kademe, hem fansuba en guclu katkidir hem de kullaniciya en gorunur supporter kimligini verir.',
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canUseSupporterStickers', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', true,
      'hasSupporterProfileEffect', true,
      'hasSupporterSpotlight', true
    )
    when 2 then jsonb_build_object(
      'rewardTier', 2,
      'rewardLabel', 'Sadik destekci',
      'rewardSummary', 'Tekrarlayan destek ve gorunur kimlik katmani burada belirginlesir.',
      'rewardHighlights', jsonb_build_array(
        'Aktif supporter rozeti, supporter emojileri ve cikartmalari acik kalir.',
        'Supporter notu ve supporter listesinde gorunurluk devam eder.',
        'Kurucu destekci ve destek serisi kimligi daha okunur hale gelir.'
      ),
      'supporterPitch', 'Bu kademe, sadece bir kere destek verip cikmak yerine ritim kuran destekciyi one cikarir.',
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canUseSupporterStickers', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', true,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
    when 1 then jsonb_build_object(
      'rewardTier', 1,
      'rewardLabel', 'Destekci',
      'rewardSummary', 'Temel supporter kademesi; destegin gorunur hale gelmesini ve isimle anilmani saglar.',
      'rewardHighlights', jsonb_build_array(
        'Aktif supporter rozeti acilir.',
        'Supporter emojileri, cikartmalari ve destek notu kullanilabilir.',
        'Supporter listesi ve kredi yuzeyinde gorunebilirsin.'
      ),
      'supporterPitch', 'Bu kademe, fansuba destek verirken kendine de gorunur bir supporter kimligi kazandirir.',
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canUseSupporterStickers', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', false,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
    else jsonb_build_object(
      'rewardTier', 0,
      'rewardLabel', 'Henuz destekci degilsin',
      'rewardSummary', 'Ilk takviyeyle birlikte supporter kimligi, not gorunurlugu ve kredi yuzeyi acilir.',
      'rewardHighlights', jsonb_build_array(),
      'supporterPitch', 'Ilk takviyeyle birlikte hem fansuba guc katarsin hem de supporter kimligin gorunur olur.',
      'hasActiveSupporterBadge', false,
      'canUseSupporterEmojis', false,
      'canUseSupporterStickers', false,
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

create or replace function public.list_public_fansub_supporter_assets(
  p_fansub_id uuid,
  p_asset_kind text default null
)
returns table (
  id uuid,
  fansub_id uuid,
  asset_kind text,
  shortcode text,
  label text,
  asset_ref text,
  mime_type text,
  width integer,
  height integer,
  size_bytes integer,
  is_active boolean,
  sort_order integer,
  quota_limit integer,
  quota_rank integer,
  is_within_quota boolean,
  is_usable boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  with snapshot_caps as (
    select coalesce(snapshot.capabilities, public.build_fansub_boost_capabilities(0)) as capabilities
    from public.fansubs as fansub
    left join public.fansub_boost_snapshots as snapshot
      on snapshot.fansub_id = fansub.id
    where fansub.id = p_fansub_id
      and coalesce(fansub.is_active, true) = true
  ),
  ranked_assets as (
    select
      asset.*,
      row_number() over (
        partition by asset.asset_kind
        order by asset.sort_order asc, asset.created_at asc, asset.id asc
      )::integer as quota_rank
    from public.fansub_supporter_assets as asset
    where asset.fansub_id = p_fansub_id
      and (
        nullif(lower(trim(coalesce(p_asset_kind, ''))), '') is null
        or asset.asset_kind = lower(trim(p_asset_kind))
      )
  )
  select
    asset.id,
    asset.fansub_id,
    asset.asset_kind,
    asset.shortcode,
    asset.label,
    asset.asset_ref,
    asset.mime_type,
    asset.width,
    asset.height,
    asset.size_bytes,
    asset.is_active,
    asset.sort_order,
    public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind) as quota_limit,
    asset.quota_rank,
    asset.quota_rank <= public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind) as is_within_quota,
    (
      asset.is_active
      and public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind) > 0
      and asset.quota_rank <= public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind)
    ) as is_usable,
    asset.created_at,
    asset.updated_at
  from ranked_assets as asset
  cross join snapshot_caps
  order by
    case asset.asset_kind when 'emoji' then 0 else 1 end asc,
    asset.sort_order asc,
    asset.created_at asc,
    asset.id asc;
$$;

grant execute on function public.list_public_fansub_supporter_assets(uuid, text) to anon, authenticated;

create or replace function public.get_my_fansub_supporter_asset_bundle(
  p_fansub_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_snapshot public.fansub_boost_snapshots%rowtype;
  v_state public.fansub_boost_supporter_states%rowtype;
  v_capabilities jsonb := public.build_fansub_boost_capabilities(0);
  v_reward_capabilities jsonb := public.build_fansub_boost_supporter_capabilities(0);
  v_emoji_slot_limit integer := 0;
  v_sticker_slot_limit integer := 0;
  v_can_use_emojis boolean := false;
  v_can_use_stickers boolean := false;
begin
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  perform public.maybe_refresh_fansub_boost_snapshot(p_fansub_id);

  select *
  into v_snapshot
  from public.fansub_boost_snapshots
  where fansub_id = p_fansub_id;

  if found then
    v_capabilities := coalesce(v_snapshot.capabilities, v_capabilities);
  end if;

  select *
  into v_state
  from public.fansub_boost_supporter_states
  where fansub_id = p_fansub_id
    and supporter_user_id = v_user_id;

  if found then
    v_reward_capabilities := coalesce(v_state.reward_capabilities, v_reward_capabilities);
  end if;

  v_emoji_slot_limit := public.resolve_fansub_supporter_asset_limit(v_capabilities, 'emoji');
  v_sticker_slot_limit := public.resolve_fansub_supporter_asset_limit(v_capabilities, 'sticker');
  v_can_use_emojis := coalesce((v_reward_capabilities ->> 'canUseSupporterEmojis')::boolean, false) and v_emoji_slot_limit > 0;
  v_can_use_stickers := coalesce((v_reward_capabilities ->> 'canUseSupporterStickers')::boolean, false) and v_sticker_slot_limit > 0;

  return jsonb_build_object(
    'fansubId', p_fansub_id,
    'supporterUserId', v_user_id,
    'supporterRewardTier', coalesce(v_state.supporter_reward_tier, 0),
    'canUseSupporterEmojis', v_can_use_emojis,
    'canUseSupporterStickers', v_can_use_stickers,
    'supporterEmojiSlotLimit', v_emoji_slot_limit,
    'supporterStickerSlotLimit', v_sticker_slot_limit,
    'rewardCapabilities', v_reward_capabilities
  );
end;
$$;

grant execute on function public.get_my_fansub_supporter_asset_bundle(uuid) to authenticated;

create or replace function public.get_fansub_manage_supporter_assets(
  p_fansub_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capabilities jsonb := public.build_fansub_boost_capabilities(0);
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun supporter assetlerini gorme yetkiniz yok.';
  end if;

  perform public.maybe_refresh_fansub_boost_snapshot(p_fansub_id);

  select coalesce(snapshot.capabilities, v_capabilities)
  into v_capabilities
  from public.fansub_boost_snapshots as snapshot
  where snapshot.fansub_id = p_fansub_id;

  return jsonb_build_object(
    'fansubId', p_fansub_id,
    'supporterEmojiSlotLimit', public.resolve_fansub_supporter_asset_limit(v_capabilities, 'emoji'),
    'supporterStickerSlotLimit', public.resolve_fansub_supporter_asset_limit(v_capabilities, 'sticker'),
    'items',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', asset_row.id,
            'fansubId', asset_row.fansub_id,
            'assetKind', asset_row.asset_kind,
            'shortcode', asset_row.shortcode,
            'label', asset_row.label,
            'assetRef', asset_row.asset_ref,
            'mimeType', asset_row.mime_type,
            'width', asset_row.width,
            'height', asset_row.height,
            'sizeBytes', asset_row.size_bytes,
            'isActive', asset_row.is_active,
            'sortOrder', asset_row.sort_order,
            'quotaLimit', asset_row.quota_limit,
            'quotaRank', asset_row.quota_rank,
            'isWithinQuota', asset_row.is_within_quota,
            'isUsable', asset_row.is_usable,
            'createdAt', asset_row.created_at,
            'updatedAt', asset_row.updated_at
          )
          order by
            case asset_row.asset_kind when 'emoji' then 0 else 1 end asc,
            asset_row.sort_order asc,
            asset_row.created_at asc
        )
        from public.list_public_fansub_supporter_assets(p_fansub_id, null) as asset_row
      ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_fansub_manage_supporter_assets(uuid) to authenticated;

update public.fansub_boost_supporter_states as state
set
  reward_capabilities = public.build_fansub_boost_supporter_runtime_capabilities(
    state.fansub_id,
    state.supporter_user_id,
    state.supporter_reward_tier
  ),
  updated_at = now()
where state.fansub_id is not null;

select public.refresh_all_fansub_boost_snapshot_capabilities();

commit;
