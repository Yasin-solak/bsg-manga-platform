import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Mail } from 'lucide-react'
import { listMangas } from '@/services/mangaService'
import {
  listEnabledOAuthProviders,
  signInWithOAuthProvider,
  type OAuthProviderDefinition,
} from '@/services/oauthProviders'
import { toast } from '@/services/toastService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { createScopedLogger } from '@/services/logger'
import { cn } from '@/lib/utils'
import { useTx } from '@/i18n/LocaleProvider'
import { txa } from '@/i18n/activeLocale'

/**
 * Welcome: the first screen of the sign-in funnel (prototype screen 1).
 *
 * PLACEMENT DECISION: this screen is NOT THE HOME PAGE, it is a state of `/giris`.
 * In the prototype the welcome looks like the app's opening screen; on the web, turning the home
 * page into a login wall would devalue 12 prerendered public routes and
 * 108 sitemap URLs, and also cut visitors off from the catalog.
 * The prototype's ORDER is kept (Welcome -> Sign in / Sign up); only where the
 * funnel starts is inside the site.
 *
 * That is why "Browse for now" stays meaningful: the user could already browse,
 * and the button returns them to their place in the catalog.
 */

const welcomeLogger = createScopedLogger('AuthWelcome')

/** Column count and covers per column for the scrolling cover wall behind. */
const WALL_COLUMNS = 4
const COVERS_PER_COLUMN = 5

interface AuthWelcomeProps {
  onEmailSignup: () => void
  onLogin: () => void
  onGuest: () => void
}

function ProviderIcon({ id }: { id: OAuthProviderDefinition['id'] }) {
  if (id === 'google') {
    return (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
        <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.7 4.1-5.35 4.1a5.9 5.9 0 1 1 0-11.8c1.68 0 2.81.72 3.46 1.34l2.36-2.28C16.3 3.9 14.35 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.66 8.64-8.8 0-.6-.06-1.05-.15-1.5Z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="currentColor" d="M19.6 5.6A16.9 16.9 0 0 0 15.4 4.3l-.2.4a15.7 15.7 0 0 1 3.6 1.5 12 12 0 0 0-9.6 0 15.7 15.7 0 0 1 3.6-1.5l-.2-.4a16.9 16.9 0 0 0-4.2 1.3C5 9 4.3 12.3 4.6 15.6a17 17 0 0 0 5.1 2.6l.7-1a11 11 0 0 1-1.9-.9l.5-.4a12.2 12.2 0 0 0 10 0l.5.4c-.6.4-1.2.7-1.9.9l.7 1a17 17 0 0 0 5.1-2.6c.4-3.8-.6-7.1-2.8-10Zm-9.9 8c-.9 0-1.6-.8-1.6-1.8s.7-1.9 1.6-1.9c.9 0 1.6.9 1.6 1.9s-.7 1.8-1.6 1.8Zm4.6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.9 1.6-1.9c.9 0 1.6.9 1.6 1.9s-.7 1.8-1.6 1.8Z" />
    </svg>
  )
}

export default function AuthWelcome({ onEmailSignup, onLogin, onGuest }: AuthWelcomeProps) {
  const tx = useTx()
  const [covers, setCovers] = useState<string[]>([])
  const [providers, setProviders] = useState<OAuthProviderDefinition[]>([])
  const [busyProvider, setBusyProvider] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // The cover wall is not decoration but proof of the promise: when saying "the series you love"
      // we really show catalog series.
      // The wall can fail SILENTLY: it is decorative, and an error message
      // tells the user nothing they can act on. The curtain already gives an opaque
      // background, so the state with no covers is readable.
      const page = await listMangas({ limit: WALL_COLUMNS * COVERS_PER_COLUMN })
        .catch((error: unknown) => {
          welcomeLogger.warn({
            event: 'auth-welcome-covers',
            message: toUserFacingErrorMessage(error, txa('Kapaklar yüklenemedi.')),
            error,
          })
          return null
        })
      if (cancelled || !page) return
      setCovers(page.data.map((manga) => manga.coverImage).filter(Boolean))
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const enabled = await listEnabledOAuthProviders()
      if (!cancelled) setProviders(enabled)
    })()
    return () => { cancelled = true }
  }, [])

  /*
   * PREPARE THE HOME PAGE IN THE BACKGROUND.
   *
   * Both exits from the welcome ("Browse for now" and the end of sign-in) go to the
   * home page, the app's heaviest screen. Downloading the bundle during idle time
   * while the user reads the welcome noticeably shortens the next transition.
   *
   * With `requestIdleCallback`: this screen's OWN work (cover wall,
   * provider flags) finishes first. If the download raced them the welcome
   * would open late, turning the gain into a loss.
   *
   * The error is SWALLOWED: this is a preload, not a task. On failure the user
   * loads it the normal way on reaching the home page.
   */
  useEffect(() => {
    let cancelled = false
    const preload = () => {
      if (cancelled) return
      void import('@/pages/HomePage').catch(() => undefined)
    }

    const idle = window.requestIdleCallback
    if (typeof idle === 'function') {
      const handle = idle(preload, { timeout: 2500 })
      return () => {
        cancelled = true
        window.cancelIdleCallback?.(handle)
      }
    }

    // Safari has no requestIdleCallback; a short delay does the same job.
    const timer = window.setTimeout(preload, 1200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  const columns = useMemo(() => {
    if (covers.length === 0) return []
    return Array.from({ length: WALL_COLUMNS }, (_, columnIndex) =>
      Array.from({ length: COVERS_PER_COLUMN * 2 }, (_, rowIndex) =>
        // Iki kat: animasyon basa donerken bosluk olusmasin.
        covers[(columnIndex * COVERS_PER_COLUMN + rowIndex) % covers.length],
      ),
    )
  }, [covers])

  const handleProvider = async (provider: OAuthProviderDefinition) => {
    setBusyProvider(provider.id)
    try {
      await signInWithOAuthProvider(provider.id)
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, txa('Giriş başlatılamadı. Lütfen tekrar dene.')))
      setBusyProvider(null)
    }
  }

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-background"
      data-testid="auth-welcome"
    >
      {/* Kapak duvari: yaslanmis, egik ve yavas kayan. Okunabilirligi
          bozmamasi icin uzerine alttan yukari acilan bir perde var. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-[16%] -inset-y-[18%] flex gap-2.5 rotate-[-12deg] opacity-60 saturate-[.85]"
      >
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="min-w-0 flex-1">
            <div
              className={cn(
                'flex flex-col gap-2.5',
                columnIndex % 2 === 0 ? 'animate-auth-drift-up' : 'animate-auth-drift-down',
              )}
              style={{ animationDuration: `${46 + columnIndex * 6}s`, animationDelay: `-${columnIndex * 9}s` }}
            >
              {column.map((cover, rowIndex) => (
                <img
                  key={`${columnIndex}-${rowIndex}`}
                  src={cover}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-[180px] w-full flex-none rounded-xl object-cover"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {/*
        Perde inline style: tema degiskenleri OKLCH, HSL uclusu DEGIL. Yani
        `hsl(var(--background))` GECERSIZ ve tum gradyani sessizce dusuruyor --
        ilk halde metin kapaklarin uzerinde okunmuyordu. Alfa icin color-mix.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'linear-gradient(to top,',
            'var(--background) 46%,',
            'color-mix(in oklch, var(--background) 92%, transparent) 64%,',
            'color-mix(in oklch, var(--background) 70%, transparent) 82%,',
            'color-mix(in oklch, var(--background) 35%, transparent) 94%,',
            'transparent)',
          ].join(' '),
        }}
      />

      <div className="relative flex justify-end px-4 pt-4">
        <button
          type="button"
          onClick={onGuest}
          data-testid="auth-welcome-guest"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card/70 px-3.5 text-[12.5px] font-extrabold text-foreground backdrop-blur"
        >
          {tx('Şimdilik gez')}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-end px-6 pb-8">
        <div className="mb-5 inline-flex flex-col items-start gap-2 self-start rounded-[20px] bg-black/40 px-4 py-3.5 backdrop-blur">
          <img
            src="/assets/promo/logo.png"
            alt={txa('BSG Manga')}
            className="block h-[56px] w-auto object-contain"
          />
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/60">
            {tx('Çeviri topluluğu')}
          </span>
        </div>

        <h1 className="m-0 text-[31px] font-black leading-[1.1] tracking-tight text-foreground">
          {tx('Sevdiğin seriler')}<br />{tx('seni bekliyor')}
        </h1>
        <p className="m-0 mb-5 mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
          {tx('Kaldığın sayfayı biz hatırlarız — yeni bölüm çıktığında da ilk sen bilirsin.')}
        </p>

        <div className="flex flex-col gap-2.5">
          {/*
            Saglayici dugmeleri yalnizca KURULU olanlar icin cizilir
            (src/services/oauthProviders.ts). Kurulmamis saglayicinin
            dugmesini basmak, dokununca hicbir sey olmayan bir dugme demekti.
          */}
          {providers.map((provider, index) => (
            <button
              key={provider.id}
              type="button"
              disabled={busyProvider !== null}
              onClick={() => { void handleProvider(provider) }}
              data-testid={`auth-welcome-oauth-${provider.id}`}
              className={cn(
                'inline-flex h-[54px] items-center justify-center gap-2.5 rounded-2xl text-[15px] font-black disabled:opacity-60',
                index === 0
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card/70 text-foreground backdrop-blur',
              )}
            >
              <ProviderIcon id={provider.id} />
              {tx(provider.label)}
            </button>
          ))}

          <button
            type="button"
            onClick={onEmailSignup}
            data-testid="auth-welcome-signup"
            className={cn(
              'inline-flex h-[54px] items-center justify-center gap-2.5 rounded-2xl text-[15px] font-black',
              // Without providers email is the MAIN path and looks primary.
              providers.length === 0
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card/70 text-foreground backdrop-blur',
            )}
          >
            <Mail className="size-[18px]" aria-hidden="true" />
            {tx('E-posta ile hesap oluştur')}
          </button>
        </div>

        <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[13px] font-bold text-muted-foreground">
          {tx('Zaten hesabın var mı?')}
          <button
            type="button"
            onClick={onLogin}
            data-testid="auth-welcome-login"
            className="px-0.5 py-1.5 text-[13px] font-black text-primary"
          >
            {tx('Giriş yap')}
          </button>
        </div>
      </div>
    </div>
  )
}
