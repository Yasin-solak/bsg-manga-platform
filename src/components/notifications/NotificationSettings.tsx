import { useId } from 'react'
import { ArrowLeft, Bell, LoaderCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PushNotificationOptIn from '@/components/layout/PushNotificationOptIn'
import { useAuth } from '@/contexts/AuthContext'
import type { NotificationPreferenceKey } from '@/services/notificationService'
import { cn } from '@/lib/utils'
import { useNotificationSettingsState } from './useNotificationSettingsState'
import { NotificationQuietHoursSettings } from './NotificationQuietHoursSettings'
import { txa } from '@/i18n/activeLocale'

const PREFERENCE_GROUPS: Array<{
  title: string
  rows: Array<{ key: NotificationPreferenceKey; title: string; description: string }>
}> = [
  {
    get title() { return txa('Takip ve topluluk') },
    rows: [
      { key: 'followEnabled', get title() { return txa('Takipler ve yeni bölümler') }, get description() { return txa('Yeni takipçiler ve takip ettiğin serilerin bölüm haberleri.') } },
      { key: 'commentEnabled', get title() { return txa('Yorumlar ve yanıtlar') }, get description() { return txa('Yorumlarına gelen yanıtları kaçırma.') } },
      { key: 'mentionEnabled', get title() { return txa('Bahsetmeler') }, get description() { return txa('Bir gönderide veya yorumda etiketlendiğinde haber al.') } },
    ],
  },
  {
    get title() { return txa('Başarılar') },
    rows: [
      { key: 'badgeEnabled', get title() { return txa('Rozetler ve ödüller') }, get description() { return txa('Kazandığın ve satın aldığın rozetleri gör.') } },
      { key: 'levelUpEnabled', get title() { return txa('Seviye atlama') }, get description() { return txa('Yeni bir seviyeye ulaştığında haber al.') } },
    ],
  },
  {
    get title() { return txa('Sistem') },
    rows: [{ key: 'systemEnabled', get title() { return txa('Duyurular') }, get description() { return txa('Sistem bildirimleri ve uygulama duyurularını al.') } }],
  },
]

export type NotificationSettingsProps = { onClose?: () => void; embedded?: boolean }

export function NotificationSettings({ onClose, embedded = false }: NotificationSettingsProps) {
  const { currentUser, loading } = useAuth()
  if (loading) return <SettingsLoading />
  if (!currentUser) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">{txa('Bildirim ayarlarını görmek için giriş yapmalısın.')}</p>
  }
  // If the account changes, the previous account's draft and pending responses do not move to the new form.
  return <NotificationSettingsForm key={currentUser.id} onClose={onClose} embedded={embedded} />
}

function SettingsLoading() {
  return (
    <div role="status" className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {txa('Bildirim ayarların yükleniyor…')}
    </div>
  )
}

function NotificationSettingsForm({ onClose, embedded }: NotificationSettingsProps) {
  const settings = useNotificationSettingsState()
  const id = useId()

  return (
    <section aria-labelledby={`${id}-title`} className="w-full space-y-6">
      <header className="flex items-center gap-3">
        {!embedded && (onClose ? (
          <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0 rounded-xl"
            aria-label={txa('Bildirimlere dön')} onClick={onClose} disabled={settings.saving}>
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Button>
        ) : <Bell className="size-6 shrink-0 text-primary" aria-hidden="true" />)}
        <div className="min-w-0">
          <h2 id={`${id}-title`} className={embedded ? 'sr-only' : 'm-0 text-2xl font-black tracking-tight text-foreground'}>{txa('Bildirim ayarları')}</h2>
          <p className={cn('mb-0 text-xs leading-5 text-muted-foreground', embedded ? 'mt-0' : 'mt-1')}>{txa('Hangi gelişmelerden haberdar olacağını seç.')}</p>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border [&:empty]:hidden"><PushNotificationOptIn /></div>

      {settings.loading ? <SettingsLoading /> : settings.loadError ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-border bg-muted/20 p-5">
          <p className="m-0 text-sm text-foreground">{txa('Bildirim ayarların yüklenemedi.')}</p>
          <p className="m-0 text-xs leading-5 text-muted-foreground">{txa('Bağlantını kontrol edip tekrar dene.')}</p>
          <Button type="button" variant="outline" onClick={settings.retry} className="min-h-11 gap-2 rounded-xl">
            <RotateCcw className="size-4" aria-hidden="true" /> {txa('Tekrar dene')}
          </Button>
        </div>
      ) : settings.draft ? (
        <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); void settings.save() }}>
          {PREFERENCE_GROUPS.map((group) => (
            <fieldset key={group.title} className="m-0 min-w-0 space-y-2 border-0 p-0" disabled={settings.saving}>
              <legend className="mb-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{txa(group.title)}</legend>
              {group.rows.map((row) => {
                const checked = settings.draft?.[row.key] === true
                return (
                  <button key={row.key} type="button" role="switch" aria-checked={checked}
                    aria-labelledby={`${id}-${row.key}-title`} aria-describedby={`${id}-${row.key}-description`}
                    onClick={() => settings.change(row.key, !checked)} disabled={settings.saving}
                    className="flex min-h-20 w-full items-center justify-between gap-4 rounded-2xl border border-border bg-muted/20 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60">
                    <span className="min-w-0">
                      <span id={`${id}-${row.key}-title`} className="block text-sm font-bold text-foreground">{txa(row.title)}</span>
                      <span id={`${id}-${row.key}-description`} className="mt-1 block text-xs leading-5 text-muted-foreground">{txa(row.description)}</span>
                    </span>
                    <span aria-hidden="true" className={cn('flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors motion-reduce:transition-none', checked ? 'bg-primary' : 'bg-muted-foreground/30')}>
                      <span className={cn('size-5 rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none', checked ? 'translate-x-5' : 'translate-x-0')} />
                    </span>
                  </button>
                )
              })}
            </fieldset>
          ))}

          <div className="space-y-3 border-t border-border pt-5">
            {settings.saveError ? <p role="alert" className="m-0 text-sm text-destructive">{txa('Ayarların kaydedilemedi. Seçimlerin korunuyor; tekrar kaydedebilirsin.')}</p> : null}
            <p role="status" className="m-0 text-xs leading-5 text-muted-foreground">
              {settings.saving ? txa('Ayarların kaydediliyor…') : settings.hasChanges
                ? txa('Değişikliklerinin uygulanması için kaydet.')
                : txa('Bu ayarlar yeni bildirimler için geçerli; geçmiş bildirimlerini silmez.')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!settings.hasChanges || settings.saving} className="min-h-11 flex-1 gap-2 rounded-xl font-bold">
                {settings.saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {settings.saving ? txa('Kaydediliyor…') : txa('Değişiklikleri kaydet')}
              </Button>
              {settings.hasChanges ? <Button type="button" variant="outline" disabled={settings.saving} onClick={settings.discard} className="min-h-11 rounded-xl">{txa('Vazgeç')}</Button> : null}
            </div>
          </div>
        </form>
      ) : null}
      <NotificationQuietHoursSettings />
    </section>
  )
}
