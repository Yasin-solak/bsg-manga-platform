import { NavLink } from '@/i18n/router'
import { useT } from '@/i18n/LocaleProvider'
import { Compass, Home, MessageSquare, ShoppingBag, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { EXPLORE_PATH } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * Mobile bottom tab bar.
 *
 * Until now the only navigation surface for phone visitors was the hamburger in the top bar:
 * each move took two taps (open menu, choose) and the panel was the same as the
 * desktop sidebar. The five main surfaces now take one tap.
 *
 * **Only below `lg`.** On desktop the sidebar stays; showing two navigation surfaces
 * at once would weaken both.
 *
 * **Shell exceptions apply by themselves:** this component renders in `Layout`'s chrome
 * branch. Reader / admin / fansub studio / onboarding routes return BEFORE that branch,
 * so the bar does not overlap full-screen pages. Keeping a separate route exception list
 * would risk it drifting from `shouldUseChrome` one day.
 *
 * **Visible to guests too** (product decision): Explore/Shop are public;
 * Community depends on the public flag. The Profile tab goes to sign-in. Locking navigation behind
 * membership would hinder "browse the site", the only job before signup.
 */

interface TabItem {
  to: string
  label: string
  icon: typeof Home
  /** `/` fits every path as a prefix; only an exact match counts. */
  exact?: boolean
  /** Profil sekmesi ikon yerine avatar basar. */
  avatar?: boolean
}

export function MobileTabBar() {
  const { currentUser } = useAuth()
  const t = useT()
  const { enabled: communityEnabled } = useCommunityAvailability()

  const profilePath = currentUser?.username
    ? `/profil/${encodeURIComponent(currentUser.username)}`
    : '/giris'

  const items: TabItem[] = [
    { to: '/', label: t('nav.home'), icon: Home, exact: true },
    { to: EXPLORE_PATH, label: t('nav.explore'), icon: Compass },
    { to: profilePath, label: t('nav.profile'), icon: User, avatar: Boolean(currentUser) },
    { to: '/topluluk', label: t('nav.community'), icon: MessageSquare },
    { to: '/magaza', label: t('nav.shop'), icon: ShoppingBag },
  ]

  /*
   * Activeness comes from NavLink's OWN match; writing a separate `isActive`
   * function created two sources. NavLink already sets `aria-current` by its own
   * calculation, so a handwritten function only drove the color, not
   * the info going to screen readers, which is why a mutation test
   * (make Home active on every path) did not catch it.
   *
   * Prefix matching is the WANTED behavior on the others: on a /topluluk/... subpage,
   * if the tab dims the user loses where they are.
   *
   * `end` is on for Home, but in react-router 7 it is already NON-FUNCTIONAL for the root path:
   * the match needs `charAt(toPathname.length) === '/'`, and for `/` that position holds
   * "k" (kesfet), so `/` fits no path as a prefix.
   * It stays anyway: it shows intent and keeps correct behavior if Home's path ever
   * stops being the root.
   */

  return (
    <nav
      // pb: safe area for the iPhone bottom bar; a fixed value does not cover this gap,
      // which varies by device.
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-md lg:hidden',
        'pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2',
      )}
      aria-label={t('nav.mobile')}
      data-testid="mobile-tab-bar"
    >
      <div className={cn('grid', communityEnabled ? 'grid-cols-5' : 'grid-cols-4')}>
        {items.filter(item => communityEnabled || item.to !== '/topluluk').map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[52px] flex-col items-center justify-center gap-1 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.avatar && currentUser?.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt=""
                      className={cn(
                        'size-7 rounded-full border-2 object-cover',
                        isActive ? 'border-primary' : 'border-border',
                      )}
                    />
                  ) : (
                    <Icon
                      className="size-[22px]"
                      strokeWidth={isActive ? 2.5 : 2}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(
                      'text-[10.5px] leading-none',
                      isActive ? 'font-extrabold' : 'font-semibold',
                    )}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
