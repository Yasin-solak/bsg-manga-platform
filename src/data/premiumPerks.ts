import { txa } from '@/i18n/activeLocale'
/*
 * Premium perks catalog. On/off state and setting values live on the server (premium_perks,
 * premium_perks_public RPC); texts and groups are here. The server already does not apply a disabled perk,
 * and the UI hides it with the same information (the Premium page only describes enabled perks).
 */

export const PREMIUM_PERK_KEYS = [
  'early_access',
  'name_style',
  'name_effects',
  'custom_background',
  'hover_theme',
  'fansub_expressions',
  'premium_badge',
  'premium_exclusives',
  'member_pricing',
  'coin_bonus',
  'shop_early_access',
] as const
export type PremiumPerkKey = (typeof PREMIUM_PERK_KEYS)[number]

export type PremiumPerkGroup = 'reading' | 'identity' | 'community' | 'shop'

export interface PremiumPerkConfigField {
  field: 'percent' | 'hours'
  label: string
  suffix: string
  min: number
  max: number
  fallback: number
}

export interface PremiumPerkMeta {
  key: PremiumPerkKey
  group: PremiumPerkGroup
  label: string
  /** Short description on the Premium page. */
  pitch: string
  /** Shop Control: what the perk does. */
  description: string
  /** Shop Control: what happens when it is disabled. */
  whenOff: string
  /** Startup default (before the server responds). */
  defaultEnabled: boolean
  config?: PremiumPerkConfigField
}

export const PREMIUM_PERK_GROUPS: Record<PremiumPerkGroup, string> = {
  get reading() { return txa('Okuma') },
  get identity() { return txa('Kimlik ve profil') },
  get community() { return txa('Topluluk') },
  get shop() { return txa('Mağaza ve Coin') },
}

export const PREMIUM_PERKS: PremiumPerkMeta[] = [
  {
    key: 'early_access',
    group: 'reading',
    get label() { return txa('Erken erişim') },
    get pitch() { return txa('Yeni bölümleri herkesten önce oku.') },
    get description() { return txa('Yeni bölümler Premium okura genel yayından önce açılır.') },
    get whenOff() { return txa('Bölümler herkese aynı anda açılır; bekleme süresi kalkar.') },
    defaultEnabled: true,
    config: { field: 'hours', get label() { return txa('Erken erişim süresi') }, get suffix() { return txa('saat') }, min: 1, max: 168, fallback: 36 },
  },
  {
    key: 'name_style',
    group: 'identity',
    get label() { return txa('İsim stili') },
    get pitch() { return txa('Adını yazı tipi, renk ve efektle öne çıkar.') },
    get description() { return txa('Yorumlarda, profilde ve listelerde adının yazı tipi, rengi ve efekti.') },
    get whenOff() { return txa('Kimsenin isim stili görünmez ve yeni stil kaydedilemez; kayıtlı seçimler silinmez.') },
    defaultEnabled: true,
  },
  {
    key: 'name_effects',
    group: 'identity',
    get label() { return txa('Animasyonlu isim efektleri') },
    get pitch() { return txa('Adının etrafında canlı alev, şimşek, sakura…') },
    get description() { return txa('İsim stilinin içindeki animasyonlu görsel efektler (Alev, Şimşek, Buz…).') },
    get whenOff() { return txa('Yalnız animasyonlu efektler gizlenir; yazı tipi ve renk kalır.') },
    defaultEnabled: true,
  },
  {
    key: 'custom_background',
    group: 'identity',
    get label() { return txa('Kendi arka planın') },
    get pitch() { return txa('Profiline kendi görselini ya da videonu koy.') },
    get description() { return txa('Profil arka planı olarak görsel veya video yükleme.') },
    get whenOff() { return txa('Yüklenmiş arka planlar gizlenir, yeni yükleme yapılamaz.') },
    defaultEnabled: true,
  },
  {
    key: 'hover_theme',
    group: 'identity',
    get label() { return txa('Hover kartı teması') },
    get pitch() { return txa('Adının üstüne gelindiğinde açılan kart senin renklerinde.') },
    get description() { return txa('Kullanıcı kartının ana ve vurgu rengini seçme.') },
    get whenOff() { return txa('Tüm kartlar varsayılan temada görünür.') },
    defaultEnabled: true,
  },
  {
    key: 'fansub_expressions',
    group: 'community',
    get label() { return txa('Fansub emoji ve çıkartmaları') },
    get pitch() { return txa('Fansubların özel emoji ve çıkartmalarını her yerde kullan.') },
    get description() { return txa('Yorum ve topluluk yazılarında fansub emoji / çıkartma kullanımı.') },
    get whenOff() { return txa('Fansub emoji ve çıkartmaları kimse tarafından yazılamaz.') },
    defaultEnabled: true,
  },
  {
    key: 'premium_badge',
    group: 'community',
    get label() { return txa('Premium rozeti') },
    get pitch() { return txa('Profilinde ve kartında Premium işareti.') },
    get description() { return txa('Profil ve kullanıcı kartında Premium işareti.') },
    get whenOff() { return txa('Premium işareti hiçbir yerde gösterilmez.') },
    defaultEnabled: true,
  },
  {
    key: 'premium_exclusives',
    group: 'shop',
    get label() { return txa('Premium’a özel ürünler') },
    get pitch() { return txa('Yalnız Premium üyelere açılan çerçeve ve efektler.') },
    get description() { return txa('Kitlesi “Premium” olan mağaza ürünlerini yalnız Premium üyeler alabilir.') },
    get whenOff() { return txa('Premium’a özel ürünler kimseye satılmaz.') },
    defaultEnabled: true,
  },
  {
    key: 'member_pricing',
    group: 'shop',
    get label() { return txa('Üye fiyatı') },
    get pitch() { return txa('Mağazadaki her şey Premium üyeye daha ucuz.') },
    get description() { return txa('Premium üye tüm çerçeve, efekt ve paketlerde yüzdesel indirim alır; diğer indirimlerle karşılaştırılıp en ucuzu uygulanır.') },
    get whenOff() { return txa('Herkes aynı fiyatı öder.') },
    defaultEnabled: false,
    config: { field: 'percent', get label() { return txa('Üye indirimi') }, get suffix() { return txa('%') }, min: 1, max: 90, fallback: 15 },
  },
  {
    key: 'coin_bonus',
    group: 'shop',
    get label() { return txa('Coin bonusu') },
    get pitch() { return txa('Görev ve okuma serisi ödüllerinden fazladan Coin.') },
    get description() { return txa('Görev, okuma serisi ve etkinlik ödüllerinde Premium üyeye yüzdesel ek Coin.') },
    get whenOff() { return txa('Ödüller herkese aynı miktarda verilir.') },
    defaultEnabled: false,
    config: { field: 'percent', get label() { return txa('Bonus oranı') }, get suffix() { return txa('%') }, min: 1, max: 300, fallback: 25 },
  },
  {
    key: 'shop_early_access',
    group: 'shop',
    get label() { return txa('Mağazaya erken erişim') },
    get pitch() { return txa('Yeni ürünleri satışa çıkmadan önce al.') },
    get description() { return txa('Planlanmış ürünler Premium üyeye satış başlamadan önce açılır.') },
    get whenOff() { return txa('Ürünler herkese aynı anda satışa açılır.') },
    defaultEnabled: false,
    config: { field: 'hours', get label() { return txa('Erken erişim süresi') }, get suffix() { return txa('saat') }, min: 1, max: 168, fallback: 24 },
  },
]

export const PREMIUM_PERK_META: Record<PremiumPerkKey, PremiumPerkMeta> = Object.fromEntries(
  PREMIUM_PERKS.map((perk) => [perk.key, perk]),
) as Record<PremiumPerkKey, PremiumPerkMeta>

export function isPremiumPerkKey(value: string): value is PremiumPerkKey {
  return (PREMIUM_PERK_KEYS as readonly string[]).includes(value)
}
