import { useLocation } from 'react-router-dom'
import { Link } from '@/i18n/router'
import { Bell, ArrowUpRight, SlidersHorizontal } from '@phosphor-icons/react'
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useNotificationCenter } from './notificationContext'
import { NotificationInbox } from './NotificationInbox'
import { txa } from '@/i18n/activeLocale'

export function NotificationTrigger({ sidebar, open, onOpenChange }: { sidebar: boolean; open: boolean; onOpenChange: (value: boolean) => void }) {
  const center = useNotificationCenter(), mobile = useIsMobileViewport(), location = useLocation()
  if (!center.enabled || !center.userId) return null
  const body = <><Bell size={21} aria-hidden />{sidebar && <span className="flex-1 text-left">{txa('Bildirimler')}</span>}{center.counts != null && center.counts.all > 0 && <span className={cn('flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-primary-foreground', !sidebar && 'absolute -right-1 -top-1')}>{center.counts.all > 99 ? '99+' : center.counts.all}</span>}</>
  const style = cn('relative flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted', sidebar && 'w-full justify-start border-transparent bg-transparent px-3 text-sm font-semibold')
  if (mobile) return <Link to="/bildirimler" state={{ from: location.pathname + location.search }} data-account-part="bell" aria-label={txa('Bildirimler')} className={style}>{body}</Link>
  return <Popover open={open} onOpenChange={onOpenChange}><PopoverTrigger asChild><button type="button" data-account-part="bell" aria-label={txa('Bildirimler')} className={style}>{body}</button></PopoverTrigger>
    <PopoverContent side={sidebar ? 'top' : 'bottom'} align={sidebar ? 'start' : 'end'} sideOffset={12} collisionPadding={12} className="z-[80] flex w-[min(460px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border-border p-0 shadow-2xl">
      <div className="flex items-center justify-between px-4 pt-3"><h2 className="font-black">{txa('Bildirimler')}</h2><Link to="/bildirimler/ayarlar" aria-label={txa('Bildirim ayarları')} onClick={() => onOpenChange(false)} className="grid size-11 place-items-center rounded-xl hover:bg-muted"><SlidersHorizontal size={20} aria-hidden /></Link></div>
      {open && <NotificationInbox compact onNavigate={() => onOpenChange(false)} />}
      <Link to="/bildirimler" onClick={() => onOpenChange(false)} className="flex min-h-12 items-center justify-center gap-2 border-t border-border text-sm font-bold text-primary hover:bg-muted">{txa('Tüm bildirimleri aç')}<ArrowUpRight size={16} aria-hidden /></Link>
    </PopoverContent>
  </Popover>
}
