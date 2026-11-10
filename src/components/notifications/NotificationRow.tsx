import { Bell, BookOpen, Check, ChatCircle, Medal } from '@phosphor-icons/react'
import { useNavigate } from '@/i18n/router'
import type { Notification } from '@/services/notificationService'
import { getNotificationCategory } from '@/services/notificationService/centerModel'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { useNotificationCenter } from './notificationContext'
import { notificationDestination, notificationText, notificationTime, notificationDisplayTitle, notificationDisplayMessage } from './notificationPresentation'
import { intlLocale, txa } from '@/i18n/activeLocale'

function imageSource(value: string) { return /^https?:\/\//i.test(value) || (value.startsWith('/') && !value.startsWith('//')) ? value : '' }
export function NotificationRow({ item, onNavigate }: { item: Notification; onNavigate?: () => void }) {
  const center = useNotificationCenter(), navigate = useNavigate()
  const { currentUser } = useAuth()
  const category = getNotificationCategory(item)
  const Icon = category === 'chapter' ? BookOpen : category === 'community' ? ChatCircle : item.type.startsWith('badge') ? Medal : Bell
  const image = imageSource(notificationText(item, 'fansub_avatar') || notificationText(item, 'actor_avatar') || item.icon || '')
  const cover = imageSource(notificationText(item, 'manga_cover') || notificationText(item, 'cover_image_url'))
  const title = notificationDisplayTitle(item), message = notificationDisplayMessage(item)
  const target = notificationDestination(item, currentUser?.username)
  const busy = center.busy.has(item.id) || center.busy.has('all')
  async function open() {
    if (!await center.markRead(item)) return
    if (target) { onNavigate?.(); navigate(target) }
  }
  return <article className={cn('flex border-b border-border/70 transition-colors', !item.is_read && 'bg-primary/[0.045]')} data-notification-id={item.id} data-read={item.is_read}>
    <button type="button" disabled={busy} onClick={() => void open()} className="flex min-w-0 flex-1 items-start gap-3 px-4 py-[13px] text-left hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60" aria-label={txa(item.is_read ? (target ? txa('{title}, aç') : txa('{title}, okundu işaretle')) : (target ? txa('{title}, okunmamış, aç') : txa('{title}, okunmamış, okundu işaretle')), { title })}>
      <span className={cn('relative flex size-[42px] shrink-0 items-center justify-center rounded-[13px]', category === 'community' ? 'bg-violet-400/10 text-violet-400' : category === 'chapter' ? 'bg-primary/10 text-primary' : 'bg-amber-400/10 text-amber-500')}>
        <Icon size={22} weight="fill" aria-hidden />
        {image && <img src={image} alt="" loading="lazy" className="absolute inset-0 size-full rounded-full object-cover" onError={e => { e.currentTarget.hidden = true }} />}
        <span className="absolute -bottom-0.5 -right-0.5 flex size-[19px] items-center justify-center rounded-full border-2 border-background bg-current"><Icon size={10} weight="fill" className="text-background" aria-hidden /></span>
      </span>
      <span className="min-w-0 flex-1 break-words">
        <span className={cn('block text-[13.5px] font-extrabold leading-[1.35]', item.is_read ? 'text-foreground/75' : 'text-foreground')}>{title}</span>
        {message && <span className="mt-1 block text-xs font-semibold leading-[1.45] text-muted-foreground">{message}</span>}
        <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString(intlLocale())} className="mt-1.5 block text-[11px] font-semibold text-muted-foreground">{notificationTime(item.created_at)}</time>
      </span>
      {cover && <img src={cover} alt="" loading="lazy" className="h-[52px] w-[38px] shrink-0 rounded-[9px] object-cover" onError={e => { e.currentTarget.hidden = true }} />}
      {!item.is_read && <span aria-hidden className="mt-[30px] size-2 shrink-0 rounded-full bg-primary sm:hidden" />}
    </button>
    {!item.is_read && <button type="button" disabled={busy} onClick={() => void center.markRead(item)} aria-label={txa('{title}: okundu işaretle', { title })} title={txa('Okundu işaretle')} className="hidden min-h-11 w-11 shrink-0 items-center justify-center text-primary hover:bg-primary/10 disabled:opacity-50 sm:flex"><Check size={18} aria-hidden /></button>}
  </article>
}
