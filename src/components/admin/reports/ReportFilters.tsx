import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import type { ReportFiltersState } from './reportManagementModel'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface ReportFiltersProps {
  filters: ReportFiltersState
  resultCount: number
  onChange: (filters: ReportFiltersState) => void
  onReset: () => void
}

export function ReportFilters({
  filters,
  resultCount,
  onChange,
  onReset,
}: ReportFiltersProps) {
  const update = <Key extends keyof ReportFiltersState>(key: Key, value: ReportFiltersState[Key]) => {
    onChange({ ...filters, [key]: value })
  }

  return (
    <AdminSurface className="p-3">
      {/* Sarmalanan satir: her filtre kendi genisliginde, metin kesilmez. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={filters.search}
            onChange={(event) => update('search', event.target.value)}
            placeholder={txa('Sebep, açıklama veya kullanıcı ara...')}
            className="h-10 pl-9"
            aria-label={txa('Raporlarda ara')}
          />
        </div>

        <Select value={filters.targetType} onValueChange={(value) => update('targetType', value as ReportFiltersState['targetType'])}>
          <SelectTrigger className="h-10 w-auto" aria-label={txa('Rapor tipi')}>
            <SelectValue placeholder={txa('Tip')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{txa('Tüm tipler')}</SelectItem>
            <SelectItem value="manga_comment">{txa('Manga yorumu')}</SelectItem>
            <SelectItem value="manga_list_comment">{txa('Liste yorumu')}</SelectItem>
            <SelectItem value="user">{txa('Kullanıcı')}</SelectItem>
            <SelectItem value="manga">{txa('Manga')}</SelectItem>
            <SelectItem value="chapter">{txa('Manga bölümü')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(value) => update('status', value as ReportFiltersState['status'])}>
          <SelectTrigger className="h-10 w-auto" aria-label={txa('Rapor durumu')}>
            <SelectValue placeholder={txa('Durum')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{txa('Tüm durumlar')}</SelectItem>
            <SelectItem value="pending">{txa('Beklemede')}</SelectItem>
            <SelectItem value="resolved">{txa('Çözüldü')}</SelectItem>
            <SelectItem value="dismissed">{txa('Yoksayıldı')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.targetGroup} onValueChange={(value) => update('targetGroup', value as ReportFiltersState['targetGroup'])}>
          <SelectTrigger className="h-10 w-auto" aria-label={txa('Rapor hedefi')}>
            <SelectValue placeholder={txa('Hedef')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{txa('Tüm hedefler')}</SelectItem>
            <SelectItem value="manga">{txa('Manga')}</SelectItem>
            <SelectItem value="lists">{txa('Listeler')}</SelectItem>
            <SelectItem value="users">{txa('Kullanıcılar')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.risk} onValueChange={(value) => update('risk', value as ReportFiltersState['risk'])}>
          <SelectTrigger className="h-10 w-auto" aria-label={txa('Risk seviyesi')}>
            <SelectValue placeholder={txa('Risk')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{txa('Tüm riskler')}</SelectItem>
            <SelectItem value="high">{txa('Yüksek')}</SelectItem>
            <SelectItem value="medium">{txa('Orta')}</SelectItem>
            <SelectItem value="low">{txa('Düşük')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.dateRange} onValueChange={(value) => update('dateRange', value as ReportFiltersState['dateRange'])}>
          <SelectTrigger className="h-10 w-auto" aria-label={txa('Tarih aralığı')}>
            <SelectValue placeholder={txa('Tarih')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{txa('Tüm tarihler')}</SelectItem>
            <SelectItem value="today">{txa('Son 24 Saat')}</SelectItem>
            <SelectItem value="7d">{txa('Son 7 Gün')}</SelectItem>
            <SelectItem value="30d">{txa('Son 30 Gün')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.sort} onValueChange={(value) => update('sort', value as ReportFiltersState['sort'])}>
          <SelectTrigger className="h-10 w-auto" aria-label={txa('Rapor sıralaması')}>
            <SelectValue placeholder={txa('Sırala')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{txa('En yeni')}</SelectItem>
            <SelectItem value="oldest">{txa('En eski')}</SelectItem>
            <SelectItem value="risk">{txa('En riskli')}</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 text-muted-foreground"
          title={txa('Filtreleri temizle')}
          aria-label={txa('Filtreleri temizle')}
          onClick={onReset}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <p className="sr-only" role="status">{txa('{v1} rapor listeleniyor.', { v1: resultCount.toLocaleString(intlLocale()) })}</p>
    </AdminSurface>
  )
}
