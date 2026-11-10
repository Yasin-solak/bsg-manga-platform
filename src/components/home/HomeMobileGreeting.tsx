import { Link } from '@/i18n/router'
import { ChevronRight, Shuffle, Gamepad2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTx } from '@/i18n/LocaleProvider'
import { txa } from '@/i18n/activeLocale'

/**
 * Mobile home greeting (design handoff pattern).
 *
 * On desktop the sidebar shows who is signed in; on mobile the sidebar is closed, so it was
 * unclear "whose" page this is. The greeting says so, and the two shortcuts next to it surface
 * the two most wanted things on mobile:
 * balance and a random series.
 *
 * **Only below `lg` and only WHEN SIGNED IN.** Saying "good evening, @nobody" to a guest
 * is meaningless; what a guest should see on the home page is the
 * catalog, not a greeting.
 */

/** A greeting by time of day; a fixed "welcome" says the same thing at every hour. */
function greetingFor(hour: number): string {
  if (hour < 6) return txa('İyi geceler')
  if (hour < 12) return txa('Günaydın')
  if (hour < 18) return txa('İyi günler')
  return txa('İyi akşamlar')
}

interface HomeMobileGreetingProps {
  /** UNREAD chapter count in followed series; no strip if 0. */
  newChapterCount?: number
  /** Serit uzerindeki kapaklar (en fazla 3). */
  covers?: string[]
  /** Tapping the strip narrows the feed to following+unread. */
  onFocusUnread?: () => void
}

export function HomeMobileGreeting({
  newChapterCount = 0,
  covers = [],
  onFocusUnread,
}: HomeMobileGreetingProps) {
  const { currentUser } = useAuth()
  const tx = useTx()
  if (!currentUser) return null

  return (
    <section
      className="mb-4 flex items-center gap-3"
      data-testid="home-mobile-greeting"
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-lg font-black tracking-tight text-foreground">
          {greetingFor(new Date().getHours())}, @{currentUser.username}
        </p>
        {/*
          Sayi bir IDDIA degil KAPI: dokununca hangi bolumler oldugunu
          gosteriyor. Sadece metin birakmak "12 bölüm var" deyip nerede
          oldugunu kullaniciya arattirmak olurdu.
          Sayi 0 ise serit hic basilmaz — sifir gostermek bos bir satir
          kaplamaktan baska is yapmaz.
        */}
        {newChapterCount > 0 ? (
          <button
            type="button"
            onClick={onFocusUnread}
            className="mt-1 flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2.5"
            data-testid="home-unread-strip"
          >
            {covers.length > 0 ? (
              <span className="flex -space-x-2">
                {covers.slice(0, 3).map((cover, index) => (
                  <img
                    key={cover}
                    src={cover}
                    alt=""
                    loading="lazy"
                    className="size-6 rounded-full border-2 border-card object-cover"
                    style={{ zIndex: 3 - index }}
                  />
                ))}
              </span>
            ) : null}
            <span className="text-xs font-bold text-foreground">
              {tx('{count} yeni bölüm', { count: newChapterCount })}
            </span>
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <Link
        to="/sans"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground"
      >
        <Shuffle className="size-3.5 text-primary" aria-hidden="true" />
        {tx('Şans')}
      </Link>
      <Link
        to="/oyunlar"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground"
      >
        <Gamepad2 className="size-3.5 text-primary" aria-hidden="true" />
        {tx('Oyunlar')}
      </Link>
    </section>
  )
}
