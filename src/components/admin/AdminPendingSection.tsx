import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Link, useNavigate } from '@/i18n/router'
import { Check, ChevronLeft, ChevronRight, ExternalLink, Inbox, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { cn } from '@/lib/utils'
import { AdminEntityHoverCard } from './shared/AdminEntityHoverCard'
import { focusSheetContainer, useDeskLayout } from './shared/useDeskLayout'
import { AdminPendingDetailContent } from './pending/AdminPendingDetailContent'
import { PendingDecisionDialog } from './pending/PendingDecisionDialog'
import {
    formatDateTimeTr,
    itemTypeLabel,
    normalizeSearchText,
    pendingAuthorEntity,
    pendingLocationLabel,
    pendingPriorityLevel,
    pendingPriorityScore,
    pendingPublicUrl,
    toTimestamp,
    type PendingItem,
    type PendingItemType,
    type PendingPriority,
} from './pending/pendingSectionUtils'
import { pendingSubViewByTypeFilter, pendingSubViewFromHash, pendingSubViewOption } from './pending/pendingSectionSubViews'

export type {
    PendingItemType,
    PendingItemMangaDetails,
    PendingItemChapterDetails,
    PendingItem,
} from './pending/pendingSectionUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminPendingSectionProps {
    items: PendingItem[]
    /** True on success: the row leaves the queue and the desk moves to the next request. */
    onApprove: (item: PendingItem) => Promise<boolean>
    onReject: (item: PendingItem, reason?: string) => Promise<boolean>
    /** Arac cubugunda tur sekmelerinin yaninda (or. Ceviri Studyosu seri talepleri). */
    toolbarExtra?: ReactNode
}

type PendingSortMode = 'priority' | 'newest' | 'oldest'
const PAGE_SIZE = 12

const TYPE_TABS: Array<{ value: 'all' | PendingItemType, label: string }> = [
    { value: 'all', get label() { return txa('Tümü') } },
    { value: 'manga', get label() { return txa('Manga') } },
    { value: 'chapter', get label() { return txa('Bölüm') } },
    { value: 'fansub_request', get label() { return txa('Fansub') } },
]

const TYPE_TONE: Record<PendingItemType, string> = {
    manga: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
    chapter: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
    fansub_request: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
}

function priorityDot(level: PendingPriority) {
    if (level === 'critical') return 'bg-rose-500'
    if (level === 'high') return 'bg-amber-500'
    return 'bg-muted-foreground/40'
}

function relativeAge(value?: string) {
    const ts = toTimestamp(value)
    if (!ts) return '—'
    const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60_000))
    if (minutes < 60) return txa('{v1} dk', { v1: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return txa('{v1} sa', { v1: hours })
    return txa('{v1} gün', { v1: Math.floor(hours / 24) })
}

/** The row's second line: new record, edit, or a revision of published content. */
function changeTag(item: PendingItem) {
    if (item.revisionId) return txa('Yayındaki revizyon')
    const action = item.mangaDetails?.changeAction ?? item.chapterDetails?.changeAction
    if (action === 'edit') return txa('Düzenleme')
    if (item.type === 'fansub_request') return txa('Yeni ekip')
    return txa('Yeni kayıt')
}

function initialsOf(value: string) {
    return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase(intlLocale()) || '?'
}

/** Row / title image: cover for series and chapters, the team's uploaded avatar for fansub applications. */
function PendingThumb({ item, large = false }: { item: PendingItem, large?: boolean }) {
    if (item.type === 'fansub_request') {
        const src = item.requestedAvatar
        const box = cn(large ? 'size-12 text-[14px]' : 'size-9 text-[12px]', 'rounded-xl')
        return src
            ? <img src={src} alt="" className={cn(box, 'shrink-0 border border-border bg-muted object-cover')} data-testid="admin-pending-thumb" />
            : <span className={cn(box, 'flex shrink-0 items-center justify-center bg-emerald-500/12 font-black text-emerald-700 dark:text-emerald-300')} aria-hidden="true">{initialsOf(item.title)}</span>
    }
    const cover = item.type === 'manga' ? item.mangaDetails?.coverImage : item.chapterDetails?.mangaCover
    const label = item.type === 'manga' ? item.title : item.chapterDetails?.mangaTitle || item.title
    return <img src={cover || buildCoverPlaceholder(label)} alt="" className={cn(large ? 'h-[60px] w-11' : 'h-11 w-8', 'shrink-0 rounded-md border border-border bg-muted object-cover')} />
}

const keyOf = (item: PendingItem) => `${item.type}:${item.id}`

/**
 * Pending approval v2: review desk. A tight paged list on the left, the selected
 * request's details and decision on the right. After a decision the same position opens
 * (desktop). On narrow screens details are in a side panel. Every rejection passes a confirm
 * dialog (it says explicitly when rejecting a new record means deletion).
 */
function AdminPendingSection({ items, onApprove, onReject, toolbarExtra }: AdminPendingSectionProps) {
    const location = useLocation()
    const navigate = useNavigate()
    const desk = useDeskLayout()
    const [search, setSearch] = useState('')
    const [sortMode, setSortMode] = useState<PendingSortMode>('priority')
    const [page, setPage] = useState(0)
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
    const [rejectItem, setRejectItem] = useState<PendingItem | null>(null)
    const lastIndexRef = useRef(0)
    const listRef = useRef<HTMLUListElement>(null)

    const typeFilter = useMemo(() => pendingSubViewOption(pendingSubViewFromHash(location.hash)).typeFilter, [location.hash])

    const counts = useMemo(() => {
        const result: Record<string, number> = { all: items.length }
        for (const item of items) result[item.type] = (result[item.type] ?? 0) + 1
        return result
    }, [items])

    const oldest = useMemo(() => items.reduce<string | undefined>((min, item) => (
        item.createdAt && (!min || toTimestamp(item.createdAt) < toTimestamp(min)) ? item.createdAt : min
    ), undefined), [items])

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase()
        return items
            .filter((item) => (typeFilter === 'all' || item.type === typeFilter) && (!query || normalizeSearchText(item).includes(query)))
            .sort((a, b) => {
                if (sortMode === 'newest') return toTimestamp(b.createdAt) - toTimestamp(a.createdAt)
                if (sortMode === 'oldest') return toTimestamp(a.createdAt) - toTimestamp(b.createdAt)
                return pendingPriorityScore(b) - pendingPriorityScore(a) || toTimestamp(a.createdAt) - toTimestamp(b.createdAt)
            })
    }, [items, search, typeFilter, sortMode])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const safePage = Math.min(page, pageCount - 1)
    const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
    const selected = filtered.find((item) => keyOf(item) === selectedKey) ?? null

    useEffect(() => { setPage(0) }, [search, typeFilter, sortMode])

    // On desktop a selection always exists: when the selected request leaves the queue, the same position opens.
    useEffect(() => {
        if (selected) {
            lastIndexRef.current = filtered.indexOf(selected)
            return
        }
        if (!desk) return
        const next = filtered[Math.min(lastIndexRef.current, filtered.length - 1)]
        setSelectedKey(next ? keyOf(next) : null)
    }, [desk, filtered, selected])

    // If the selection is on another page, the list goes to that page.
    useEffect(() => {
        if (!selected) return
        const index = filtered.indexOf(selected)
        if (index >= 0) setPage(Math.floor(index / PAGE_SIZE))
    }, [filtered, selected])

    // Liste kendi icinde kayar (masa ekran yuksekliginde): secili satir gorunur kalsin.
    useEffect(() => {
        listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [selectedKey, safePage])

    const select = useCallback((item: PendingItem) => {
        setSelectedKey(keyOf(item))
        if (!desk) setSheetOpen(true)
    }, [desk])

    const moveSelection = (delta: number) => {
        if (!filtered.length) return
        const index = selected ? filtered.indexOf(selected) : -1
        const next = filtered[Math.max(0, Math.min(filtered.length - 1, index + delta))]
        if (next) setSelectedKey(keyOf(next))
    }

    const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); moveSelection(1) }
        if (event.key === 'ArrowUp') { event.preventDefault(); moveSelection(-1) }
    }

    const afterDecision = (ok: boolean) => {
        if (ok && !desk) { setSheetOpen(false); setSelectedKey(null) }
    }

    const approve = async (item: PendingItem) => {
        setBusy('approve')
        try { afterDecision(await onApprove(item)) } finally { setBusy(null) }
    }

    const confirmReject = async (reason: string) => {
        if (!rejectItem) return
        setBusy('reject')
        try {
            const ok = await onReject(rejectItem, reason)
            if (ok) setRejectItem(null)
            afterDecision(ok)
        } finally { setBusy(null) }
    }

    const setTypeFilter = (value: 'all' | PendingItemType) => {
        navigate({ pathname: location.pathname, hash: `#${pendingSubViewByTypeFilter(value)}` })
    }

    const detail = selected ? (
        <PendingDetailPane
            item={selected}
            layout={desk ? 'desk' : 'sheet'}
            busy={busy}
            onApprove={() => { void approve(selected) }}
            onReject={() => setRejectItem(selected)}
        />
    ) : null

    return (
        <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" data-testid="admin-pending">
            <header className="min-w-0">
                <h1 className="text-[26px] font-black leading-tight tracking-tight text-foreground">{txa('Onay bekleyenler')}</h1>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {items.length
                        ? txa('{v1} talep karar bekliyor · en eskisi {v2} önce', { v1: items.length.toLocaleString(intlLocale()), v2: relativeAge(oldest) })
                        : txa('Kuyruk boş; karar bekleyen talep yok.')}
                </p>
            </header>

            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Talep türü')}>
                    {TYPE_TABS.map((tab) => {
                        const active = typeFilter === tab.value
                        return (
                            <button
                                key={tab.value}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                data-testid={`admin-pending-tab-${tab.value}`}
                                onClick={() => setTypeFilter(tab.value)}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {tab.label}
                                <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[11px] tabular-nums">{counts[tab.value] ?? 0}</span>
                            </button>
                        )
                    })}
                </div>
                {toolbarExtra}
                <div className="relative ml-auto w-full sm:w-[260px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={txa('Başlık, gönderen ya da adres ara')}
                        aria-label={txa('Taleplerde ara')}
                        className="h-9 pl-9 text-[13px]"
                    />
                </div>
                <Select value={sortMode} onValueChange={(value) => setSortMode(value as PendingSortMode)}>
                    <SelectTrigger className="h-9 w-[150px] text-[13px]" aria-label={txa('Sıralama')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="priority">{txa('Önceliğe göre')}</SelectItem>
                        <SelectItem value="oldest">{txa('En eski önce')}</SelectItem>
                        <SelectItem value="newest">{txa('En yeni önce')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-14 text-center" data-testid="admin-pending-empty">
                    <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check className="size-5" /></span>
                    <b className="text-[14px]">{txa('Her şey onaylandı')}</b>
                    <span className="text-[12.5px] text-muted-foreground">{txa('Yeni manga, bölüm, gönderi ya da fansub başvurusu geldiğinde burada görünür.')}</span>
                </div>
            ) : (
                // At desk size (xl) the grid fills the remaining height; list and details scroll inside,
                // title and tabs stay in place (the whole page used to scroll).
                <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-pending-desk">
                    <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full">
                        {filtered.length === 0 ? (
                            <p className="px-5 py-10 text-center text-[12.5px] text-muted-foreground">
                                {search ? txa('Aramaya uyan talep yok.') : txa('Bu türde bekleyen talep yok.')}
                            </p>
                        ) : (
                            <ul
                                className="min-h-0 divide-y divide-border/50 overflow-y-auto outline-none"
                                role="listbox"
                                aria-label={txa('Bekleyen talepler')}
                                tabIndex={0}
                                onKeyDown={handleListKey}
                                ref={listRef}
                                data-testid="admin-pending-list"
                            >
                                {pageItems.map((item) => {
                                    const active = selected ? keyOf(selected) === keyOf(item) : false
                                    const author = pendingAuthorEntity(item)
                                    return (
                                        <li key={keyOf(item)} role="option" aria-selected={active}>
                                            <button
                                                type="button"
                                                tabIndex={-1}
                                                onClick={() => select(item)}
                                                data-testid={`admin-pending-row-${item.type}-${item.id}`}
                                                className={cn(
                                                    'relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40',
                                                    active && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
                                                )}
                                            >
                                                <span className={cn('size-2 shrink-0 rounded-full', priorityDot(pendingPriorityLevel(item)))} aria-hidden="true" />
                                                <PendingThumb item={item} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        <span className={cn('shrink-0 rounded-md px-1.5 py-px text-[10.5px] font-bold', TYPE_TONE[item.type])}>{itemTypeLabel(item.type)}</span>
                                                        <span className="truncate text-[13px] font-semibold text-foreground">{item.title}</span>
                                                    </span>
                                                    <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                                                        <AdminEntityHoverCard kind={author.kind} entityKey={author.key} focusable={false}>
                                                            {item.author || txa('Bilinmeyen gönderen')}
                                                        </AdminEntityHoverCard>
                                                        {' · '}{changeTag(item)}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 self-start pt-0.5 text-[11px] tabular-nums text-muted-foreground">{relativeAge(item.createdAt)}</span>
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                        {filtered.length > PAGE_SIZE ? (
                            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
                                <span className="tabular-nums">
                                    {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} / {filtered.length}
                                </span>
                                <span className="flex gap-1">
                                    <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                                        <ChevronLeft className="size-4" />
                                    </Button>
                                    <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                                        <ChevronRight className="size-4" />
                                    </Button>
                                </span>
                            </footer>
                        ) : null}
                    </div>

                    {desk ? (
                        detail ?? (
                            <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
                                <Inbox className="size-5" />
                                {txa('Soldan bir talep seç.')}
                            </div>
                        )
                    ) : null}
                </div>
            )}

            {!desk ? (
                <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
                    <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]" onOpenAutoFocus={focusSheetContainer}>
                        <SheetTitle className="sr-only">{selected?.title ?? txa('Talep ayrıntısı')}</SheetTitle>
                        <SheetDescription className="sr-only">{txa('Talep ayrıntısı ve karar')}</SheetDescription>
                        {detail}
                    </SheetContent>
                </Sheet>
            ) : null}

            <PendingDecisionDialog
                item={rejectItem}
                busy={busy === 'reject'}
                onCancel={() => setRejectItem(null)}
                onConfirm={(reason) => { void confirmReject(reason) }}
            />
        </section>
    )
}

function PendingDetailPane({
    item,
    layout,
    busy,
    onApprove,
    onReject,
}: {
    item: PendingItem
    /** desk: kararlar basligin saginda (her zaman gorunur); sheet: altta sabit. */
    layout: 'desk' | 'sheet'
    busy: 'approve' | 'reject' | null
    onApprove: () => void
    onReject: () => void
}) {
    const publicUrl = pendingPublicUrl(item)
    const author = pendingAuthorEntity(item)
    const actions = (
        <>
            <Button
                variant="outline"
                size={layout === 'desk' ? 'sm' : 'default'}
                disabled={Boolean(busy)}
                onClick={onReject}
                className="gap-1.5 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-300"
                data-testid="admin-pending-reject"
            >
                <X className="size-4" />{txa('Reddet…')}
            </Button>
            <Button size={layout === 'desk' ? 'sm' : 'default'} disabled={Boolean(busy)} onClick={onApprove} className="gap-1.5" data-testid="admin-pending-approve">
                {busy === 'approve' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {txa('Onayla')}
            </Button>
        </>
    )
    return (
        <section
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
            aria-label={txa('Talep ayrıntısı')}
            data-testid="admin-pending-detail"
        >
            <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
                {item.type === 'fansub_request' ? <PendingThumb item={item} large /> : null}
                <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
                        <span className={cn('shrink-0 rounded-md px-1.5 py-px text-[10.5px] font-bold', TYPE_TONE[item.type])}>{itemTypeLabel(item.type)}</span>
                        <span className="truncate">{pendingLocationLabel(item)}</span>
                    </span>
                    <h2 className="mt-1 truncate text-[17px] font-bold tracking-tight text-foreground">
                        {/* Yayindaki serinin revizyonunda kart canli seriyi (bolum, takipci) gosterir. */}
                        {item.type === 'manga' && item.revisionId
                            ? <AdminEntityHoverCard kind="manga" entityKey={item.mangaDetails?.slug}>{item.title}</AdminEntityHoverCard>
                            : item.title}
                    </h2>
                    <span className="text-[12px] text-muted-foreground">
                        <AdminEntityHoverCard kind={author.kind} entityKey={author.key}>{item.author || txa('Bilinmeyen gönderen')}</AdminEntityHoverCard>
                        {' · '}{formatDateTimeTr(item.createdAt)}
                    </span>
                </span>
                <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
                    {publicUrl ? (
                        <Button asChild size="icon-sm" variant="ghost" title={txa('Sitede aç')} aria-label={txa('Sitede aç')}>
                            <Link to={publicUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="size-4" />
                            </Link>
                        </Button>
                    ) : null}
                    {layout === 'desk' ? actions : null}
                </span>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <AdminPendingDetailContent item={item} />
            </div>

            {layout === 'sheet' ? (
                <footer className="flex items-center justify-end gap-2 border-t border-border/60 bg-card/80 px-5 py-3">{actions}</footer>
            ) : (
                <footer className="border-t border-border/60 px-5 py-2 text-[11.5px] text-muted-foreground">
                    {txa('Karar verince sıradaki talep açılır · listede ↑ ↓ ile gezebilirsin')}
                </footer>
            )}
        </section>
    )
}

export default AdminPendingSection
