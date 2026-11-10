import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { AdminFilterGroup, type AdminFilterOption } from '@/components/admin/shared/AdminFilterGroup'
import { AdminOverflowMenu } from '@/components/admin/shared/AdminOverflowMenu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Search, ChevronLeft, ChevronRight, Eye, BookOpen, CheckCircle2, CirclePause, TrendingUp } from 'lucide-react'
import type { AdminManagedManga, AdminStatusFilter } from '@/services/adminService'
import { dateText } from './fansubManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubMangasTabProps {
  searchInput: string
  onSearchInputChange: (value: string) => void
  mangaStatus: AdminStatusFilter
  onMangaStatusChange: (status: AdminStatusFilter) => void
  total: number
  page: number
  pageTotal: number
  loading: boolean
  error: string | null
  mangas: AdminManagedManga[]
  mangaBusyId: string | null
  onToggleMangaActive: (manga: AdminManagedManga) => void
  onPrevPage: () => void
  onNextPage: () => void
}

const STATUS_OPTIONS: AdminFilterOption<AdminStatusFilter>[] = [
  { value: 'all', get label() { return txa('Tümü') } },
  { value: 'active', get label() { return txa('Aktif') } },
  { value: 'inactive', get label() { return txa('Pasif') } },
]

// ── Manga tab ──
// Manga list with a cover image table and a status filter
export function FansubMangasTab({
  searchInput,
  onSearchInputChange,
  mangaStatus,
  onMangaStatusChange,
  total,
  page,
  pageTotal,
  loading,
  error,
  mangas,
  mangaBusyId,
  onToggleMangaActive,
  onPrevPage,
  onNextPage,
}: FansubMangasTabProps) {
  const activeCount = mangas.filter((manga) => manga.isActive).length
  const approvedCount = mangas.filter((manga) => manga.isApproved).length
  const visibleViews = mangas.reduce((sum, manga) => sum + manga.totalViews, 0)
  const topMangas = [...mangas]
    .sort((left, right) => right.totalViews - left.totalViews)
    .slice(0, 3)
  const latestManga = [...mangas]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0]
  const activeRate = mangas.length > 0 ? Math.round((activeCount / mangas.length) * 100) : 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <MangaSummaryCard icon={BookOpen} label={txa('Toplam seri')} value={total.toLocaleString(intlLocale())} helper={txa('Tüm mangalar')} />
        <MangaSummaryCard icon={TrendingUp} label={txa('Aktif')} value={activeCount.toLocaleString(intlLocale())} helper={txa('Bu sayfadaki aktif seriler')} />
        <MangaSummaryCard icon={CheckCircle2} label={txa('Onaylı')} value={approvedCount.toLocaleString(intlLocale())} helper={txa('Bu sayfadaki onaylı seriler')} />
        <MangaSummaryCard icon={CirclePause} label={txa('Görüntülenme')} value={visibleViews.toLocaleString(intlLocale())} helper={txa('Bu sayfadaki toplam')} />
      </div>
      {/* Filtreler */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={txa('Seri ara…')}
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {total} manga
          </Badge>
        </div>
        <div className="sm:ml-auto">
          <AdminFilterGroup
            label={txa('Durum')}
            value={mangaStatus}
            options={STATUS_OPTIONS}
            onChange={onMangaStatusChange}
          />
        </div>
      </div>

      {/* Tablo */}
      {loading ? (
        <p className="py-12 text-center text-xs text-muted-foreground">{txa('Yükleniyor...')}</p>
      ) : error ? (
        <p className="py-12 text-center text-xs text-muted-foreground">{error}</p>
      ) : mangas.length === 0 ? (
        <p className="py-12 text-center text-xs text-muted-foreground">{txa('Manga bulunamadı.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Manga')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Durum')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Onay')}</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Görüntülenme')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Son Güncelleme')}</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('İşlem')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mangas.map((manga) => (
                <tr key={manga.id} className="transition-colors hover:bg-muted/20">
                  <td className="px-3 py-1">
                    <div className="flex items-center gap-2.5">
                      <img loading="lazy" decoding="async"
                        src={manga.coverImageUrl}
                        alt=""
                        className="h-8 w-6 shrink-0 rounded-md border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <strong className="block truncate text-xs font-semibold text-foreground">{manga.title}</strong>
                        <span className="block text-[10px] text-muted-foreground">{manga.slug}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1">
                    <Badge variant={manga.isActive ? 'default' : 'destructive'} className="text-[10px]">
                      {manga.isActive ? txa('Aktif') : txa('Pasif')}
                    </Badge>
                  </td>
                  <td className="px-3 py-1">
                    <Badge variant={manga.isApproved ? 'default' : 'secondary'} className="text-[10px]">
                      {manga.isApproved ? txa('Onaylı') : txa('Beklemede')}
                    </Badge>
                  </td>
                  <td className="px-3 py-1 text-right">
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      {manga.totalViews.toLocaleString(intlLocale())}
                    </div>
                  </td>
                  <td className="px-3 py-1 text-xs text-muted-foreground">{dateText(manga.updatedAt)}</td>
                  <td className="px-3 py-1 text-center">
                    <AdminOverflowMenu size="sm" disabled={mangaBusyId === manga.id}>
                      <DropdownMenuItem onClick={() => onToggleMangaActive(manga)}>
                        {mangaBusyId === manga.id ? txa('İşleniyor...') : manga.isActive ? txa('Yayından kaldır') : txa('Yayına al')}
                      </DropdownMenuItem>
                    </AdminOverflowMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sayfalama */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {txa('Sayfa {v1}/{v2}', { v1: page, v2: pageTotal })}
        </span>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1 || loading} onClick={onPrevPage}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={page >= pageTotal || loading} onClick={onNextPage}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[1.15fr_0.8fr_1.2fr]">
        <article className="rounded-xl border border-border bg-card p-3">
          <h3 className="text-xs font-semibold text-foreground">{txa('En çok okunan seriler')}</h3>
          <div className="mt-2 space-y-2">
            {topMangas.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">{txa('Okuma verisi bulunmuyor.')}</p>
            ) : topMangas.map((manga, index) => (
              <div key={manga.id} className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 text-[10px]">
                <span className="text-muted-foreground">{index + 1}</span>
                <span className="truncate text-foreground">{manga.title}</span>
                <span className="tabular-nums text-muted-foreground">{manga.totalViews.toLocaleString(intlLocale())}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-end justify-between gap-2">
            <h3 className="text-xs font-semibold text-foreground">{txa('Güncel seri oranı')}</h3>
            <strong className="text-lg tabular-nums text-foreground">{txa('%{v1}', { v1: activeRate })}</strong>
          </div>
          <Progress value={activeRate} className="mt-2 h-1.5" aria-label={txa('Aktif seri oranı yüzde {v1}', { v1: activeRate })} />
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{txa('{v1} aktif seri · {v2} gösterilen seri', { v1: activeCount, v2: mangas.length })}</p>
        </article>

        <article className="rounded-xl border border-border bg-card p-3">
          <h3 className="text-xs font-semibold text-foreground">{txa('Son güncellenen seri')}</h3>
          {latestManga ? (
            <div className="mt-2 flex items-center gap-3">
              <img src={latestManga.coverImageUrl} alt="" className="h-14 w-10 rounded-md border border-border object-cover" />
              <div className="min-w-0">
                <strong className="block truncate text-xs text-foreground">{latestManga.title}</strong>
                <p className="mt-1 text-[10px] text-muted-foreground">{dateText(latestManga.updatedAt)}</p>
              </div>
            </div>
          ) : <p className="mt-2 text-[10px] text-muted-foreground">{txa('Güncel seri bulunmuyor.')}</p>}
        </article>
      </div>
    </div>
  )
}

function MangaSummaryCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof BookOpen
  label: string
  value: string
  helper: string
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <strong className="block text-lg tabular-nums text-foreground">{value}</strong>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">{helper}</p>
    </article>
  )
}
