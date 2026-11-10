import { useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowRight, Check, Clock, Crown, PaintBrush, Sparkle } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getActivePremiumOffer } from '@/services/premiumPackagePublicService'

import { getPremiumCardState } from './desktop/premiumCardState'
import { useTx } from '@/i18n/LocaleProvider'
import { intlLocale, txa } from '@/i18n/activeLocale'

type Offer = NonNullable<Awaited<ReturnType<typeof getActivePremiumOffer>>['data']>
/** Desktop home offer: price, duration and access come from the real offer. */
export function HomePremiumCard() {
  const { currentUser, loading } = useAuth()
  const [offer, setOffer] = useState<Offer | null>(null)
  const [open, setOpen] = useState(false)
  const tx = useTx()
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    let cancelled = false
    void getActivePremiumOffer().then(result => { if (!cancelled) setOffer(result.error ? null : result.data) }).catch(() => { if (!cancelled) setOffer(null) })
    return () => { cancelled = true }
  }, [])
  const state = getPremiumCardState(currentUser?.premiumExpiresAt, now)
  if (loading || !offer || state.kind === 'hidden') return null
  const active = state.kind === 'expiring'
  const features = [tx('{hours} saat erken erişim', { hours: offer.publicUnlockDelayHours }), tx('Profil isim stili ve arka plan'), tx('Fansub emoji ve çıkartmaları')]
  const perks = [
    { icon: Clock, title: tx('Hikâyenin devamını önce oku'), text: tx('Erken erişimli bölümlere genel yayından {hours} saat önce eriş.', { hours: offer.publicUnlockDelayHours }) },
    { icon: PaintBrush, title: tx('Profiline kendi tarzını kat'), text: tx('Premium isim stili ve özel arka planla profilini kişiselleştir.') },
    { icon: Sparkle, title: tx('Topluluğunla kendini ifade et'), text: tx('Fansub emoji ve çıkartmalarını kullan.') },
    { icon: Crown, title: tx('{days} gün Premium', { days: offer.durationDays }), text: tx('Üyelik hakları, Premium süren boyunca hesabında geçerlidir.') },
  ]
  return <>
    <button type="button" data-testid="desktop-home-premium" className="dh-premium-mini" onClick={() => setOpen(true)}>
      <span className="dh-premium-brand">BSG<span>MANGA</span></span><strong>PREMIUM</strong>
      <span className="dh-premium-features">{active && <span><Clock size={12} />{tx('Premium sürenin bitmesine {days} gün kaldı.', { days: state.days })}</span>}{(!active ? features : []).map(feature => <span key={feature}><Check size={12} />{feature}</span>)}</span>
      <span className="dh-premium-cta">{active ? tx('Premium’u yenile') : tx("Premium'a Geç")}<ArrowRight size={14} /></span>
    </button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="dh-premium-modal sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
      <DialogHeader><span className="dh-premium-eyebrow"><Crown weight="fill" /> {txa('BSG MANGA PREMIUM')}</span><DialogTitle className="dh-premium-title">{tx('Hikâyeye bir adım önden katıl.')}</DialogTitle><DialogDescription>{tx('Sevdiğin serilere erken eriş, profilini kişiselleştir.')}</DialogDescription></DialogHeader>
      <div className="dh-premium-perks">{perks.map(perk => <div key={perk.title}><perk.icon size={22} /><h3>{perk.title}</h3><p>{perk.text}</p></div>)}</div>
      <div className="dh-premium-offer"><div><strong>{typeof offer.premiumItem.price === 'number' ? offer.premiumItem.price.toLocaleString(intlLocale()) : '—'} <small>{txa('Coin')}</small></strong><p>{tx('{days} gün üyelik', { days: offer.durationDays })}</p></div><Link to="/magaza/premium" onClick={() => setOpen(false)} className="dh-premium-cta">{active ? tx('Üyeliği yönet') : tx('Mağazada incele')}<ArrowRight size={16} /></Link></div>
      <p className="text-xs leading-5 text-muted-foreground">{tx('Haklar üyelik süresince geçerlidir. Satın alma ve bakiye kontrolü mağazada yapılır.')}</p>
    </DialogContent></Dialog>
  </>
}
