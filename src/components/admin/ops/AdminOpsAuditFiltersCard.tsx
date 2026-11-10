import { RefreshCw } from 'lucide-react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface AdminOpsAuditFiltersCardProps {
  auditSearch: string
  auditActionFilter: string
  auditResourceFilter: string
  auditLimit: number
  auditActions: string[]
  auditResourceTypes: string[]
  auditLoading: boolean
  /** Islem dagilimi: en cok gorulen islemler, tiklanabilir. */
  actionsOpen: boolean
  actionCounts: Array<{ action: string; count: number }>
  onPickAction: (action: string) => void
  onAuditSearchChange: (value: string) => void
  onAuditActionFilterChange: (value: string) => void
  onAuditResourceFilterChange: (value: string) => void
  onAuditLimitChange: (value: number) => void
  onRefresh: () => void
  onReset: () => void
}

const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm'

export function AdminOpsAuditFiltersCard({
  auditSearch,
  auditActionFilter,
  auditResourceFilter,
  auditLimit,
  auditActions,
  auditResourceTypes,
  auditLoading,
  actionsOpen,
  actionCounts,
  onPickAction,
  onAuditSearchChange,
  onAuditActionFilterChange,
  onAuditResourceFilterChange,
  onAuditLimitChange,
  onRefresh,
  onReset,
}: AdminOpsAuditFiltersCardProps) {
  return (
    <AdminSurface className="p-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          type="text"
          value={auditSearch}
          onChange={(event) => onAuditSearchChange(event.target.value)}
          placeholder={txa('İşlem, kaynak ya da özet ara…')}
          aria-label={txa('Denetim kaydinda ara')}
        />
        <select
          value={auditActionFilter}
          onChange={(event) => onAuditActionFilterChange(event.target.value)}
          className={selectClass}
          aria-label={txa('İşlem filtresi')}
        >
          <option value="all">{txa('Tüm işlemler')}</option>
          {auditActions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        <select
          value={auditResourceFilter}
          onChange={(event) => onAuditResourceFilterChange(event.target.value)}
          className={selectClass}
          aria-label={txa('Kaynak tipi filtresi')}
        >
          <option value="all">{txa('Tüm kaynak türleri')}</option>
          {auditResourceTypes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={String(auditLimit)}
          onChange={(event) => onAuditLimitChange(Number(event.target.value))}
          className={selectClass}
          aria-label={txa('Cekim limiti')}
        >
          <option value="60">{txa('60 kayıt')}</option>
          <option value="120">{txa('120 kayıt')}</option>
          <option value="240">{txa('240 kayıt')}</option>
          <option value="400">{txa('400 kayıt')}</option>
        </select>
      </div>

      {/*
        Dugmeler SAGDA ve YAN YANA. Onceki halde `sm:flex-col sm:items-stretch`
        vardi: genis ekranda ikisi de tam genislikte alt alta diziliyor, kartin
        yarisini kapliyordu. Dar ekranda alt alta inmeleri dogru, genis ekranda
        degil — kosul tersine cevrildi.
      */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onReset} disabled={auditLoading}>
          {txa('Filtreyi temizle')}
        </Button>
        <Button onClick={onRefresh} disabled={auditLoading}>
          <RefreshCw
            className={cn('mr-1.5 size-3.5', auditLoading && 'animate-spin')}
            aria-hidden="true"
          />
          {auditLoading ? txa('Yükleniyor…') : txa('Filtreyi uygula')}
        </Button>
      </div>

      {/*
        Islem dagilimi acilir listeye alternatif DEGIL, tamamlayici: acilir
        listede "hangi islem ne kadar oldu" gorunmez. Chip'e basmak filtreyi
        uygular ve veriyi HEMEN ceker; secip "Uygula"ya basmayi beklemek,
        tiklamanin hicbir sey yapmadigi izlenimi verirdi.
      */}
      {actionsOpen ? (
        <div
          className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3"
          data-testid="admin-ops-audit-action-chips"
        >
          {actionCounts.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">
              {txa('Cekilen kayitlarda islem yok.')}
            </span>
          ) : (
            actionCounts.map(({ action, count }) => {
              const active = auditActionFilter === action
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => onPickAction(active ? 'all' : action)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors',
                    active
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <code className="bg-transparent p-0 text-[11px]">{action}</code>
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </AdminSurface>
  )
}
