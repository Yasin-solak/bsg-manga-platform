import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import {
  disableWebPush,
  enableWebPush,
  getWebPushState,
  type WebPushState,
} from '@/services/pushNotificationService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

/**
 * Browser push opt-in row inside the notification panel.
 * Not rendered at all if the flag is off / the browser is unsupported / there is no VAPID key
 * (getWebPushState returns 'unavailable'/'unsupported').
 */
function PushNotificationOptIn() {
  const [state, setState] = useState<WebPushState | 'loading'>('loading')
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    let isMounted = true
    void getWebPushState().then((nextState) => {
      if (isMounted) setState(nextState)
    })
    return () => {
      isMounted = false
    }
  }, [])

  if (state === 'loading' || state === 'unsupported' || state === 'unavailable') return null

  const isSubscribed = state === 'subscribed'
  const isDenied = state === 'denied'

  const handleToggle = async () => {
    if (isBusy || isDenied) return
    setIsBusy(true)
    try {
      const nextState = isSubscribed ? await disableWebPush() : await enableWebPush()
      setState(nextState)
      if (nextState === 'subscribed') {
        toast.success(txa('Tarayıcı bildirimleri açıldı.'))
      } else if (isSubscribed && nextState === 'unsubscribed') {
        toast.info(txa('Tarayıcı bildirimleri kapatıldı.'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Tarayıcı bildirimleri güncellenemedi.'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <BellRing className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 leading-tight">
          <p className="m-0 truncate text-xs font-bold text-foreground">{txa('Tarayıcı bildirimleri')}</p>
          <p className="m-0 truncate text-[11px] text-muted-foreground">
            {isDenied
              ? txa('Tarayıcı ayarlarından izin vermen gerekiyor.')
              : txa('Yeni bölüm çıktığında haber ver.')}
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isSubscribed}
        aria-label={txa('Tarayıcı bildirimleri')}
        disabled={isBusy || isDenied}
        onClick={() => void handleToggle()}
        className={
          'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 '
          + (isSubscribed ? 'bg-primary' : 'bg-muted-foreground/30')
        }
      >
        <span
          className={
            'absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] '
            + (isSubscribed ? 'left-[18px]' : 'left-0.5')
          }
        />
      </button>
    </div>
  )
}

export default PushNotificationOptIn
