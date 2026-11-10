import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Coins,
  Gift,
  Package,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type {
  AdminFansubInventoryItem,
  AdminFansubTransactionRecord,
  AdminFansubTransactionTypeFilter,
} from '@/services/adminService'
import {
  TRANSACTION_TYPE_OPTIONS,
  coinAmountText,
  dateTimeText,
  renderInventoryStoreItemPreview,
  transactionTypeText,
} from './fansubManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubEconomyTabProps {
  coinBalance: number
  inventoryTotal: number
  transactionTotal: number
  inventorySearchInput: string
  onInventorySearchInputChange: (value: string) => void
  inventoryPage: number
  inventoryPageTotal: number
  inventoryLoading: boolean
  inventoryError: string | null
  inventory: AdminFansubInventoryItem[]
  onInventoryPrevPage: () => void
  onInventoryNextPage: () => void
  transactionSearchInput: string
  onTransactionSearchInputChange: (value: string) => void
  transactionType: AdminFansubTransactionTypeFilter
  onTransactionTypeChange: (value: AdminFansubTransactionTypeFilter) => void
  transactionPage: number
  transactionPageTotal: number
  transactionLoading: boolean
  transactionError: string | null
  transactions: AdminFansubTransactionRecord[]
  onTransactionPrevPage: () => void
  onTransactionNextPage: () => void
}

// ── Economy tab ──
// Summary cards + inventory table + transaction history table
export function FansubEconomyTab({
  coinBalance,
  inventoryTotal,
  transactionTotal,
  inventorySearchInput,
  onInventorySearchInputChange,
  inventoryPage,
  inventoryPageTotal,
  inventoryLoading,
  inventoryError,
  inventory,
  onInventoryPrevPage,
  onInventoryNextPage,
  transactionSearchInput,
  onTransactionSearchInputChange,
  transactionType,
  onTransactionTypeChange,
  transactionPage,
  transactionPageTotal,
  transactionLoading,
  transactionError,
  transactions,
  onTransactionPrevPage,
  onTransactionNextPage,
}: FansubEconomyTabProps) {
  const incomingAmount = transactions.reduce((sum, row) => sum + Math.max(0, row.amount), 0)
  const outgoingAmount = transactions.reduce((sum, row) => sum + Math.abs(Math.min(0, row.amount)), 0)
  const donationAmount = transactions
    .filter((row) => row.type === 'donation')
    .reduce((sum, row) => sum + Math.max(0, row.amount), 0)

  return (
    <div className="space-y-3">
      {/* Özet kartları */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <EconomySummaryCard
          icon={Coins}
          label={txa('Coin bakiyesi')}
          value={coinBalance.toLocaleString(intlLocale())}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
        />
        <EconomySummaryCard
          icon={Package}
          label={txa('Toplam envanter')}
          value={String(inventoryTotal)}
          color="text-sky-400"
          bgColor="bg-sky-500/10"
        />
        <EconomySummaryCard
          icon={ArrowLeftRight}
          label={txa('Toplam İşlem')}
          value={String(transactionTotal)}
          color="text-violet-400"
          bgColor="bg-violet-500/10"
        />
        <EconomySummaryCard
          icon={TrendingUp}
          label={txa('Gelen coin')}
          value={incomingAmount.toLocaleString(intlLocale())}
          helper={txa('Bu sayfadaki akış')}
          color="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />
        <EconomySummaryCard
          icon={Gift}
          label={txa('Bağış')}
          value={donationAmount.toLocaleString(intlLocale())}
          helper={txa('Bu sayfadaki bağışlar')}
          color="text-rose-500"
          bgColor="bg-rose-500/10"
        />
        <EconomySummaryCard
          icon={TrendingDown}
          label={txa('Giden coin')}
          value={outgoingAmount.toLocaleString(intlLocale())}
          helper={txa('Bu sayfadaki akış')}
          color="text-sky-500"
          bgColor="bg-sky-500/10"
        />
      </div>

      {/* ── Envanter Tablosu ── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <h4 className="text-sm font-bold text-foreground">{txa('Sahip Olunan Ürünler')}</h4>
          <Badge variant="secondary" className="text-[10px]">{txa('{v1} kayıt', { v1: inventoryTotal })}</Badge>
        </div>
        <div className="p-3">
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={txa('Ürün veya alan kişi ara...')}
              value={inventorySearchInput}
              onChange={(e) => onInventorySearchInputChange(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {inventoryLoading ? (
            <p className="py-5 text-center text-xs text-muted-foreground">{txa('Yükleniyor...')}</p>
          ) : inventoryError ? (
            <p className="py-5 text-center text-xs text-muted-foreground">{inventoryError}</p>
          ) : inventory.length === 0 ? (
            <p className="py-5 text-center text-xs text-muted-foreground">{txa('Kayıt bulunamadı.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Ürün')}</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Tip')}</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Durum')}</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Alım Tarihi')}</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Alan')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inventory.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {renderInventoryStoreItemPreview(row.storeItem)}
                          <div className="min-w-0">
                            <strong className="block truncate text-xs font-semibold text-foreground">{row.storeItem?.name || row.storeItemId}</strong>
                            <span className="block text-[10px] text-muted-foreground">{row.storeItem?.identifier || row.storeItemId}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.storeItem?.type || '-'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.storeItem?.isActive === false ? 'destructive' : 'default'} className="text-[10px]">
                          {row.storeItem?.isActive === false ? txa('Pasif') : txa('Aktif')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{dateTimeText(row.acquiredAt)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.acquiredByUser?.username || row.acquiredByUserId || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{txa('Sayfa {v1}/{v2}', { v1: inventoryPage, v2: inventoryPageTotal })}</span>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={inventoryPage <= 1 || inventoryLoading} onClick={onInventoryPrevPage}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={inventoryPage >= inventoryPageTotal || inventoryLoading} onClick={onInventoryNextPage}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── İşlem Geçmişi Tablosu ── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <h4 className="text-sm font-bold text-foreground">{txa('Coin İşlem Geçmişi')}</h4>
          <Badge variant="secondary" className="text-[10px]">{txa('{v1} işlem', { v1: transactionTotal })}</Badge>
        </div>
        <div className="p-3">
          <div className="mb-3 flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={txa('Açıklama / ürün / oluşturan ara...')}
                value={transactionSearchInput}
                onChange={(e) => onTransactionSearchInputChange(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {TRANSACTION_TYPE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={transactionType === option.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2.5 text-[11px]"
                  onClick={() => onTransactionTypeChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {transactionLoading ? (
            <p className="py-5 text-center text-xs text-muted-foreground">{txa('Yükleniyor...')}</p>
          ) : transactionError ? (
            <p className="py-5 text-center text-xs text-muted-foreground">{transactionError}</p>
          ) : transactions.length === 0 ? (
            <p className="py-5 text-center text-xs text-muted-foreground">{txa('Kayıt bulunamadı.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Tarih')}</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Tip')}</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Tutar')}</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Açıklama')}</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Ürün')}</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Oluşturan')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{dateTimeText(row.createdAt)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{transactionTypeText(row.type)}</td>
                      <td className="px-3 py-2 text-right">
                        <strong className={cn(
                          'text-xs font-semibold',
                          row.amount >= 0 ? 'text-emerald-400' : 'text-rose-400',
                        )}>
                          {coinAmountText(row.amount)}
                        </strong>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-xs text-muted-foreground">{row.description || '-'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.relatedItem?.name || row.relatedItemId || '-'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.createdByUser?.username || row.createdByUserId || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{txa('Sayfa {v1}/{v2}', { v1: transactionPage, v2: transactionPageTotal })}</span>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={transactionPage <= 1 || transactionLoading} onClick={onTransactionPrevPage}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={transactionPage >= transactionPageTotal || transactionLoading} onClick={onTransactionNextPage}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Economy summary card ──
function EconomySummaryCard({
  icon: Icon,
  label,
  value,
  helper,
  color,
  bgColor,
}: {
  icon: React.ElementType
  label: string
  value: string
  helper?: string
  color: string
  bgColor: string
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-2.5">
      <div className={`mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg ${bgColor}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <strong className="block text-base font-bold text-foreground tabular-nums">{value}</strong>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">{label}</span>
      {helper ? <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{helper}</span> : null}
    </article>
  )
}
