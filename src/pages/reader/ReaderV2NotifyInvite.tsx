/**
 * Chapter end follow + notification invite.
 *
 * In context: the user JUST finished the chapter and just saw the team's work.
 * This asks here instead of a cold invite on the general site.
 *
 * Which card shows is in the pure engine (readerV2NotifyInviteEngine); drawing is here.
 */

import { Link } from '@/i18n/router'
import { BellRing, LogIn, Share, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReaderV2NotifyInviteVariant } from '@/pages/reader/readerV2NotifyInviteEngine'
import { txa } from '@/i18n/activeLocale'

interface ReaderV2NotifyInviteProps {
  variant: Exclude<ReaderV2NotifyInviteVariant, 'hidden'>
  fansubName: string
  isBusy: boolean
  onDismiss: () => void
  onFollow: () => void
  onEnableNotifications: () => void
  /**
   * Address to return to after sign-in. AuthPage reads the return path from router state
   * (NOT a query parameter), so it is passed as state.
   */
  signInFrom: string
}

const COPY: Record<
  Exclude<ReaderV2NotifyInviteVariant, 'hidden'>,
  { title: (fansubName: string) => string; body: string }
> = {
  signin: {
    title: (fansubName) => txa('{v1} ekibini takip et', { v1: fansubName }),
    get body() { return txa('Giris yaparsan yeni bolum ciktiginda haberin olur.') },
  },
  follow: {
    title: (fansubName) => txa('{v1} ekibini takip et', { v1: fansubName }),
    get body() { return txa('Yeni bolum ciktiginda ilk sen gor; bildirimi de ayni anda acalim.') },
  },
  push: {
    title: () => txa('Yeni bolum bildirimi acalim mi?'),
    get body() { return txa('Takip ettigin ekiplerin yeni bolumleri icin tarayici bildirimi al — site kapaliyken bile.') },
  },
  install: {
    title: () => txa('BSG Manga\'u ana ekranina ekle'),
    get body() { return txa('Safari\'de Paylas menusunden "Ana Ekrana Ekle"yi sec — yeni bolum bildirimleri iPhone/iPad\'de ancak boyle calisir.') },
  },
}

export function ReaderV2NotifyInvite({
  variant,
  fansubName,
  isBusy,
  onDismiss,
  onFollow,
  onEnableNotifications,
  signInFrom,
}: ReaderV2NotifyInviteProps) {
  const copy = COPY[variant]

  return (
    <section
      data-testid="reader-v2-end-notify"
      data-variant={variant}
      className="relative rounded-2xl border border-primary/25 bg-primary/[0.07] p-4 sm:p-5"
    >
      <button
        type="button"
        aria-label={txa('Daveti kapat')}
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded-full p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-3.5" />
      </button>

      <div className="flex items-center gap-3 pr-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          {variant === 'install' ? <Share className="size-5" /> : variant === 'push' ? <BellRing className="size-5" /> : <UserPlus className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{copy.title(fansubName)}</p>
          <p className="text-sm text-white/55">{copy.body}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {variant === 'signin' ? (
          <Button asChild className="gap-1.5 rounded-full font-bold">
            <Link to="/giris" state={{ from: signInFrom }} data-testid="reader-v2-end-notify-signin">
              <LogIn className="size-4" />{' '}{txa('Giris yap')}
            </Link>
          </Button>
        ) : null}

        {variant === 'follow' ? (
          <Button
            data-testid="reader-v2-end-notify-follow"
            disabled={isBusy}
            onClick={onFollow}
            className="gap-1.5 rounded-full font-bold"
          >
            <UserPlus className="size-4" />{' '}{txa('Takip et')}
          </Button>
        ) : null}

        {variant === 'push' ? (
          <Button
            data-testid="reader-v2-end-notify-push"
            disabled={isBusy}
            onClick={onEnableNotifications}
            className="gap-1.5 rounded-full font-bold"
          >
            <BellRing className="size-4" />{' '}{txa('Bildirimleri ac')}
          </Button>
        ) : null}

        <Button
          variant="ghost"
          onClick={onDismiss}
          className="rounded-full text-white/60 hover:text-white"
        >
          {variant === 'install' ? txa('Anladim') : txa('Simdi degil')}
        </Button>
      </div>
    </section>
  )
}

export default ReaderV2NotifyInvite
