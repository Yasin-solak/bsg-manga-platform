import { expect, test, type Page } from '@playwright/test'

const SHOWCASE_FANSUB_ID = 'c0ffeec0-1111-4444-8888-aaaaaaaaaaaa'
const SHOWCASE_FANSUB_SLUG = 'test-s1-ekip'
const DIRECTORY_FANSUB_ID = 'baddcafe-2222-4444-9999-bbbbbbbbbbbb'
const DIRECTORY_FANSUB_SLUG = 'test-dizin-ekip'

const STATIC_BACKGROUND_CAPABILITY_KEY = 'canUploadStaticBackground'
const DISCOVER_BADGE_CAPABILITY_KEY = 'hasDiscoverBadge'
const GOLD_FRAME_CAPABILITY_KEY = 'hasGoldFrame'
const FULL_NAME_STYLE_CAPABILITY_KEY = 'hasFullNameStyle'

type PlacementValue = 'core' | 'disabled' | 'tier:1' | 'tier:2' | 'tier:3'

type RuntimeState = {
  placements: Record<string, PlacementValue>
}

function parsePlacement(value: PlacementValue) {
  if (value === 'core') {
    return {
      placementType: 'core' as const,
      tierLevel: null,
      tierLabel: 'Core',
      shortLabel: 'Core',
    }
  }

  if (value === 'disabled') {
    return {
      placementType: 'disabled' as const,
      tierLevel: null,
      tierLabel: 'Kapali',
      shortLabel: 'Kapali',
    }
  }

  const tierLevel = Number(value.split(':')[1] || '1')
  return {
    placementType: 'tier' as const,
    tierLevel,
    tierLabel: `Seviye ${tierLevel}`,
    shortLabel: `S${tierLevel}`,
  }
}

function isPlacementEnabledForTier(value: PlacementValue, tierLevel: number) {
  if (value === 'disabled') return false
  if (value === 'core') return true
  return tierLevel >= Number(value.split(':')[1] || '1')
}

function resolvePlacementFromPayload(payload: {
  p_placement_type?: 'core' | 'tier' | 'disabled'
  p_tier_level?: number | null
}) {
  if (payload.p_placement_type === 'core') return 'core' as PlacementValue
  if (payload.p_placement_type === 'disabled') return 'disabled' as PlacementValue
  const nextTier = Math.max(1, Math.min(3, Number(payload.p_tier_level || 1)))
  return `tier:${nextTier}` as PlacementValue
}

function buildFeatureFlags() {
  return [
    {
      id: 'flag-boost-system',
      key: 'boost.system',
      label: 'Takviye sistemi',
      description: 'Tum boost runtime',
      is_enabled: true,
      rollout_percent: 100,
      is_public: false,
      metadata: {},
      updated_by: null,
      created_at: '2026-04-10T08:00:00.000Z',
      updated_at: '2026-04-10T08:00:00.000Z',
      updated_by_user: null,
    },
    {
      id: 'flag-fansub-donations',
      key: 'economy.fansub_donations',
      label: 'Fansub bagisi',
      description: 'Bagis CTA ve bagis akisi',
      is_enabled: true,
      rollout_percent: 100,
      is_public: false,
      metadata: {},
      updated_by: null,
      created_at: '2026-04-10T08:00:00.000Z',
      updated_at: '2026-04-10T08:00:00.000Z',
      updated_by_user: null,
    },
    {
      id: 'flag-fansub-manage-tab',
      key: 'boost.fansub_manage_tab',
      label: 'Fansub panel sekmesi',
      description: 'Tarihsel manage yuzeyi',
      is_enabled: false,
      rollout_percent: 100,
      is_public: false,
      metadata: {},
      updated_by: null,
      created_at: '2026-04-10T08:00:00.000Z',
      updated_at: '2026-04-10T08:00:00.000Z',
      updated_by_user: null,
    },
  ]
}

function buildCapabilityRow(
  capabilityKey: string,
  label: string,
  summary: string,
  where: string,
  surfaceGroup: string,
  sortOrder: number,
  placementValue: PlacementValue,
  isLive: boolean,
) {
  const placement = parsePlacement(placementValue)

  return {
    capabilityKey,
    label,
    summary,
    detail: `${label} capability'si policy ile yer degistirir veya kapanir.`,
    where,
    surfaceGroup,
    placementType: placement.placementType,
    tierLevel: placement.tierLevel,
    sortOrder,
    eligibleFansubCount: isLive ? 2 : 0,
    liveFansubCount: isLive ? 2 : 0,
  }
}

function buildAdminDashboard(runtimeState: RuntimeState) {
  const staticPlacement = runtimeState.placements[STATIC_BACKGROUND_CAPABILITY_KEY]
  const discoverPlacement = runtimeState.placements[DISCOVER_BADGE_CAPABILITY_KEY]
  const goldPlacement = runtimeState.placements[GOLD_FRAME_CAPABILITY_KEY]
  const fullNamePlacement = runtimeState.placements[FULL_NAME_STYLE_CAPABILITY_KEY]

  return {
    generatedAt: '2026-04-10T12:00:00.000Z',
    policy: {
      tierThresholds: [3, 6, 12],
      foundingLimit: 10,
      streakGraceDays: 7,
    },
    capabilityPolicies: [
      buildCapabilityRow(
        STATIC_BACKGROUND_CAPABILITY_KEY,
        'Statik arka plan',
        'Fansub vitrin arka planini gorsel varlikla guclendirir.',
        'Fansub vitrini ve kart yuzeyleri',
        'identity',
        10,
        staticPlacement,
        isPlacementEnabledForTier(staticPlacement, 1),
      ),
      buildCapabilityRow(
        DISCOVER_BADGE_CAPABILITY_KEY,
        'Topluluk destekli rozeti',
        'Kimlik satirinda gorunen sosyal kanit rozeti.',
        'Fansub kartlari ve vitrin isim satiri',
        'identity',
        20,
        discoverPlacement,
        isPlacementEnabledForTier(discoverPlacement, 1),
      ),
      buildCapabilityRow(
        GOLD_FRAME_CAPABILITY_KEY,
        'Takviye cercevesi',
        'Avatar cevresinde premium cerceve vurgusu.',
        'Avatar ve vitrin kimligi',
        'identity',
        30,
        goldPlacement,
        isPlacementEnabledForTier(goldPlacement, 1),
      ),
      buildCapabilityRow(
        FULL_NAME_STYLE_CAPABILITY_KEY,
        'Isim stili',
        'Fansub adinin premium tipografi ile render edilmesi.',
        'Liste kartlari, vitrin ve liderlik satiri',
        'identity',
        40,
        fullNamePlacement,
        isPlacementEnabledForTier(fullNamePlacement, 1),
      ),
      {
        capabilityKey: 'hasChapterEndCredit',
        label: 'Bolum sonu kapanis alani',
        summary: 'Reader sonunda tesekkur ve yonlendirme seridi.',
        detail: 'Kapanis kredisi configi sakli kalir, hak dusunce yuzey gizlenir.',
        where: 'Reader kapanis seridi',
        surfaceGroup: 'conversion',
        placementType: 'core',
        tierLevel: null,
        sortOrder: 50,
        eligibleFansubCount: 1,
        liveFansubCount: 1,
      },
    ],
    overview: {
      totalFansubCount: 4,
      boostedFansubCount: 2,
      totalActivePower: 6,
      uniqueActiveSupporterCount: 2,
      activeGrantCount: 2,
      grantCount7d: 1,
      grantCount30d: 2,
      grantedPower30d: 3,
      donationCount30d: 1,
      donationAmount30d: 450,
      activeFoundingSupporterCount: 1,
      activeStreakSupporterCount: 1,
      repeatSupporterCount: 1,
    },
    tiers: [
      {
        tierLevel: 0,
        tierLabel: 'Core',
        fansubCount: 2,
        totalPower: 0,
        totalSupporters: 0,
      },
      {
        tierLevel: 1,
        tierLabel: 'Seviye 1',
        fansubCount: 2,
        totalPower: 6,
        totalSupporters: 2,
      },
    ],
    surfaces: [
      {
        key: 'fansub-background',
        label: 'Fansub arka plani',
        tierLabel: parsePlacement(staticPlacement).tierLabel,
        modeLabel: 'Aksiyon',
        placement: `Kimlik · ${parsePlacement(staticPlacement).shortLabel}`,
        eligibleFansubCount: isPlacementEnabledForTier(staticPlacement, 1) ? 2 : 0,
        liveFansubCount: isPlacementEnabledForTier(staticPlacement, 1) ? 2 : 0,
        usageLast30d: isPlacementEnabledForTier(staticPlacement, 1) ? 2 : 0,
      },
    ],
    topFansubs: [
      {
        fansubId: SHOWCASE_FANSUB_ID,
        name: 'Test S1 Ekip',
        slug: SHOWCASE_FANSUB_SLUG,
        tierLevel: 1,
        activePower: 3,
        activeSupporterCount: 2,
        lastGrantAt: '2026-04-10T09:00:00.000Z',
      },
    ],
    health: {
      expiringGrantCount7d: 0,
      staleSnapshotCount: 0,
      missingRewardStateCount: 0,
      chapterCreditEnabledCount: 1,
      specialNotificationCount30d: 0,
      activeVanityCount: 0,
      lastGrantAt: '2026-04-10T09:00:00.000Z',
      lastDonationAt: '2026-04-10T07:00:00.000Z',
    },
  }
}

function buildFansubStatsRows(runtimeState: RuntimeState) {
  const canUseStaticBackground = isPlacementEnabledForTier(runtimeState.placements[STATIC_BACKGROUND_CAPABILITY_KEY], 1)
  const showcaseIdentity = {
    hasDiscoverBadge: isPlacementEnabledForTier(runtimeState.placements[DISCOVER_BADGE_CAPABILITY_KEY], 1),
    hasGoldFrame: isPlacementEnabledForTier(runtimeState.placements[GOLD_FRAME_CAPABILITY_KEY], 1),
    hasFullNameStyle: isPlacementEnabledForTier(runtimeState.placements[FULL_NAME_STYLE_CAPABILITY_KEY], 1),
    activeNameStyle: {
      fontId: 'serif',
      effectId: 'solid',
      colorId: 'gold',
      secondaryColorId: 'gold',
    },
  }

  return [
    {
      id: SHOWCASE_FANSUB_ID,
      name: 'Test S1 Ekip',
      slug: SHOWCASE_FANSUB_SLUG,
      avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=test-s1-ekip',
      description: 'Downgrade smoke icin canli arka planli test ekibi.',
      discord_invite_url: null,
      frame_type: 'default',
      primary_color: '#7c3aed',
      secondary_color: '#0f172a',
      custom_background_asset_url: 'https://images.example.com/fansub-static-bg.jpg',
      active_name_style: showcaseIdentity.activeNameStyle,
      manga_count: 12,
      follower_count: 345,
      has_discover_badge: showcaseIdentity.hasDiscoverBadge,
      has_gold_frame: showcaseIdentity.hasGoldFrame,
      has_full_name_style: showcaseIdentity.hasFullNameStyle,
      can_upload_static_background: canUseStaticBackground,
      can_upload_video_background: false,
      active_frame_id: null,
      active_background_id: null,
      active_pattern_id: null,
      active_profile_effect_id: null,
      vanity_slug_changed_at: null,
      coin_balance: 0,
    },
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Dolgu Zirve',
      slug: 'dolgu-zirve',
      avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=dolgu-zirve',
      description: 'Siralamayi dolduran ekip.',
      discord_invite_url: null,
      frame_type: 'default',
      primary_color: '#2563eb',
      secondary_color: '#111827',
      custom_background_asset_url: null,
      active_name_style: null,
      manga_count: 10,
      follower_count: 290,
      has_discover_badge: false,
      has_gold_frame: false,
      has_full_name_style: false,
      can_upload_static_background: false,
      can_upload_video_background: false,
      active_frame_id: null,
      active_background_id: null,
      active_pattern_id: null,
      active_profile_effect_id: null,
      vanity_slug_changed_at: null,
      coin_balance: 0,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Dolgu Ikinci',
      slug: 'dolgu-ikinci',
      avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=dolgu-ikinci',
      description: 'Siralamayi dolduran ikinci ekip.',
      discord_invite_url: null,
      frame_type: 'default',
      primary_color: '#dc2626',
      secondary_color: '#111827',
      custom_background_asset_url: null,
      active_name_style: null,
      manga_count: 8,
      follower_count: 250,
      has_discover_badge: false,
      has_gold_frame: false,
      has_full_name_style: false,
      can_upload_static_background: false,
      can_upload_video_background: false,
      active_frame_id: null,
      active_background_id: null,
      active_pattern_id: null,
      active_profile_effect_id: null,
      vanity_slug_changed_at: null,
      coin_balance: 0,
    },
    {
      id: DIRECTORY_FANSUB_ID,
      name: 'Test Dizin Ekip',
      slug: DIRECTORY_FANSUB_SLUG,
      avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=test-dizin-ekip',
      description: 'Dizin karti smoke kontrolu icin ikinci hedef ekip.',
      discord_invite_url: null,
      frame_type: 'default',
      primary_color: '#0f766e',
      secondary_color: '#111827',
      custom_background_asset_url: null,
      active_name_style: showcaseIdentity.activeNameStyle,
      manga_count: 5,
      follower_count: 140,
      has_discover_badge: showcaseIdentity.hasDiscoverBadge,
      has_gold_frame: showcaseIdentity.hasGoldFrame,
      has_full_name_style: showcaseIdentity.hasFullNameStyle,
      can_upload_static_background: false,
      can_upload_video_background: false,
      active_frame_id: null,
      active_background_id: null,
      active_pattern_id: null,
      active_profile_effect_id: null,
      vanity_slug_changed_at: null,
      coin_balance: 0,
    },
  ]
}

async function enableAdminE2EMode(page: Page) {
  await page.addInitScript(() => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: 'admin-e2e-user',
        authUserId: 'admin-e2e-user',
        username: 'boostadmin',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=boostadmin',
        role: 'admin',
        isBanned: false,
        isActive: true,
        stones: 10000,
        ownedItems: {
          frames: ['default'],
          backgrounds: [],
          patterns: [],
          premium: [],
        },
        frameType: 'default',
        // The age gate (Layout) sends every session with no date to /dogum-tarihi.
        birthDate: '1998-04-12',
        onboardingCompletedAt: '2026-04-01T09:00:00.000Z',
        premiumExpiresAt: null,
      },
    }
  })
}

async function mockBoostGovernanceRoutes(page: Page) {
  const runtimeState: RuntimeState = {
    placements: {
      [STATIC_BACKGROUND_CAPABILITY_KEY]: 'tier:1',
      [DISCOVER_BADGE_CAPABILITY_KEY]: 'tier:1',
      [GOLD_FRAME_CAPABILITY_KEY]: 'tier:1',
      [FULL_NAME_STYLE_CAPABILITY_KEY]: 'tier:1',
    },
  }

  await page.route('**/rest/v1/feature_flags*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildFeatureFlags()),
    })
  })

  await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
    const request = route.request()
    const payload = request.postDataJSON() as { p_keys?: string[] } | null
    const keys = Array.isArray(payload?.p_keys) ? payload.p_keys : []
    const enabledMap = new Map([
      ['boost.system', true],
      ['economy.fansub_donations', true],
      ['boost.fansub_manage_tab', false],
    ])

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(keys.map((key) => ({
        key,
        is_enabled: enabledMap.get(key) ?? false,
      }))),
    })
  })

  await page.route('**/rest/v1/rpc/get_admin_boost_control_center', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminDashboard(runtimeState)),
    })
  })

  await page.route('**/rest/v1/rpc/update_admin_boost_capability_policy', async (route) => {
    const payload = route.request().postDataJSON() as {
      p_capability_key?: string
      p_placement_type?: 'core' | 'tier' | 'disabled'
      p_tier_level?: number | null
    } | null

    if (payload?.p_capability_key) {
      runtimeState.placements[payload.p_capability_key] = resolvePlacementFromPayload(payload)
    }

    const nextRow = buildAdminDashboard(runtimeState).capabilityPolicies.find(
      (row) => row.capabilityKey === payload?.p_capability_key,
    )

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(nextRow || null),
    })
  })

  await page.route('**/rest/v1/rpc/get_public_fansub_tier_preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          fansub_id: SHOWCASE_FANSUB_ID,
          fansub_name: 'Test S1 Ekip',
          total_views: 125000,
          rank_position: 1,
          rank_coin_reward: 12000,
          tier_coin_reward: 1200,
          total_coin_reward: 13200,
          tier_labels: ['10K Okunma'],
        },
      ]),
    })
  })

  await page.route('**/rest/v1/rpc/get_popular_mangas_by_views_window', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'manga-smoke-1',
          title: 'Smoke Manga',
          cover_image_url: null,
          last_chapter_number: 12,
          rating: 4.8,
          total_views: 48000,
          recent_views: 5200,
        },
      ]),
    })
  })

  await page.route('**/rest/v1/rpc/get_fansubs_with_stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildFansubStatsRows(runtimeState)),
    })
  })

  await page.route('**/rest/v1/fansub_requests*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/rest/v1/fansub_members*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/rest/v1/fansub_invites*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/rest/v1/fansub_join_requests*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/rest/v1/fansub_follows*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

async function changeCapabilityPlacement(
  page: Page,
  capabilityKey: string,
  nextLabel: 'Core' | 'S3' | 'Kapali',
) {
  // Takviye v2: seviye adlari Turkce; degisiklik etkisini soyleyen onaydan gecer.
  const optionLabel = { Core: 'Herkese açık', S3: 'Seviye 3', Kapali: 'Kapalı' }[nextLabel]
  await page.getByTestId(`boost-capability-select-${capabilityKey}`).click()
  await page.getByRole('option', { name: optionLabel, exact: true }).click()
  await page.getByTestId('admin-confirm').click()
  await expect(page.getByTestId('admin-confirm-dialog')).toHaveCount(0)
  await expect(page.getByTestId(`boost-capability-select-${capabilityKey}`)).toContainText(optionLabel)
}

test.describe('Admin Boost Downgrade Smoke', () => {
  test('static background tier transfer and close return to the fallback render', async ({ page }) => {
    test.setTimeout(90_000)

    await enableAdminE2EMode(page)
    await mockBoostGovernanceRoutes(page)

    await page.goto('/tr/admin/takviye?e2e=1', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Takviye' })).toBeVisible()
    await expect(page.getByTestId(`boost-capability-select-${STATIC_BACKGROUND_CAPABILITY_KEY}`)).toContainText('Seviye 1')

    await page.goto('/tr/fansub-tier', { waitUntil: 'domcontentloaded' })
    const card = page.getByTestId(`fansub-card-${SHOWCASE_FANSUB_SLUG}`).first()
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-background-mode', 'image')

    await page.goto('/tr/admin/takviye?e2e=1', { waitUntil: 'domcontentloaded' })
    await changeCapabilityPlacement(page, STATIC_BACKGROUND_CAPABILITY_KEY, 'S3')

    await page.goto('/tr/fansub-tier', { waitUntil: 'domcontentloaded' })
    await expect(card).toHaveAttribute('data-background-mode', 'default')

    await page.goto('/tr/admin/takviye?e2e=1', { waitUntil: 'domcontentloaded' })
    await changeCapabilityPlacement(page, STATIC_BACKGROUND_CAPABILITY_KEY, 'Kapali')

    await page.goto('/tr/fansub-tier', { waitUntil: 'domcontentloaded' })
    await expect(card).toHaveAttribute('data-background-mode', 'default')

    await page.goto('/tr/admin/takviye?e2e=1', { waitUntil: 'domcontentloaded' })
    await changeCapabilityPlacement(page, STATIC_BACKGROUND_CAPABILITY_KEY, 'Core')

    await page.goto('/tr/fansub-tier', { waitUntil: 'domcontentloaded' })
    await expect(card).toHaveAttribute('data-background-mode', 'image')
  })

  test('kimlik capabilityleri yer degistirdiginde katalog yuzeyleri aninda uyum saglar', async ({ page }) => {
    test.setTimeout(90_000)

    await enableAdminE2EMode(page)
    await mockBoostGovernanceRoutes(page)

    await page.goto('/tr/fansublar', { waitUntil: 'domcontentloaded' })

    const showcaseCard = page.getByTestId('weekly-chapter-leader-card')
    const leaderboardRow = page.getByTestId(`fansub-trend-row-${SHOWCASE_FANSUB_SLUG}`).locator('[data-name-style-mode]')
    const directoryCard = page.getByTestId(`fansub-directory-card-${DIRECTORY_FANSUB_SLUG}`)

    await expect(showcaseCard).toHaveAttribute('data-has-discover-badge', 'true')
    await expect(showcaseCard).toHaveAttribute('data-has-gold-frame', 'true')
    await expect(showcaseCard).toHaveAttribute('data-name-style-mode', 'styled')
    await expect(leaderboardRow).toHaveAttribute('data-name-style-mode', 'styled')
    await expect(directoryCard).toHaveAttribute('data-has-discover-badge', 'true')
    await expect(directoryCard).toHaveAttribute('data-has-gold-frame', 'true')
    await expect(directoryCard).toHaveAttribute('data-name-style-mode', 'styled')

    await page.goto('/tr/admin/takviye?e2e=1', { waitUntil: 'domcontentloaded' })
    await changeCapabilityPlacement(page, DISCOVER_BADGE_CAPABILITY_KEY, 'Kapali')
    await changeCapabilityPlacement(page, GOLD_FRAME_CAPABILITY_KEY, 'S3')
    await changeCapabilityPlacement(page, FULL_NAME_STYLE_CAPABILITY_KEY, 'S3')

    await page.goto('/tr/fansublar', { waitUntil: 'domcontentloaded' })

    await expect(showcaseCard).toHaveAttribute('data-has-discover-badge', 'false')
    await expect(showcaseCard).toHaveAttribute('data-has-gold-frame', 'false')
    await expect(showcaseCard).toHaveAttribute('data-name-style-mode', 'plain')
    await expect(leaderboardRow).toHaveAttribute('data-name-style-mode', 'plain')
    await expect(directoryCard).toHaveAttribute('data-has-discover-badge', 'false')
    await expect(directoryCard).toHaveAttribute('data-has-gold-frame', 'false')
    await expect(directoryCard).toHaveAttribute('data-name-style-mode', 'plain')

    await page.goto('/tr/admin/takviye?e2e=1', { waitUntil: 'domcontentloaded' })
    await changeCapabilityPlacement(page, DISCOVER_BADGE_CAPABILITY_KEY, 'Core')
    await changeCapabilityPlacement(page, GOLD_FRAME_CAPABILITY_KEY, 'Core')
    await changeCapabilityPlacement(page, FULL_NAME_STYLE_CAPABILITY_KEY, 'Core')

    await page.goto('/tr/fansublar', { waitUntil: 'domcontentloaded' })

    await expect(showcaseCard).toHaveAttribute('data-has-discover-badge', 'true')
    await expect(showcaseCard).toHaveAttribute('data-has-gold-frame', 'true')
    await expect(showcaseCard).toHaveAttribute('data-name-style-mode', 'styled')
    await expect(leaderboardRow).toHaveAttribute('data-name-style-mode', 'styled')
    await expect(directoryCard).toHaveAttribute('data-has-discover-badge', 'true')
    await expect(directoryCard).toHaveAttribute('data-has-gold-frame', 'true')
    await expect(directoryCard).toHaveAttribute('data-name-style-mode', 'styled')
  })
})
