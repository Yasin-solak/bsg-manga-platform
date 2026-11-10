/**
 * FansubYonetChaptersTab v2: 'Chapters' tab.
 *
 * A collapsible compact list grouped by manga; a one-row metric strip,
 * a filter with status counts, a month calendar + next releases + recent activity on the right.
 * Data is gathered client-side from real sources (mangas + chapters + manga_comments).
 * Per-chapter views are not in the schema, so pages + comments are given.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
    BookOpen,
    CalendarBlank,
    CaretDown,
    CaretRight,
    ChatCircle,
    Clock,
    DownloadSimple,
    Eye,
    MagnifyingGlass,
    PencilSimple,
    Plus,
    Stack,
    TrendUp,
} from '@phosphor-icons/react'
import {
    getFansubManageChapterEditData,
    getFansubManageChaptersOverview,
    updateFansubChapterPagesForReview,
    type ChapterPipelineStatus,
    type ChaptersOverviewChapter,
    type FansubManageChapter,
    type FansubManageChaptersOverview,
} from '@/services/fansubManageService'
import { uploadChapterPages } from '@/services/storageService'
import { resolveChapterPageUrl, resolveStoreAssetUrl } from '@/services/assetUrlService'
import { toast } from '@/services/toastService'
import FansubChapterEditModal from '@/components/fansub/FansubChapterEditModal'
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
import { Meter, Panel, PanelEmpty } from '@/pages/profile/ProfileTabKit'
import { toErrorText, formatDateTime } from './useFansubYonetState'
import { formatCompact, formatRelative } from './FansubYonetOverviewPanels'
import { StudioStatStrip } from './StudioStatStrip'
import {
    createLocalDraftId,
    revokeDraftPagePreviews,
    type ChapterPageItem,
} from '../fansubYonetChapterEditUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubYonetChaptersTabProps {
    fansubId: string
    /** Degeri degisince genel bakis yeniden cekilir (ekleme sonrasi tazeleme). */
    reloadToken?: number
    /** Opens the in-studio chapter add modal. */
    onCreateChapter?: () => void
}

type StatusFilter = 'all' | ChapterPipelineStatus
type SortKey = 'newest' | 'oldest' | 'comments'

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'all', get label() { return txa('Tümü') } },
    { id: 'published', get label() { return txa('Yayında') } },
    { id: 'scheduled', get label() { return txa('Planlı') } },
    { id: 'pending', get label() { return txa('Onayda') } },
    { id: 'draft', get label() { return txa('Taslak') } },
]

const STATUS_META: Record<ChapterPipelineStatus, { label: string; dot: string; chip: string }> = {
    published: { get label() { return txa('Yayında') }, dot: 'bg-emerald-400', chip: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300' },
    scheduled: { get label() { return txa('Planlı') }, dot: 'bg-sky-400', chip: 'bg-sky-500/12 text-sky-600 dark:text-sky-300' },
    pending: { get label() { return txa('Onayda') }, dot: 'bg-amber-400', chip: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' },
    draft: { get label() { return txa('Taslak') }, dot: 'bg-muted-foreground/60', chip: 'bg-muted text-muted-foreground' },
}

const MONTH_LABELS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']
const GROUP_PAGE = 8

function fmt(value: number) {
    return Math.max(0, value || 0).toLocaleString(intlLocale())
}

function shortDate(iso: string | null) {
    if (!iso) return '—'
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '—'
    const diffDays = Math.abs(Date.now() - date.getTime()) / 86_400_000
    if (diffDays < 7) return formatRelative(iso)
    return date.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

function StatusChip({ status }: { status: ChapterPipelineStatus }) {
    const meta = STATUS_META[status]
    return (
        <span className={cn('inline-flex flex-none items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold', meta.chip)}>
            <span className={cn('size-1.5 rounded-full', meta.dot)} />
            {meta.label}
        </span>
    )
}

export default function FansubYonetChaptersTab({
    fansubId,
    reloadToken,
    onCreateChapter,
}: FansubYonetChaptersTabProps) {
    // ─── Genel bakis state ────────────────────────────────
    const [overview, setOverview] = useState<FansubManageChaptersOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [sortKey, setSortKey] = useState<SortKey>('newest')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [groupLimit, setGroupLimit] = useState<Record<string, number>>({})
    const initialisedExpandRef = useRef(false)

    // ─── Edit modal state (mevcut akis korunur) ───────────
    const [editTarget, setEditTarget] = useState<FansubManageChapter | null>(null)
    const [titleDraft, setTitleDraft] = useState('')
    const [editLoading, setEditLoading] = useState(false)
    const [editError, setEditError] = useState<string | null>(null)
    const [pageItems, setPageItems] = useState<ChapterPageItem[]>([])
    const [saving, setSaving] = useState(false)
    const [editOriginalCount, setEditOriginalCount] = useState<number | undefined>(undefined)
    const [editIsLive, setEditIsLive] = useState(false)

    const existingPageCount = useMemo(() => pageItems.filter((p) => p.source === 'existing').length, [pageItems])
    const newPageCount = useMemo(() => pageItems.filter((p) => p.source === 'new').length, [pageItems])
    const resultPageCount = pageItems.length
    const pageItemsRef = useRef<ChapterPageItem[]>([])

    useEffect(() => { pageItemsRef.current = pageItems }, [pageItems])
    useEffect(() => () => { revokeDraftPagePreviews(pageItemsRef.current) }, [])
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim().toLocaleLowerCase(intlLocale())), 240)
        return () => clearTimeout(t)
    }, [searchInput])

    // ─── Data fetching ───────────────────────────────────────
    const loadOverview = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await getFansubManageChaptersOverview(fansubId)
            setOverview(data)
            if (!initialisedExpandRef.current && data.groups.length > 0) {
                initialisedExpandRef.current = true
                setExpanded(new Set([data.groups[0].id]))
            }
        } catch (err) {
            console.error('[FansubYonetChaptersTab] loadOverview error', err)
            setOverview(null)
            setError(toErrorText(err, txa('Bölümler yüklenemedi.')))
        } finally {
            setLoading(false)
        }
    }, [fansubId, reloadToken])

    useEffect(() => { void loadOverview() }, [loadOverview])

    // ─── Edit modal handlers ──────────────────────────────
    function openEditFromOverview(chapter: ChaptersOverviewChapter) {
        revokeDraftPagePreviews(pageItemsRef.current)
        pageItemsRef.current = []
        setPageItems([])
        setEditError(null)
        setEditTarget({
            id: chapter.id,
            mangaId: chapter.mangaId,
            mangaTitle: chapter.mangaTitle,
            mangaSlug: chapter.mangaSlug,
            chapterNumber: chapter.chapterNumber,
            title: chapter.title || '',
            isApproved: chapter.status !== 'pending',
            publishAt: chapter.publishAt || undefined,
            createdAt: chapter.createdAt,
            updatedAt: chapter.updatedAt,
        })
        setTitleDraft(chapter.title || '')
        setEditOriginalCount(undefined)
        setEditIsLive(chapter.status === 'published' || chapter.status === 'scheduled')
    }

    function closeEditModal() {
        revokeDraftPagePreviews(pageItemsRef.current)
        pageItemsRef.current = []
        setPageItems([])
        setEditError(null)
        setEditLoading(false)
        setEditTarget(null)
        setTitleDraft('')
    }

    useEffect(() => {
        if (!editTarget) return
        const targetId = editTarget.id
        const targetTitle = editTarget.title || ''
        let disposed = false
        setEditLoading(true)
        setEditError(null)
        setPageItems([])

        async function load() {
            try {
                const data = await getFansubManageChapterEditData(fansubId, targetId)
                if (disposed) return
                setTitleDraft(data.title || targetTitle)
                setEditOriginalCount(data.pages.length)
                setPageItems(
                    data.pages.map((url, i) => ({
                        id: `existing-${i}-${createLocalDraftId()}`,
                        source: 'existing' as const,
                        assetRef: url,
                        previewUrl: resolveChapterPageUrl(url) || url,
                    })),
                )
            } catch (err) {
                if (!disposed) setEditError(toErrorText(err, txa('Bölüm ayrıntıları yüklenemedi.')))
            } finally {
                if (!disposed) setEditLoading(false)
            }
        }

        void load()
        return () => { disposed = true }
    }, [fansubId, editTarget])

    function movePage(pageId: string, direction: 'up' | 'down') {
        setPageItems((prev) => {
            const idx = prev.findIndex((p) => p.id === pageId)
            if (idx < 0) return prev
            const next = direction === 'up' ? idx - 1 : idx + 1
            if (next < 0 || next >= prev.length) return prev
            const copy = [...prev]
            const [moved] = copy.splice(idx, 1)
            copy.splice(next, 0, moved)
            return copy
        })
    }

    function addPageFiles(files: File[]) {
        if (files.length === 0) return
        const newPages: ChapterPageItem[] = files.map((file) => ({
            id: createLocalDraftId(),
            source: 'new',
            previewUrl: URL.createObjectURL(file),
            file,
        }))
        setPageItems((prev) => [...prev, ...newPages])
    }

    function handleNewPageSelect(event: ChangeEvent<HTMLInputElement>) {
        addPageFiles(Array.from(event.target.files || []))
        event.target.value = ''
    }

    /** Drag-and-drop: moves the page to the target position. */
    function reorderPage(pageId: string, targetIndex: number) {
        setPageItems((prev) => {
            const from = prev.findIndex((p) => p.id === pageId)
            if (from < 0 || from === targetIndex) return prev
            const copy = [...prev]
            const [moved] = copy.splice(from, 1)
            copy.splice(Math.max(0, Math.min(copy.length, targetIndex)), 0, moved)
            return copy
        })
    }

    function removePage(pageId: string) {
        setPageItems((prev) => {
            const target = prev.find((p) => p.id === pageId)
            if (target) revokeDraftPagePreviews([target])
            return prev.filter((p) => p.id !== pageId)
        })
    }

    async function handleSave() {
        if (!editTarget || editLoading) return
        if (resultPageCount <= 0) {
            toast.warning(txa('Bölümde en az bir sayfa olmalı.'))
            return
        }
        setSaving(true)
        try {
            const uploadMap = new Map<string, string>()
            const uploadedPageDimensions: Array<{ ref: string; width: number; height: number }> = []
            const newOnly = pageItems.filter(
                (p): p is Extract<ChapterPageItem, { source: 'new' }> => p.source === 'new',
            )
            if (newOnly.length > 0) {
                const uploaded = await uploadChapterPages(
                    newOnly.map((p) => p.file),
                    editTarget.mangaId,
                    editTarget.chapterNumber,
                    fansubId,
                )
                newOnly.forEach((p, i) => {
                    if (!uploaded[i]) return
                    uploadMap.set(p.id, uploaded[i].ref)
                    uploadedPageDimensions.push(uploaded[i])
                })
            }
            const finalPages = pageItems
                .map((p) => (p.source === 'existing' ? p.assetRef : uploadMap.get(p.id) || ''))
                .filter(Boolean)
            if (finalPages.length !== pageItems.length) {
                throw new Error(txa('Sayfa sırası oluşturulurken bazı yeni sayfalar yüklenemedi.'))
            }
            const result = await updateFansubChapterPagesForReview({
                fansubId,
                chapterId: editTarget.id,
                title: titleDraft,
                pages: finalPages,
                uploadedPageDimensions,
            })
            toast.success(result.status === 'pending_revision'
                ? txa('Revizyon onaya gönderildi; onaylanana kadar mevcut sürüm yayında kalır.')
                : txa('Bölüm sayfaları güncellendi ve onaya gönderildi.'))
            closeEditModal()
            await loadOverview()
        } catch (err) {
            toast.error(toErrorText(err, txa('Bölüm güncellenemedi.')))
        } finally {
            setSaving(false)
        }
    }

    // ─── Derived view: search + filter + sort ────
    const visibleGroups = useMemo(() => {
        if (!overview) return []
        const sortChapters = (chapters: ChaptersOverviewChapter[]) => {
            const copy = [...chapters]
            if (sortKey === 'comments') copy.sort((a, b) => b.commentCount - a.commentCount)
            else {
                copy.sort((a, b) => {
                    const aKey = a.publishAt || a.createdAt
                    const bKey = b.publishAt || b.createdAt
                    return sortKey === 'oldest' ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey)
                })
            }
            return copy
        }

        return overview.groups
            .map((group) => {
                const chapters = sortChapters(
                    group.chapters.filter((chapter) => {
                        if (statusFilter !== 'all' && chapter.status !== statusFilter) return false
                        if (!search) return true
                        const haystack = txa('{v1} {v2} bölüm bolum {v3}', { v1: group.title, v2: chapter.title ?? '', v3: chapter.chapterNumber }).toLocaleLowerCase(intlLocale())
                        return haystack.includes(search)
                    }),
                )
                return { ...group, chapters }
            })
            .filter((group) => group.chapters.length > 0)
    }, [overview, statusFilter, search, sortKey])

    const metrics = overview?.metrics

    function toggleGroup(id: string) {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function exportCsv() {
        if (!overview) return
        const rows: string[][] = [[txa('Seri'), txa('Bölüm'), txa('Başlık'), txa('Durum'), txa('Yayın tarihi'), txa('Sayfa'), txa('Yorum')]]
        for (const group of overview.groups) {
            for (const chapter of group.chapters) {
                rows.push([
                    group.title,
                    String(chapter.chapterNumber),
                    chapter.title || '',
                    STATUS_META[chapter.status].label,
                    chapter.publishAt ? formatDateTime(chapter.publishAt) : '',
                    String(chapter.pageCount),
                    String(chapter.commentCount),
                ])
            }
        }
        const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'bolumler.csv'
        link.click()
        URL.revokeObjectURL(url)
    }

    // ─── Render ───────────────────────────────────────────
    if (loading && !overview) {
        return (
            <section className="flex min-h-[220px] items-center justify-center rounded-[20px] border border-border/70 bg-card/60 text-sm text-muted-foreground">
                {txa('Bölümler yükleniyor…')}
            </section>
        )
    }

    if (error && !overview) {
        return (
            <section className="flex flex-col gap-3 rounded-[20px] border border-destructive/40 bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{error}</p>
                <Button type="button" variant="outline" onClick={() => void loadOverview()}>{txa('Tekrar dene')}</Button>
            </section>
        )
    }

    const statusCounts = (overview?.groups || []).reduce<Record<StatusFilter, number>>((acc, group) => {
        for (const chapter of group.chapters) {
            acc.all += 1
            acc[chapter.status] += 1
        }
        return acc
    }, { all: 0, published: 0, scheduled: 0, pending: 0, draft: 0 })
    const upcoming = (overview?.groups || [])
        .flatMap((group) => group.chapters.filter((chapter) => chapter.status === 'scheduled' && chapter.publishAt))
        .sort((a, b) => (a.publishAt || '').localeCompare(b.publishAt || ''))
        .slice(0, 4)
    const monthDelta = metrics?.thisMonthPublishedDeltaPct

    return (
        <div className="flex flex-col gap-4" data-testid="studio-chapters">
            {metrics ? (
                <StudioStatStrip
                    items={[
                        { key: 'series', icon: BookOpen, tone: 'violet', label: txa('Seri'), value: fmt(metrics.totalManga), sub: `${fmt(metrics.activeManga)} aktif` },
                        { key: 'chapters', icon: Stack, tone: 'primary', label: txa('Bölüm'), value: fmt(metrics.totalChapters), sub: txa('{v1} yayında', { v1: fmt(metrics.publishedChapters) }) },
                        {
                            key: 'month',
                            icon: TrendUp,
                            tone: 'emerald',
                            label: txa('Bu ay yayınlanan'),
                            value: fmt(metrics.thisMonthPublished),
                            sub: monthDelta == null || monthDelta === 0
                                ? txa('Geçen ayla aynı')
                                : <span className={monthDelta > 0 ? 'font-semibold text-emerald-500' : 'font-semibold text-rose-500'}>{monthDelta > 0 ? '+' : ''}{monthDelta}% {txa('geçen aya göre')}</span>,
                        },
                        { key: 'views', icon: Eye, tone: 'sky', label: txa('Görüntülenme'), value: formatCompact(metrics.totalViews), sub: txa('seri toplamı') },
                        { key: 'comments', icon: ChatCircle, tone: 'amber', label: txa('Yorum'), value: formatCompact(metrics.totalComments), sub: txa('bu ay {v1}', { v1: fmt(metrics.thisMonthComments) }) },
                    ]}
                />
            ) : null}

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="flex flex-wrap rounded-full border border-border/70 bg-card/60 p-0.5" role="tablist" aria-label={txa('Durum filtresi')}>
                    {STATUS_FILTERS.map((filter) => (
                        <button
                            key={filter.id}
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === filter.id}
                            onClick={() => setStatusFilter(filter.id)}
                            className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors', statusFilter === filter.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
                        >
                            {filter.label}
                            <span className="tabular-nums opacity-70">{statusCounts[filter.id]}</span>
                        </button>
                    ))}
                </div>
                <label className="relative lg:ml-auto lg:w-60">
                    <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder={txa('Seri, bölüm no ya da başlık')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="h-9 rounded-full pl-8 text-[13px]" />
                </label>
                <div className="flex items-center gap-2">
                    <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                        <SelectTrigger className="h-9 w-[140px] rounded-full text-[12.5px]" aria-label={txa('Sıralama')}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest">{txa('En yeni')}</SelectItem>
                            <SelectItem value="oldest">{txa('En eski')}</SelectItem>
                            <SelectItem value="comments">{txa('En çok yorum')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" className="size-9 rounded-full" onClick={exportCsv} aria-label={txa('CSV olarak indir')} title={txa('CSV olarak indir')}>
                        <DownloadSimple size={15} />
                    </Button>
                    {onCreateChapter ? (
                        <Button type="button" className="h-9 rounded-full" onClick={onCreateChapter}>
                            <Plus size={15} weight="bold" />{txa('Bölüm ekle')}
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="flex min-w-0 flex-col gap-3">
                    {visibleGroups.length === 0 ? (
                        <Panel>
                            <PanelEmpty
                                icon={Stack}
                                title={statusCounts.all ? txa('Eşleşen bölüm yok') : txa('Henüz bölüm yok')}
                                hint={statusCounts.all ? txa('Filtreyi ya da aramayı değiştir.') : txa('İlk bölümünü yükle; onaylanınca takipçilerine bildirim gider.')}
                                action={!statusCounts.all && onCreateChapter ? <Button size="sm" className="mt-2 rounded-full" onClick={onCreateChapter}>{txa('Bölüm ekle')}</Button> : undefined}
                            />
                        </Panel>
                    ) : (
                        visibleGroups.map((group) => {
                            const isOpen = expanded.has(group.id) || Boolean(search)
                            const cover = resolveStoreAssetUrl(group.coverImageUrl || undefined) || group.coverImageUrl || buildCoverPlaceholder(group.title)
                            const progress = group.totalChapters > 0 ? Math.round((group.publishedChapters / group.totalChapters) * 100) : 0
                            const limit = groupLimit[group.id] || GROUP_PAGE
                            const shown = group.chapters.slice(0, limit)
                            return (
                                <section key={group.id} className="overflow-hidden rounded-[18px] border border-border/70 bg-card/60">
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.id)}
                                        aria-expanded={isOpen}
                                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40"
                                    >
                                        <img src={cover} alt="" loading="lazy" className="h-11 w-8 shrink-0 rounded-md object-cover" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[14px] font-bold">{group.title}</span>
                                            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-muted-foreground">
                                                <span>{txa('{v1} bölüm', { v1: fmt(group.totalChapters) })}</span>
                                                <span className="inline-flex items-center gap-1"><Eye size={12} />{formatCompact(group.totalViews)}</span>
                                                <span className="inline-flex items-center gap-1"><ChatCircle size={12} />{fmt(group.commentTotal)}</span>
                                                <span>{txa('ort.')}{' '}{txa('{v1} sayfa', { v1: fmt(group.avgPages) })}</span>
                                            </span>
                                        </span>
                                        <span className="hidden w-28 shrink-0 sm:block">
                                            <span className="mb-1 flex justify-between text-[11px] text-muted-foreground"><span>{txa('Yayında')}</span><span className="tabular-nums">{group.publishedChapters}/{group.totalChapters}</span></span>
                                            <Meter percent={progress} barClassName="from-emerald-400 to-emerald-300" />
                                        </span>
                                        {isOpen ? <CaretDown size={14} className="shrink-0 text-muted-foreground" /> : <CaretRight size={14} className="shrink-0 text-muted-foreground" />}
                                    </button>

                                    {isOpen ? (
                                        <ul className="divide-y divide-border/50 border-t border-border/60">
                                            {shown.map((chapter) => (
                                                <li key={chapter.id} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/30">
                                                    <span className="w-14 flex-none text-[13px] font-black tabular-nums">#{chapter.chapterNumber}</span>
                                                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{chapter.title || txa('Başlıksız')}</span>
                                                    <StatusChip status={chapter.status} />
                                                    <span className="hidden w-24 flex-none text-right text-[11.5px] text-muted-foreground sm:block" title={chapter.publishAt ? formatDateTime(chapter.publishAt) : undefined}>{shortDate(chapter.publishAt || chapter.createdAt)}</span>
                                                    <span className="hidden w-14 flex-none text-right text-[11.5px] tabular-nums text-muted-foreground md:block">{fmt(chapter.pageCount)}{' '}{txa('sf')}</span>
                                                    <span className="hidden w-10 flex-none items-center justify-end gap-1 text-[11.5px] tabular-nums text-muted-foreground md:flex"><ChatCircle size={12} />{fmt(chapter.commentCount)}</span>
                                                    <Button size="icon-sm" variant="ghost" className="rounded-full" onClick={() => openEditFromOverview(chapter)} aria-label={txa('Bölüm {v1} düzenle', { v1: chapter.chapterNumber })} title={txa('Düzenle')}>
                                                        <PencilSimple size={14} />
                                                    </Button>
                                                </li>
                                            ))}
                                            {group.chapters.length > limit ? (
                                                <li className="px-4 py-1.5 text-center">
                                                    <Button variant="ghost" size="sm" className="rounded-full text-[12px]" onClick={() => setGroupLimit((prev) => ({ ...prev, [group.id]: limit + 20 }))}>
                                                        {txa('{v1} bölüm daha', { v1: fmt(group.chapters.length - limit) })}
                                                    </Button>
                                                </li>
                                            ) : null}
                                        </ul>
                                    ) : null}
                                </section>
                            )
                        })
                    )}
                </div>

                <div className="flex flex-col gap-4">
                    <ChapterCalendar overview={overview} />

                    <Panel title={txa('Sıradaki yayınlar')} icon={Clock} tone="sky" meta={upcoming.length ? txa('{v1} planlı bölüm', { v1: upcoming.length }) : txa('Planlı bölüm yok')}>
                        {upcoming.length ? (
                            <ul className="flex flex-col gap-2">
                                {upcoming.map((chapter) => (
                                    <li key={chapter.id} className="flex items-center gap-2 text-[12.5px]">
                                        <span className="min-w-0 flex-1 truncate"><b>{chapter.mangaTitle}</b> <span className="text-muted-foreground">#{chapter.chapterNumber}</span></span>
                                        <span className="flex-none text-[11.5px] font-semibold text-sky-500">{formatRelative(chapter.publishAt)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-[12px] text-muted-foreground">{txa('Bölüm eklerken ileri bir tarih seçersen burada sıraya girer.')}</p>
                        )}
                    </Panel>

                    <Panel title={txa('Son hareketler')} icon={Stack} tone="neutral">
                        {overview && overview.recent.length > 0 ? (
                            <ul className="flex flex-col gap-2">
                                {overview.recent.slice(0, 6).map((item) => (
                                    <li key={item.id} className="flex items-center gap-2">
                                        <span className={cn('size-1.5 flex-none rounded-full', STATUS_META[item.status].dot)} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[12.5px] font-semibold">{item.mangaTitle} #{item.chapterNumber}</span>
                                            <span className="block text-[11px] text-muted-foreground">{STATUS_META[item.status].label} · {formatRelative(item.at)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-[12px] text-muted-foreground">{txa('Henüz hareket yok.')}</p>
                        )}
                    </Panel>
                </div>
            </div>

            <FansubChapterEditModal
                isOpen={Boolean(editTarget)}
                chapterTitleDraft={titleDraft}
                chapterEditLoading={editLoading}
                chapterEditError={editError}
                chapterExistingPageCount={existingPageCount}
                chapterNewPageCount={newPageCount}
                chapterPageItems={pageItems.map((p) => ({ id: p.id, source: p.source, previewUrl: p.previewUrl }))}
                chapterResultPageCount={resultPageCount}
                chapterSaving={saving}
                chapterLabel={editTarget ? txa('{v1} · Bölüm {v2}', { v1: editTarget.mangaTitle, v2: editTarget.chapterNumber }) : undefined}
                isLive={editIsLive}
                originalPageCount={editOriginalCount}
                onReorderPage={reorderPage}
                onAddFiles={addPageFiles}
                onTitleChange={setTitleDraft}
                onMovePage={movePage}
                onSelectNewPages={handleNewPageSelect}
                onRemovePage={removePage}
                onClose={closeEditModal}
                onSave={() => { void handleSave() }}
            />
        </div>
    )
}

// ─── Planlama takvimi (icinde bulunulan ay) ─────────────────────────────────
function ChapterCalendar({ overview }: { overview: FansubManageChaptersOverview | null }) {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const byDay = useMemo(() => {
        const map = new Map<string, { published: number; scheduled: number; pending: number }>()
        for (const day of overview?.calendar || []) {
            map.set(day.date, { published: day.published, scheduled: day.scheduled, pending: day.pending })
        }
        return map
    }, [overview])

    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // Pzt = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: Array<{ day: number; key: string } | null> = []
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null)
    for (let d = 1; d <= daysInMonth; d += 1) {
        cells.push({ day: d, key: `${monthPrefix}-${String(d).padStart(2, '0')}` })
    }
    const monthTotal = [...byDay.entries()]
        .filter(([key]) => key.startsWith(monthPrefix))
        .reduce((sum, [, entry]) => sum + entry.published + entry.scheduled + entry.pending, 0)

    return (
        <Panel title={`${txa(MONTH_LABELS[month])} ${year}`} icon={CalendarBlank} tone="primary" meta={monthTotal ? txa('{v1} bölüm hareketi', { v1: monthTotal }) : txa('Bu ay hareket yok')}>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
                {WEEKDAYS.map((w) => <div key={w} className="py-0.5 font-semibold">{txa(w)}</div>)}
                {cells.map((cell, index) => {
                    if (!cell) return <div key={`empty-${index}`} />
                    const entry = byDay.get(cell.key)
                    const isToday = cell.day === now.getDate()
                    return (
                        <div
                            key={cell.key}
                            className={cn(
                                'relative flex h-7 items-center justify-center rounded-md text-[11px]',
                                isToday ? 'bg-primary/15 font-bold text-foreground' : entry ? 'font-semibold text-foreground' : 'text-muted-foreground',
                            )}
                            title={entry ? txa('Planlı {v1} · Yayında {v2} · Onayda {v3}', { v1: entry.scheduled, v2: entry.published, v3: entry.pending }) : undefined}
                        >
                            {cell.day}
                            {entry ? (
                                <span className="absolute bottom-0.5 flex gap-0.5">
                                    {entry.scheduled > 0 ? <span className="size-1 rounded-full bg-sky-400" /> : null}
                                    {entry.published > 0 ? <span className="size-1 rounded-full bg-emerald-400" /> : null}
                                    {entry.pending > 0 ? <span className="size-1 rounded-full bg-amber-400" /> : null}
                                </span>
                            ) : null}
                        </div>
                    )
                })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 text-[10.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-sky-400" />{txa('Planlı')}</span>
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400" />{txa('Yayında')}</span>
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" />{txa('Onayda')}</span>
            </div>
        </Panel>
    )
}
