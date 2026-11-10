import { forwardRef } from 'react'
import { useNavigate } from '@/i18n/router'
import { ArrowRight } from 'lucide-react'
import type { SecurityRedeemAnomalyItem } from '@/services/adminSecurityService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  formatDateTime,
  userStatusBadgeClass,
} from './adminOpsSecurityUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminOpsSecurityAnomalyTableCardProps {
  anomalyLoading: boolean
  anomalyError: string | null
  anomalies: SecurityRedeemAnomalyItem[]
  /** Basliktaki cerceve; liste hangi pencere/esikten geldigini SOYLEMELI. */
  windowHours: number
  minCount: number
}

export const AdminOpsSecurityAnomalyTableCard = forwardRef<
  HTMLElement,
  AdminOpsSecurityAnomalyTableCardProps
>(function AdminOpsSecurityAnomalyTableCard(
  { anomalyLoading, anomalyError, anomalies, windowHours, minCount },
  ref,
) {
  const navigate = useNavigate()

  return (
    <AdminSurface ref={ref} className="p-4" data-testid="admin-ops-security-anomaly">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="m-0 font-heading text-base text-foreground">{txa('Redeem anomaly izleme')}</h2>
          <Badge variant="outline" className="rounded-lg tabular-nums">
            {anomalies.length}
          </Badge>
        </div>
        {/* Esik gorunur olmali: "supheli" bir yargi degil, bir SAYAC esigi.
            Kacinci aktivasyondan sonra listeye girildigi yazmazsa liste
            keyfi gorunur. */}
        <span className="text-[11px] text-muted-foreground">
          {txa('Son {v1} saat · {v2}+ aktivasyon', { v1: windowHours, v2: minCount })}
        </span>
      </div>
      {anomalyLoading ? (
        <p className="text-sm text-muted-foreground">{txa('Anomaliler yükleniyor…')}</p>
      ) : anomalyError ? (
        <p className="text-sm text-muted-foreground">{anomalyError}</p>
      ) : anomalies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {txa('Bu pencerede {v1}+ aktivasyon yapan hesap yok.', { v1: minCount })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-border text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2 pr-2 font-semibold">{txa('Kullanıcı')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Toplam')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Kisisel Kasa')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Fansub Kasa')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Son kullanım')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Durum')}</th>
                <th className="py-2 pr-2 font-semibold sr-only">{txa('İşlem')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {anomalies.map((item) => (
                <tr key={item.userId}>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={item.avatarUrl}
                        alt={item.username}
                        loading="lazy"
                        className="h-8 w-8 rounded-full border-2 border-border object-cover"
                      />
                      <div>
                        <strong className="block text-[13px] leading-tight">
                          {item.username}
                        </strong>
                        <small className="block break-all text-[11px] text-muted-foreground">
                          {item.userId}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-2 tabular-nums">
                    {item.totalRedemptions.toLocaleString(intlLocale())}
                  </td>
                  <td className="py-2 pr-2 tabular-nums">
                    {item.userWalletRedemptions.toLocaleString(intlLocale())}
                  </td>
                  <td className="py-2 pr-2 tabular-nums">
                    {item.fansubWalletRedemptions.toLocaleString(intlLocale())}
                  </td>
                  <td className="py-2 pr-2">{formatDateTime(item.lastRedeemedAt)}</td>
                  <td className="py-2 pr-2">
                    <Badge
                      variant="outline"
                      className={cn('font-bold', userStatusBadgeClass(item.isBanned))}
                    >
                      {item.isBanned ? txa('Banli') : txa('Aktif')}
                    </Badge>
                  </td>
                  <td className="py-2 pr-2 text-right">
                    {/*
                      Supheli hesabin yaninda YAPILACAK SEY olmali. Onceki halde
                      liste bir raporlama ekraniydi: adi okuyup kullanicilar
                      sekmesine gidip elle aratmak gerekiyordu. `?q=` ile arama
                      karsi tarafta hazir gelir.
                    */}
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/admin/kullanicilar?q=${encodeURIComponent(item.username)}`)
                      }
                      className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold text-primary hover:underline"
                    >
                      {txa('Hesabi ac')}
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminSurface>
  )
})
