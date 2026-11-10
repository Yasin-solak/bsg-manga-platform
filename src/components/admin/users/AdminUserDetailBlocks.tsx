import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { InventoryBlockProps } from './adminUserDetailUtils'
import { cardBase, emptyText } from './adminUserDetailUtils'
import { txa } from '@/i18n/activeLocale'

export function InventoryBlock({ title, items }: InventoryBlockProps) {
  return (
    <div className={cardBase}>
      <h4 className="m-0 text-base font-bold text-foreground">{`${title} (${items.length})`}</h4>
      {items.length === 0 ? (
        <p className={cn(emptyText, 'm-0')}>{txa('Kayit yok.')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge key={`${item.type}-${item.ref}`} variant="secondary" className="rounded-full border border-border">
              {item.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
