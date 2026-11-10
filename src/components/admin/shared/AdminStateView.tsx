import type { ReactNode } from 'react'
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminStateViewProps {
  message: string
  tone?: 'default' | 'warning' | 'destructive'
  action?: ReactNode
}

/**
 * AdminStateView: simple status message card.
 */
export function AdminStateView({ message, tone = 'default', action }: AdminStateViewProps) {
  const Icon = tone === 'destructive' ? ShieldAlert : tone === 'warning' ? AlertTriangle : Info

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div
        className={cn(
          'flex items-center gap-3 text-sm',
          tone === 'destructive' && 'text-red-600 dark:text-red-400',
          tone === 'warning' && 'text-amber-600 dark:text-amber-400',
          tone === 'default' && 'text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <p>{message}</p>
      </div>
      {action && <div className="mt-3 pl-8">{action}</div>}
    </div>
  )
}
