import { NOTIFICATION_TABS } from '@/components/notifications/notificationTabs'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Link, Navigate, useSearchParams } from '@/i18n/router'
import { ArrowLeft, Bell, SlidersHorizontal } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationInbox } from '@/components/notifications/NotificationInbox'
import { useNotificationCenter } from '@/components/notifications/notificationContext'
import { NotificationSettings } from '@/components/notifications/NotificationSettings'
import { safeNotificationPath } from '@/components/notifications/notificationPresentation'
import type { NotificationCategory } from '@/services/notificationService/centerModel'
import { intlLocale, txa } from '@/i18n/activeLocale'

export default function NotificationsPage() {
  const { currentUser, loading } = useAuth()
  const center = useNotificationCenter(), location = useLocation()
  const [params, setParams] = useSearchParams()
  const settings = location.pathname.replace(/\/+$/, '').endsWith('/ayarlar')
  const category: NotificationCategory = NOTIFICATION_TABS.find(t => t.id === params.get('kategori'))?.id || 'all'
  const from = typeof location.state?.from === 'string' ? safeNotificationPath(location.state.from) : null
  const back = settings ? '/bildirimler' : from && !from.startsWith('/bildirimler') ? from : '/'
  if (loading || center.flagsLoading) return <div role="status" className="p-8 text-center text-sm text-muted-foreground">{txa('Bildirimler hazırlanıyor…')}</div>
  if (!currentUser) return <Navigate to="/giris" state={{ from: location.pathname + location.search }} replace />
  if (!center.enabled) return <div className="p-8 text-center"><h1 className="text-xl font-bold">{txa('Bildirim merkezi şu anda kullanılamıyor')}</h1><Link to="/" className="mt-4 inline-flex min-h-11 items-center text-primary">{txa('Ana sayfaya dön')}</Link></div>
  const header = (readAll?: ReactNode) => <header className="flex min-h-[56px] shrink-0 items-center gap-1.5 px-2 sm:min-h-16 sm:border-b sm:border-border sm:px-4">
          <Link to={back} aria-label={settings ? txa('Bildirimlere dön') : txa('Geri dön')} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted"><ArrowLeft size={21} weight="bold" aria-hidden /></Link>
          <h1 className="min-w-0 flex-1 text-[17px] font-black tracking-tight sm:text-xl">{settings ? txa('Bildirim ayarları') : txa('Bildirimler')}</h1>
          {readAll}
          {!settings && <Link to="/bildirimler/ayarlar" aria-label={txa('Bildirim ayarları')} className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted"><SlidersHorizontal size={20} weight="bold" aria-hidden /></Link>}
        </header>
  return <div className="bg-background sm:px-6 sm:py-8" data-testid="notifications-page">
    <div className="mx-auto max-w-[1120px] lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="flex h-[100svh] min-h-0 flex-col pt-[env(safe-area-inset-top)] sm:h-[min(850px,calc(100svh-6rem))] sm:min-h-[520px] overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:pt-0">

        {settings ? <>{header()}<div className="min-h-0 flex-1 overflow-y-auto p-4"><NotificationSettings embedded /></div></> : <NotificationInbox renderHeader={header} category={category} onCategoryChange={next => setParams(next === 'all' ? {} : { kategori: next }, { replace: true })} />}
      </section>
      <aside className="hidden self-start space-y-4 lg:block">
        <div className="rounded-2xl border border-border bg-card p-5"><Bell size={26} weight="duotone" className="mb-3 text-primary" aria-hidden /><h2 className="text-base font-extrabold">{txa('Sana gelen haberler')}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{txa('Takip ettiğin seriler, topluluk ve hesabınla ilgili gelişmeler bir arada.')}</p><p className="mt-4 border-t border-border pt-4 text-sm font-semibold">{center.counts ? txa('{v1} okunmamış bildirim', { v1: center.counts.all.toLocaleString(intlLocale()) }) : txa('Okunmamış sayısı yükleniyor…')}</p></div>
        <div className="rounded-2xl border border-border p-5"><h2 className="text-sm font-extrabold">{txa('Kontrol sende')}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{txa('Okuduğun bildirimler geçmişinde kalır. Almak istediğin bildirimleri ve bu cihazdaki sessiz saatleri ayarlayabilirsin.')}</p><Link to="/bildirimler/ayarlar" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-primary">{txa('Bildirim tercihlerini düzenle')}</Link></div>
      </aside>
    </div>
  </div>
}
