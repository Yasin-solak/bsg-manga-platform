import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from '@/i18n/router'
import { useAuth } from '@/contexts/AuthContext'
import { getActivePremiumOffer, isPremiumActive } from '@/services/premiumPackagePublicService'
import { txa } from '@/i18n/activeLocale'

/**
 * Sidebar Premium card. Perks and duration come from the real offer;
 * if there is no offer or the member is already Premium, no card is shown.
 */
export function PremiumPromoCard() {
  const { currentUser } = useAuth()
  const [offer, setOffer] = useState<Awaited<ReturnType<typeof getActivePremiumOffer>>['data']>(null)
  useEffect(() => {
    let cancelled = false
    void getActivePremiumOffer()
      .then((result) => { if (!cancelled) setOffer(result.error ? null : result.data) })
      .catch(() => { if (!cancelled) setOffer(null) })
    return () => { cancelled = true }
  }, [])

  if (!offer || isPremiumActive(currentUser?.premiumExpiresAt)) return null

  return (
    <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-amber-500/10 p-4">
      <p className="text-base font-black tracking-tight">
        BSG <span className="text-primary">MANGA</span>
      </p>
      <p className="mt-2 text-lg font-black text-amber-500">PREMIUM</p>
      <ul className="mt-3 flex flex-col gap-2 text-xs font-medium text-foreground/80">
        <li>{txa('{hours} saat erken erişim', { hours: offer.publicUnlockDelayHours })}</li>
        <li>{txa('Profil isim stili ve arka plan')}</li>
        <li>{txa('Fansub emoji ve çıkartmaları')}</li>
      </ul>
      <Link
        to="/magaza/premium"
        className="mt-4 flex items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
      >
        {txa("Premium'a Geç")} <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}
