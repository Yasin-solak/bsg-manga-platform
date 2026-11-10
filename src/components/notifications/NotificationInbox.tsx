import { NOTIFICATION_TABS } from './notificationTabs'
import { useId, useState, type ReactNode } from 'react'
import { BellSlash, ArrowClockwise, Checks } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { NotificationCategory } from '@/services/notificationService/centerModel'
import { useNotificationCenter } from './notificationContext'
import { useNotificationPage } from './useNotificationPage'
import { NotificationRow } from './NotificationRow'
import { notificationDateGroup } from './notificationPresentation'
import { txa } from '@/i18n/activeLocale'

export function NotificationInbox({ compact = false, onNavigate, category: controlledCategory, onCategoryChange, renderHeader }: { renderHeader?: (readAll: ReactNode) => ReactNode; compact?: boolean; onNavigate?: () => void; category?: NotificationCategory; onCategoryChange?: (category: NotificationCategory) => void }) {
  const center = useNotificationCenter()
  const [localCategory, setCategory] = useState<NotificationCategory>('all')
  const category = controlledCategory || localCategory
  const [unreadOnly, setUnreadOnly] = useState(false)
  const page = useNotificationPage(category, unreadOnly, compact ? 12 : 30)
  const id = useId()
  let previousGroup = ''
  const readAll = <button type="button" disabled={!page.snapshotAt || page.loading || center.busy.size > 0 || center.counts?.all === 0} onClick={() => { if (page.snapshotAt) void center.markAll(page.snapshotAt) }} aria-label={center.busy.has('all') ? txa('Kaydediliyor…') : txa('Tümünü oku')} className="min-h-11 shrink-0 rounded-xl border border-border px-3 text-xs font-extrabold hover:bg-muted disabled:opacity-40 max-[359px]:w-11 max-[359px]:px-0"><Checks size={19} className="mx-auto min-[360px]:hidden" aria-hidden /><span className="hidden min-[360px]:inline">{center.busy.has('all') ? txa('Kaydediliyor…') : txa('Tümünü oku')}</span></button>
  return <div className="flex min-h-0 flex-1 flex-col" data-testid="notification-inbox">
    {renderHeader?.(readAll)}
    <div className={cn("shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-1", renderHeader ? "hidden sm:flex" : "flex")}>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} className="size-4 accent-primary" />{txa('Okunmamışlar')}</label>
      <div className="flex items-center gap-1">
        <button type="button" onClick={page.refresh} disabled={page.loading || page.loadingMore} aria-label={txa('Bildirimleri yenile')} className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted disabled:opacity-50"><ArrowClockwise size={18} aria-hidden /></button>
        {!renderHeader && readAll}
      </div>
    </div>
    <div className="flex shrink-0 items-start">
    <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto px-3.5 pb-3 hide-scrollbar" role="tablist" aria-label={txa('Bildirim kategorileri')}>
      {NOTIFICATION_TABS.map((t, i) => { const count = center.counts?.[t.id]; return <button type="button" key={t.id} role="tab" id={`${id}-${t.id}`} aria-selected={category === t.id} aria-controls={`${id}-panel`} tabIndex={category === t.id ? 0 : -1}
        onKeyDown={e => { const next = e.key === 'ArrowRight' ? (i + 1) % 4 : e.key === 'ArrowLeft' ? (i + 3) % 4 : e.key === 'Home' ? 0 : e.key === 'End' ? 3 : null; if (next !== null) { e.preventDefault(); (onCategoryChange || setCategory)(NOTIFICATION_TABS[next].id); document.getElementById(`${id}-${NOTIFICATION_TABS[next].id}`)?.focus() } }}
        onClick={() => (onCategoryChange || setCategory)(t.id)} className={cn('relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', category === t.id ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground')}>
        {txa(t.label)}{count != null && count > 0 && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px]">{count > 99 ? '99+' : count}<span className="sr-only">{txa(' okunmamış')}</span></span>}
      </button> })}
    </div>
    {renderHeader && <button type="button" onClick={page.refresh} disabled={page.loading || page.loadingMore} aria-label={txa('Bildirimleri yenile')} title={txa('Bildirimleri yenile')} className="mr-2 grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 sm:hidden"><ArrowClockwise size={18} aria-hidden /></button>}
    </div>
    {center.countError && <p role="status" className="px-4 pb-2 text-xs text-muted-foreground">{txa('Okunmamış sayısı güncellenemedi.')} <button onClick={() => void center.refreshCounts()} className="underline">{txa('Tekrar dene')}</button></p>}
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${category}`} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]', compact && 'max-h-[min(460px,55vh)]')} aria-busy={page.loading || page.loadingMore}>
      {page.error ? <div role="alert" className="p-8 text-center"><p className="text-sm">{txa('Bildirimler yüklenemedi.')}</p><button className="mt-3 min-h-11 font-bold text-primary" onClick={page.refresh}>{txa('Tekrar dene')}</button></div> : page.loading ? <div aria-label={txa('Bildirimler yükleniyor')} className="space-y-3 p-4">{[0,1,2].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div> : <>
        {page.items.length === 0 && <div className="px-8 py-14 text-center"><BellSlash size={32} className="mx-auto mb-4 text-muted-foreground" aria-hidden /><h2 className="text-lg font-extrabold">{unreadOnly ? txa('Hepsini yakaladın') : txa('Henüz bildirim yok')}</h2><p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{unreadOnly ? txa('Bu kategoride okunmamış bildirim bulunmuyor. Geçmiş için filtreyi kapatabilirsin.') : txa(NOTIFICATION_TABS.find(t => t.id === category)?.hint ?? '')}</p></div>}
        {page.items.map(item => { const group = notificationDateGroup(item.created_at); const heading = group !== previousGroup; previousGroup = group; return <div key={item.id}>{heading && <h2 className="px-[18px] pb-2 pt-1.5 text-[11px] font-black uppercase tracking-[.07em] text-muted-foreground">{group}</h2>}<NotificationRow item={item} onNavigate={onNavigate} /></div> })}
        {page.moreError && <p role="alert" className="px-4 pt-4 text-sm text-destructive">{txa('Daha eski bildirimler yüklenemedi.')}</p>}
        {page.cursor && <div className="p-4"><button type="button" onClick={() => void page.loadMore()} disabled={page.loadingMore} className="min-h-11 w-full rounded-xl border border-border text-sm font-bold hover:bg-muted disabled:opacity-50">{page.loadingMore ? txa('Yükleniyor…') : page.moreError ? txa('Tekrar dene') : txa('Daha eski bildirimler')}</button></div>}
        {!page.cursor && page.items.length > 0 && <p className="px-5 py-6 text-center text-xs text-muted-foreground">{txa('Tüm bildirimlerini gördün.')}</p>}
      </>}
    </div>
  </div>
}
