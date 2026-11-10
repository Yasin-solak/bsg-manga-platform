import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Inbox, Lock, MessageSquareReply, Paperclip, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { AdminSectionHeader } from '../shared/AdminSectionHeader'
import { AdminEntityHoverCard } from '../shared/AdminEntityHoverCard'
import { focusSheetContainer, useDeskLayout } from '../shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  countSupportRequestsByStatus,
  listAdminSupportPage,
  type AdminSupportFilter,
  type SupportRequest,
  type SupportStatusCounts,
} from '@/services/supportRequestService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { AdminSupportDetail } from './AdminSupportDetail'
import { intlLocale, txa } from '@/i18n/activeLocale'

const PAGE_SIZE = 20
const categories: Record<string, string> = { get technical() { return txa('Teknik sorun') }, get account() { return txa('Hesap') }, get content() { return txa('İçerik') }, get payment() { return txa('Ödeme') }, get suggestion() { return txa('Öneri') }, get other() { return txa('Diğer') } }
const statuses: Record<string, string> = { get open() { return txa('Yanıt bekliyor') }, get answered() { return txa('Yanıtlandı') }, get closed() { return txa('Kapalı') } }
const STATUS_TONE: Record<string, string> = {
  open: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  answered: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  closed: 'bg-muted text-muted-foreground',
}

function relativeAge(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (!Number.isFinite(minutes)) return '—'
  if (minutes < 60) return txa('{v1} dk', { v1: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return txa('{v1} sa', { v1: hours })
  return txa('{v1} gün', { v1: Math.floor(hours / 24) })
}

/**
 * Support requests v2: reply desk. The summary strip shows real status counts
 * and works as a status filter (the "awaiting reply" count used to cover only the open
 * page). A paged list on the left, message + reply on the right; after saving a reply
 * "next awaiting reply" opens in one click.
 */
export default function AdminSupportSection() {
  const [filter, setFilter] = useState<AdminSupportFilter>({ page: 0, search: '', status: 'open', category: 'all' })
  const [result, setResult] = useState<{ rows: SupportRequest[]; total: number }>({ rows: [], total: 0 })
  const [counts, setCounts] = useState<SupportStatusCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const timer = setTimeout(() => {
      void listAdminSupportPage(filter).then((data) => { if (active) setResult(data) })
        .catch((reason) => { if (active) setError(toUserFacingErrorMessage(reason, txa('Talepler yüklenemedi.'))) })
        .finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [filter, revision])

  useEffect(() => {
    const controller = new AbortController()
    countSupportRequestsByStatus(controller.signal).then(setCounts).catch(() => { if (!controller.signal.aborted) setCounts(null) })
    return () => controller.abort()
  }, [revision])

  return (
    <AdminSupportView
      {...result}
      counts={counts}
      filter={filter}
      onFilter={setFilter}
      loading={loading}
      error={error}
      onRefresh={() => setRevision((value) => value + 1)}
    />
  )
}

export function AdminSupportView({ rows, total, counts, filter, onFilter, loading, error, onRefresh }: {
  rows: SupportRequest[]
  total: number
  counts: SupportStatusCounts | null
  filter: AdminSupportFilter
  onFilter: (value: AdminSupportFilter) => void
  loading: boolean
  error: string
  onRefresh: () => void
}) {
  const desk = useDeskLayout()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftSearch, setDraftSearch] = useState(filter.search)
  const [localStatus, setLocalStatus] = useState<Record<string, { status: SupportRequest['status'], response: string }>>({})

  const merged = useMemo(() => rows.map((row) => (localStatus[row.id]
    ? { ...row, status: localStatus[row.id].status, admin_response: localStatus[row.id].response }
    : row)), [localStatus, rows])
  const selected = merged.find((row) => row.id === selectedId) ?? null
  const nextOpen = merged.find((row) => row.status === 'open' && row.id !== selectedId) ?? null

  // On desktop the selection is never empty: the first row opens.
  useEffect(() => {
    if (!desk || loading) return
    if (!selected && merged[0]) setSelectedId(merged[0].id)
  }, [desk, loading, merged, selected])

  const pick = (row: SupportRequest) => {
    setSelectedId(row.id)
    if (!desk) setSheetOpen(true)
  }

  const setStatus = (status: AdminSupportFilter['status']) => onFilter({ ...filter, status, page: 0 })

  const strip: Array<{ id: AdminSupportFilter['status'], label: string, value: number | null, icon: typeof Inbox, tone: string }> = [
    { id: 'open', label: txa('Yanıt bekliyor'), value: counts?.open ?? null, icon: Inbox, tone: 'bg-amber-500/10 text-amber-500' },
    { id: 'answered', label: txa('Yanıtlandı'), value: counts?.answered ?? null, icon: CheckCircle2, tone: 'bg-emerald-500/10 text-emerald-500' },
    { id: 'closed', label: txa('Kapalı'), value: counts?.closed ?? null, icon: Lock, tone: 'bg-muted text-muted-foreground' },
    { id: 'all', label: txa('Tümü'), value: counts ? counts.open + counts.answered + counts.closed : null, icon: MessageSquareReply, tone: 'bg-primary/10 text-primary' },
  ]

  const detail = selected ? (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full" aria-label={txa('Talep ayrıntısı')} data-testid="admin-support-detail">
      <header className={cn('flex items-center gap-2 border-b border-border/60 px-5 py-3', !desk && 'pr-12')}>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[selected.status])}>{statuses[selected.status]}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{categories[selected.category] || selected.category}</span>
        {nextOpen && selected.status !== 'open' ? (
          <Button size="sm" variant="outline" className="ml-auto h-8 gap-1 rounded-full text-[12px]" onClick={() => setSelectedId(nextOpen.id)} data-testid="admin-support-next">
            {txa('Sıradaki yanıt bekleyen')} <ChevronRight className="size-3.5" />
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pt-4">
        <AdminSupportDetail
          key={selected.id}
          request={selected}
          onSaved={(response) => {
            setLocalStatus((current) => ({ ...current, [selected.id]: { status: 'answered', response } }))
            toast.success(txa('Yanıt kaydedildi; kullanıcı bildirim alır.'))
            onRefresh()
          }}
        />
      </div>
    </section>
  ) : null

  return (
    <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" data-testid="admin-support">
      <AdminSectionHeader
        title={txa('Destek talepleri')}
        description={txa('Kullanıcı mesajları, ekran görüntüleri ve yanıtlar; yanıt bekleyenler önce.')}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={loading} onClick={onRefresh}><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />{txa('Yenile')}</Button>}
      />

      {/* Ozet seridi = durum filtresi; sayilar tum talepler uzerinden. */}
      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Destek özeti')}>
        <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {strip.map((cell) => {
            const active = filter.status === cell.id
            return (
              <button key={cell.id} type="button" aria-pressed={active} onClick={() => setStatus(cell.id)} data-testid={`admin-support-status-${cell.id}`} className={cn('relative flex items-center gap-3 px-4 py-3 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', cell.tone)}><cell.icon className="size-[18px]" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{cell.label}</span>
                  <span className="block text-[20px] font-black leading-tight tabular-nums">{cell.value == null ? '—' : cell.value.toLocaleString(intlLocale())}</span>
                </span>
                <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <form className="relative min-w-[240px] flex-1" onSubmit={(event) => { event.preventDefault(); onFilter({ ...filter, search: draftSearch, page: 0 }) }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={txa('Talep konusunda ara')} placeholder={txa('Talep konusunda ara, Enter')} maxLength={120} value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} className="h-9 pl-9 text-[13px]" />
        </form>
        <Select value={filter.category} onValueChange={(value) => onFilter({ ...filter, category: value, page: 0 })}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Kategori')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{txa('Tüm kategoriler')}</SelectItem>
            {Object.entries(categories).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[12px] tabular-nums text-muted-foreground">{loading ? txa('Yükleniyor…') : txa('{v1} sonuç', { v1: total })}</span>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: error })}</p> : null}

      {/* Masada (xl) izgara kalan yuksekligi doldurur; liste ve ayrinti kendi icinde kayar. */}
      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={loading}>
          {loading && !rows.length ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3].map((index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : !rows.length ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckCircle2 className="size-5" /></span>
              <span className="text-[13px] font-semibold">{filter.status === 'open' ? txa('Yanıt bekleyen talep yok') : txa('Bu filtrede talep yok')}</span>
            </div>
          ) : (
            <ul className="min-h-0 divide-y divide-border/50 overflow-y-auto" data-testid="admin-support-list">
              {merged.map((row) => {
                const active = row.id === selectedId
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => pick(row)}
                      data-testid={`admin-support-row-${row.id}`}
                      className={cn('relative flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40', active && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary')}
                    >
                      <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', row.status === 'open' ? 'bg-amber-500' : row.status === 'answered' ? 'bg-emerald-500' : 'bg-muted-foreground/40')} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-foreground">{row.subject}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
                          <AdminEntityHoverCard kind="user" entityKey={row.user_id} focusable={false}>{row.username ? `@${row.username}` : txa('Kullanıcı')}</AdminEntityHoverCard>
                          <span>· {categories[row.category] || row.category}</span>
                          {row.hasScreenshot ? <Paperclip className="size-3 shrink-0" aria-label={txa('Görsel ekli')} /> : null}
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">{relativeAge(row.created_at)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {total > PAGE_SIZE ? (
            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{filter.page * PAGE_SIZE + 1}–{Math.min(total, (filter.page + 1) * PAGE_SIZE)} / {total}</span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={loading || filter.page === 0} onClick={() => onFilter({ ...filter, page: filter.page - 1 })}><ChevronLeft className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={loading || Boolean(error) || (filter.page + 1) * PAGE_SIZE >= total} onClick={() => onFilter({ ...filter, page: filter.page + 1 })}><ChevronRight className="size-4" /></Button>
              </span>
            </footer>
          ) : null}
        </div>

        {desk ? (detail ?? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
            <Inbox className="size-5" />{txa('Soldan bir talep seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl" onOpenAutoFocus={focusSheetContainer}>
            <SheetHeader className="sr-only"><SheetTitle>{txa('Talep ayrıntısı')}</SheetTitle><SheetDescription>{txa('Mesajı ve ekleri inceleyerek kullanıcıyı yanıtla.')}</SheetDescription></SheetHeader>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
