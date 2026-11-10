/**
 * FansubManageMangaSection v2: studio 'Series' tab.
 *
 * One-row metric strip, one-row toolbar (status / visibility / search /
 * sort / view) and cover-focused cards or a compact list. A fansub cannot directly edit a
 * live series; "Request a fix" sends only changed fields to approval
 * (submit_fansub_manga_revision) and the request history is listed below.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import {
  ArrowSquareOut,
  BookOpen,
  ClockCountdown,
  PencilSimpleLine,
  CaretLeft,
  CaretRight,
  Eye,
  List as ListIcon,
  MagnifyingGlass,
  Plus,
  SquaresFour,
  Stack,
  Star,
  Users,
} from '@phosphor-icons/react'
import {
  getFansubManageAnalyticsSummary,
  listFansubManageMangas,
  listFansubMangaRevisions,
  type FansubMangaRevisionRequest,
  type FansubManageAnalyticsSummary,
  type FansubManageManga,
  type FansubManageMangaStatusFilter,
  type FansubManageMangaVisibilityFilter,
} from '@/services/fansubManageService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { buildPublicMangaPath } from '@/lib/routes'
import { Panel, PanelEmpty } from '@/pages/profile/ProfileTabKit'
import { StudioStatStrip } from '@/pages/fansubYonet/StudioStatStrip'
import { formatCompact, formatRelative } from '@/pages/fansubYonet/FansubYonetOverviewPanels'
import FansubMangaRevisionDialog, { FIELD_LABELS } from './FansubMangaRevisionDialog'
import { intlLocale, txa } from '@/i18n/activeLocale'

const PAGE_SIZE = 12

const STATUS_OPTIONS: Array<{ id: FansubManageMangaStatusFilter; label: string }> = [
  { id: 'all', get label() { return txa('Tümü') } },
  { id: 'approved', get label() { return txa('Onaylı') } },
  { id: 'pending', get label() { return txa('Onayda') } },
]

const VISIBILITY_OPTIONS: Array<{ id: FansubManageMangaVisibilityFilter; label: string }> = [
  { id: 'all', get label() { return txa('Tüm görünürlük') } },
  { id: 'active', get label() { return txa('Yayında') } },
  { id: 'inactive', get label() { return txa('Gizli') } },
]

type MangaStatusValue = 'ongoing' | 'completed' | 'hiatus'
type MangaSortKey = 'updated' | 'views' | 'followers' | 'rating'

const SORT_OPTIONS: Array<{ id: MangaSortKey; label: string }> = [
  { id: 'updated', get label() { return txa('Son güncelleme') } },
  { id: 'views', get label() { return txa('Görüntülenme') } },
  { id: 'followers', get label() { return txa('Takipçi') } },
  { id: 'rating', get label() { return txa('Puan') } },
]

const SERIES_STATUS: Record<MangaStatusValue, { label: string; className: string }> = {
  ongoing: { get label() { return txa('Devam ediyor') }, className: 'text-emerald-600 dark:text-emerald-300' },
  completed: { get label() { return txa('Tamamlandı') }, className: 'text-sky-600 dark:text-sky-300' },
  hiatus: { get label() { return txa('Ara verdi') }, className: 'text-amber-600 dark:text-amber-300' },
}

interface FansubManageMangaSectionProps {
  fansubId: string
  isActive: boolean
  onTotalChange?: (total: number) => void
  /** Degeri degisince liste yeniden cekilir (ekleme sonrasi yerinde tazeleme). */
  reloadToken?: number
  /** Opens the series add window (if permitted). */
  onCreateManga?: () => void
}

function toErrorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

const fmt = (value: number | null | undefined) => Math.max(0, value || 0).toLocaleString(intlLocale())

/** Approval and visibility in one badge: can readers see the series? */
function VisibilityChip({ manga }: { manga: FansubManageManga }) {
  const state = !manga.isApproved
    ? { label: txa('Onayda'), className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' }
    : manga.isActive
      ? { label: txa('Yayında'), className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' }
      : { label: txa('Gizli'), className: 'bg-muted text-muted-foreground' }
  return <span className={cn('inline-flex flex-none rounded-full px-2 py-0.5 text-[11px] font-bold', state.className)}>{state.label}</span>
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T, options: Array<{ id: T; label: string }>, onChange: (value: T) => void, label: string }) {
  return (
    <div className="flex rounded-full border border-border/70 bg-card/60 p-0.5" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn('rounded-full px-3 py-1 text-[12px] font-semibold transition-colors', value === option.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function FansubManageMangaSection({ fansubId, isActive, onTotalChange, reloadToken, onCreateManga }: FansubManageMangaSectionProps) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<FansubManageMangaStatusFilter>('all')
  const [visibility, setVisibility] = useState<FansubManageMangaVisibilityFilter>('all')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<FansubManageManga[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('card')
  const [sortKey, setSortKey] = useState<MangaSortKey>('updated')
  const [summary, setSummary] = useState<FansubManageAnalyticsSummary | null>(null)
  const [revisions, setRevisions] = useState<FansubMangaRevisionRequest[]>([])
  const [revisionTarget, setRevisionTarget] = useState<FansubManageManga | null>(null)
  const onTotalChangeRef = useRef(onTotalChange)

  useEffect(() => { onTotalChangeRef.current = onTotalChange }, [onTotalChange])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  useEffect(() => { setPage((prev) => Math.min(prev, totalPages)) }, [totalPages])
  useEffect(() => {
    const timeout = setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 260)
    return () => clearTimeout(timeout)
  }, [searchInput])
  useEffect(() => { setPage(1) }, [status, visibility, fansubId])

  const loadItems = useCallback(async () => {
    if (!isActive) return
    setLoading(true)
    setError(null)
    try {
      const result = await listFansubManageMangas(fansubId, { page, limit: PAGE_SIZE, search, status, visibility })
      setItems(result.items)
      setTotal(result.total)
      onTotalChangeRef.current?.(result.total)
    } catch (err) {
      setItems([])
      setTotal(0)
      setError(toErrorText(err, txa('Seriler yüklenemedi.')))
    } finally {
      setLoading(false)
    }
    // reloadToken: ekleme sonrasi yerinde tazeleme tetikleyicisi
  }, [isActive, fansubId, page, search, status, visibility, reloadToken])

  useEffect(() => { void loadItems() }, [loadItems])

  // Metric strip: total series / chapters / views / followers.
  useEffect(() => {
    if (!isActive) return
    let active = true
    void getFansubManageAnalyticsSummary(fansubId)
      .then((result) => { if (active) setSummary(result) })
      .catch(() => { /* metrik seridi opsiyoneldir */ })
    return () => { active = false }
  }, [isActive, fansubId, reloadToken])

  const loadRevisions = useCallback(async () => {
    if (!isActive) return
    try {
      setRevisions(await listFansubMangaRevisions(fansubId))
    } catch {
      setRevisions([])
    }
  }, [isActive, fansubId])

  useEffect(() => { void loadRevisions() }, [loadRevisions, reloadToken])

  const pendingByManga = useMemo(() => new Set(revisions.filter((entry) => entry.status === 'pending').map((entry) => entry.mangaId)), [revisions])
  const titleById = useMemo(() => new Map(items.map((item) => [item.id, item.title])), [items])

  const sortedItems = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      if (sortKey === 'views') return b.totalViews - a.totalViews
      if (sortKey === 'followers') return b.followerCount - a.followerCount
      if (sortKey === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    return copy
  }, [items, sortKey])

  const filtersActive = Boolean(search) || status !== 'all' || visibility !== 'all'

  return (
    <div className="flex flex-col gap-4" data-testid="studio-series">
      {summary ? (
        <StudioStatStrip
          items={[
            { key: 'series', icon: BookOpen, tone: 'violet', label: txa('Seri'), value: fmt(summary.overview.totalMangaCount), sub: txa('{v1} yayında · {v2} onayda', { v1: fmt(summary.statuses.mangas.active), v2: fmt(summary.statuses.mangas.pending) }) },
            { key: 'chapters', icon: Stack, tone: 'primary', label: txa('Bölüm'), value: fmt(summary.overview.totalChapterCount), sub: txa('30 günde +{v1}', { v1: fmt(summary.momentum.newChapters30d) }) },
            { key: 'views', icon: Eye, tone: 'sky', label: txa('Görüntülenme'), value: formatCompact(summary.overview.totalViews), sub: txa('tüm seriler') },
            { key: 'followers', icon: Users, tone: 'emerald', label: txa('Takipçi'), value: formatCompact(summary.overview.followerCount), sub: txa('bu hafta +{v1}', { v1: fmt(summary.momentum.newFollowers7d) }) },
          ]}
        />
      ) : null}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Segmented value={status} options={STATUS_OPTIONS} onChange={setStatus} label={txa('Onay durumu')} />
        <Segmented value={visibility} options={VISIBILITY_OPTIONS} onChange={setVisibility} label={txa('Görünürlük')} />
        <label className="relative lg:ml-auto lg:w-56">
          <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={txa('Seri adı ara')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="h-9 rounded-full pl-8 text-[13px]" />
        </label>
        <div className="flex items-center gap-2">
          <Select value={sortKey} onValueChange={(value) => setSortKey(value as MangaSortKey)}>
            <SelectTrigger className="h-9 w-[150px] rounded-full text-[12.5px]" aria-label={txa('Sıralama')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-full border border-border/70 bg-card/60 p-0.5">
            {([['card', SquaresFour, txa('Kart görünümü')], ['table', ListIcon, txa('Liste görünümü')]] as const).map(([mode, IconCmp, label]) => (
              <button
                key={mode}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={cn('flex size-8 items-center justify-center rounded-full transition-colors', viewMode === mode ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
              >
                <IconCmp size={15} />
              </button>
            ))}
          </div>
          {onCreateManga ? (
            <Button type="button" className="h-9 rounded-full" onClick={onCreateManga}>
              <Plus size={15} weight="bold" />{txa('Seri ekle')}
            </Button>
          ) : null}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <Panel><p className="py-10 text-center text-[13px] text-muted-foreground">{txa('Seriler yükleniyor…')}</p></Panel>
      ) : error ? (
        <Panel><p className="py-8 text-center text-[13px] text-destructive">{error}</p></Panel>
      ) : items.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={BookOpen}
            title={filtersActive ? txa('Eşleşen seri yok') : txa('Henüz seri yok')}
            hint={filtersActive ? txa('Filtreyi ya da aramayı değiştir.') : txa('İlk serini ekle; onaylandıktan sonra katalogda ve profilinde görünür.')}
            action={!filtersActive && onCreateManga ? <Button size="sm" className="mt-2 rounded-full" onClick={onCreateManga}>{txa('Seri ekle')}</Button> : undefined}
          />
        </Panel>
      ) : viewMode === 'card' ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
          {sortedItems.map((item) => (
            <div key={item.id} className="group relative flex flex-col overflow-hidden rounded-[18px] border border-border/70 bg-card/60 transition-colors hover:border-border">
              {item.isApproved ? (
                <button
                  type="button"
                  onClick={() => setRevisionTarget(item)}
                  className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-semibold text-white opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <PencilSimpleLine size={12} />{txa('Düzeltme iste')}
                </button>
              ) : null}
              <Link to={buildPublicMangaPath({ id: item.id, slug: item.slug, title: item.title })} className="flex flex-col">
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                <img loading="lazy" decoding="async" src={item.coverImageUrl || buildCoverPlaceholder(item.title)} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
                  <VisibilityChip manga={item} />
                  {pendingByManga.has(item.id) ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/90 px-2 py-0.5 text-[11px] font-bold text-white"><ClockCountdown size={11} weight="bold" />{txa('Düzeltme onayda')}</span> : null}
                </span>
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-6 text-[11px] font-semibold text-white">
                  <span className="inline-flex items-center gap-1"><Eye size={12} />{formatCompact(item.totalViews)}</span>
                  <span className="inline-flex items-center gap-1"><Users size={12} />{fmt(item.followerCount)}</span>
                  {item.rating ? <span className="inline-flex items-center gap-1"><Star size={12} weight="fill" />{item.rating.toFixed(1)}</span> : null}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 p-2.5">
                <span className="truncate text-[13px] font-bold" title={item.title}>{item.title}</span>
                <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <span className={SERIES_STATUS[item.status].className}>{SERIES_STATUS[item.status].label}</span>
                  <span>· {item.lastChapterNumber ? txa('{number}. bölüm', { number: item.lastChapterNumber }) : txa('bölüm yok')}</span>
                </span>
              </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <Panel flush>
          <ul className="divide-y divide-border/50">
            {sortedItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2">
                <img loading="lazy" decoding="async" src={item.coverImageUrl || buildCoverPlaceholder(item.title)} alt="" className="h-11 w-8 flex-none rounded-md object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{item.title}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    <span className={SERIES_STATUS[item.status].className}>{SERIES_STATUS[item.status].label}</span>
                    {item.genres.length ? ` · ${item.genres.slice(0, 3).join(', ')}` : ''}
                  </span>
                </span>
                {pendingByManga.has(item.id) ? <span className="hidden flex-none rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-600 dark:text-sky-300 sm:inline">{txa('Düzeltme onayda')}</span> : null}
                <VisibilityChip manga={item} />
                <span className="hidden w-16 flex-none text-right text-[12px] tabular-nums text-muted-foreground sm:block">{item.lastChapterNumber ?? '—'}. bl</span>
                <span className="hidden w-16 flex-none items-center justify-end gap-1 text-[12px] tabular-nums text-muted-foreground md:flex"><Users size={12} />{fmt(item.followerCount)}</span>
                <span className="hidden w-16 flex-none items-center justify-end gap-1 text-[12px] tabular-nums text-muted-foreground md:flex"><Eye size={12} />{formatCompact(item.totalViews)}</span>
                <span className="hidden w-24 flex-none text-right text-[11.5px] text-muted-foreground lg:block">{formatRelative(item.updatedAt)}</span>
                {item.isApproved ? (
                  <Button type="button" size="icon-sm" variant="ghost" className="rounded-full" onClick={() => setRevisionTarget(item)} aria-label={txa('{v1} için düzeltme iste', { v1: item.title })} title={txa('Düzeltme iste')}>
                    <PencilSimpleLine size={14} />
                  </Button>
                ) : null}
                <Button asChild size="icon-sm" variant="ghost" className="rounded-full">
                  <Link to={buildPublicMangaPath({ id: item.id, slug: item.slug, title: item.title })} aria-label={txa('{v1} sayfasını aç', { v1: item.title })} title={txa('Seri sayfasını aç')}>
                    <ArrowSquareOut size={14} />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span className="tabular-nums">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}</span>
          <span className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" className="rounded-full" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label={txa('Önceki sayfa')}><CaretLeft size={14} /></Button>
            <span className="tabular-nums">{page} / {totalPages}</span>
            <Button size="icon-sm" variant="ghost" className="rounded-full" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)} aria-label={txa('Sonraki sayfa')}><CaretRight size={14} /></Button>
          </span>
        </div>
      ) : null}

      {revisions.length > 0 ? (
        <Panel title={txa('Düzeltme istekleri')} icon={PencilSimpleLine} tone="sky" meta={txa('{v1} onayda · site yönetimi inceler', { v1: pendingByManga.size })} testId="studio-series-revisions">
          <ul className="divide-y divide-border/50">
            {revisions.slice(0, 8).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2">
                <span className={cn('flex-none rounded-full px-2 py-0.5 text-[11px] font-bold', REVISION_STATE[entry.status].className)}>{REVISION_STATE[entry.status].label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{titleById.get(entry.mangaId) || txa('Seri')}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {entry.changedFields.map((key) => FIELD_LABELS[key] || key).join(', ') || txa('Değişiklik')}
                    {entry.reviewNote && entry.status !== 'pending' ? txa(' · Yanıt: {v1}', { v1: entry.reviewNote }) : entry.note ? txa(' · Not: {v1}', { v1: entry.note }) : ''}
                  </span>
                </span>
                <span className="flex-none text-[11.5px] text-muted-foreground">{formatRelative(entry.reviewedAt || entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <FansubMangaRevisionDialog
        open={Boolean(revisionTarget)}
        onOpenChange={(open) => { if (!open) setRevisionTarget(null) }}
        fansubId={fansubId}
        manga={revisionTarget}
        hasPendingRequest={revisionTarget ? pendingByManga.has(revisionTarget.id) : false}
        onSubmitted={() => { void loadRevisions() }}
      />
    </div>
  )
}

const REVISION_STATE: Record<FansubMangaRevisionRequest['status'], { label: string; className: string }> = {
  pending: { get label() { return txa('Onayda') }, className: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' },
  approved: { get label() { return txa('Uygulandı') }, className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  rejected: { get label() { return txa('Reddedildi') }, className: 'bg-muted text-muted-foreground' },
}

export default FansubManageMangaSection
