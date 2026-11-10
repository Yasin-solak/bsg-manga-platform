import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

export type AdminQueuePriority = 'normal' | 'high' | 'critical'

interface AdminQueueItemCardProps {
  actorName: string
  actorMeta?: ReactNode
  avatarSrc?: string | null
  avatarSeed: string
  title?: string
  description?: string
  badges?: ReactNode
  metaItems?: string[]
  note?: ReactNode
  hint?: string
  actions?: ReactNode
  priority?: AdminQueuePriority
  muted?: boolean
  onClick?: () => void
}

/**
 * AdminQueueItemCard: simple queue item card.
 *
 * ShadcnUIKit style: a clean white/dark card, thin border,
 * priority dot indicator on the left.
 */
export function AdminQueueItemCard({
  actorName,
  actorMeta,
  avatarSrc,
  avatarSeed,
  title,
  description,
  badges,
  metaItems,
  note,
  hint,
  actions,
  priority = 'normal',
  muted = false,
  onClick,
}: AdminQueueItemCardProps) {
  return (
    <article
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow',
        muted && 'opacity-60',
        onClick && 'cursor-pointer hover:shadow-md',
      )}
      onClick={onClick}
    >
      {/* Üst: Avatar + isim + badge */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <img loading="lazy" decoding="async"
            src={avatarSrc || `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`}
            alt=""
            className="h-8 w-8 rounded-full border border-border object-cover"
          />
          <div className="min-w-0">
            <strong className="block truncate text-sm font-medium text-foreground">{actorName}</strong>
            {actorMeta && <p className="truncate text-xs text-muted-foreground">{actorMeta}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {priority !== 'normal' && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                priority === 'critical'
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
              )}
            >
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                priority === 'critical' ? 'bg-red-500' : 'bg-amber-500',
              )} />
              {priority === 'critical' ? txa('Kritik') : txa('Yüksek')}
            </span>
          )}
          {badges}
        </div>
      </div>

      {/* Başlık + Açıklama */}
      {title ? <h3 className="break-words text-sm font-semibold text-foreground">{title}</h3> : null}
      {description && (
        <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
      )}

      {/* Meta satırı */}
      {metaItems && metaItems.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {metaItems.map((item, i) => (
            <span key={`${item}-${i}`}>
              {i > 0 && <span className="mr-1.5">·</span>}
              {item}
            </span>
          ))}
        </div>
      )}

      {note && <div className="mt-2 text-xs">{note}</div>}

      {/* Alt aksiyon çubuğu */}
      {(hint || actions) && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{hint || ''}</p>
          {actions ? (
            <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">{actions}</div>
          ) : null}
        </div>
      )}
    </article>
  )
}
