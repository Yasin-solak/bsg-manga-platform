import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import DesktopSearchCommand from './DesktopSearchCommand'
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport'
import { SearchDialog } from '@/components/search/SearchDialog'
import { txa } from '@/i18n/activeLocale'

export interface GlobalSearchCommandProps {
  variant?: 'sidebar' | 'icon'
  enableHotkey?: boolean
}

function MobileSearchCommand({ variant = 'sidebar', enableHotkey = false }: GlobalSearchCommandProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!enableHotkey) return
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (!open && document.querySelector('[data-testid="search-dialog"]')) return
        event.preventDefault(); setOpen(value => !value)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enableHotkey, open])
  return <>
    <button ref={trigger} type="button" data-sidebar-search={variant === 'sidebar' ? '' : undefined} aria-label={txa('Site aramasını aç')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
      className={variant === 'icon' ? 'flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground' : 'flex min-h-11 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:text-foreground'}>
      <Search className="size-[18px]" />{variant === 'sidebar' && <><span className="flex-1 text-left">{txa('Ara')}</span><kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">Ctrl K</kbd></>}
    </button>
    {open && <SearchDialog onClose={() => { setOpen(false); trigger.current?.focus() }} />}
  </>
}
/** The mobile search update does not change desktop's existing command palette. */
export function GlobalSearchCommand(props: GlobalSearchCommandProps) {
  const isMobile = useIsMobileViewport()
  return isMobile ? <MobileSearchCommand {...props} /> : <DesktopSearchCommand {...props} />
}
export default GlobalSearchCommand
