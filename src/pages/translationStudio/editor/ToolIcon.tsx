import {
  ArrowCounterClockwise, Bandaids, Cursor, Eraser, Eyedropper, Hand, Lasso, MagicWand, MagnifyingGlass, PaintBrush, Selection,
  SelectionForeground, SelectionPlus, Stamp, TextT,
} from '@phosphor-icons/react'
import type { ToolId } from './editorModel'

const ICONS = {
  sec: Cursor,
  el: Hand,
  zoom: MagnifyingGlass,
  ekle: SelectionPlus,
  kement: Lasso,
  secKutu: Selection,
  secKement: SelectionForeground,
  degnek: MagicWand,
  metin: TextT,
  stil: Eyedropper,
  onarim: Bandaids,
  firca: PaintBrush,
  geri: ArrowCounterClockwise,
  silgi: Eraser,
  damga: Stamp,
} satisfies Record<ToolId, typeof Cursor>

export function ToolIcon({ id, size, className }: { id: ToolId, size: number, className?: string }) {
  const Icon = ICONS[id]
  return <Icon weight='bold' size={size} className={className} />
}
