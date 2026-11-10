import type { TlItemType } from '@/services/translationStudioService'
import type { TlTextStatus } from '@/services/translationEditorService'
import { txa } from '@/i18n/activeLocale'

export { BLACK, contrastOf, DEFAULT_FONT_BY_TYPE, FONTS, fontOf, resolveStyle, WHITE, type FontKey, type ResolvedStyle } from '@/lib/translationLettering'

/*
 * Editor constants (handoff "Translation Studio v3"): 6 typefaces, type colors,
 * tool rail and shortcuts. The font key is stored in the DB as style.font.
 */

export const TYPE_META: Record<TlItemType, { label: string, color: string }> = {
  balon: { get label() { return txa('Balon') }, color: 'var(--tl-p)' },
  anlatim: { get label() { return txa('Anlatım') }, color: 'var(--tl-amber)' },
  sfx: { label: 'SFX', color: 'var(--tl-red)' },
  tabela: { get label() { return txa('Tabela') }, color: 'var(--tl-green)' },
}

export const STATUS_META: Record<TlTextStatus, { label: string, color: string }> = {
  onayli: { get label() { return txa('Onaylı') }, color: 'var(--tl-green)' },
  oneri: { get label() { return txa('Öneri') }, color: 'var(--tl-amber)' },
  eksik: { get label() { return txa('Eksik') }, color: 'var(--tl-red)' },
}

export type ToolId =
  | 'sec' | 'el' | 'zoom' | 'ekle' | 'kement' | 'secKutu' | 'secKement' | 'degnek'
  | 'metin' | 'stil' | 'onarim' | 'firca' | 'geri' | 'silgi' | 'damga'

export interface ToolDef { id: ToolId, label: string, key: string, off?: boolean, hint: string, cursor: string }

export const PAINT_TOOLS: ToolId[] = ['onarim', 'firca', 'geri', 'silgi', 'damga']
export const SELECT_TOOLS: ToolId[] = ['secKutu', 'secKement', 'degnek']

export const TOOLS: Array<ToolDef | 'sep'> = [
  { id: 'sec', get label() { return txa('Seç ve taşı') }, key: 'V', get hint() { return txa('Sürükle: taşı · köşeler: boyutlandır · oklar: 1px, Shift: 10px') }, cursor: 'default' },
  { id: 'el', get label() { return txa('Kaydır') }, key: 'H', get hint() { return txa('Sürükleyerek sayfayı kaydır · her araçta Space basılıyken kaydırılır') }, cursor: 'grab' },
  { id: 'zoom', get label() { return txa('Yakınlaştır') }, key: 'Z', get hint() { return txa('Tıkla: yakınlaştır · Alt+tıkla: uzaklaştır · Ctrl+tekerlek: imleçte yakınlaştır') }, cursor: 'zoom-in' },
  'sep',
  { id: 'ekle', get label() { return txa('Alan çiz') }, key: 'M', get hint() { return txa('Sistemin bulamadığı alanı sürükleyerek çiz') }, cursor: 'crosshair' },
  { id: 'kement', get label() { return txa('Serbest alan') }, key: 'L', get hint() { return txa('Sürükleyerek serbest biçimli alan çiz; bırakınca kapanır') }, cursor: 'crosshair' },
  'sep',
  { id: 'secKutu', get label() { return txa('Dikdörtgen seçim') }, key: 'R', get hint() { return txa('Sürükleyerek seç · Delete/Enter: içeriğe duyarlı doldur · Esc: seçimi kaldır') }, cursor: 'crosshair' },
  { id: 'secKement', get label() { return txa('Serbest seçim') }, key: 'Q', get hint() { return txa('Serbest biçimli seçim · Delete/Enter: içeriğe duyarlı doldur · Esc: seçimi kaldır') }, cursor: 'crosshair' },
  { id: 'degnek', get label() { return txa('Sihirli değnek') }, key: 'W', get hint() { return txa('Tıkla: benzer renkteki bitişik alanı seç (tolerans ayarlanır)') }, cursor: 'crosshair' },
  'sep',
  { id: 'metin', get label() { return txa('Metin') }, key: 'T', get hint() { return txa('Sayfaya tıkla, serbest metin kutusu ekle') }, cursor: 'text' },
  { id: 'stil', get label() { return txa('Stili aktar') }, key: 'I', get hint() { return txa('Önce hedefi seç, sonra stilini alacağın öğeye tıkla') }, cursor: 'copy' },
  'sep',
  { id: 'onarim', get label() { return txa('Onarım fırçası') }, key: 'J', get hint() { return txa('Boya; arka plan çevresindeki dokuyla onarılır') }, cursor: 'none' },
  { id: 'firca', get label() { return txa('Fırça') }, key: 'B', get hint() { return txa('Seçili renkle boya · Alt+tıkla: renk al (damlalık) · X: beyaz/siyah') }, cursor: 'none' },
  { id: 'geri', get label() { return txa('Geri getir fırçası') }, key: 'Y', get hint() { return txa('Orijinal sayfayı geri boya (yanlış temizlenen çizimi düzelt)') }, cursor: 'none' },
  { id: 'silgi', get label() { return txa('Silgi') }, key: 'E', get hint() { return txa('Fırça, onarım, damga ve geri getir izlerini sil') }, cursor: 'none' },
  { id: 'damga', get label() { return txa('Klon damgası') }, key: 'S', get hint() { return txa('Alt+tıkla kaynak seç, sonra boyayarak kopyala') }, cursor: 'none' },
]

export function toolById(id: ToolId): ToolDef {
  return TOOLS.find((tool): tool is ToolDef => tool !== 'sep' && tool.id === id) as ToolDef
}

export type ViewMode = 'ham' | 'temiz' | 'ceviri'
export type ItemFilter = 'hepsi' | 'eksik' | 'oneri' | 'onayli'

export function clampBox(box: { x: number, y: number, w: number, h: number }, pageWidth: number, pageHeight: number) {
  const w = Math.max(8, Math.min(Math.round(box.w), pageWidth))
  const h = Math.max(8, Math.min(Math.round(box.h), pageHeight))
  return {
    x: Math.max(0, Math.min(Math.round(box.x), pageWidth - w)),
    y: Math.max(0, Math.min(Math.round(box.y), pageHeight - h)),
    w,
    h,
  }
}

export function matchesFilter(item: { status: TlTextStatus }, filter: ItemFilter) {
  return filter === 'hepsi' || item.status === filter
}
