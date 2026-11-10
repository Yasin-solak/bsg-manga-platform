import type { CSSProperties } from 'react'
import { txa } from '@/i18n/activeLocale'

type NameTextOptionBase = {
  id: string
  name: string
  description: string
}

type NameTextFontOption = NameTextOptionBase & {
  sample: string
  usage: string
  className: string
}

type NameTextEffectOption = NameTextOptionBase & {
  usage: string
  motionLabel: string
  className: string
  isLegacy?: boolean
}

type NameTextColorOption = NameTextOptionBase & {
  usage: string
  swatchClassName: string
  className: string
}

export const NAME_TEXT_PREMIUM_PASS_IDS = ['namefx-pass', 'namefx-premium', 'namefx-all'] as const

export const NAME_TEXT_FONTS = [
  {
    id: 'neo',
    get name() { return txa('Modern') },
    get description() { return txa('Temiz, net ve sistemle kavga etmeyen modern sans karakter.') },
    get usage() { return txa('En dengeli varsayilan; tema ne olursa olsun en stabil secim.') },
    get sample() { return txa('Aa') },
    className: 'name-font-neo',
  },
  {
    id: 'bold',
    get name() { return txa('Tempo') },
    get description() { return txa('Sikistirilmis ve hizli okunan, afis gibi vuran baslik tonu.') },
    get usage() { return txa('Kisa isimlerde daha ritmik ve enerjik gorunur.') },
    get sample() { return txa('Aa') },
    className: 'name-font-bold',
  },
  {
    id: 'round',
    get name() { return txa('Sakura') },
    get description() { return txa('Yumusak koseli ve daha oyuncu, daha sicak bir karakter.') },
    get usage() { return txa('Daha samimi ve renkli topluluk kimliklerinde iyi calisir.') },
    get sample() { return txa('Aa') },
    className: 'name-font-round',
  },
  {
    id: 'comic',
    name: 'Jellybean',
    get description() { return txa('Daha dolgun, daha yumuşak ve daha cartoon hissi veren govde.') },
    get usage() { return txa('Oyunlu, tatli veya eglencli kimlikler icin tematik secim.') },
    get sample() { return txa('Aa') },
    className: 'name-font-comic',
  },
  {
    id: 'serif',
    get name() { return txa('Medieval') },
    get description() { return txa('Klasik serif tabanli ama daha agir ve tarihsel hissi yuksek.') },
    get usage() { return txa('Fantastik, lonca veya eski dunya hissi icin iyi calisir.') },
    get sample() { return txa('Aa') },
    className: 'name-font-serif',
  },
  {
    id: 'tech',
    get name() { return txa('Cyber') },
    get description() { return txa('Dar, teknik ve sistem ekranindan cikmis gibi duran sans yapi.') },
    get usage() { return txa('Sci-fi, cyber veya mekanik kimlikler icin net secim.') },
    get sample() { return txa('Aa') },
    className: 'name-font-tech',
  },
  {
    id: 'mono',
    name: '8-Bit',
    get description() { return txa('Monospace ve piksel tadinda, retro oyun ekrani hissi verir.') },
    get usage() { return txa('Arcade, retro ve oyun odakli kimlikler icin tematik secim.') },
    get sample() { return txa('Aa') },
    className: 'name-font-mono',
  },
  {
    id: 'display',
    name: 'Vampyre',
    get description() { return txa('Keskin, karanlik ve dramatik baslik hissi veren display ton.') },
    get usage() { return txa('Gotik, gece veya daha tehditkar temalar icin kullan.') },
    get sample() { return txa('Aa') },
    className: 'name-font-display',
  },
] as const satisfies readonly NameTextFontOption[]

export const NAME_TEXT_EFFECTS = [
  {
    id: 'solid',
    get name() { return txa('Core') },
    get description() { return txa('En temiz, en okunabilir ve en guvenli temel stil.') },
    get usage() { return txa('Varsayilan secim olarak ya da uzun isimlerde kullan.') },
    get motionLabel() { return txa('Sabit') },
    className: 'name-effect-solid',
  },
  {
    id: 'gradient',
    name: 'Satin',
    get description() { return txa('Ipek yuzeyde kayan tek yonlu isik seridi gibi premium sweep kurar.') },
    get usage() { return txa('Markayi vitrin afisine ceviren luks ve temiz hareket icin kullan.') },
    motionLabel: 'Sweep',
    className: 'name-effect-gradient',
  },
  {
    id: 'neon',
    get name() { return txa('Halo') },
    get description() { return txa('Isim etrafinda buyuyup daralan aura halkasi kurar.') },
    get usage() { return txa('Gece, cyber ve sahne hissi gereken kimliklerde daha iyi calisir.') },
    motionLabel: 'Aura',
    className: 'name-effect-neon',
  },
  {
    id: 'comic',
    get name() { return txa('Outline') },
    get description() { return txa('Konturu damga gibi sikistirip geri acan baski pulse verir.') },
    get usage() { return txa('Okunurlugu koruyup yine de mekanik bir vurgu istediginde kullan.') },
    get motionLabel() { return txa('Muhur') },
    className: 'name-effect-comic',
  },
  {
    id: 'pop',
    get name() { return txa('Lift') },
    get description() { return txa('Harfi posterden kopup one gelen yumusak bir yukselisle oynatir.') },
    get usage() { return txa('Afis, poster ve premium tabela hissi vermek icin en dogru secimlerden biri.') },
    get motionLabel() { return txa('Lift') },
    className: 'name-effect-pop',
  },
  {
    id: 'prism',
    get name() { return txa('Spectrum') },
    get description() { return txa('Genis prizma taramasi ve beyaz beam ile sahne isigi gibi akar.') },
    get usage() { return txa('En gosteri odakli ve en fark edilir premium efekt olarak kullan.') },
    get motionLabel() { return txa('Prizma') },
    className: 'name-effect-prism',
  },
  {
    id: 'glitch',
    get name() { return txa('Split') },
    get description() { return txa('Renk kanallarini aralikli ayirip dijital sinyal kirilmasi verir.') },
    get usage() { return txa('Teknik, distopik ve sert bir kimlik istendiginde acikca ayristirir.') },
    get motionLabel() { return txa('Glitch') },
    className: 'name-effect-glitch',
  },
  {
    id: 'arc',
    get name() { return txa('Pulse') },
    get description() { return txa('Cift vuruslu enerji nabziyla guc toplayip bosaliyor gibi davranir.') },
    get usage() { return txa('Takviye, aktif topluluk ve guc hissi veren kimlikler icin net secim.') },
    get motionLabel() { return txa('Enerji') },
    className: 'name-effect-arc',
  },
  {
    id: 'pixel',
    name: '8-Bit',
    get description() { return txa('Piksel kontur, CRT parlamasi ve kademe kademe titreseme veren retro tema.') },
    get usage() { return txa('Oyun, retro veya arcade kimligi isteyen isimlerde temasal secim olarak kullan.') },
    motionLabel: 'CRT',
    className: 'name-effect-pixel',
  },
  {
    id: 'aurora',
    name: 'Aurora (Legacy)',
    get description() { return txa('Legacy kimlik - Satin ile esitlenir.') },
    get usage() { return txa('Eski kayitlar icin korunur.') },
    motionLabel: 'Legacy',
    className: 'name-effect-gradient',
    isLegacy: true,
  },
  {
    id: 'ember',
    name: 'Ember (Legacy)',
    get description() { return txa('Legacy kimlik - Outline ile esitlenir.') },
    get usage() { return txa('Eski kayitlar icin korunur.') },
    motionLabel: 'Legacy',
    className: 'name-effect-comic',
    isLegacy: true,
  },
  {
    id: 'frost',
    name: 'Frost (Legacy)',
    get description() { return txa('Legacy kimlik - Core ile esitlenir.') },
    get usage() { return txa('Eski kayitlar icin korunur.') },
    motionLabel: 'Legacy',
    className: 'name-effect-solid',
    isLegacy: true,
  },
] as const satisfies readonly NameTextEffectOption[]

export const NAME_TEXT_COLORS = [
  {
    id: 'black',
    name: 'Onyx',
    get description() { return txa('Daha agir, daha koyu ve afis hissi yuksek siyah taban.') },
    get usage() { return txa('Koyu vurgu, ciddi ton ve kontrast isteyen isimlerde kullan.') },
    swatchClassName: 'name-color-swatch-black',
    className: 'name-color-black',
  },
  {
    id: 'white',
    name: 'Porcelain',
    get description() { return txa('Parlak beyaz ve kirik buz tonlariyla daha temiz vitrin secimi.') },
    get usage() { return txa('Temiz, premium ve parlayan isimler icin en acik ton.') },
    swatchClassName: 'name-color-swatch-white',
    className: 'name-color-white',
  },
  {
    id: 'pine',
    name: 'Pine',
    get description() { return txa('Kapali cam yesili ile daha serin ve daha oturakli ton.') },
    get usage() { return txa('Daha sakin, daha olgun topluluk kimlikleri icin uygun.') },
    swatchClassName: 'name-color-swatch-pine',
    className: 'name-color-pine',
  },
  {
    id: 'moss',
    name: 'Moss',
    get description() { return txa('Yumusak yosun ve kirik zeytin arasi dengeli yesil.') },
    get usage() { return txa('Dogal ama bagirmayan bir gorunum istendiginde kullan.') },
    swatchClassName: 'name-color-swatch-moss',
    className: 'name-color-moss',
  },
  {
    id: 'sage',
    name: 'Sage',
    get description() { return txa('Daha sisli ve daha premium duran acik kapali yesil.') },
    get usage() { return txa('Light ve dark temada daha yumusak bir yesil etkisi verir.') },
    swatchClassName: 'name-color-swatch-sage',
    className: 'name-color-sage',
  },
  {
    id: 'neutral',
    name: 'Stone',
    get description() { return txa('Tema ile uyumlanan siyah-beyaz arasi guvenli standart ton.') },
    get usage() { return txa('Takviyesiz ve standart isimler icin en dengeli varsayilan secim.') },
    swatchClassName: 'name-color-swatch-neutral',
    className: 'name-color-neutral',
  },
  {
    id: 'blue',
    name: 'Atlas',
    get description() { return txa('Gok-mavi ve indigo arasi daha agir bir mavi.') },
    get usage() { return txa('Sakin ama guven veren bir teknik ton icin.') },
    swatchClassName: 'name-color-swatch-blue',
    className: 'name-color-blue',
  },
  {
    id: 'cyan',
    name: 'Glacier',
    get description() { return txa('Mavi-camgobegi arasi serin ve parlak ton.') },
    get usage() { return txa('Teknik ve temiz kimliklerde iyi sonuc verir.') },
    swatchClassName: 'name-color-swatch-cyan',
    className: 'name-color-cyan',
  },
  {
    id: 'indigo',
    name: 'Orbit',
    get description() { return txa('Indigo ve gece mavisi arasi daha derin bir elektronik ton.') },
    get usage() { return txa('Sci-fi ve daha karanlik premium kimlikler icin iyi calisir.') },
    swatchClassName: 'name-color-swatch-indigo',
    className: 'name-color-indigo',
  },
  {
    id: 'violet',
    name: 'Amethyst',
    get description() { return txa('Mor tabanli, premium ve geceye uygun palet.') },
    get usage() { return txa('Takviye ve premium hissi yuksek isimlerde kullan.') },
    swatchClassName: 'name-color-swatch-violet',
    className: 'name-color-violet',
  },
  {
    id: 'pink',
    name: 'Rose',
    get description() { return txa('Pembe-rose spektrumlu daha enerjik vitrin tonu.') },
    get usage() { return txa('Daha oyunlu ama hala premium kalan isimlerde kullan.') },
    swatchClassName: 'name-color-swatch-pink',
    className: 'name-color-pink',
  },
  {
    id: 'crimson',
    name: 'Crimson',
    get description() { return txa('Koyu kiraz ve bordo arasi daha sert, daha dramatik ton.') },
    get usage() { return txa('Sert, gotik veya tehditkar vitrin kimlikleri icin kullan.') },
    swatchClassName: 'name-color-swatch-crimson',
    className: 'name-color-crimson',
  },
  {
    id: 'gold',
    name: 'Amber',
    get description() { return txa('Sari-altin arasi daha parlak odak rengi.') },
    get usage() { return txa('One cikan ya da odul hissi veren isimlerde etkili.') },
    swatchClassName: 'name-color-swatch-gold',
    className: 'name-color-gold',
  },
  {
    id: 'copper',
    name: 'Copper',
    get description() { return txa('Bakir ve sicak metalik tonlarin daha agir vitrini.') },
    get usage() { return txa('Eski dunya, lonca ve sicak premium hissi icin kullan.') },
    swatchClassName: 'name-color-swatch-copper',
    className: 'name-color-copper',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    get description() { return txa('Mercan, amber ve sicak gun batimi karisimi.') },
    get usage() { return txa('Afis tadinda sicak ve canli vitrinler icin.') },
    swatchClassName: 'name-color-swatch-sunset',
    className: 'name-color-sunset',
  },
  {
    id: 'rainbow',
    name: 'Prismatic',
    get description() { return txa('Tam gokkusagi yerine daha editoriyel spektrum kurar.') },
    get usage() { return txa('Ancak Spectrum veya Satin gibi kontrollu efektlerle kullan.') },
    swatchClassName: 'name-color-swatch-rainbow',
    className: 'name-color-rainbow',
  },
] as const satisfies readonly NameTextColorOption[]

/*
 * Motion: only moves the text (adds no color, light or image). Chosen independently of the effect and
 * works with every effect (index.css: .name-motion-*). Carried as a class, so it shows
 * everywhere the name is rendered.
 */
export const NAME_TEXT_MOTIONS = [
  { id: 'none', get name() { return txa('Yok') }, get description() { return txa('Isim sabit durur.') }, className: '' },
  { id: 'float', get name() { return txa('Suzulme') }, get description() { return txa('Isim yavasca yukari asagi suzulur.') }, className: 'name-motion-float' },
  { id: 'bounce', get name() { return txa('Ziplama') }, get description() { return txa('Isim kisa araliklarla hafifce ziplar.') }, className: 'name-motion-bounce' },
  { id: 'sway', get name() { return txa('Salinim') }, get description() { return txa('Isim saga sola hafifce yatar.') }, className: 'name-motion-sway' },
  { id: 'breathe', get name() { return txa('Nefes') }, get description() { return txa('Isim buyuyup kuculerek nefes alir.') }, className: 'name-motion-breathe' },
  { id: 'drift', get name() { return txa('Kayma') }, get description() { return txa('Isim yatayda ileri geri kayar.') }, className: 'name-motion-drift' },
  { id: 'jelly', get name() { return txa('Jole') }, get description() { return txa('Isim esneyip toparlanir.') }, className: 'name-motion-jelly' },
  { id: 'shake', get name() { return txa('Titreme') }, get description() { return txa('Isim arada bir kisa titrer.') }, className: 'name-motion-shake' },
] as const satisfies readonly (NameTextOptionBase & { className: string })[]

export type NameTextFontId = (typeof NAME_TEXT_FONTS)[number]['id']
export type NameTextMotionId = (typeof NAME_TEXT_MOTIONS)[number]['id']
export type NameTextBuiltInEffectId = (typeof NAME_TEXT_EFFECTS)[number]['id']
/** Animated name effect uploaded from Shop Control (name_effects.slug): "fx-<slug>". */
export type NameAssetEffectId = `fx-${string}`
export type NameTextEffectId = NameTextBuiltInEffectId | NameAssetEffectId
export type NameTextPaletteColorId = (typeof NAME_TEXT_COLORS)[number]['id']
/** A free color chosen by the user ("#rrggbb"); a valid color id alongside the palette. */
export type NameTextCustomColor = `#${string}`
export type NameTextColorId = NameTextPaletteColorId | NameTextCustomColor
/** Isim dolgusu: duz renk ya da ana -> ikinci renk gecisi (hareketsiz). */
export type NameTextFillId = 'solid' | 'gradient'
/** Animated effect color: the image's own color, the name's color or the user's two colors. */
export type NameTextFxTint = 'original' | 'name' | 'custom'

export type NameTextStyleSelection = {
  fontId: NameTextFontId
  effectId: NameTextEffectId
  colorId: NameTextColorId
  secondaryColorId?: NameTextColorId
  motionId?: NameTextMotionId
  fillId?: NameTextFillId
  fxTint?: NameTextFxTint
  fxColors?: [NameTextCustomColor, NameTextCustomColor]
}

export const DEFAULT_NAME_TEXT_FONT_ID: NameTextFontId = 'neo'
export const DEFAULT_NAME_TEXT_MOTION_ID: NameTextMotionId = 'none'
export const DEFAULT_NAME_TEXT_EFFECT_ID: NameTextEffectId = 'solid'
export const DEFAULT_NAME_TEXT_COLOR_ID: NameTextColorId = 'neutral'
export const DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID: NameTextColorId = 'neutral'

export const STANDARD_NAME_TEXT_STYLE = {
  colorId: DEFAULT_NAME_TEXT_COLOR_ID,
  effectId: DEFAULT_NAME_TEXT_EFFECT_ID,
  fontId: DEFAULT_NAME_TEXT_FONT_ID,
  secondaryColorId: DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
} as const satisfies NameTextStyleSelection

export const ACTIVE_NAME_TEXT_FONTS = NAME_TEXT_FONTS
export const ACTIVE_NAME_TEXT_EFFECTS = NAME_TEXT_EFFECTS.filter((effect) => !('isLegacy' in effect) || effect.isLegacy !== true)
export const ACTIVE_NAME_TEXT_COLORS = NAME_TEXT_COLORS

const NAME_TEXT_FONT_CLASS_MAP = new Map<NameTextFontId, string>(
  NAME_TEXT_FONTS.map((font) => [font.id, font.className]),
)

const NAME_TEXT_EFFECT_CLASS_MAP = new Map<NameTextBuiltInEffectId, string>(
  NAME_TEXT_EFFECTS.map((effect) => [effect.id, effect.className]),
)

const NAME_TEXT_COLOR_CLASS_MAP = new Map<NameTextPaletteColorId, string>(
  NAME_TEXT_COLORS.map((color) => [color.id, color.className]),
)

const NAME_TEXT_FONT_ID_SET = new Set<NameTextFontId>(NAME_TEXT_FONTS.map((font) => font.id))
const NAME_TEXT_EFFECT_ID_SET = new Set<NameTextBuiltInEffectId>(NAME_TEXT_EFFECTS.map((effect) => effect.id))
const NAME_ASSET_EFFECT_ID_PATTERN = /^fx-[a-z0-9][a-z0-9-]{1,40}$/
const NAME_TEXT_COLOR_ID_SET = new Set<NameTextPaletteColorId>(NAME_TEXT_COLORS.map((color) => color.id))
const NAME_TEXT_CUSTOM_COLOR_PATTERN = /^#[0-9a-f]{6}$/
const NAME_TEXT_MOTION_CLASS_MAP = new Map<NameTextMotionId, string>(
  NAME_TEXT_MOTIONS.map((motion) => [motion.id, motion.className]),
)
const LEGACY_NAME_TEXT_COLOR_ID_ALIASES = {
  green: 'moss',
} as const satisfies Record<string, NameTextPaletteColorId>

type NameTextColorSpec = {
  solid: string
  gradientStart: string
  gradientMid: string
  gradientEnd: string
  glowSoft: string
  glowStrong: string
  edge: string
  edgeSoft: string
}

const NAME_TEXT_COLOR_SPEC_MAP: Record<NameTextPaletteColorId, NameTextColorSpec> = {
  black: {
    solid: '#020617',
    gradientStart: '#020617',
    gradientMid: '#111827',
    gradientEnd: '#334155',
    glowSoft: 'rgba(15, 23, 42, 0.18)',
    glowStrong: 'rgba(15, 23, 42, 0.32)',
    edge: 'rgba(248, 250, 252, 0.82)',
    edgeSoft: 'rgba(203, 213, 225, 0.42)',
  },
  white: {
    solid: '#f8fafc',
    gradientStart: '#ffffff',
    gradientMid: '#f8fafc',
    gradientEnd: '#dbeafe',
    glowSoft: 'rgba(248, 250, 252, 0.2)',
    glowStrong: 'rgba(255, 255, 255, 0.36)',
    edge: 'rgba(15, 23, 42, 0.88)',
    edgeSoft: 'rgba(15, 23, 42, 0.54)',
  },
  pine: {
    solid: '#d1fae5',
    gradientStart: '#6ee7b7',
    gradientMid: '#10b981',
    gradientEnd: '#064e3b',
    glowSoft: 'rgba(16, 185, 129, 0.16)',
    glowStrong: 'rgba(16, 185, 129, 0.28)',
    edge: 'rgba(6, 78, 59, 0.9)',
    edgeSoft: 'rgba(6, 78, 59, 0.52)',
  },
  moss: {
    solid: '#d9f99d',
    gradientStart: '#84cc16',
    gradientMid: '#65a30d',
    gradientEnd: '#3f6212',
    glowSoft: 'rgba(132, 204, 22, 0.16)',
    glowStrong: 'rgba(101, 163, 13, 0.28)',
    edge: 'rgba(54, 83, 20, 0.9)',
    edgeSoft: 'rgba(54, 83, 20, 0.5)',
  },
  sage: {
    solid: '#d7e6dd',
    gradientStart: '#b7cabd',
    gradientMid: '#7f9b88',
    gradientEnd: '#51645a',
    glowSoft: 'rgba(127, 155, 136, 0.14)',
    glowStrong: 'rgba(81, 100, 90, 0.26)',
    edge: 'rgba(38, 50, 44, 0.9)',
    edgeSoft: 'rgba(38, 50, 44, 0.48)',
  },
  neutral: {
    solid: 'var(--name-theme-neutral-solid)',
    gradientStart: 'var(--name-theme-neutral-gradient-start)',
    gradientMid: 'var(--name-theme-neutral-gradient-mid)',
    gradientEnd: 'var(--name-theme-neutral-gradient-end)',
    glowSoft: 'var(--name-theme-neutral-glow-soft)',
    glowStrong: 'var(--name-theme-neutral-glow-strong)',
    edge: 'var(--name-theme-neutral-edge)',
    edgeSoft: 'var(--name-theme-neutral-edge-soft)',
  },
  blue: {
    solid: '#bfdbfe',
    gradientStart: '#7dd3fc',
    gradientMid: '#60a5fa',
    gradientEnd: '#818cf8',
    glowSoft: 'rgba(96, 165, 250, 0.22)',
    glowStrong: 'rgba(129, 140, 248, 0.42)',
    edge: 'rgba(30, 41, 59, 0.88)',
    edgeSoft: 'rgba(30, 64, 175, 0.52)',
  },
  cyan: {
    solid: '#a5f3fc',
    gradientStart: '#67e8f9',
    gradientMid: '#22d3ee',
    gradientEnd: '#38bdf8',
    glowSoft: 'rgba(34, 211, 238, 0.22)',
    glowStrong: 'rgba(56, 189, 248, 0.42)',
    edge: 'rgba(8, 47, 73, 0.88)',
    edgeSoft: 'rgba(14, 116, 144, 0.52)',
  },
  indigo: {
    solid: '#c7d2fe',
    gradientStart: '#818cf8',
    gradientMid: '#6366f1',
    gradientEnd: '#4338ca',
    glowSoft: 'rgba(99, 102, 241, 0.2)',
    glowStrong: 'rgba(67, 56, 202, 0.36)',
    edge: 'rgba(30, 27, 75, 0.9)',
    edgeSoft: 'rgba(49, 46, 129, 0.52)',
  },
  violet: {
    solid: '#ddd6fe',
    gradientStart: '#c4b5fd',
    gradientMid: '#a78bfa',
    gradientEnd: '#f0abfc',
    glowSoft: 'rgba(167, 139, 250, 0.24)',
    glowStrong: 'rgba(192, 132, 252, 0.44)',
    edge: 'rgba(49, 23, 80, 0.88)',
    edgeSoft: 'rgba(76, 29, 149, 0.5)',
  },
  pink: {
    solid: '#fbcfe8',
    gradientStart: '#f9a8d4',
    gradientMid: '#f472b6',
    gradientEnd: '#fb7185',
    glowSoft: 'rgba(244, 114, 182, 0.22)',
    glowStrong: 'rgba(251, 113, 133, 0.42)',
    edge: 'rgba(80, 7, 36, 0.88)',
    edgeSoft: 'rgba(131, 24, 67, 0.52)',
  },
  crimson: {
    solid: '#fecdd3',
    gradientStart: '#fb7185',
    gradientMid: '#e11d48',
    gradientEnd: '#881337',
    glowSoft: 'rgba(225, 29, 72, 0.2)',
    glowStrong: 'rgba(136, 19, 55, 0.34)',
    edge: 'rgba(76, 5, 25, 0.9)',
    edgeSoft: 'rgba(127, 29, 29, 0.5)',
  },
  gold: {
    solid: '#fde68a',
    gradientStart: '#fcd34d',
    gradientMid: '#f59e0b',
    gradientEnd: '#fb923c',
    glowSoft: 'rgba(251, 191, 36, 0.22)',
    glowStrong: 'rgba(249, 115, 22, 0.42)',
    edge: 'rgba(120, 53, 15, 0.9)',
    edgeSoft: 'rgba(146, 64, 14, 0.54)',
  },
  copper: {
    solid: '#fdba74',
    gradientStart: '#f59e0b',
    gradientMid: '#c2410c',
    gradientEnd: '#7c2d12',
    glowSoft: 'rgba(194, 65, 12, 0.2)',
    glowStrong: 'rgba(124, 45, 18, 0.34)',
    edge: 'rgba(67, 20, 7, 0.9)',
    edgeSoft: 'rgba(124, 45, 18, 0.5)',
  },
  sunset: {
    solid: '#fed7aa',
    gradientStart: '#fdba74',
    gradientMid: '#fb7185',
    gradientEnd: '#f59e0b',
    glowSoft: 'rgba(251, 113, 133, 0.22)',
    glowStrong: 'rgba(245, 158, 11, 0.42)',
    edge: 'rgba(124, 45, 18, 0.9)',
    edgeSoft: 'rgba(154, 52, 18, 0.52)',
  },
  rainbow: {
    solid: '#ddd6fe',
    gradientStart: '#7dd3fc',
    gradientMid: '#c4b5fd',
    gradientEnd: '#f9a8d4',
    glowSoft: 'rgba(125, 211, 252, 0.22)',
    glowStrong: 'rgba(196, 181, 253, 0.42)',
    edge: 'rgba(49, 23, 80, 0.88)',
    edgeSoft: 'rgba(124, 58, 237, 0.5)',
  },
}

export type NameTextStyleVars = CSSProperties & {
  '--name-text-color': string
  '--name-text-gradient': string
  '--name-text-glow-a-soft': string
  '--name-text-glow-a-strong': string
  '--name-text-glow-b-soft': string
  '--name-text-glow-b-strong': string
  '--name-text-edge': string
  '--name-text-edge-soft': string
}

function toOwnedItemsRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, unknown>
  return value as Record<string, unknown>
}


function parsePremiumExpiryAccess(value: unknown): boolean | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return false
  const normalized = value.trim()
  if (!normalized) return null
  const expiresAt = Date.parse(normalized)
  if (!Number.isFinite(expiresAt)) return false
  return expiresAt > Date.now()
}

export function isKnownNameTextFontId(value?: string | null): value is NameTextFontId {
  if (!value) return false
  return NAME_TEXT_FONT_ID_SET.has(value as NameTextFontId)
}

export function isNameAssetEffectId(value?: string | null): value is NameAssetEffectId {
  return Boolean(value && NAME_ASSET_EFFECT_ID_PATTERN.test(value))
}

export function isKnownNameTextEffectId(value?: string | null): value is NameTextEffectId {
  if (!value) return false
  return NAME_TEXT_EFFECT_ID_SET.has(value as NameTextBuiltInEffectId) || isNameAssetEffectId(value)
}

export function isNameTextCustomColor(value?: string | null): value is NameTextCustomColor {
  return Boolean(value && NAME_TEXT_CUSTOM_COLOR_PATTERN.test(value))
}

export function isKnownNameTextColorId(value?: string | null): value is NameTextColorId {
  if (!value) return false
  return NAME_TEXT_COLOR_ID_SET.has(value as NameTextPaletteColorId) || isNameTextCustomColor(value)
}

export function resolveKnownNameTextFontId(value?: string | null): NameTextFontId | null {
  const normalized = (value || '').trim().toLowerCase()
  if (!normalized) return null
  return isKnownNameTextFontId(normalized) ? normalized : null
}

export function resolveKnownNameTextEffectId(value?: string | null): NameTextEffectId | null {
  const normalized = (value || '').trim().toLowerCase()
  if (!normalized) return null
  return isKnownNameTextEffectId(normalized) ? normalized : null
}

export function resolveKnownNameTextColorId(value?: string | null): NameTextColorId | null {
  const normalized = (value || '').trim().toLowerCase()
  if (!normalized) return null
  const aliased = LEGACY_NAME_TEXT_COLOR_ID_ALIASES[normalized as keyof typeof LEGACY_NAME_TEXT_COLOR_ID_ALIASES] || normalized
  return isKnownNameTextColorId(aliased) ? aliased : null
}

export function resolveKnownNameTextMotionId(value?: string | null): NameTextMotionId | null {
  const normalized = (value || '').trim().toLowerCase()
  if (!normalized) return null
  return NAME_TEXT_MOTION_CLASS_MAP.has(normalized as NameTextMotionId) ? normalized as NameTextMotionId : null
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const
}

function rgba(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function mixHex(hex: string, target: string, weight: number) {
  const a = hexToRgb(hex)
  const b = hexToRgb(target)
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * weight).toString(16).padStart(2, '0')).join('')}`
}

/** WCAG goreli parlaklik (0-1). */
export function nameColorLuminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function nameColorContrast(a: string, b: string) {
  const x = nameColorLuminance(a)
  const y = nameColorLuminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// Free color: gradient / glow / edge tones are produced the same way as a palette entry.
function buildCustomColorSpec(hex: string): NameTextColorSpec {
  const light = nameColorLuminance(hex) > 0.4
  return {
    solid: hex,
    gradientStart: mixHex(hex, '#ffffff', 0.25),
    gradientMid: hex,
    gradientEnd: mixHex(hex, '#000000', 0.25),
    glowSoft: rgba(hex, 0.2),
    glowStrong: rgba(hex, 0.4),
    edge: light ? 'rgba(15, 23, 42, 0.88)' : 'rgba(248, 250, 252, 0.82)',
    edgeSoft: light ? 'rgba(15, 23, 42, 0.5)' : 'rgba(203, 213, 225, 0.42)',
  }
}

export function resolveNameTextColorSpec(colorId?: string | null): NameTextColorSpec {
  const resolvedId = resolveKnownNameTextColorId(colorId) || DEFAULT_NAME_TEXT_COLOR_ID
  if (isNameTextCustomColor(resolvedId)) return buildCustomColorSpec(resolvedId)
  return NAME_TEXT_COLOR_SPEC_MAP[resolvedId as NameTextPaletteColorId]
}

// Plain hex of the color for contrast math (pinned because Stone uses a theme variable).
const PALETTE_CONTRAST_HEX: Partial<Record<NameTextPaletteColorId, string>> = { neutral: '#e2e8f0' }

export function resolveNameTextColorHex(colorId?: string | null): string {
  const resolvedId = resolveKnownNameTextColorId(colorId) || DEFAULT_NAME_TEXT_COLOR_ID
  if (isNameTextCustomColor(resolvedId)) return resolvedId
  const solid = NAME_TEXT_COLOR_SPEC_MAP[resolvedId as NameTextPaletteColorId].solid
  return isNameTextCustomColor(solid) ? solid : PALETTE_CONTRAST_HEX[resolvedId as NameTextPaletteColorId] ?? '#e2e8f0'
}

export function buildNameTextStyleVars(
  primaryColorId?: string | null,
  secondaryColorId?: string | null,
): NameTextStyleVars {
  const primarySpec = resolveNameTextColorSpec(primaryColorId || DEFAULT_NAME_TEXT_COLOR_ID)
  const secondarySpec = resolveNameTextColorSpec(secondaryColorId || DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID)
  return {
    '--name-text-color': primarySpec.solid,
    '--name-text-gradient': `linear-gradient(102deg, ${primarySpec.gradientStart} 0%, ${primarySpec.gradientMid} 48%, ${secondarySpec.gradientEnd} 100%)`,
    '--name-text-glow-a-soft': primarySpec.glowSoft,
    '--name-text-glow-a-strong': primarySpec.glowStrong,
    '--name-text-glow-b-soft': secondarySpec.glowSoft,
    '--name-text-glow-b-strong': secondarySpec.glowStrong,
    '--name-text-edge': primarySpec.edge,
    '--name-text-edge-soft': primarySpec.edgeSoft,
  }
}

export function buildStandardNameTextStyleVars() {
  return buildNameTextStyleVars(
    STANDARD_NAME_TEXT_STYLE.colorId,
    STANDARD_NAME_TEXT_STYLE.secondaryColorId,
  )
}

export function getNameTextFontClassName(fontId?: string | null): string {
  const normalized = resolveKnownNameTextFontId(fontId)
  if (!normalized) return ''
  return NAME_TEXT_FONT_CLASS_MAP.get(normalized) || ''
}

export function getNameTextEffectClassName(effectId?: string | null): string {
  const normalized = resolveKnownNameTextEffectId(effectId)
  if (!normalized) return ''
  // Animated name effect: image and layout come from the rule produced by nameEffectRegistry.
  if (isNameAssetEffectId(normalized)) return `name-effect-solid name-fx-asset name-${normalized}`
  return NAME_TEXT_EFFECT_CLASS_MAP.get(normalized) || ''
}
export function getNameTextColorClassName(colorId?: string | null): string {
  const normalized = resolveKnownNameTextColorId(colorId)
  if (!normalized || isNameTextCustomColor(normalized)) return ''
  return NAME_TEXT_COLOR_CLASS_MAP.get(normalized as NameTextPaletteColorId) || ''
}

export function getNameTextMotionClassName(motionId?: string | null): string {
  const normalized = resolveKnownNameTextMotionId(motionId)
  if (!normalized) return ''
  return NAME_TEXT_MOTION_CLASS_MAP.get(normalized) || ''
}

export function getNameTextStyleClassName(style?: Partial<NameTextStyleSelection> | null) {
  const effectClassName = getNameTextEffectClassName(style?.effectId)
  const fontClassName = getNameTextFontClassName(style?.fontId)
  const colorClassName = getNameTextColorClassName(style?.colorId)
  const motionClassName = getNameTextMotionClassName(style?.motionId)
  const fillClassName = style?.fillId === 'gradient' ? 'name-fill-gradient' : ''
  // Effect color only matters for animated effects: the image is tinted with the name's / user's color.
  const tintClassName = isNameAssetEffectId(style?.effectId) && style?.fxTint && style.fxTint !== 'original' ? 'name-fx-tinted' : ''
  return ['name-text-base', effectClassName, fontClassName, colorClassName, fillClassName, tintClassName, motionClassName].filter(Boolean).join(' ')
}

export function getStandardNameTextClassName() {
  return getNameTextStyleClassName(STANDARD_NAME_TEXT_STYLE)
}

export function isNameTextPremiumPassIdentifier(value?: string | null) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return NAME_TEXT_PREMIUM_PASS_IDS.includes(normalized as (typeof NAME_TEXT_PREMIUM_PASS_IDS)[number])
}

export function hasNameTextPremiumAccess(ownedItems: unknown, premiumExpiresAt?: string | null) {
  const payload = toOwnedItemsRecord(ownedItems)
  return parsePremiumExpiryAccess(
    premiumExpiresAt === undefined ? payload.premium_expires_at : premiumExpiresAt,
  ) === true
}

export const NAME_TEXT_EFFECT_OPTIONS: { id: string; name: string }[] = [
  { id: 'namefx-pass', name: 'Text FX Pass (Tum efektler)' },
  ...ACTIVE_NAME_TEXT_EFFECTS.map((effect) => ({
    id: effect.id,
    name: effect.name,
  })),
  ...NAME_TEXT_EFFECTS
    .filter((effect) => 'isLegacy' in effect && effect.isLegacy === true)
    .map((effect) => ({
      id: effect.id,
      name: effect.name,
    })),
]

