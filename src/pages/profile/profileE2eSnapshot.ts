import type { StoreItem } from '@/data/storeProducts'
import type { MangaListSummary } from '@/services/mangaListService'
import type { UserBadge } from '@/services/badgeService'
import type { UserProfileViewAccess } from '@/services/userService'
import { E2E_ADMIN_USER_ID, getE2EMockAuthUser, isE2EModeEnabled } from '@/testing/e2eMocks'
import type { ProfilePageSnapshot } from './profilePageLoader'
import type { MockUser, OwnedBackground } from './types'
import { txa } from '@/i18n/activeLocale'

const PROFILE_E2E_BACKGROUND: OwnedBackground = {
  id: 'e2e-bg-night-alley',
  get label() { return txa('Night Alley') },
  background: '/backgrounds/optimized/bg-night-alley.webp',
  mediaType: 'image',
  origin: 'store',
}

const PROFILE_E2E_EFFECT: StoreItem = {
  id: 'e2e-profile-effect-pulse',
  identifier: 'e2e-profile-effect-pulse',
  get name() { return txa('Pulse Aura') },
  get description() { return txa('Profil sahnesinde hafif enerji katmani.') },
  price: 0,
  currency: 'Coin',
  type: 'profile_effect',
  isActive: true,
  profileEffectAssets: {
    posterAssetUrl: '/backgrounds/optimized/bg-city-glow.webp',
    cardLoopAssetUrl: '/backgrounds/optimized/bg-city-glow.webp',
    profileLoopAssetUrl: '/backgrounds/optimized/bg-city-glow.webp',
    hoverLoopAssetUrl: '/backgrounds/optimized/bg-city-glow.webp',
  },
}

const PROFILE_E2E_EFFECT_VARIANTS: Array<Pick<StoreItem, 'id' | 'name' | 'description' | 'themeName'> & { asset: string }> = [
  { id: 'starfall', get name() { return txa('Starfall') }, get description() { return txa('Yıldız parçacıkları.') }, get themeName() { return txa('Yıldız') }, asset: '/covers/optimized/starlight-academy.webp' },
  { id: 'cherry-bloom', get name() { return txa('Cherry Bloom') }, get description() { return txa('Sakura yaprakları.') }, get themeName() { return txa('Sakura') }, asset: '/backgrounds/optimized/bg-sky-temple.webp' },
  { id: 'arcane-flames', get name() { return txa('Arcane Flames') }, get description() { return txa('Mor alev katmanı.') }, get themeName() { return txa('Fantastik') }, asset: '/covers/optimized/cursed-sword.webp' },
  { id: 'void-swirl', get name() { return txa('Void Swirl') }, get description() { return txa('Karanlık girdap.') }, get themeName() { return txa('Kozmik') }, asset: '/covers/optimized/deep-abyss.webp' },
  { id: 'pixel-rain', get name() { return txa('Pixel Rain') }, get description() { return txa('Retro dijital yağmur.') }, get themeName() { return txa('Retro') }, asset: '/backgrounds/optimized/bg-night-alley.webp' },
  { id: 'electric-surge', get name() { return txa('Electric Surge') }, get description() { return txa('Elektrik akımı.') }, get themeName() { return txa('Enerji') }, asset: '/covers/optimized/iron-blood.webp' },
  { id: 'aurora-wave', get name() { return txa('Aurora Wave') }, get description() { return txa('Kuzey ışıkları.') }, get themeName() { return txa('Aurora') }, asset: '/backgrounds/optimized/bg-dragon-hall.webp' },
  { id: 'neon-flora', get name() { return txa('Neon Flora') }, get description() { return txa('Bitki neonları.') }, get themeName() { return txa('Flora') }, asset: '/covers/optimized/dragon-court.webp' },
  { id: 'ember-wings', get name() { return txa('Ember Wings') }, get description() { return txa('Alev kanatları.') }, get themeName() { return txa('Alev') }, asset: '/covers/optimized/phantom-guild.webp' },
  { id: 'crystal-shard', get name() { return txa('Crystal Shard') }, get description() { return txa('Kristal kırıkları.') }, get themeName() { return txa('Kristal') }, asset: '/covers/optimized/wind-chronicle.webp' },
  { id: 'manga-splash', get name() { return txa('Manga Splash') }, get description() { return txa('Mürekkep patlaması.') }, get themeName() { return txa('Manga') }, asset: '/assets/explore/collections/aksiyon.webp' },
  { id: 'dream-haze', get name() { return txa('Dream Haze') }, get description() { return txa('Yumuşak sis dokusu.') }, get themeName() { return txa('Sis') }, asset: '/assets/explore/collections/romantik.webp' },
]

function createE2EProfileEffect(variant: (typeof PROFILE_E2E_EFFECT_VARIANTS)[number]): StoreItem {
  return {
    id: `e2e-profile-effect-${variant.id}`,
    identifier: `e2e-profile-effect-${variant.id}`,
    name: variant.name,
    description: variant.description,
    price: 0,
    currency: 'Coin',
    type: 'profile_effect',
    themeName: variant.themeName,
    isActive: true,
    profileEffectAssets: {
      posterAssetUrl: variant.asset,
      cardLoopAssetUrl: variant.asset,
      profileLoopAssetUrl: variant.asset,
      hoverLoopAssetUrl: variant.asset,
    },
  }
}

const PROFILE_E2E_EFFECTS: StoreItem[] = [
  PROFILE_E2E_EFFECT,
  ...PROFILE_E2E_EFFECT_VARIANTS.map(createE2EProfileEffect),
]

const PROFILE_E2E_FRAMES = [
  'default',
  'neon',
  'fire',
  'ice',
  'gold',
  'rainbow',
  'christmas',
  'halloween',
  'avatarframe1',
  'avatarframe2',
  'avatarframe3',
  'avatarframe4',
]

const PROFILE_E2E_BADGE_VARIANTS = [
  ['reader-gold', 'Altın Okur', '/badges/reader_gold.png'],
  ['comment-hero', 'Yorum Kahramanı', '/badges/achievement_comment_hero.png'],
  ['vip-gold', 'VIP Gold', '/badges/vip_gold.png'],
  ['supporter-3', 'Destekçi III', '/badges/supporter_level3.png'],
  ['reader-silver', 'Gümüş Okur', '/badges/reader_silver.png'],
  ['reader-bronze', 'Bronz Okur', '/badges/reader_bronze.png'],
  ['first-step', 'İlk Adım', '/badges/achievement_first_step.png'],
  ['bookworm', 'Kitap Kurdu', '/badges/achievement_bookworm.png'],
  ['manga-master', 'Manga Ustası', '/badges/achievement_manga_master.png'],
  ['artist-beginner', 'Çizer Başlangıç', '/badges/artist_beginner.png'],
  ['artist-intermediate', 'Çizer Orta', '/badges/artist_intermediate.png'],
  ['artist-master', 'Çizer Usta', '/badges/artist_master.png'],
  ['supporter-1', 'Destekçi I', '/badges/supporter_level1.png'],
  ['supporter-2', 'Destekçi II', '/badges/supporter_level2.png'],
  ['vip-bronze', 'VIP Bronze', '/badges/vip_bronze.png'],
  ['vip-silver', 'VIP Silver', '/badges/vip_silver.png'],
] as const

const PROFILE_E2E_ACCESS: UserProfileViewAccess = {
  profileVisibility: 'public',
  statsVisibility: 'public',
  socialLinksVisibility: 'public',
  activityVisibility: 'public',
  isOwner: true,
  viewerIsFollower: false,
  profileVisible: true,
  statsVisible: true,
  socialLinksVisible: true,
  activityVisible: true,
}

function createBadgeRow(
  index: number,
  badgeId: string,
  name: string,
  imageUrl: string,
): UserBadge {
  return {
    id: `e2e-user-badge-${index}`,
    user_id: E2E_ADMIN_USER_ID,
    badge_id: badgeId,
    obtained_at: new Date(Date.UTC(2026, 4, index)).toISOString(),
    is_displayed: index <= 3,
    display_order: index,
    badge: {
      id: badgeId,
      name,
      description: txa('{v1} test rozeti.', { v1: name }),
      image_url: imageUrl,
      category: 'achievement',
      subcategory: 'reader',
      price: null,
      rarity: index >= 3 ? 'epic' : 'rare',
      is_active: true,
      target_type: 'user',
      requirements: null,
      available_from: null,
      available_until: null,
      created_at: new Date(Date.UTC(2026, 0, 1)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 0, 1)).toISOString(),
    },
  }
}

function createProfileLists(username: string, avatar: string): MangaListSummary[] {
  const base = [
    ['e2e-list-1', 'Karanlik Fantazi Rafim', 'Atmosferi guclu, kapagi iyi seri secimi.', '/covers/optimized/shadow-warrior.webp', 24, 128, 4.8],
    ['e2e-list-2', txa('Haftalık Okuma Planı'), 'Yayin takvimiyle birlikte takip ettigim bolumler.', '/covers/optimized/iron-blood.webp', 18, 74, 4.5],
    ['e2e-list-3', 'Yeni Baslayanlar', 'Arkadaslara onerilecek akici ilk seriler.', '/covers/optimized/starlight-academy.webp', 31, 92, 4.7],
    ['e2e-list-4', txa('Fansub Takipleri'), 'Ceviri kalitesi yuksek gruplarin serileri.', '/covers/optimized/dragon-court.webp', 16, 48, 4.3],
  ] as const

  return base.map(([id, title, description, coverImage, itemsCount, commentsCount, ratingAvg], index) => ({
    id,
    title,
    description,
    isPublic: index !== 1,
    ownerId: E2E_ADMIN_USER_ID,
    ownerUsername: username,
    ownerAvatar: avatar,
    ownerFrameType: 'neon',
    coverImage,
    previewImages: [coverImage],
    itemsCount,
    ratingsCount: commentsCount * 2,
    ratingAvg,
    commentsCount,
    createdAt: new Date(Date.UTC(2026, 3, 12 + index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 4, 1 + index)).toISOString(),
  }))
}

function createE2EUser(username: string, avatar: string): MockUser {
  return {
    id: E2E_ADMIN_USER_ID,
    username,
    displayName: username,
    activeFansubIdentityTag: {
      id: 'e2e-identity-tag',
      fansubId: 'e2e-fansub-1',
      fansubName: 'E2E Fansub',
      fansubSlug: 'e2e-fansub',
      audience: 'supporter',
      shortcode: 'MZ',
      badgeKey: 'bolt',
    },
    avatar,
    frameType: 'neon',
    bio: 'Yayin takvimini aktif kullanan, karanlik fantazi ve aksiyon serilerini takip eden test profili. Profil; okuma tarzi, fansub iliskileri ve vitrine cikan kozmetiklerle tek bakista karakter kazanir.',
    joinDate: '12 Ekim 2024',
    level: 'Seviye 27',
    isPremiumActive: true,
    activeProfileEffectId: PROFILE_E2E_EFFECT.id,
    stats: {
      reading: 1284,
      followers: 642,
      following: 118,
      totalChaptersRead: 1284,
      timeSpentMinutes: 27320,
      comments: 318,
    },
    favoriteGenres: [
      { name: txa('Aksiyon'), percent: 34 },
      { name: txa('Karanlık Fantazi'), percent: 28 },
      { name: 'Romantik Dram', percent: 21 },
      { name: txa('Bilim Kurgu'), percent: 17 },
    ],
    badges: [],
    socialLinks: [
      { platform: txa('Discord'), username: 'bsgmanga.qa' },
      { platform: 'X', username: 'bsgmanga_test' },
      { platform: txa('Instagram'), username: 'bsgmanga.profile' },
    ],
    following: [
      { id: 'shadow-warrior', slug: 'shadow-warrior', title: 'Golgelerin Dirilisi', coverImage: '/covers/optimized/shadow-warrior.webp', lastChapter: '112', isNew: true },
      { id: 'iron-blood', slug: 'iron-blood', title: 'Demir Kanatlar', coverImage: '/covers/optimized/iron-blood.webp', lastChapter: '73', isNew: false },
      { id: 'dragon-court', slug: 'dragon-court', title: 'Ejder Sarayi', coverImage: '/covers/optimized/dragon-court.webp', lastChapter: '46', isNew: true },
    ],
    readingHistory: [
      { mangaId: 'shadow-warrior', mangaSlug: 'shadow-warrior', title: 'Golgelerin Dirilisi', coverImage: '/covers/optimized/shadow-warrior.webp', chapterNumber: 112 },
      { mangaId: 'wind-chronicle', mangaSlug: 'wind-chronicle', title: 'Ruzgarin Cocuklari', coverImage: '/covers/optimized/wind-chronicle.webp', chapterNumber: 88 },
    ],
    followingFansubs: [
      { id: 'e2e-fansub-1', slug: 'e2e-fansub', name: 'E2E Fansub', avatar: '/fansub/cloud-avatar.png', mangaCount: 42, followerCount: 8500, frameType: 'neon' },
      { id: 'e2e-fansub-2', slug: 'azure-scans', name: 'Azure Scans', avatar: '/fansub/detective-avatar.png', mangaCount: 18, followerCount: 3200, frameType: 'default' },
      { id: 'e2e-fansub-3', slug: 'crimson-scan', name: txa('Crimson Scan'), avatar: '/fansub/fire-avatar.png', mangaCount: 24, followerCount: 5100, frameType: 'fire' },
      { id: 'e2e-fansub-4', slug: 'lunar-pages', name: txa('Lunar Pages'), avatar: '/fansub/owl-avatar.png', mangaCount: 31, followerCount: 6900, frameType: 'ice' },
      { id: 'e2e-fansub-5', slug: 'reaper-team', name: txa('Reaper Team'), avatar: '/fansub/detective-avatar.png', mangaCount: 12, followerCount: 2300, frameType: 'halloween' },
    ],
    ownedFrames: PROFILE_E2E_FRAMES,
    ownedBackgrounds: [PROFILE_E2E_BACKGROUND],
    activityFeed: [
      { id: 'e2e-activity-1', type: 'read', mangaTitle: 'Golgelerin Dirilisi', mangaId: 'shadow-warrior', chapterNumber: 112, timestamp: new Date(Date.now() - 36e5).toISOString() },
      { id: 'e2e-activity-2', type: 'comment', targetLabel: txa('Takvim duyurusu'), timestamp: new Date(Date.now() - 12 * 36e5).toISOString() },
    ],
    followsCurrentUser: true,
    followersList: [],
    followingList: [],
  }
}

export function getE2EMockProfilePageSnapshot(params: {
  currentUserId: string | null
  username: string
}): ProfilePageSnapshot | null {
  if (!isE2EModeEnabled()) return null

  const e2eAuthUser = getE2EMockAuthUser()
  const requestedUsername = params.username.trim().toLowerCase()
  const e2eUsername = (e2eAuthUser?.username || 'e2e_admin').toLowerCase()
  if (requestedUsername !== e2eUsername && params.username !== e2eAuthUser?.id) return null

  const avatar = e2eAuthUser?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=e2e-admin'
  const username = e2eAuthUser?.username || 'e2e_admin'
  const profileOwnedItems = {
    frames: PROFILE_E2E_FRAMES,
    backgrounds: [PROFILE_E2E_BACKGROUND.id],
    premium: ['namefx-pass'],
    profile_effects: PROFILE_E2E_EFFECTS.map((effect) => effect.id),
    active_name_style: {
      fontId: 'display',
      effectId: 'gradient',
      colorId: 'crimson',
      secondaryColorId: 'gold',
    },
  }
  const ownedBadges = PROFILE_E2E_BADGE_VARIANTS.map(([badgeId, name, imageUrl], index) => (
    createBadgeRow(index + 1, badgeId, name, imageUrl)
  ))

  return {
    editResourcesHydrated: true,
    equippedBackground: PROFILE_E2E_BACKGROUND,
    equippedProfileEffect: PROFILE_E2E_EFFECT,
    hasNameTextAccess: true,
    ownedBadges,
    ownedProfileEffects: PROFILE_E2E_EFFECTS,
    profileLists: createProfileLists(username, avatar),
    profileOwnedItems,
    profilePremiumExpiresAt: '2099-01-01T00:00:00.000Z',
    profileViewAccess: {
      ...PROFILE_E2E_ACCESS,
      isOwner: params.currentUserId === E2E_ADMIN_USER_ID,
    },
    resolvedFrames: [],
    selectedBadgeIds: ownedBadges.slice(0, 3).map((badge) => badge.badge_id),
    selectedNameColorId: 'crimson',
    selectedNameEffectId: 'gradient',
    selectedNameFontId: 'display',
    selectedNameSecondaryColorId: 'gold',
    selectedNameMotionId: 'none',
    selectedNameFx: { fillId: 'gradient', fxTint: 'original', fxColors: ['#22d3ee', '#3b82f6'] },
    user: createE2EUser(username, avatar),
  }
}
