import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import {
  Check, ChevronLeft, ChevronRight, ExternalLink, Flag, Hash, Inbox, Loader2, MoreHorizontal, Paperclip, Trash2, X,
} from 'lucide-react'
import { AdminEntityHoverCard } from '@/components/admin/shared/AdminEntityHoverCard'
import { focusSheetContainer } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  COMMUNITY_REPORT_REASONS,
  communityAdmin,
  type CommunityAdminReport,
  type CommunityMemberOperation,
  type CommunityReportStatus,
} from '@/services/communityAdminService'
import { toast } from '@/services/toastService'
import { MemberActionDialog, ReportDecisionDialog, type MemberActionTarget, type ReportDecisionMode } from './CommunityActionDialogs'
import { ServerAvatar } from './CommunityServerDetail'
import { communityRelativeAge, formatCommunityDate, formatUntil, initialsOf, isTimedOut } from './communityAdminUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

const PAGE_SIZE = 20

const STATUS_TABS: Array<[CommunityReportStatus, string]> = [
  ['open', 'Bekleyen'],
  ['resolved', 'Sonuçlandırılan'],
  ['dismissed', 'Gerekçesiz'],
]

type ReportList = { total: number, counts: Record<CommunityReportStatus, number>, rows: CommunityAdminReport[] }
const EMPTY: ReportList = { total: 0, counts: { open: 0, resolved: 0, dismissed: 0 }, rows: [] }

function Tag({ tone, children }: { tone?: 'rose' | 'amber' | 'emerald', children: ReactNode }) {
  return (
    <span className={cn(
      'rounded-md px-1.5 py-px text-[10.5px] font-bold',
      tone === 'rose' ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
        : tone === 'amber' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
          : tone === 'emerald' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
            : 'bg-muted text-muted-foreground',
    )}>
      {children}
    </span>
  )
}

function PersonAvatar({ name, url }: { name: string, url: string | null }) {
  return url
    ? <img src={url} alt="" loading="lazy" decoding="async" className="size-9 shrink-0 rounded-full border border-border bg-muted object-cover" />
    : <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground" aria-hidden="true">{initialsOf(name)}</span>
}

/**
 * Message report queue for all the site's servers. Server staff keep reviewing their own
 * reports; a site admin removes, resolves or applies a member action to the author here.
 * Decisions are written to the server's action history.
 */
export function CommunityReportsDesk({ desk, siteOpen, server, onClearServer, onChanged }: {
  desk: boolean
  siteOpen: boolean
  /** Filter arriving from "Show its reports" in server details. */
  server: { id: string, name: string } | null
  onClearServer: () => void
  onChanged: () => void
}) {
  const [status, setStatus] = useState<CommunityReportStatus>('open')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<ReportList>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [decision, setDecision] = useState<{ report: CommunityAdminReport, mode: ReportDecisionMode } | null>(null)
  const [memberAction, setMemberAction] = useState<MemberActionTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const lastIndexRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => { setPage(0) }, [status, server?.id])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    communityAdmin.reports({ status, serverId: server?.id ?? null, offset: page * PAGE_SIZE }, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setData(value) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? txa(reason.message) : txa('Şikâyetler alınamadı.')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [status, server?.id, page, revision])

  const rows = data.rows
  const selected = rows.find((row) => row.id === selectedId) ?? null
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  // On desktop a selection always exists: when a decided report leaves the list, the same position opens.
  useEffect(() => {
    if (selected) {
      lastIndexRef.current = rows.indexOf(selected)
      return
    }
    if (!desk || loading) return
    const next = rows[Math.min(lastIndexRef.current, rows.length - 1)]
    setSelectedId(next ? next.id : null)
  }, [desk, loading, rows, selected])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const select = useCallback((row: CommunityAdminReport) => {
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
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-report-id="${next.id}"]`)?.focus())
  }

  const refresh = () => { setRevision((value) => value + 1); onChanged() }

  const runDecision = async (note: string) => {
    if (!decision) return
    const { report, mode } = decision
    setBusy(true)
    try {
      if (mode === 'delete' && !report.message.deleted_at) await communityAdmin.deleteMessage(report.message.id)
      await communityAdmin.decideReport(report, mode === 'dismiss' ? 'dismissed' : 'resolved', note)
      toast.success(mode === 'delete' ? txa('Mesaj kaldırıldı, şikâyet sonuçlandı.') : mode === 'resolve' ? txa('Şikâyet sonuçlandı.') : txa('Şikâyet gerekçesiz bulundu.'))
      setDecision(null)
      if (!desk) { setSheetOpen(false); setSelectedId(null) }
      refresh()
    } catch (reason) {
      toast.error(reason instanceof Error ? txa(reason.message) : txa('Karar kaydedilemedi.'))
      // Surum cakismasinda (baska yonetici karar verdiyse) liste tazelenir.
      setRevision((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  const runMemberAction = async (minutes?: number) => {
    if (!memberAction) return
    setBusy(true)
    try {
      await communityAdmin.moderate(memberAction.serverId, memberAction.userId, memberAction.operation, minutes)
      toast.success({ timeout: minutes ? txa('Yazar kısıtlandı.') : txa('Kısıtlama kaldırıldı.'), kick: txa('Yazar sunucudan çıkarıldı.'), ban: txa('Yazar yasaklandı.'), unban: txa('Yasak kaldırıldı.') }[memberAction.operation])
      setMemberAction(null)
      refresh()
    } catch (reason) {
      toast.error(reason instanceof Error ? txa(reason.message) : txa('İşlem tamamlanamadı.'))
    } finally {
      setBusy(false)
    }
  }

  const detail = selected ? (
    <ReportDetail
      report={selected}
      layout={desk ? 'desk' : 'sheet'}
      siteOpen={siteOpen}
      busy={busy}
      onDecide={(mode) => setDecision({ report: selected, mode })}
      onMemberAction={(operation) => setMemberAction({
        serverId: selected.server.id,
        serverName: selected.server.name,
        userId: selected.message.author.id,
        username: selected.message.author.username ?? txa('üye'),
        operation,
        timedOut: isTimedOut(selected.message.author_state?.timeout_until),
      })}
    />
  ) : null

  return (
    <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1" data-testid="admin-community-reports">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Şikâyet durumu')}>
          {STATUS_TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              onClick={() => setStatus(value)}
              data-testid={`admin-community-reports-status-${value}`}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors', status === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {txa(label)}
              <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', value === 'open' && data.counts.open ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'bg-foreground/[0.07]')}>{data.counts[value]}</span>
            </button>
          ))}
        </div>
        {server ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12px]" data-testid="admin-community-reports-server-filter">
            {txa('Sunucu:')}{' '}<b className="max-w-[200px] truncate font-semibold">{server.name}</b>
            <button type="button" onClick={onClearServer} aria-label={txa('Sunucu filtresini kaldır')} className="rounded-full text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          </span>
        ) : null}
      </div>

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: error })}</p> : null}

      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-community-reports-desk">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={loading}>
          {loading && rows.length === 0 ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="admin-community-reports-empty">
              <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check className="size-5" /></span>
              <span className="text-[13px] font-semibold">{status === 'open' ? txa('Bekleyen şikâyet yok') : txa('Bu durumda şikâyet yok')}</span>
              <span className="max-w-[320px] text-[12px] text-muted-foreground">{txa('Üyelerin sohbette şikâyet ettiği mesajlar, hangi sunucuda olursa olsun burada toplanır.')}</span>
            </div>
          ) : (
            <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', loading && 'opacity-60')} aria-label={txa('Şikâyetler')} onKeyDown={handleListKey} ref={listRef} data-testid="admin-community-reports-list">
              {rows.map((row) => <ReportRow key={row.id} report={row} active={row.id === selectedId} onSelect={() => select(row)} />)}
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
            <Inbox className="size-5" />{txa('Soldan bir şikâyet seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{txa('Şikâyet ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Şikâyet edilen mesajı incele ve karar ver.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <ReportDecisionDialog
        report={decision?.report ?? null}
        mode={decision?.mode ?? 'resolve'}
        busy={busy}
        onCancel={() => setDecision(null)}
        onConfirm={(note) => { void runDecision(note) }}
      />
      <MemberActionDialog target={memberAction} busy={busy} onCancel={() => setMemberAction(null)} onConfirm={(minutes) => { void runMemberAction(minutes) }} />
    </div>
  )
}

function ReportRow({ report, active, onSelect }: { report: CommunityAdminReport, active: boolean, onSelect: () => void }) {
  const author = report.message.author.username ?? txa('üye')
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        data-report-id={report.id}
        data-testid={`admin-community-report-${report.id}`}
        className={cn(
          'relative flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50',
          active && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
        )}
      >
        <PersonAvatar name={author} url={report.message.author.avatar_url} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] text-muted-foreground">
            <AdminEntityHoverCard kind="user" entityKey={report.message.author.id} focusable={false}>
              <span className="font-semibold text-foreground">@{author}</span>
            </AdminEntityHoverCard>
            {' · '}{report.server.name} › #{report.channel.name}
          </span>
          <span className={cn('mt-0.5 line-clamp-2 break-words text-[12.5px] leading-5 [overflow-wrap:anywhere]', report.message.deleted_at ? 'italic text-muted-foreground' : 'text-foreground')}>
            {report.message.deleted_at ? txa('Mesaj silinmiş.') : report.message.body.trim() || txa('Metin yok (yalnız dosya).')}
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            <Tag tone={report.reason === 'harassment' || report.reason === 'unsafe' ? 'rose' : 'amber'}>{COMMUNITY_REPORT_REASONS[report.reason]}</Tag>
            {report.message.reports_on_message > 1 ? <Tag tone="rose">{txa('{v1} şikâyet', { v1: report.message.reports_on_message })}</Tag> : null}
            {report.status === 'resolved' ? <Tag tone="emerald">{txa('Sonuçlandı')}</Tag> : report.status === 'dismissed' ? <Tag>{txa('Gerekçesiz')}</Tag> : null}
          </span>
        </span>
        <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">{communityRelativeAge(report.created_at)}</span>
      </button>
    </li>
  )
}

function ReportDetail({ report, layout, siteOpen, busy, onDecide, onMemberAction }: {
  report: CommunityAdminReport
  layout: 'desk' | 'sheet'
  siteOpen: boolean
  busy: boolean
  onDecide: (mode: ReportDecisionMode) => void
  onMemberAction: (operation: CommunityMemberOperation) => void
}) {
  const message = report.message
  const author = message.author.username ?? txa('üye')
  const authorState = message.author_state
  const timedOut = isTimedOut(authorState?.timeout_until)
  const open = report.status === 'open'
  const size = layout === 'desk' ? 'sm' : 'default'
  const canModerateAuthor = Boolean(authorState && !authorState.is_owner)

  const actions = open ? (
    <>
      {!message.deleted_at ? (
        <Button variant="outline" size={size} disabled={busy} onClick={() => onDecide('delete')} className="gap-1.5 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-300" data-testid="admin-community-report-delete">
          <Trash2 className="size-4" />{txa('Mesajı kaldır…')}
        </Button>
      ) : null}
      <Button variant="outline" size={size} disabled={busy} onClick={() => onDecide('resolve')} className="gap-1.5" data-testid="admin-community-report-resolve">
        <Check className="size-4" />{txa('Sonuçlandır…')}
      </Button>
    </>
  ) : null

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Şikâyet ayrıntısı')}
      data-testid="admin-community-report-detail"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
        <ServerAvatar name={report.server.name} url={report.server.avatar_url} large />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Tag tone={report.reason === 'harassment' || report.reason === 'unsafe' ? 'rose' : 'amber'}>{COMMUNITY_REPORT_REASONS[report.reason]}</Tag>
            {report.status === 'resolved' ? <Tag tone="emerald">{txa('Sonuçlandı')}</Tag> : report.status === 'dismissed' ? <Tag>{txa('Gerekçesiz')}</Tag> : <Tag tone="rose">{txa('Bekliyor')}</Tag>}
          </span>
          <h2 className="mt-1 truncate text-[16px] font-bold tracking-tight">{report.server.name}</h2>
          <span className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted-foreground"><Hash className="size-3.5" />{report.channel.name} · {formatCommunityDate(report.created_at)}</span>
        </span>
        <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
          {layout === 'desk' ? actions : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={txa('Diğer işlemler')} data-testid="admin-community-report-more"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {open ? <DropdownMenuItem onSelect={() => onDecide('dismiss')} data-testid="admin-community-report-dismiss"><X className="size-4" />{txa('Gerekçesiz bul…')}</DropdownMenuItem> : null}
              {siteOpen ? (
                <DropdownMenuItem asChild>
                  <Link to={`/topluluk?sunucu=${report.server.id}&kanal=${report.channel.id}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{txa('Kanalı sitede aç')}</Link>
                </DropdownMenuItem>
              ) : null}
              {canModerateAuthor ? (
                <>
                  <DropdownMenuSeparator />
                  {authorState?.state === 'active' ? <DropdownMenuItem onSelect={() => onMemberAction('timeout')}>{timedOut ? txa('Yazarın kısıtlamasını değiştir…') : txa('Yazarı süreli kısıtla…')}</DropdownMenuItem> : null}
                  {authorState?.state === 'active' ? <DropdownMenuItem onSelect={() => onMemberAction('kick')}>{txa('Yazarı sunucudan çıkar…')}</DropdownMenuItem> : null}
                  {authorState?.state !== 'banned' ? <DropdownMenuItem variant="destructive" onSelect={() => onMemberAction('ban')}>{txa('Yazarı yasakla…')}</DropdownMenuItem> : <DropdownMenuItem onSelect={() => onMemberAction('unban')}>{txa('Yazarın yasağını kaldır…')}</DropdownMenuItem>}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section>
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Şikâyet edilen mesaj')}</h3>
          <div className="rounded-2xl bg-muted/35 px-4 py-3" data-testid="admin-community-report-message">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
              <AdminEntityHoverCard kind="user" entityKey={message.author.id}><b className="font-semibold">@{author}</b></AdminEntityHoverCard>
              {message.author.display_name ? <span className="text-muted-foreground">{message.author.display_name}</span> : null}
              <span className="text-muted-foreground">· {formatCommunityDate(message.created_at)}{message.edited_at ? txa(' · düzenlendi') : ''}</span>
            </div>
            {message.deleted_at ? (
              <p className="text-[13px] italic text-muted-foreground">{txa('Mesaj {v1} tarihinde silindi.', { v1: formatCommunityDate(message.deleted_at) })}</p>
            ) : (
              <p className="whitespace-pre-wrap break-words text-[13.5px] leading-6 [overflow-wrap:anywhere]">{message.body.trim() || txa('Metin yok.')}</p>
            )}
            {message.attachments ? <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Paperclip className="size-3.5" />{txa('{v1} dosya eki', { v1: message.attachments })}</p> : null}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Şikâyet')}</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px] sm:grid-cols-3">
            <div className="min-w-0"><dt className="text-[11px] font-semibold text-muted-foreground">{txa('Bildiren')}</dt><dd className="mt-0.5 truncate"><AdminEntityHoverCard kind="user" entityKey={report.reporter.id}>@{report.reporter.username ?? txa('üye')}</AdminEntityHoverCard></dd></div>
            <div className="min-w-0"><dt className="text-[11px] font-semibold text-muted-foreground">{txa('Gerekçe')}</dt><dd className="mt-0.5">{COMMUNITY_REPORT_REASONS[report.reason]}</dd></div>
            <div className="min-w-0"><dt className="text-[11px] font-semibold text-muted-foreground">{txa('Bu mesaja')}</dt><dd className="mt-0.5">{txa('{v1} şikâyet', { v1: message.reports_on_message })}</dd></div>
          </dl>
          {report.note?.trim() ? <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-border/60 px-3.5 py-2.5 text-[12.5px] [overflow-wrap:anywhere]">“{report.note}”</p> : null}
        </section>

        <section>
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Yazarın sunucudaki durumu')}</h3>
          <p className="text-[12.5px] text-muted-foreground" data-testid="admin-community-report-author-state">
            {!authorState ? txa('Yazar artık bu sunucunun üyesi değil.')
              : authorState.is_owner ? txa('Yazar bu sunucunun sahibi; üye işlemi uygulanamaz, gerekirse sunucu arşivlenir.')
                : authorState.state === 'banned' ? txa('Yazar bu sunucudan yasaklı.')
                  : authorState.state === 'left' ? txa('Yazar sunucudan ayrılmış.')
                    : timedOut ? txa('Yazar kısıtlı · {v1}.', { v1: formatUntil(authorState.timeout_until) })
                      : txa('Yazar aktif üye.')}
          </p>
        </section>

        {!open ? (
          <section>
            <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Karar')}</h3>
            <p className="text-[12.5px]">
              <Flag className="mr-1 inline size-3.5 text-muted-foreground" />
              {report.status === 'resolved' ? txa('Sonuçlandırıldı') : txa('Gerekçesiz bulundu')}
              {report.reviewer_username ? ` · @${report.reviewer_username}` : ''}
              {report.reviewed_at ? ` · ${formatCommunityDate(report.reviewed_at)}` : ''}
            </p>
            {report.resolution_note?.trim() ? <p className="mt-2 whitespace-pre-wrap break-words text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">{report.resolution_note}</p> : null}
          </section>
        ) : null}
      </div>

      {layout === 'sheet' && actions ? (
        <footer className="flex items-center justify-end gap-2 border-t border-border/60 bg-card/80 px-5 py-3">
          {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          {actions}
        </footer>
      ) : layout === 'desk' ? (
        <footer className="border-t border-border/60 px-5 py-2 text-[11.5px] text-muted-foreground">{txa('Listede ↑ ↓ ile gezebilirsin')}</footer>
      ) : null}
    </section>
  )
}
