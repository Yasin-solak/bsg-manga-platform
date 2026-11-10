import { txa } from '@/i18n/activeLocale'
export type FansubBoostPlacementType = 'core' | 'tier' | 'disabled'

export type FansubBoostCapabilityPolicy = {
  capabilityKey: string
  label: string
  summary: string
  detail: string
  where: string
  surfaceGroup: string
  placementType: FansubBoostPlacementType
  tierLevel: number | null
  sortOrder: number
}

export const DEFAULT_FANSUB_BOOST_TIER_THRESHOLDS = [3, 6, 12] as const

export const DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES: FansubBoostCapabilityPolicy[] = [
  {
    capabilityKey: 'hasAnalytics',
    get label() { return txa('Temel analytics') },
    summary: 'Takip, bagis ve ritim ozetleri boost kilidi olmadan acik kalir.',
    detail: 'Yonetim istatistikleri temel operasyon verisi olarak kullanilir.',
    where: 'Yonetim > Istatistikler',
    surfaceGroup: 'core',
    placementType: 'core',
    tierLevel: null,
    sortOrder: 10,
  },
  {
    capabilityKey: 'canUsePolls',
    get label() { return txa('Mini anket') },
    summary: 'Topluluk postlari icinde basic anketler herkese acik kalir.',
    detail: 'Anket artik boost ayricaligi degil, temel etkilesim aracidir.',
    where: 'Yonetim > Postlar',
    surfaceGroup: 'core',
    placementType: 'core',
    tierLevel: null,
    sortOrder: 20,
  },
  {
    capabilityKey: 'canManagePinnedNotice',
    get label() { return txa('Public duyurular') },
    summary: 'Public duyuru akisi temel iletisim katmani olarak kullanilir.',
    detail: 'Fansub kendi duyuru akisina boost beklemeden sahip olur.',
    where: 'Yonetim > Duyurular',
    surfaceGroup: 'communication',
    placementType: 'core',
    tierLevel: null,
    sortOrder: 30,
  },
  {
    capabilityKey: 'canUseSupporterList',
    get label() { return txa('Bagis ve takviyede bulunanlar') },
    summary: 'Basic supporter ve donor ozeti public sosyal kanit katmanidir.',
    detail: 'Supporter ozeti, detay ve kapanis yuzeylerinde gorunur.',
    where: 'Takviye sekmesi, detay, kapanis seridi',
    surfaceGroup: 'supporters',
    placementType: 'core',
    tierLevel: null,
    sortOrder: 40,
  },
  {
    capabilityKey: 'canUseSupporterEmojiAssets',
    get label() { return txa('Supporter emojileri') },
    summary: 'Fansubun yukledigi ozel emoji seti aktif destekcilere acilir.',
    detail: 'Yorum ve topluluk alanlarindaki emoji seti boost katmanina gore genisler.',
    where: 'Yorumlar ve topluluk alanlari',
    surfaceGroup: 'supporters',
    placementType: 'core',
    tierLevel: null,
    sortOrder: 45,
  },
  {
    capabilityKey: 'canUseSupporterStickerAssets',
    get label() { return txa('Supporter cikartmalari') },
    summary: 'Fansubun yukledigi ozel cikartma seti aktif destekcilere acilir.',
    detail: 'Yorum ve topluluk alanlarindaki cikartma seti boost katmanina gore genisler.',
    where: 'Yorumlar ve topluluk alanlari',
    surfaceGroup: 'supporters',
    placementType: 'core',
    tierLevel: null,
    sortOrder: 46,
  },
  {
    capabilityKey: 'hasChapterEndCredit',
    get label() { return txa('Kapanis seridi') },
    summary: 'Bolum sonu tesekkur ve yonlendirme seridi takviye ile acilir.',
    detail: 'Reader sonundaki kapanis alani seviye 1 takviye ile aktif olur.',
    where: 'Reader sonu',
    surfaceGroup: 'reader',
    placementType: 'tier',
    tierLevel: 1,
    sortOrder: 115,
  },
  {
    capabilityKey: 'canShowcaseManga',
    get label() { return txa('Manga vitrini') },
    summary: 'Fansub kendi manga vitrini ve basic public kimligini boost beklemeden gosterir.',
    detail: 'Manga vitrini artik temel profil sunumunun parcasi.',
    where: 'Fansub profil sayfasi',
    surfaceGroup: 'identity',
    placementType: 'core',
    tierLevel: null,
    sortOrder: 60,
  },
  {
    capabilityKey: 'canUploadStaticBackground',
    get label() { return txa('Gorsel arka plan') },
    summary: 'Fansub vitrini ilk gorsel farki kazanir.',
    detail: 'Gorsel arka plan ile profil kahramani daha ayirt edici olur.',
    where: 'Duzenle modal > Arka plan',
    surfaceGroup: 'background',
    placementType: 'tier',
    tierLevel: 1,
    sortOrder: 110,
  },
  {
    capabilityKey: 'canUploadVideoBackground',
    get label() { return txa('Video arka plan') },
    summary: 'Vitrin daha hareketli ve premium his verir.',
    detail: 'Video arka plan aktif oldugunda fansub kahramani daha sinematik gorunur.',
    where: 'Duzenle modal > Arka plan',
    surfaceGroup: 'background',
    placementType: 'tier',
    tierLevel: 1,
    sortOrder: 112,
  },
  {
    capabilityKey: 'hasDiscoverBadge',
    get label() { return txa('Topluluk destekli rozeti') },
    summary: 'Destek alan ekip kimligi profil ve katalog yuzeylerinde one cikar.',
    detail: 'Rozet isim sonunda, katalogda ve hover yuzeylerinde gorunur.',
    where: 'Profil, katalog, hover',
    surfaceGroup: 'identity',
    placementType: 'tier',
    tierLevel: 1,
    sortOrder: 130,
  },
  {
    capabilityKey: 'hasFansubIdentityTags',
    get label() { return txa('Fansub etiketi') },
    summary: 'Fansubun tek kimlik etiketi uye ve destekci icin ortak acilir.',
    detail: 'Fansub Studio > Emoji ve Cikartma alanindan tek bir etiket ve rozet yonetilir.',
    where: 'Fansub Studio > Emoji ve Cikartma',
    surfaceGroup: 'identity',
    placementType: 'tier',
    tierLevel: 1,
    sortOrder: 135,
  },
  {
    capabilityKey: 'hasFullNameStyle',
    get label() { return txa('Gelismis isim stili') },
    summary: 'Fansub adi daha guclu bir kimlik katmani kazanir.',
    detail: 'Tam isim stili profil ve katalog yuzeylerine tasinir.',
    where: 'Profil, katalog, hover',
    surfaceGroup: 'identity',
    placementType: 'tier',
    tierLevel: 2,
    sortOrder: 210,
  },
  {
    capabilityKey: 'canUseSpecialNotifications',
    get label() { return txa('Ozel bildirim') },
    summary: 'Takipcilerle tek amacli bildirim akisi kurulabilir.',
    detail: 'Ozel bildirim sayesinde takipcilere daha dogrudan ulasilir.',
    where: 'Yonetim > Duyurular',
    surfaceGroup: 'communication',
    placementType: 'tier',
    tierLevel: 1,
    sortOrder: 140,
  },
  {
    capabilityKey: 'hasSupporterStreak',
    get label() { return txa('Destek serisi') },
    summary: 'Tekrarli destek davranisi supporter kimligine donusur.',
    detail: 'Supporter seri kimligi public reward yuzeylerine yansir.',
    where: 'Supporter kartlari ve reward yuzeyleri',
    surfaceGroup: 'supporters',
    placementType: 'core',
    tierLevel: null,
    sortOrder: 48,
  },
  {
    capabilityKey: 'hasFoundingSupporter',
    get label() { return txa('Kurucu destekci') },
    summary: 'Ilk destek verenler kalici bir kimlik katmani kazanir.',
    detail: 'Kurucu rozetleri supporter kimligi ve reward sunumuna eklenir.',
    where: 'Supporter kartlari ve reward yuzeyleri',
    surfaceGroup: 'supporters',
    placementType: 'core',
    tierLevel: null,
    sortOrder: 47,
  },
  {
    capabilityKey: 'hasGoldFrame',
    get label() { return txa('Takviye cercevesi') },
    summary: 'Prestij katmaninda fansub vitrini daha ayirt edici hale gelir.',
    detail: 'Takviye cercevesi avatar ve profil kahramaninda gorunur.',
    where: 'Profil kahramani',
    surfaceGroup: 'prestige',
    placementType: 'tier',
    tierLevel: 3,
    sortOrder: 310,
  },
  {
    capabilityKey: 'hasVanityUrl',
    get label() { return txa('Ozel fansub adresi') },
    summary: 'Fansub icin kisa ve hatirlanabilir ozel URL kullanilir.',
    detail: 'Fansub kendi benzersiz ve daha kolay paylasilabilir public adresini belirler.',
    where: 'Public fansub rotasi',
    surfaceGroup: 'prestige',
    placementType: 'tier',
    tierLevel: 3,
    sortOrder: 320,
  },
  {
    capabilityKey: 'hasAdvancedAnalytics',
    get label() { return txa('Gelismis analytics') },
    summary: 'Prestij katmaninda daha derin icgoru ve olcum verisi acilir.',
    detail: 'Ileri seviye analytics sadece ust katmanda aktif olur.',
    where: 'Yonetim > Istatistikler',
    surfaceGroup: 'prestige',
    placementType: 'tier',
    tierLevel: 3,
    sortOrder: 330,
  },
]

function clonePolicy(policy: FansubBoostCapabilityPolicy): FansubBoostCapabilityPolicy {
  return { ...policy }
}

export function normalizeFansubBoostCapabilityPolicies(
  policies?: FansubBoostCapabilityPolicy[] | null,
): FansubBoostCapabilityPolicy[] {
  const defaultsByKey = new Map(
    DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES.map((policy) => [policy.capabilityKey, clonePolicy(policy)]),
  )

  if (Array.isArray(policies)) {
    policies.forEach((policy) => {
      if (!policy?.capabilityKey) return
      const fallback = defaultsByKey.get(policy.capabilityKey)
      defaultsByKey.set(policy.capabilityKey, {
        ...(fallback ?? {
          capabilityKey: policy.capabilityKey,
          label: policy.capabilityKey,
          summary: '',
          detail: '',
          where: '',
          surfaceGroup: 'general',
          placementType: 'disabled',
          tierLevel: null,
          sortOrder: 999,
        }),
        ...policy,
      })
    })
  }

  return Array.from(defaultsByKey.values()).sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
    return left.label.localeCompare(right.label, 'tr')
  })
}

export function resolveFansubBoostTierTitle(level: number) {
  if (level >= 3) return 'Prestij'
  if (level === 2) return 'Topluluk etkisi'
  if (level === 1) return 'Gorunur destek'
  return 'Core'
}

export function resolveFansubBoostPlacementLabel(
  placementType: FansubBoostPlacementType,
  tierLevel: number | null,
) {
  if (placementType === 'core') return 'Core'
  if (placementType === 'disabled') return 'Kapali'
  return `Seviye ${Math.max(1, Number(tierLevel || 1))}`
}
