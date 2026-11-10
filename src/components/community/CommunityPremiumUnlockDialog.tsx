import { Link } from '@/i18n/router'
import { Coins, Crown, Loader2, Sparkles } from 'lucide-react'
import type { CurrentUser } from '@/contexts/AuthContext'
import type { CommunityPremiumOffer } from './useCommunityPremiumUnlock'
import { resolveMyAccountStones } from '@/services/selfAccountEconomyService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { intlLocale, txa } from '@/i18n/activeLocale'

type CommunityPremiumUnlockDialogProps = {
  open: boolean
  currentUser: CurrentUser | null
  offer: CommunityPremiumOffer | null
  loading: boolean
  purchasing: boolean
  onOpenChange: (open: boolean) => void
  onPurchase: () => void
}

export default function CommunityPremiumUnlockDialog({
  open,
  currentUser,
  offer,
  loading,
  purchasing,
  onOpenChange,
  onPurchase,
}: CommunityPremiumUnlockDialogProps) {
  const premiumPrice = offer?.price ?? 0
  const currentUserStones = currentUser
    ? resolveMyAccountStones({
        userId: currentUser.id,
        fallbackStones: currentUser.stones ?? 0,
      })
    : 0
  const canAfford = currentUser ? currentUserStones >= premiumPrice : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(540px,calc(100vw-1rem))] max-w-[540px] overflow-hidden rounded-[28px] border-border/70 p-0 shadow-2xl"
        showCloseButton={false}
      >
        <div className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(124,58,237,0.14),rgba(59,130,246,0.06))] px-5 py-4">
          <DialogHeader className="gap-2 text-left">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                <Crown className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-[1.05rem] font-semibold text-foreground">{txa('Premium ile özel ifadeleri aç')}</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  {txa('Fansubların yüklediği emoji ve çıkartmaları kullanmak için Premium gerekir.')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 py-5">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {txa('Premium teklifi yükleniyor...')}
            </div>
          ) : !currentUser ? (
            <div className="space-y-4 rounded-3xl border border-border/60 bg-muted/20 p-5 text-center">
              <p className="text-sm font-medium text-foreground">{txa('Bu ifadeleri açmak için önce giriş yapmalısın.')}</p>
              <Button asChild className="rounded-full">
                <Link to="/giris">{txa('Giriş Yap')}</Link>
              </Button>
            </div>
          ) : !offer ? (
            <div className="space-y-4 rounded-3xl border border-border/60 bg-muted/20 p-5 text-center">
              <p className="text-sm font-medium text-foreground">{txa('Aktif Premium teklifi şu an hazır değil.')}</p>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/magaza/premium">{txa('Mağazayı aç')}</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-border/60 bg-card/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-foreground">{offer.name}</p>
                      <Badge className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {txa('Premium')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {offer.durationDays}{' '}{txa('gun premium; custom ifade kullanimi, profil ozellestirme ve erken bolum erisimi acar.')}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-primary/20 bg-primary/8 px-3 py-2 text-right">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{txa('Fiyat')}</p>
                    <p className="text-lg font-semibold text-foreground">{txa('{v1} Coin', { v1: premiumPrice.toLocaleString(intlLocale()) })}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{txa('Açılan')}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{txa('Emoji ve çıkartma kullanımı')}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{txa('Süre')}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{txa('{v1} gün Premium', { v1: offer.durationDays })}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{txa('Bölüm')}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{txa('Normal kullanıcıdan {v1} saat önce', { v1: offer.publicUnlockDelayHours })}</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/20 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{txa('Bakiye')}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{txa('{v1} Coin', { v1: currentUserStones.toLocaleString(intlLocale()) })}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-xs text-muted-foreground">
                  <Coins className="h-3.5 w-3.5" />
                  {canAfford ? txa('Yeterli bakiye') : txa('Yetersiz bakiye')}
                </span>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 px-5 py-4 sm:justify-between">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            {txa('Kapat')}
          </Button>
          {currentUser && offer ? (
            <Button
              type="button"
              className="rounded-full"
              disabled={purchasing || !canAfford || !offer.purchasable}
              onClick={onPurchase}
            >
              {purchasing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {txa('Satın alınıyor...')}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {txa('Premium satın al')}
                </>
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
