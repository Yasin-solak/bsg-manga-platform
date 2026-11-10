import { expect, test, type Page } from '@playwright/test'

const TARGET_FANSUB_ID = 'b33e2830-8cb6-4fe3-9467-9795ef28b109'
const TARGET_FANSUB_SLUG = 'bsg-manga121212'

function buildRuntimeFlagRows(keys: string[]) {
  const enabledMap = new Map<string, boolean>([
    ['boost.system', false],
    ['boost.fansub_manage_tab', false],
    ['economy.store_purchase', true],
  ])

  return keys.map((key) => ({
    key,
    is_enabled: enabledMap.get(key) ?? false,
  }))
}

function buildManageSupporterAssetsPayload() {
  return {
    fansubId: TARGET_FANSUB_ID,
    supporterEmojiSlotLimit: 5,
    supporterStickerSlotLimit: 5,
    items: [
      {
        id: 'emoji-asset-1',
        fansubId: TARGET_FANSUB_ID,
        assetKind: 'emoji',
        shortcode: 'bsg',
        label: 'Bsg',
        assetRef: 'https://images.example.com/fansub-assets/bsg.webp',
        mimeType: 'image/webp',
        width: 256,
        height: 256,
        sizeBytes: 81234,
        isActive: true,
        sortOrder: 10,
        quotaLimit: 5,
        quotaRank: 1,
        isWithinQuota: true,
        isUsable: true,
        presentation: {
          version: 1,
          fitMode: 'cover',
          scale: 1.15,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
        },
        currentRevisionId: '11111111-1111-1111-1111-111111111111',
        currentRevisionNumber: 1,
        legacyRevisionId: '11111111-1111-1111-1111-111111111111',
        legacyRevisionNumber: 1,
        createdAt: '2026-04-11T10:00:00.000Z',
        updatedAt: '2026-04-11T10:00:00.000Z',
      },
      {
        id: 'sticker-asset-1',
        fansubId: TARGET_FANSUB_ID,
        assetKind: 'sticker',
        shortcode: 'destek',
        label: 'Destek',
        assetRef: 'https://images.example.com/fansub-assets/destek.webp',
        mimeType: 'image/webp',
        width: 512,
        height: 512,
        sizeBytes: 132456,
        isActive: true,
        sortOrder: 10,
        quotaLimit: 5,
        quotaRank: 1,
        isWithinQuota: true,
        isUsable: true,
        presentation: {
          version: 1,
          fitMode: 'contain',
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
        },
        currentRevisionId: '22222222-2222-2222-2222-222222222222',
        currentRevisionNumber: 1,
        legacyRevisionId: '22222222-2222-2222-2222-222222222222',
        legacyRevisionNumber: 1,
        createdAt: '2026-04-11T10:00:00.000Z',
        updatedAt: '2026-04-11T10:00:00.000Z',
      },
    ],
  }
}

function buildFansubFollowRows() {
  return [
    {
      user_id: 'supporter-admin-user',
      fansub_id: TARGET_FANSUB_ID,
      created_at: '2026-04-11T10:10:00.000Z',
      fansub: {
        id: TARGET_FANSUB_ID,
        name: 'bsg manga121212',
        slug: TARGET_FANSUB_SLUG,
        avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=bsg-manga121212',
        manga_count: 3,
        follower_count: 42,
        frame_type: 'default',
        active_frame_id: null,
        primary_color: '#7c3aed',
        secondary_color: '#0f172a',
        is_active: true,
      },
    },
  ]
}

function buildActiveSupportGrantRows() {
  return [
    {
      fansub_id: TARGET_FANSUB_ID,
      fansub: {
        id: TARGET_FANSUB_ID,
        name: 'bsg manga121212',
        slug: TARGET_FANSUB_SLUG,
        avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=bsg-manga121212',
        is_active: true,
      },
    },
  ]
}

function buildFansubStatsRow() {
  return {
    id: TARGET_FANSUB_ID,
    name: 'bsg manga121212',
    slug: TARGET_FANSUB_SLUG,
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=bsg-manga121212',
    description: 'Supporter asset smoke icin test fansubu.',
    discord_invite_url: null,
    frame_type: 'default',
    primary_color: '#7c3aed',
    secondary_color: '#0f172a',
    custom_background_asset_url: null,
    active_name_style: null,
    manga_count: 3,
    follower_count: 42,
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
  }
}

function buildFansubRawRow() {
  return {
    id: TARGET_FANSUB_ID,
    name: 'bsg manga121212',
    slug: TARGET_FANSUB_SLUG,
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=bsg-manga121212',
    description: 'Supporter asset smoke icin test fansubu.',
    discord_invite_url: null,
    frame_type: 'default',
    primary_color: '#7c3aed',
    secondary_color: '#0f172a',
    custom_background_asset_url: null,
    active_name_style: null,
    active_frame_id: null,
    active_background_id: null,
    active_pattern_id: null,
    active_profile_effect_id: null,
    vanity_slug_changed_at: null,
  }
}

function buildMembershipRows() {
  return [
    {
      fansub_id: TARGET_FANSUB_ID,
      user_id: 'supporter-admin-user',
      role: 'admin',
      team_tag: null,
      created_at: '2026-04-01T09:00:00.000Z',
      fansub: {
        id: TARGET_FANSUB_ID,
        name: 'bsg manga121212',
        slug: TARGET_FANSUB_SLUG,
        avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=bsg-manga121212',
        is_active: true,
      },
    },
  ]
}

async function enableAdminE2EMode(page: Page) {
  await enableE2EMode(page, {
    stones: 9000,
    premiumExpiresAt: '2026-05-01T09:00:00.000Z',
  })
}

async function enableE2EMode(
  page: Page,
  options: {
    stones: number
    premiumExpiresAt: string | null
  },
) {
  await page.addInitScript((payload) => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: 'supporter-admin-user',
        authUserId: 'supporter-admin-user',
        username: 'supporteradmin',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=supporteradmin',
        role: 'admin',
        isBanned: false,
        isActive: true,
        stones: payload.stones,
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
        premiumExpiresAt: payload.premiumExpiresAt,
      },
    }
  }, options)
}

async function mockSupporterAssetRoutes(page: Page) {
  await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
    const payload = route.request().postDataJSON() as { p_keys?: string[] } | null
    const keys = Array.isArray(payload?.p_keys) ? payload.p_keys : []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildRuntimeFlagRows(keys)),
    })
  })

  await page.route('**/rest/v1/rpc/get_fansubs_with_stats*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildFansubStatsRow()),
    })
  })

  await page.route('**/rest/v1/fansubs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildFansubRawRow()),
    })
  })

  await page.route('**/rest/v1/rpc/get_fansub_manage_supporter_assets', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildManageSupporterAssetsPayload()),
    })
  })

  await page.route('**/rest/v1/rpc/list_public_fansub_supporter_assets', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildManageSupporterAssetsPayload().items),
    })
  })

  await page.route('**/rest/v1/rpc/get_my_fansub_supporter_asset_bundle', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fansubId: TARGET_FANSUB_ID,
        supporterUserId: 'supporter-admin-user',
        supporterRewardTier: 2,
        canUseSupporterEmojis: true,
        canUseSupporterStickers: true,
        supporterEmojiSlotLimit: 5,
        supporterStickerSlotLimit: 5,
        rewardCapabilities: {
          canUseSupporterEmojis: true,
          canUseSupporterStickers: true,
        },
      }),
    })
  })

  await page.route('**/rest/v1/rpc/list_fansub_manage_chapters', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, limit: 1 }),
    })
  })

  await page.route('**/rest/v1/rpc/list_fansub_manage_posts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, limit: 1 }),
    })
  })

  await page.route('**/rest/v1/mangas*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await page.route('**/rest/v1/manga_follows*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await page.route('**/rest/v1/fansub_members*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildMembershipRows()),
    })
  })

  await page.route('**/rest/v1/fansub_follows*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildFansubFollowRows()),
    })
  })

  await page.route('**/rest/v1/fansub_boost_grants*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildActiveSupportGrantRows()),
    })
  })

  await page.route('**/rest/v1/rpc/get_active_premium_offer', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        premium_item: {
          id: 'premium-item-1',
          identifier: 'premium-monthly',
          name: 'Premium',
          description: 'Custom ifade kullanimi.',
          price: 300,
        },
        duration_days: 30,
        public_unlock_delay_hours: 36,
      }),
    })
  })

  await page.route('**/rest/v1/rpc/purchase_store_item', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stones: 300,
        owned_items: {
          frames: ['default'],
          backgrounds: [],
          patterns: [],
          premium: [],
        },
        premium_expires_at: '2026-05-11T09:00:00.000Z',
        active_profile_effect_id: null,
        premium_duration_days: 30,
      }),
    })
  })
}

test.describe('Supporter Assets Studio And Composer Smoke', () => {
  test('studio tab loads and the editor dialog opens', async ({ page }) => {
    test.setTimeout(90_000)

    await enableAdminE2EMode(page)
    await mockSupporterAssetRoutes(page)

    await page.goto(`/tr/fansub/${TARGET_FANSUB_ID}/yonet?e2e=1#ifadeler`, { waitUntil: 'domcontentloaded' })

    const tab = page.getByTestId('fansub-supporter-assets-tab')
    await expect(tab).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Yeni emoji' })).toBeVisible()
    await expect(tab.getByText('Bsg', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Cikartma' }).click()
    await expect(tab.getByText('Destek', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Emoji' }).click()

    await page.getByRole('button', { name: 'Yeni emoji' }).click()
    const editorDialog = page.getByTestId('fansub-supporter-asset-editor-dialog')
    await expect(editorDialog).toBeVisible()
    await expect(editorDialog.getByText('Emoji ekle')).toBeVisible()
    await expect(editorDialog.getByLabel('Ad')).toHaveValue('Yeni emoji')
    await expect(editorDialog.getByLabel('Kisa kod')).toBeEmpty()
  })

})
