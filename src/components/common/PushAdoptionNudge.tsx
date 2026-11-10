import { useEffect, useState } from 'react'
import { BellRing, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { enableWebPush, getWebPushState, isWebPushSupported } from '@/services/pushNotificationService'
import { isFeatureEnabled } from '@/services/featureFlagService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

/**
 * PushAdoptionNudge: a gentle push suggestion shown ONCE at chapter end.
 *
 * Two variants:
 * - 'push': a push subscription is possible (flag + support + permission not denied)
 * -> enables notifications in one click.
 * - 'install': iOS Safari browser tab (push works only in a PWA added to the
 * home screen) -> shows install instructions.
 *
 * Persistence: localStorage 'mz-push-nudge' ('done' | 'dismissed'): after the user
 * decides once it never appears again. If a subscription is already on,
 * 'done' is silently written.
 */

const NUDGE_STORAGE_KEY = 'mz-push-nudge'

type NudgeVariant = 'push' | 'install'

function readNudgeState(): string | null {
  if (typeof window === 'undefined') return 'done'
  try {
    return window.localStorage.getItem(NUDGE_STORAGE_KEY)
  } catch {
    return 'done'
  }
}

function writeNudgeState(value: 'done' | 'dismissed') {
  try {
    window.localStorage.setItem(NUDGE_STORAGE_KEY, value)
  } catch {
    // localStorage kapali (gizli mod vb.) — oturum icinde state zaten gizliyor.
  }
}

function isIosBrowserTab(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIosDevice = /iphone|ipod|ipad/i.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
  if (!isIosDevice) return false
  const inStandalone = ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
    || window.matchMedia?.('(display-mode: standalone)').matches
  return !inStandalone
}

function PushAdoptionNudge({ className }: { className?: string }) {
  const [variant, setVariant] = useState<NudgeVariant | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    let isMounted = true

    const resolve = async () => {
      if (readNudgeState()) return

      // iOS browser tab: no push API, but installing is the right path.
      if (isIosBrowserTab()) {
        if (await isFeatureEnabled('notifications.web_push', false)) {
          if (isMounted) setVariant('install')
        }
        return
      }

      if (!isWebPushSupported()) return
      const state = await getWebPushState()
      if (!isMounted) return
      if (state === 'subscribed') {
        writeNudgeState('done')
        return
      }
      if (state === 'unsubscribed') setVariant('push')
    }

    void resolve()
    return () => {
      isMounted = false
    }
  }, [])

  if (!variant) return null

  const dismiss = () => {
    writeNudgeState('dismissed')
    setVariant(null)
  }

  const handleEnable = async () => {
    if (isBusy) return
    setIsBusy(true)
    try {
      const nextState = await enableWebPush()
      if (nextState === 'subscribed') {
        toast.success(txa('Tarayıcı bildirimleri açıldı.'))
        writeNudgeState('done')
        setVariant(null)
      } else if (nextState === 'denied') {
        toast.info(txa('Bildirim izni verilmedi; istersen tarayıcı ayarlarından açabilirsin.'))
        writeNudgeState('dismissed')
        setVariant(null)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Tarayıcı bildirimleri açılamadı.'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className={className}>
    <div
      data-testid="push-adoption-nudge"
      className="relative flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-black/45 px-4 py-3"
    >
      <button
        type="button"
        aria-label={txa('Kapat')}
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-full p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-3.5" />
      </button>

      {variant === 'push' ? (
        <>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
            <BellRing className="size-4" />
          </span>
          <div className="min-w-0 flex-1 pr-5">
            <p className="m-0 text-sm font-bold text-white">{txa('Yeni bölüm çıkınca haber verelim mi?')}</p>
            <p className="m-0 text-xs text-white/60">
              {txa('Takip ettiğin serilerin yeni bölümleri için tarayıcı bildirimi al — site kapalıyken bile.')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" disabled={isBusy} onClick={() => void handleEnable()} className="gap-1.5">
              <BellRing className="size-3.5" />{' '}{txa('Bildirimleri ac')}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {txa('Simdi degil')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Share className="size-4" />
          </span>
          <div className="min-w-0 flex-1 pr-5">
            <p className="m-0 text-sm font-bold text-white">{txa('BSG Manga\'yı ana ekranına ekle')}</p>
            <p className="m-0 text-xs text-white/60">
              {txa('Safari\'de Paylaş menüsünden "Ana Ekrana Ekle"yi seç — yeni bölüm bildirimleri iPhone/iPad\'de ancak böyle çalışır.')}
            </p>
          </div>
          <Button size="sm" variant="secondary" className="shrink-0" onClick={dismiss}>
            {txa('Anladım')}
          </Button>
        </>
      )}
      </div>
    </div>
  )
}

export default PushAdoptionNudge
