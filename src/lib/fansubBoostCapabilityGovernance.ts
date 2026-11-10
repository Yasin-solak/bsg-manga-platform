import { txa } from '@/i18n/activeLocale'
import type { FansubBoostCapabilities } from '@/services/fansubBoostService'

type BackgroundLike = {
  mediaType?: 'image' | 'video'
  videoUrl?: string | null
}

type CapabilitySubset = Partial<Pick<
  FansubBoostCapabilities,
  | 'canUploadStaticBackground'
  | 'canUploadVideoBackground'
  | 'hasFullNameStyle'
  | 'hasChapterEndCredit'
  | 'canUseSupporterList'
  | 'canUseSupporterEmojiAssets'
  | 'canUseSupporterStickerAssets'
  | 'hasDiscoverBadge'
  | 'hasGoldFrame'
  | 'hasVanityUrl'
  | 'hasSupporterStreak'
  | 'hasFoundingSupporter'
>>

export type FansubBoostCapabilityResolutionState = 'unknown' | 'resolved'

export type FansubBoostDowngradeBehavior =
  | 'fallback_render'
  | 'soft_lock'
  | 'hard_lock'
  | 'hide_surface'

export type FansubBoostDowngradeRule = {
  capabilityKey: string
  behavior: FansubBoostDowngradeBehavior
  shortLabel: string
  detail: string
}

const DEFAULT_DOWNGRADE_RULE: FansubBoostDowngradeRule = {
  capabilityKey: 'default',
  behavior: 'hide_surface',
  get shortLabel() { return txa('Görünümden kalkar') },
  get detail() { return txa('Seviye yetmeyince yeni kullanım kapanır ve sitedeki sonucu kaldırılır.') },
}

const DOWNGRADE_RULES: Record<string, FansubBoostDowngradeRule> = {
  hasAnalytics: {
    capabilityKey: 'hasAnalytics',
    behavior: 'hard_lock',
    get shortLabel() { return txa('Panel kapanır') },
    get detail() { return txa('İstatistik paneli kilitlenir; kayıtlı veri silinmez.') },
  },
  canUsePolls: {
    capabilityKey: 'canUsePolls',
    behavior: 'hard_lock',
    get shortLabel() { return txa('Yeni kullanım kapanır') },
    get detail() { return txa('Yeni anket açılamaz; mevcut veriler korunur.') },
  },
  canManagePinnedNotice: {
    capabilityKey: 'canManagePinnedNotice',
    behavior: 'hard_lock',
    get shortLabel() { return txa('Yeni kullanım kapanır') },
    get detail() { return txa('Yeni duyuru oluşturma ve düzenleme kapanır.') },
  },
  canUseSupporterList: {
    capabilityKey: 'canUseSupporterList',
    behavior: 'hide_surface',
    get shortLabel() { return txa('Görünümden kalkar') },
    get detail() { return txa('Destekçi özeti sitede gizlenir; ödül verisi korunur.') },
  },
  canUseSupporterEmojiAssets: {
    capabilityKey: 'canUseSupporterEmojiAssets',
    behavior: 'soft_lock',
    get shortLabel() { return txa('Yeni kullanım daralır') },
    get detail() { return txa('Kayıtlı emoji seti korunur; seçici ve yeni kullanım kota kadar açık kalır.') },
  },
  canUseSupporterStickerAssets: {
    capabilityKey: 'canUseSupporterStickerAssets',
    behavior: 'soft_lock',
    get shortLabel() { return txa('Yeni kullanım daralır') },
    get detail() { return txa('Kayıtlı çıkartma seti korunur; seçici ve yeni kullanım kota kadar açık kalır.') },
  },
  hasChapterEndCredit: {
    capabilityKey: 'hasChapterEndCredit',
    behavior: 'fallback_render',
    get shortLabel() { return txa('Sitede gizlenir') },
    get detail() { return txa('Bölüm sonu şeridi seviye düşünce sitede gizlenir; ayarlar korunur.') },
  },
  canShowcaseManga: {
    capabilityKey: 'canShowcaseManga',
    behavior: 'hide_surface',
    get shortLabel() { return txa('Görünümden kalkar') },
    get detail() { return txa('Manga vitrini kapanır; içerik korunur.') },
  },
  canUploadStaticBackground: {
    capabilityKey: 'canUploadStaticBackground',
    behavior: 'fallback_render',
    get shortLabel() { return txa('Varsayılana döner') },
    get detail() { return txa('Yüklenen görsel saklanır; arka plan varsayılana döner.') },
  },
  canUploadVideoBackground: {
    capabilityKey: 'canUploadVideoBackground',
    behavior: 'fallback_render',
    get shortLabel() { return txa('Varsayılana döner') },
    get detail() { return txa('Yüklenen video saklanır; arka plan varsayılana döner.') },
  },
  hasDiscoverBadge: {
    capabilityKey: 'hasDiscoverBadge',
    behavior: 'hide_surface',
    get shortLabel() { return txa('Rozet kalkar') },
    get detail() { return txa('Rozet sitedeki tüm yerlerden kalkar.') },
  },
  hasFullNameStyle: {
    capabilityKey: 'hasFullNameStyle',
    behavior: 'fallback_render',
    get shortLabel() { return txa('Düz metne döner') },
    get detail() { return txa('Kayıtlı isim stili korunur; sitede standart isim gösterilir.') },
  },
  canUseSpecialNotifications: {
    capabilityKey: 'canUseSpecialNotifications',
    behavior: 'hard_lock',
    get shortLabel() { return txa('Gönderim kapanır') },
    get detail() { return txa('Yeni özel bildirim gönderilemez.') },
  },
  hasSupporterStreak: {
    capabilityKey: 'hasSupporterStreak',
    behavior: 'fallback_render',
    get shortLabel() { return txa('Temel görünüm kalır') },
    get detail() { return txa('Destekçi seri kimliği temel katmanda her zaman görünür kalır.') },
  },
  hasFoundingSupporter: {
    capabilityKey: 'hasFoundingSupporter',
    behavior: 'fallback_render',
    get shortLabel() { return txa('Temel görünüm kalır') },
    get detail() { return txa('Kurucu destekçi kimliği temel katmanda her zaman görünür kalır.') },
  },
  hasGoldFrame: {
    capabilityKey: 'hasGoldFrame',
    behavior: 'hide_surface',
    get shortLabel() { return txa('Çerçeve kalkar') },
    get detail() { return txa('Takviye çerçevesi sitedeki tüm yerlerden kalkar.') },
  },
  hasVanityUrl: {
    capabilityKey: 'hasVanityUrl',
    behavior: 'soft_lock',
    get shortLabel() { return txa('Mevcut adres kalır') },
    get detail() { return txa('Var olan özel adres korunur; yeni değişiklik yapılamaz.') },
  },
  hasAdvancedAnalytics: {
    capabilityKey: 'hasAdvancedAnalytics',
    behavior: 'hard_lock',
    get shortLabel() { return txa('Panel kapanır') },
    get detail() { return txa('Gelişmiş analizler kapanır; ham veri korunur.') },
  },
}

export function getFansubBoostDowngradeRule(capabilityKey: string): FansubBoostDowngradeRule {
  return DOWNGRADE_RULES[capabilityKey] || {
    ...DEFAULT_DOWNGRADE_RULE,
    capabilityKey,
  }
}

export function resolveFansubBackgroundAccess(capabilities?: CapabilitySubset | null) {
  const canUseStaticBackground = capabilities?.canUploadStaticBackground === true
  const canUseVideoBackground = capabilities?.canUploadVideoBackground === true

  return {
    canUseStaticBackground,
    canUseVideoBackground,
    canManageAnyBackground: canUseStaticBackground || canUseVideoBackground,
  }
}

export function canRenderFansubBackground(
  background: BackgroundLike | null | undefined,
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  if (!background) return false
  if (resolutionState !== 'resolved') return true

  const { canUseStaticBackground, canUseVideoBackground } = resolveFansubBackgroundAccess(capabilities)
  const isVideoBackground = background.mediaType === 'video' || Boolean(background.videoUrl)
  return isVideoBackground ? canUseVideoBackground : canUseStaticBackground
}

export function resolveVisibleFansubBackground<T extends BackgroundLike>(
  background: T | null | undefined,
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
): T | null {
  return canRenderFansubBackground(background, capabilities, resolutionState) ? (background ?? null) : null
}

export function canRenderFansubNameStyle(
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  if (resolutionState !== 'resolved') return true
  return capabilities?.hasFullNameStyle === true
}

export function resolveVisibleFansubNameStyle<T>(
  style: T | null | undefined,
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
): T | undefined {
  return canRenderFansubNameStyle(capabilities, resolutionState) ? (style ?? undefined) : undefined
}

export function canRenderFansubChapterEndCredit(
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  if (resolutionState !== 'resolved') return true
  return capabilities?.hasChapterEndCredit === true
}

export function canRenderFansubSupporterSummary(
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  if (resolutionState !== 'resolved') return true
  return capabilities?.canUseSupporterList === true
}

export function canRenderFansubDiscoverBadge(
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  if (resolutionState !== 'resolved') return true
  return capabilities?.hasDiscoverBadge === true
}

export function canRenderFansubGoldFrame(
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  if (resolutionState !== 'resolved') return true
  return capabilities?.hasGoldFrame === true
}

export function canUseFansubVanityUrl(
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  if (resolutionState !== 'resolved') return true
  return capabilities?.hasVanityUrl === true
}

export function canRenderFansubSupporterStreakIdentity(
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  if (resolutionState !== 'resolved') return true
  return capabilities?.hasSupporterStreak === true
}

export function canRenderFansubFoundingSupporterIdentity(
  capabilities?: CapabilitySubset | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  if (resolutionState !== 'resolved') return true
  return capabilities?.hasFoundingSupporter === true
}
