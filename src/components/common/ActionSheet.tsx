import { useState, type ReactElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import BottomSheet from './BottomSheet'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/**
 * "⋯ actions" bottom action sheet (prototype pattern).
 *
 * WHY NOT A DROPDOWN: a dropdown is a surface designed for a pointer:
 * it sticks next to its trigger, items are small and on a phone it opens in the top
 * corner of the screen, out of the thumb's reach. A bottom sheet comes from the screen's
 * BOTTOM edge: rows are 52px, all within thumb reach, and
 * 'Cancel' leaves a clear exit.
 *
 * REUSABLE: a shared surface for ⋯ menus and similar action lists.
 * If needed somewhere new, use this component rather than building a dropdown.
 * The shell (handle, title, Cancel, opening motion) comes from BottomSheet.
 */

export interface ActionSheetItem {
  id: string
  label: string
  icon: LucideIcon
  onSelect: () => void
  /** Yikici eylem (rapor, engelle, sil): ikon uyari renginde. */
  destructive?: boolean
}

interface ActionSheetProps {
  /** Sayfanin ne hakkinda oldugunu soyleyen ust baslik ("Seri islemleri"). */
  title: string
  items: ActionSheetItem[]
  /** For accessibility; not visible on screen. */
  description?: string
  trigger: ReactElement
  cancelLabel?: string
}

export default function ActionSheet({
  title,
  items,
  description,
  trigger,
  cancelLabel = txa('Vazgeç'),
}: ActionSheetProps) {
  const [open, setOpen] = useState(false)

  /*
   * CLOSE first, then run the action. Actions like reporting open their own sheet;
   * if this one stays open two layers stack and the focus trap behind
   * swallows the front one.
   */
  const runItem = (item: ActionSheetItem) => {
    setOpen(false)
    item.onSelect()
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      trigger={trigger}
      cancelLabel={cancelLabel}
      testId="action-sheet"
    >
      <div className="mt-1 flex flex-col">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`action-sheet-item-${item.id}`}
              onClick={() => runItem(item)}
              className="flex h-[52px] items-center gap-3 px-5 text-left transition-colors hover:bg-accent active:bg-accent"
            >
              <Icon
                className={cn('size-5 shrink-0', item.destructive ? 'text-destructive' : 'text-primary')}
              />
              <span className="min-w-0 truncate text-[15px] font-bold text-foreground">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
