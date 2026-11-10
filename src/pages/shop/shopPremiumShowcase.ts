import type { CSSProperties } from 'react'
import {
  getNameTextStyleClassName,
  buildNameTextStyleVars,
  getNameTextColorClassName,
  getNameTextEffectClassName,
  getNameTextFontClassName,
  getStandardNameTextClassName,
  buildStandardNameTextStyleVars,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
} from '@/data/nameTextEffects'
import type { HoverCardThemeColors } from '@/components/common/hoverCardTheme'
import { txa } from '@/i18n/activeLocale'

/*
 * Premium live showcase data: name style presets (from ACTIVE_NAME_TEXT_EFFECTS), hover
 * card palettes, sample fansub expressions and the perk list. All local; no database needed.
 */

export interface ShopNamePreset {
  id: string
  label: string
  fontId: NameTextFontId
  effectId: NameTextEffectId
  colorId: NameTextColorId
  secondaryColorId: NameTextColorId
}

export const SHOP_PREMIUM_NAME_PRESETS: ShopNamePreset[] = [
  { id: 'satin-gold', get label() { return txa('Satın altın') }, fontId: 'display', effectId: 'gradient', colorId: 'gold', secondaryColorId: 'copper' },
  { id: 'prism', get label() { return txa('Prizma') }, fontId: 'round', effectId: 'prism', colorId: 'rainbow', secondaryColorId: 'pink' },
  { id: 'halo', get label() { return txa('Hale') }, fontId: 'tech', effectId: 'neon', colorId: 'cyan', secondaryColorId: 'violet' },
  { id: 'glitch', get label() { return txa('Glitch') }, fontId: 'mono', effectId: 'glitch', colorId: 'pink', secondaryColorId: 'cyan' },
  { id: 'arc', get label() { return txa('Kavis') }, fontId: 'serif', effectId: 'arc', colorId: 'violet', secondaryColorId: 'gold' },
]

export function premiumNameStyle(preset: ShopNamePreset): { className: string, style: CSSProperties } {
  return {
    className: ['name-text-base', getNameTextEffectClassName(preset.effectId), getNameTextFontClassName(preset.fontId), getNameTextColorClassName(preset.colorId)].filter(Boolean).join(' '),
    style: buildNameTextStyleVars(preset.colorId, preset.secondaryColorId),
  }
}

export function standardNameStyle(): { className: string, style: CSSProperties } {
  return { className: getStandardNameTextClassName(), style: buildStandardNameTextStyleVars() }
}

export interface ShopThemePalette extends HoverCardThemeColors {
  id: string
  label: string
}

export const SHOP_PREMIUM_THEME_PALETTES: ShopThemePalette[] = [
  { id: 'gece', get label() { return txa('Gece moru') }, mainColor: '#1e1b4b', accentColor: '#7c3aed' },
  { id: 'sakura', get label() { return txa('Sakura') }, mainColor: '#831843', accentColor: '#f9a8d4' },
  { id: 'okyanus', get label() { return txa('Okyanus') }, mainColor: '#082f49', accentColor: '#22d3ee' },
  { id: 'kor', get label() { return txa('Kor') }, mainColor: '#431407', accentColor: '#f59e0b' },
]

// Custom background preview for the hover card: a public live background in the repo.
export const SHOP_PREMIUM_DEMO_BACKGROUND = {
  videoUrl: '/backgrounds/anime-neon-loop.webm',
  stillStyle: "center / cover no-repeat url('/backgrounds/optimized/bg-night-alley.webp')",
}

// Fansub expressions in the sample comment (same presentation as fansub supporter assets).
export const SHOP_PREMIUM_DEMO_EXPRESSIONS = [
  { id: 'emoji-1', assetKind: 'emoji' as const, assetRef: '/boost-examples/boost-emoji-1.png', label: 'hype' },
  { id: 'emoji-2', assetKind: 'emoji' as const, assetRef: '/boost-examples/boost-emoji-2.png', get label() { return txa('aglama') } },
  { id: 'sticker-1', assetKind: 'sticker' as const, assetRef: '/boost-examples/boost-sticker-1.png', get label() { return txa('efsane') } },
  { id: 'sticker-2', assetKind: 'sticker' as const, assetRef: '/boost-examples/boost-sticker-2.png', get label() { return txa('bekliyoruz') } },
]

export type ShopPremiumPerkId = 'name' | 'background' | 'theme' | 'expressions' | 'early' | 'monthly'

export const SHOP_PREMIUM_PERKS: Array<{ id: ShopPremiumPerkId, title: string, body: string }> = [
  { id: 'name', get title() { return txa('İsim stili ve efekti') }, get body() { return txa('Yazı tipi, renk ve efekt; adın yorumlarda ve profilde canlı oynar.') } },
  { id: 'background', get title() { return txa('Kendi arka planın') }, get body() { return txa('Hover kartına ve profiline kendi görselini ya da videonu koy.') } },
  { id: 'theme', get title() { return txa('Hover kartı teması') }, get body() { return txa('Kartını kendi renklerinle boya; ziyaretçiler böyle görür.') } },
  { id: 'expressions', get title() { return txa('Fansub ifadeleri') }, get body() { return txa('Ekiplerin animasyonlu emoji ve çıkartmalarıyla tepki ver.') } },
  { id: 'early', get title() { return txa('Erken erişim') }, get body() { return txa('Yeni bölümler sana standart okurlardan önce açılır.') } },
  { id: 'monthly', get title() { return txa('Aylık Premium seti') }, get body() { return txa('Her ay yalnız üyelere özel çerçeve ve efektler.') } },
]

/** Look tried on the Premium page: name effect, name color and hover theme. */
export interface PremiumLook {
  effectId: NameTextEffectId
  colorId: NameTextColorId
  theme: HoverCardThemeColors | null
}

/** Name class / variables by look; null means the standard reader's plain name. */
export function premiumNameLook(look: PremiumLook | null): { className: string, style: CSSProperties } {
  if (!look) return standardNameStyle()
  return {
    className: getNameTextStyleClassName({ effectId: look.effectId, colorId: look.colorId, fontId: 'display' }),
    style: buildNameTextStyleVars(look.colorId, look.colorId),
  }
}
