import { txa } from '@/i18n/activeLocale'
/*
 * Profile showcase layout (desktop prototype v3): left / right showcase slot modules and
 * tab order. Same as the server rule (user_profile_layouts).
 */

export type ProfileSlotModule = 'badges' | 'reading' | 'fav' | 'list' | 'stats' | 'genres' | 'level' | 'teams' | 'activity' | 'none'
export type ProfileLayoutTab = 'overview' | 'stats' | 'lists' | 'about' | 'badges' | 'favs' | 'teams'

export interface ProfileLayout {
  slotLeft: ProfileSlotModule
  slotRight: ProfileSlotModule
  tabs: ProfileLayoutTab[]
}

export const PROFILE_SLOT_MODULES: Array<{ id: ProfileSlotModule, title: string, description: string }> = [
  { id: 'badges', get title() { return txa('Rozet vitrini') }, get description() { return txa('Seçtiğin en fazla 5 rozet') } },
  { id: 'reading', get title() { return txa('Şu an okuyor') }, get description() { return txa('Son okuduğun seri ve ilerlemen') } },
  { id: 'fav', get title() { return txa('Favori üçlü') }, get description() { return txa('Takip ettiğin ilk 3 seri, sıralı') } },
  { id: 'list', get title() { return txa('Öne çıkan liste') }, get description() { return txa('Listelerinden biri, kapaklarıyla') } },
  { id: 'stats', get title() { return txa('Okuma özeti') }, get description() { return txa('İstatistiklerinden 4 kutu') } },
  { id: 'genres', get title() { return txa('Tür imzası') }, get description() { return txa('En çok okuduğun 4 tür') } },
  { id: 'level', get title() { return txa('Seviye') }, get description() { return txa('Seviyen, unvanın ve XP ilerlemen') } },
  { id: 'teams', get title() { return txa('Ekipler') }, get description() { return txa('Takip ettiğin fansub ekipleri') } },
  { id: 'activity', get title() { return txa('Son etkinlik') }, get description() { return txa('Son okuduğun bölümler ve yorumların') } },
  { id: 'none', get title() { return txa('Boş bırak') }, get description() { return txa('Bu yuva ziyaretçilere görünmez') } },
]

export const PROFILE_LAYOUT_TABS: Record<ProfileLayoutTab, { label: string, description: string }> = {
  overview: { get label() { return txa('Genel Bakış') }, get description() { return txa('Takip ettiği seriler ve listeler') } },
  stats: { get label() { return txa('İstatistik') }, get description() { return txa('Okuma sayıları ve tür dağılımı') } },
  lists: { get label() { return txa('Listeler') }, get description() { return txa('Oluşturduğun listeler') } },
  about: { get label() { return txa('Hakkında') }, get description() { return txa('Biyografi ve temel bilgiler') } },
  badges: { get label() { return txa('Rozetler') }, get description() { return txa('Kazandığın tüm rozetler') } },
  favs: { get label() { return txa('Favoriler') }, get description() { return txa('Takip ettiğin seriler, sıralı') } },
  teams: { get label() { return txa('Ekipler') }, get description() { return txa('Takip ettiğin fansub ekipleri') } },
}

export const DEFAULT_PROFILE_LAYOUT: ProfileLayout = {
  slotLeft: 'badges',
  slotRight: 'reading',
  tabs: ['overview', 'stats', 'lists', 'about'],
}

const MODULE_IDS = new Set<string>(PROFILE_SLOT_MODULES.map((module) => module.id))
const TAB_IDS = new Set<string>(Object.keys(PROFILE_LAYOUT_TABS))

/** Makes a layout from the server / local safe (Overview first, no repeats). */
export function normalizeProfileLayout(input: Partial<Record<keyof ProfileLayout, unknown>> | null | undefined): ProfileLayout {
  const slotLeft = MODULE_IDS.has(String(input?.slotLeft)) ? input?.slotLeft as ProfileSlotModule : DEFAULT_PROFILE_LAYOUT.slotLeft
  let slotRight = MODULE_IDS.has(String(input?.slotRight)) ? input?.slotRight as ProfileSlotModule : DEFAULT_PROFILE_LAYOUT.slotRight
  if (slotRight !== 'none' && slotRight === slotLeft) slotRight = 'none'
  const raw = Array.isArray(input?.tabs) ? (input?.tabs as unknown[]).map(String).filter((tab) => TAB_IDS.has(tab)) : DEFAULT_PROFILE_LAYOUT.tabs
  const tabs = [...new Set(['overview', ...raw])] as ProfileLayoutTab[]
  return { slotLeft, slotRight, tabs }
}

/** Assigns a module to a slot; if the other slot has the same module, they swap (prototype). */
export function assignSlot(layout: ProfileLayout, side: 'left' | 'right', module: ProfileSlotModule): ProfileLayout {
  const current = side === 'left' ? layout.slotLeft : layout.slotRight
  const other = side === 'left' ? layout.slotRight : layout.slotLeft
  const nextOther = module !== 'none' && other === module ? current : other
  return side === 'left'
    ? { ...layout, slotLeft: module, slotRight: nextOther }
    : { ...layout, slotRight: module, slotLeft: nextOther }
}

export function moveTab(tabs: ProfileLayoutTab[], from: number, to: number): ProfileLayoutTab[] {
  if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return tabs
  const next = [...tabs]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  // Overview is locked: always first.
  return [...new Set(['overview', ...next])] as ProfileLayoutTab[]
}
