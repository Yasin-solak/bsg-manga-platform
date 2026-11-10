import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Inbox, Search, Server } from 'lucide-react'
import { focusSheetContainer } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  communityAdmin,
  type CommunityAdminServerRow,
  type CommunityServerKindFilter,
  type CommunityServerSort,
} from '@/services/communityAdminService'
import { CommunityServerDetail, ServerAvatar } from './CommunityServerDetail'
import { communityRelativeAge } from './communityAdminUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

const PAGE_SIZE = 20

const KIND_TABS: Array<[CommunityServerKindFilter, string]> = [
  ['all', 'Tümü'],
  ['fansub', 'Fansub'],
  ['room', 'Odalar'],
  ['archived', 'Arşiv'],
]

const SORT_OPTIONS: Array<[CommunityServerSort, string]> = [
  ['activity', 'Son etkinlik'],
  ['members', 'Üye sayısı'],
  ['reports', 'Açık şikâyet'],
  ['newest', 'En yeni'],
]

/** Servers: fansub servers and member rooms in one list; details on the right. */
export function CommunityServersDesk({ desk, siteOpen, onShowReports, onChanged, initialServerId = null }: {
  desk: boolean
  /** A server arriving from another page (e.g. Fansubs); opens even if not in the list. */
  initialServerId?: string | null
  siteOpen: boolean
  onShowReports: (server: { id: string, name: string }) => void
  onChanged: () => void
}) {
  const [kind, setKind] = useState<CommunityServerKindFilter>('all')
  const [sort, setSort] = useState<CommunityServerSort>('activity')
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<{ total: number, rows: CommunityAdminServerRow[] }>({ total: 0, rows: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initialServerId)
  const [sheetOpen, setSheetOpen] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(draftSearch.trim()), 300)
    return () => clearTimeout(timer)
  }, [draftSearch])
  useEffect(() => { setPage(0) }, [kind, sort, search])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    communityAdmin.servers({ search, kind, sort, offset: page * PAGE_SIZE }, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setData(value) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? txa(reason.message) : txa('Sunucular alınamadı.')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [search, kind, sort, page, revision])

  const rows = data.rows
  const selected = rows.find((row) => row.id === selectedId) ?? null
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  // On desktop the first server opens by itself; when the selected server leaves the filter, it moves to the first row.
  useEffect(() => {
    if (!desk || loading || selected || (selectedId && selectedId === initialServerId)) return
    setSelectedId(rows[0]?.id ?? null)
  }, [desk, loading, rows, selected, selectedId, initialServerId])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const select = useCallback((row: CommunityAdminServerRow) => {
    setSelectedId(row.id)
    if (!desk) setSheetOpen(true)
  }, [desk])

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = selected ? rows.indexOf(selected) : -1
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setSelectedId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-server-id="${next.id}"]`)?.focus())
  }

  const detail = selectedId && (selected || !desk || selectedId === initialServerId) ? (
    <CommunityServerDetail
      serverId={selectedId}
      layout={desk ? 'desk' : 'sheet'}
      siteOpen={siteOpen}
      onChanged={() => { setRevision((value) => value + 1); onChanged() }}
      onShowReports={(id) => { setSheetOpen(false); onShowReports({ id, name: rows.find((row) => row.id === id)?.name ?? txa('Sunucu') }) }}
    />
  ) : null

  return (
    <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1" data-testid="admin-community-servers">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Sunucu türü')}>
          {KIND_TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => setKind(value)}
              data-testid={`admin-community-kind-${value}`}
              className={cn('rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors', kind === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {txa(label)}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} maxLength={80} placeholder={txa('Sunucu, fansub ya da sahip ara')} aria-label={txa('Sunucularda ara')} className="h-9 pl-9 text-[13px]" />
        </div>
        <Select value={sort} onValueChange={(value) => setSort(value as CommunityServerSort)}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Sıralama')}><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{txa(label)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: error })}</p> : null}

      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-community-desk">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={loading}>
          {loading && rows.length === 0 ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="admin-community-servers-empty">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Server className="size-5" /></span>
              <span className="text-[13px] font-semibold">{search ? txa('Aramaya uyan sunucu yok') : kind === 'archived' ? txa('Arşivlenmiş sunucu yok') : txa('Henüz sunucu yok')}</span>
            </div>
          ) : (
            <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', loading && 'opacity-60')} aria-label={txa('Sunucular')} onKeyDown={handleListKey} ref={listRef} data-testid="admin-community-servers-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => select(row)}
                    aria-current={row.id === selectedId ? 'true' : undefined}
                    data-server-id={row.id}
                    data-testid={`admin-community-server-${row.id}`}
                    className={cn(
                      'relative flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50',
                      row.id === selectedId && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
                    )}
                  >
                    <ServerAvatar name={row.name} url={row.avatar_url} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">{row.name}</span>
                        {row.archived_at ? <span className="shrink-0 rounded-md bg-amber-500/12 px-1.5 py-px text-[10.5px] font-bold text-amber-700 dark:text-amber-300">{txa('Arşiv')}</span> : null}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {row.kind === 'fansub' ? txa('Fansub') : txa('Oda · @{v1}', { v1: row.owner.username ?? txa('üye') })} · {txa('{v1} üye · {v2} mesaj/7g', { v1: row.members_active.toLocaleString(intlLocale()), v2: row.messages_7d.toLocaleString(intlLocale()) })}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {communityRelativeAge(row.last_message_at)}
                      {row.reports_open ? <span className="rounded-full bg-rose-500/15 px-1.5 font-bold text-rose-700 dark:text-rose-300" title={txa('Açık şikâyet')}>{row.reports_open}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data.total > PAGE_SIZE ? (
            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{page * PAGE_SIZE + 1}–{Math.min(data.total, (page + 1) * PAGE_SIZE)} / {data.total.toLocaleString(intlLocale())}</span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={loading || page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={loading || page >= pageCount - 1} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
              </span>
            </footer>
          ) : null}
        </div>

        {desk ? (detail ?? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
            <Inbox className="size-5" />{txa('Soldan bir sunucu seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(selectedId)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{txa('Sunucu ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Sunucunun kanallarını, üyelerini ve geçmişini incele.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
