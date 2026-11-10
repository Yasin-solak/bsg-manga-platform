import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * Look Studio inner tabs: one group visible at a time instead of a long settings list, so
 * Profile Theme and Name Style pages fit without scrolling. The preview stays fixed above the tabs.
 */
export function StudioTabs<T extends string>({ value, onChange, tabs, label }: {
  value: T
  onChange: (value: T) => void
  tabs: Array<{ id: T, label: string, icon: ReactNode }>
  label: string
}) {
  return (
    <div className='flex gap-1 rounded-2xl border border-border/60 bg-muted/30 p-1' role='tablist' aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type='button'
          role='tab'
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          data-testid={`studio-tab-${tab.id}`}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-black transition-colors',
            value === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.icon}
          <span className='truncate'>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
