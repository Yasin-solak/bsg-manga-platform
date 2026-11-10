import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  BellRinging,
  BookOpenText,
  ChartLineUp,
  Crown,
  Diamond,
  FilmSlate,
  FireSimple,
  FrameCorners,
  Handshake,
  IdentificationBadge,
  ImageSquare,
  Lightning,
  LinkSimple,
  ListChecks,
  Medal,
  Megaphone,
  SealCheck,
  ShieldCheck,
  Smiley,
  Sticker,
  TextAa,
  UsersThree,
} from '@phosphor-icons/react'
import {
  DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES,
  DEFAULT_FANSUB_BOOST_TIER_THRESHOLDS,
  normalizeFansubBoostCapabilityPolicies,
  resolveFansubBoostTierTitle,
  type FansubBoostCapabilityPolicy,
} from '@/lib/fansubBoostPolicy'
import { txa } from '@/i18n/activeLocale'

export type FeatureStatus = 'active' | 'coming_soon'

export type BoostIcon = PhosphorIcon

export type TierFeature = {
  capabilityKey: string
  label: string
  where: string
  status: FeatureStatus
  icon: BoostIcon
}

export type CoreFeature = {
  id: string
  title: string
  summary: string
  detail: string
  icon: BoostIcon
}

export type TierTone = 'rose' | 'violet' | 'amber'

export type TierAssetQuota = {
  emojiSlots: number
  stickerSlots: number
}

export type TierDefinition = {
  level: number
  title: string
  threshold: number
  tone: TierTone
  heroIcon: BoostIcon
  teaser: string[]
  features: TierFeature[]
  assetQuota: TierAssetQuota
}

export type ExtraPerkDefinition = {
  id: string
  title: string
  requirement: number
  icon: BoostIcon
  summary: string
  details: string[]
}

type CapabilityUiMeta = {
  icon: BoostIcon
}

type TierMeta = {
  tone: TierTone
  title: string
  heroIcon: BoostIcon
}

const TIER_ASSET_QUOTAS: Record<number, TierAssetQuota> = {
  0: { emojiSlots: 5, stickerSlots: 5 },
  1: { emojiSlots: 15, stickerSlots: 10 },
  2: { emojiSlots: 30, stickerSlots: 15 },
  3: { emojiSlots: 50, stickerSlots: 30 },
}

export const CORE_ASSET_QUOTA: TierAssetQuota = TIER_ASSET_QUOTAS[0]

export function getAssetQuotaForTier(level: number): TierAssetQuota {
  return TIER_ASSET_QUOTAS[level] ?? TIER_ASSET_QUOTAS[0]
}

type ExtraPerkTemplate = Omit<ExtraPerkDefinition, 'requirement'> & {
  capabilityKeys: string[]
}

const CAPABILITY_UI_META: Record<string, CapabilityUiMeta> = {
  hasAnalytics: { icon: ChartLineUp },
  canUsePolls: { icon: ListChecks },
  canManagePinnedNotice: { icon: Megaphone },
  canUseSupporterList: { icon: UsersThree },
  canUseSupporterEmojiAssets: { icon: Smiley },
  canUseSupporterStickerAssets: { icon: Sticker },
  hasChapterEndCredit: { icon: BookOpenText },
  canShowcaseManga: { icon: BookOpenText },
  canUploadStaticBackground: { icon: ImageSquare },
  canUploadVideoBackground: { icon: FilmSlate },
  hasDiscoverBadge: { icon: SealCheck },
  hasFansubIdentityTags: { icon: IdentificationBadge },
  hasFullNameStyle: { icon: TextAa },
  canUseSpecialNotifications: { icon: BellRinging },
  hasSupporterStreak: { icon: FireSimple },
  hasFoundingSupporter: { icon: Medal },
  hasGoldFrame: { icon: FrameCorners },
  hasVanityUrl: { icon: LinkSimple },
  hasAdvancedAnalytics: { icon: ChartLineUp },
}

const TIER_META_BY_LEVEL: Record<number, TierMeta> = {
  1: { tone: 'rose', get title() { return txa('Görünür destek') }, heroIcon: ShieldCheck },
  2: { tone: 'violet', get title() { return txa('Topluluk etkisi') }, heroIcon: Handshake },
  3: { tone: 'amber', get title() { return txa('Prestij') }, heroIcon: Diamond },
}

const EXTRA_PERK_TEMPLATES: ExtraPerkTemplate[] = [
  {
    id: 'background-system',
    get title() { return txa('Arka plan sistemi') },
    icon: ImageSquare,
    capabilityKeys: ['canUploadStaticBackground', 'canUploadVideoBackground'],
    get summary() { return txa('Fansub vitrini destek geldikçe daha sinematik ve daha ayırt edici görünür.') },
    details: [
      'Statik ve video arka plan aynı aile içinde yönetilir.',
      'İlk görünür fark genelde bu katmanda başlar.',
      'Profil kahramanı destek geldikçe daha premium hisseder.',
    ],
  },
  {
    id: 'community-identity',
    get title() { return txa('Topluluk kimligi') },
    icon: SealCheck,
    capabilityKeys: ['hasDiscoverBadge', 'hasFullNameStyle'],
    get summary() { return txa('Fansub adı ve kimlik dili destekle birlikte daha güçlü hale gelir.') },
    details: [
      'Rozet, isim ve kimlik dili destek geldikçe güçlenir.',
      'Katalog ve hover yüzeyleri bu aileyi taşır.',
      'Takviyenin sayfada iz bıraktığı daha net hissedilir.',
    ],
  },
  {
    id: 'communication-layer',
    get title() { return txa('İletişim katmanı') },
    icon: BellRinging,
    capabilityKeys: ['canManagePinnedNotice', 'canUseSpecialNotifications'],
    get summary() { return txa('Duyuru ve bildirim akışları topluluğa daha hızlı ulaşır.') },
    details: [
      'Herkese açık duyurular temel katmanda açık kalır.',
      'Özel bildirim bu ailenin güçlendirilmiş katmanıdır.',
      'Fansub takipçileriyle daha hızlı hareket eder.',
    ],
  },
  {
    id: 'supporter-identity',
    get title() { return txa('Destekçi kimliği') },
    icon: Lightning,
    capabilityKeys: ['canUseSupporterList', 'hasFoundingSupporter'],
    get summary() { return txa('Destekçi kimliği ve sosyal kanıt ritmi bu ailede güçlenir.') },
    details: [
      'Temel destekçi özeti ve kurucu destekçi temel katmanda açık kalır.',
      'Destek serisi kimliği tüm destekçiler için görünür.',
      'Ödül kimliği tekrarlı desteği daha görünür hale getirir.',
    ],
  },
  {
    id: 'prestige-layer',
    get title() { return txa('Prestij katmanı') },
    icon: Crown,
    capabilityKeys: ['hasGoldFrame', 'hasVanityUrl', 'hasAdvancedAnalytics'],
    get summary() { return txa('Prestij katmanında vitrin ve ileri seviye içgörü birlikte açılır.') },
    details: [
      'Takviye çerçevesi ve özel URL prestij hissini yukarı taşır.',
      'Gelişmiş analitik ileri seviye ekip operasyonuna hizmet eder.',
      'Bu aile genelde en son açılan premium katmandır.',
    ],
  },
]

function getCapabilityIcon(capabilityKey: string) {
  return CAPABILITY_UI_META[capabilityKey]?.icon ?? Lightning
}

function normalizeTierLevel(level: number | null | undefined) {
  const numeric = Number(level)
  if (!Number.isFinite(numeric) || numeric < 1) return 1
  return Math.min(3, Math.floor(numeric))
}

function buildTierTeaser(features: TierFeature[]) {
  if (features.length === 0) return [txa('Bu katmanda aktif bir özellik yok')]
  return features.slice(0, 3).map((feature) => feature.label)
}

function resolvePerkRequirement(policies: FansubBoostCapabilityPolicy[], capabilityKeys: string[]) {
  const matchedTierLevels = policies
    .filter((policy) => capabilityKeys.includes(policy.capabilityKey) && policy.placementType === 'tier')
    .map((policy) => normalizeTierLevel(policy.tierLevel))

  if (matchedTierLevels.length === 0) return 0
  return Math.min(...matchedTierLevels)
}

export function buildBoostCoreFeatureCatalog(
  policies: FansubBoostCapabilityPolicy[] = DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES,
): CoreFeature[] {
  return normalizeFansubBoostCapabilityPolicies(policies)
    .filter((policy) => policy.placementType === 'core')
    .map((policy) => ({
      id: policy.capabilityKey,
      title: policy.label,
      summary: policy.summary,
      detail: policy.detail,
      icon: getCapabilityIcon(policy.capabilityKey),
    }))
}

export function buildBoostTierCatalog(
  policies: FansubBoostCapabilityPolicy[] = DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES,
): TierDefinition[] {
  const normalizedPolicies = normalizeFansubBoostCapabilityPolicies(policies)

  return DEFAULT_FANSUB_BOOST_TIER_THRESHOLDS.map((threshold, index) => {
    const level = index + 1
    const tierMeta = TIER_META_BY_LEVEL[level]
    const features = normalizedPolicies
      // Takviye cercevesi takviye ozellik listelerinden ve demodan gizlenir.
      .filter((policy) => policy.placementType === 'tier' && normalizeTierLevel(policy.tierLevel) === level && policy.capabilityKey !== 'hasGoldFrame')
      .map((policy) => ({
        capabilityKey: policy.capabilityKey,
        label: policy.label,
        where: policy.where,
        status: 'active' as const,
        icon: getCapabilityIcon(policy.capabilityKey),
      }))

    return {
      level,
      title: tierMeta?.title ?? resolveFansubBoostTierTitle(level),
      threshold,
      tone: tierMeta?.tone ?? 'rose',
      heroIcon: tierMeta?.heroIcon ?? ShieldCheck,
      teaser: buildTierTeaser(features),
      features,
      assetQuota: getAssetQuotaForTier(level),
    }
  })
}

export function buildBoostPerkCatalog(
  policies: FansubBoostCapabilityPolicy[] = DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES,
): ExtraPerkDefinition[] {
  const normalizedPolicies = normalizeFansubBoostCapabilityPolicies(policies)

  return EXTRA_PERK_TEMPLATES
    .map((template) => ({
      ...template,
      requirement: resolvePerkRequirement(normalizedPolicies, template.capabilityKeys),
    }))
    .filter((template) => template.requirement > 0)
    .sort((left, right) => left.requirement - right.requirement || left.title.localeCompare(right.title, 'tr'))
}

export const CORE_FEATURES = buildBoostCoreFeatureCatalog()
export const BOOST_TIERS = buildBoostTierCatalog()
export const EXTRA_PERKS = buildBoostPerkCatalog()

export type TierToneStyle = {
  border: string
  bg: string
  text: string
  badge: string
  button: string
  soft: string
  gradient: string
  glow: string
}

export const TONE_STYLES: Record<TierTone, TierToneStyle> = {
  rose: {
    border: 'border-rose-300/70 dark:border-rose-500/30',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-400',
    badge: 'bg-rose-500 text-white',
    button: 'bg-rose-500 hover:bg-rose-500/90 text-white',
    soft: 'from-rose-100/80 via-white to-white dark:from-rose-500/10 dark:via-zinc-950 dark:to-zinc-950',
    gradient: 'from-rose-400 via-fuchsia-500 to-rose-500',
    glow: 'shadow-rose-500/20',
  },
  violet: {
    border: 'border-violet-300/70 dark:border-violet-500/30',
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    text: 'text-violet-600 dark:text-violet-400',
    badge: 'bg-violet-500 text-white',
    button: 'bg-violet-500 hover:bg-violet-500/90 text-white',
    soft: 'from-violet-100/80 via-white to-white dark:from-violet-500/10 dark:via-zinc-950 dark:to-zinc-950',
    gradient: 'from-violet-400 via-fuchsia-500 to-indigo-500',
    glow: 'shadow-violet-500/25',
  },
  amber: {
    border: 'border-amber-300/70 dark:border-amber-500/30',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500 text-white',
    button: 'bg-amber-500 hover:bg-amber-500/90 text-white',
    soft: 'from-amber-100/80 via-white to-white dark:from-amber-500/10 dark:via-zinc-950 dark:to-zinc-950',
    gradient: 'from-amber-300 via-orange-400 to-amber-500',
    glow: 'shadow-amber-500/30',
  },
}

export function getTierState(level: number, currentTierLevel: number) {
  if (currentTierLevel >= level) return 'unlocked' as const
  if (currentTierLevel + 1 === level) return 'unlockable' as const
  return 'locked' as const
}

export function getTierByLevel(
  level: number,
  tiers: TierDefinition[] = BOOST_TIERS,
) {
  return tiers.find((tier) => tier.level === level) ?? null
}

export function isCapabilityActive(
  capabilities: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  if (!capabilities) return false
  return capabilities[key] === true
}

export function countActiveFeatures(
  tier: TierDefinition,
  capabilities: Record<string, unknown> | null | undefined,
): number {
  return tier.features.filter(
    (feature) => feature.status === 'active' && isCapabilityActive(capabilities, feature.capabilityKey),
  ).length
}

export function countTotalActiveFeatures(
  capabilities: Record<string, unknown> | null | undefined,
  tiers: TierDefinition[] = BOOST_TIERS,
): number {
  return tiers.reduce((sum, tier) => sum + countActiveFeatures(tier, capabilities), 0)
}
