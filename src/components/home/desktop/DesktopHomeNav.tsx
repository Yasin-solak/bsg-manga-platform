import { LocaleSwitchLink, NavLink } from '@/i18n/router'
import { useT } from '@/i18n/LocaleProvider'
import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { formatShopNavRemaining, useShopNavSignal, type ShopNavBadge } from '@/components/layout/useShopNavSignal'
import { EXPLORE_PATH } from '@/lib/routes'
// A small, colorless label on the right when the shop has a campaign / discount / season / deal of the day.
function ShopNavLink({ badge }: { badge: ShopNavBadge | null }) {
  const t = useT()
  const remaining = badge ? formatShopNavRemaining(badge.endsAt) : null
  return (
    <NavLink to="/magaza" title={badge ? (remaining ? t('nav.shopRemaining', { detail: badge.detail, remaining }) : badge.detail) : undefined} data-shop-nav-signal={badge ? 'true' : undefined}>
      {t('nav.shop')}
      {badge && <small className="dh-nav-shop-tag">{badge.label}</small>}
    </NavLink>
  )
}

export function DesktopHomeNav({ username, todayCount }: { username?: string; todayCount: number }) {
  const { enabled: communityEnabled } = useCommunityAvailability()
  const shopBadge = useShopNavSignal()
  const t = useT()
  const groups = [
    { label: t('nav.group.browse'), items: [['/', t('nav.home')], [EXPLORE_PATH, t('nav.explore')], ['/yayin-takvimi', t('nav.calendar')], ['/listeler', t('nav.lists')]] },
    { label: t('nav.group.library'), items: [['/kutuphane', t('nav.library')], [username ? `/profil/${encodeURIComponent(username)}` : '/giris', t('nav.myProfile')]] },
    { label: t('nav.group.community'), items: [['/fansublar', t('nav.fansubs')], ['/topluluk', t('nav.community')], ['/magaza', t('nav.shop')]] },
    { label: t('nav.group.fun'), items: [['/oyunlar', t('nav.games')], ['/sans', t('nav.lucky')]] },
  ]
  return <nav className="dh-nav" aria-label={t('nav.main')}>{groups.map(group => <div key={group.label}><h2>{group.label}</h2>{group.items.filter(([to]) => communityEnabled || to !== '/topluluk').map(([to, label]) => to === '/magaza' ? <ShopNavLink key={to} badge={shopBadge} /> : <NavLink key={to} to={to} end={to === "/"}>{label}{to === '/yayin-takvimi' && todayCount > 0 && <small>{t('nav.today', { count: todayCount })}</small>}</NavLink>)}</div>)}<div><LocaleSwitchLink /></div></nav>
}
