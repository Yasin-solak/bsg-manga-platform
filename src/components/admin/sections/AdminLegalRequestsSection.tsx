import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Check,
  CircleHelp,
  ExternalLink,
  FileWarning,
  Inbox,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  legalRequestPriorityLabel,
  legalRequestStatusLabel,
  legalRequestStatusOptions,
  legalRequestTypeLabel,
  legalRequestTypeOptions,
  type LegalRequest,
  type LegalRequestStatus,
  type LegalRequestType,
} from '@/services/legalRequestService'
import { toast } from '@/services/toastService'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminLegalRequestsSectionProps {
  legalRequests: LegalRequest[]
  onRefreshLegalRequests: () => Promise<void>
  onUpdateLegalRequest: (input: {
    id: string
    status: LegalRequestStatus
    adminNotes?: string
    resolutionSummary?: string
  }) => Promise<boolean>
}

type StatusFilter = 'all' | 'closed' | LegalRequestStatus

const STATUS_TONE: Record<LegalRequestStatus, string> = {
  new: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  under_review: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  needs_info: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  actioned: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
}

function formatRelativeAge(value?: string | null) {
  if (!value) return '—'
  const ts = new Date(value).getTime()
  if (!Number.isFinite(ts)) return '—'
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60)))
  if (diffMin < 60) return txa('{v1} dk önce', { v1: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return txa('{v1} sa önce', { v1: diffHour })
  return txa('{v1} gün önce', { v1: Math.floor(diffHour / 24) })
}

function Chip({ children, className }: { children: ReactNode, className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', className ?? 'bg-muted text-muted-foreground')}>{children}</span>
}

/**
 * Legal requests (DMCA, copyright, trademark, misrepresentation): a legal queue separate from normal
 * reports. The summary strip also works as a status filter; list on the left,
 * details and decision on the right (with note / result summary rules).
 */
export function AdminLegalRequestsSection({
  legalRequests,
  onRefreshLegalRequests,
  onUpdateLegalRequest,
}: AdminLegalRequestsSectionProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('new')
  const [typeFilter, setTypeFilter] = useState<'all' | LegalRequestType>('all')
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [resolutionSummary, setResolutionSummary] = useState('')
  const [actionStatus, setActionStatus] = useState<LegalRequestStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const stats = useMemo(() => ({
    newCount: legalRequests.filter((item) => item.status === 'new').length,
    reviewCount: legalRequests.filter((item) => item.status === 'under_review').length,
    waitingCount: legalRequests.filter((item) => item.status === 'needs_info').length,
    closedCount: legalRequests.filter((item) => item.status === 'actioned' || item.status === 'rejected').length,
  }), [legalRequests])

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(intlLocale())
    return legalRequests.filter((item) => {
      if (statusFilter === 'closed' && item.status !== 'actioned' && item.status !== 'rejected') return false
      if (statusFilter !== 'all' && statusFilter !== 'closed' && item.status !== statusFilter) return false
      if (typeFilter !== 'all' && item.request_type !== typeFilter) return false
      if (!query) return true
      return [item.full_name, item.email, item.subject, item.description].some((value) => value.toLocaleLowerCase(intlLocale()).includes(query))
    })
  }, [legalRequests, search, statusFilter, typeFilter])

  const selectedRequest = useMemo(
    () => filteredRequests.find((item) => item.id === selectedRequestId) || filteredRequests[0] || null,
    [filteredRequests, selectedRequestId],
  )

  useEffect(() => {
    if (!selectedRequestId && filteredRequests[0]) {
      setSelectedRequestId(filteredRequests[0].id)
    }
    if (selectedRequestId && filteredRequests.every((item) => item.id !== selectedRequestId)) {
      setSelectedRequestId(filteredRequests[0]?.id || null)
    }
  }, [filteredRequests, selectedRequestId])

  useEffect(() => {
    setAdminNotes(selectedRequest?.admin_notes || '')
    setResolutionSummary(selectedRequest?.resolution_summary || '')
  }, [selectedRequest?.id, selectedRequest?.admin_notes, selectedRequest?.resolution_summary])

  async function applyStatus(nextStatus: LegalRequestStatus) {
    if (!selectedRequest) return

    if ((nextStatus === 'needs_info' || nextStatus === 'rejected') && adminNotes.trim().length < 6) {
      toast.warning(txa('Ek bilgi istemek ya da reddetmek için en az 6 karakterlik admin notu yaz.'))
      return
    }
    if (nextStatus === 'actioned' && resolutionSummary.trim().length < 6) {
      toast.warning(txa('"İşlem uygulandı" için sonuç özetini en az 6 karakterle doldur.'))
      return
    }

    setActionStatus(nextStatus)
    const ok = await onUpdateLegalRequest({
      id: selectedRequest.id,
      status: nextStatus,
      adminNotes,
      resolutionSummary,
    })
    setActionStatus(null)
    if (!ok) return
    setSelectedRequestId(selectedRequest.id)
  }

  const refresh = async () => {
    setRefreshing(true)
    try { await onRefreshLegalRequests() } finally { setRefreshing(false) }
  }

  const strip: Array<{ id: StatusFilter, label: string, value: number, icon: typeof Inbox, tone: string }> = [
    { id: 'new', label: txa('Yeni'), value: stats.newCount, icon: Inbox, tone: 'bg-sky-500/10 text-sky-500' },
    { id: 'under_review', label: txa('İncelemede'), value: stats.reviewCount, icon: ShieldCheck, tone: 'bg-violet-500/10 text-violet-500' },
    { id: 'needs_info', label: txa('Ek bilgi bekliyor'), value: stats.waitingCount, icon: CircleHelp, tone: 'bg-amber-500/10 text-amber-500' },
    { id: 'closed', label: txa('Kapanan'), value: stats.closedCount, icon: Check, tone: 'bg-emerald-500/10 text-emerald-500' },
  ]

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" data-testid="admin-legal-requests">
      <AdminSectionHeader
        title={txa('Yasal talepler')}
        description={txa('DMCA, telif, marka ve yanlış temsil talepleri; kullanıcı raporlarından ayrı hukuk kuyruğu.')}
        actions={(
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={refreshing} onClick={() => { void refresh() }}>
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            {txa('Yenile')}
          </Button>
        )}
      />

      {/* Ozet seridi = durum filtresi (tekrar tiklamak "Tumu"ne doner). */}
      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Yasal talep özeti')}>
        <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {strip.map((cell) => {
            const active = statusFilter === cell.id
            return (
              <button
                key={cell.id}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(active ? 'all' : cell.id)}
                className={cn('relative flex items-center gap-3 px-4 py-3 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}
              >
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', cell.tone)}><cell.icon className="size-[18px]" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{cell.label}</span>
                  <span className="block text-[20px] font-black leading-tight tabular-nums">{cell.value}</span>
                </span>
                <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 pl-9 text-[13px]" placeholder={txa('Başvuran, e-posta ya da konu ara')} aria-label={txa('Yasal taleplerde ara')} />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Durum')}>
            <SelectValue placeholder={txa('Durum')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{txa('Tüm durumlar')}</SelectItem>
            <SelectItem value="closed">{txa('Kapanan (tümü)')}</SelectItem>
            {legalRequestStatusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as 'all' | LegalRequestType)}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Talep tipi')}>
            <SelectValue placeholder={txa('Talep tipi')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{txa('Tüm tipler')}</SelectItem>
            {legalRequestTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[12px] tabular-nums text-muted-foreground">{txa('{v1} kayıt', { v1: filteredRequests.length })}</span>
      </div>

      {/* Masada (xl) izgara kalan yuksekligi doldurur; liste ve ayrinti kendi icinde kayar. */}
      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] xl:grid-rows-[minmax(0,1fr)]">
        <div className="flex flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full">
          <header className="border-b border-border/60 px-4 py-3">
            {/* "Ayrik hukuk kuyrugu": normal raporlardan ayridir. */}
            <p className="text-[13.5px] font-bold text-foreground">{txa('Ayrık hukuk kuyruğu')}</p>
            <p className="text-[12px] text-muted-foreground">{txa('Kullanıcı raporlarından ayrı; her hukuki talep tek kayıt olarak izlenir.')}</p>
          </header>
          {filteredRequests.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">{txa('Bu filtrede yasal talep yok.')}</p>
          ) : (
            <ul className="min-h-0 divide-y divide-border/50 overflow-y-auto">
              {filteredRequests.map((request) => {
                const active = selectedRequest?.id === request.id
                return (
                  <li key={request.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRequestId(request.id)}
                      className={cn(
                        'relative flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/40',
                        active && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <Chip className={STATUS_TONE[request.status]}>{legalRequestStatusLabel(request.status)}</Chip>
                        <Chip>{legalRequestTypeLabel(request.request_type)}</Chip>
                        {request.priority === 'high' ? <Chip className="bg-rose-500/12 text-rose-700 dark:text-rose-300">{legalRequestPriorityLabel(request.priority)}</Chip> : null}
                        <span className="ml-auto text-[11px] text-muted-foreground">{formatRelativeAge(request.created_at)}</span>
                      </span>
                      <span className="truncate text-[13.5px] font-semibold text-foreground">{request.subject || txa('Konusuz talep')}</span>
                      <span className="truncate text-[12px] text-muted-foreground">{request.full_name} · {request.email}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full xl:overflow-y-auto" data-testid="admin-legal-detail">
          {selectedRequest ? (
            <div className="flex flex-col gap-4 p-5">
              <div>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Chip className={STATUS_TONE[selectedRequest.status]}>{legalRequestStatusLabel(selectedRequest.status)}</Chip>
                  <Chip>{legalRequestTypeLabel(selectedRequest.request_type)}</Chip>
                  <Chip className={selectedRequest.priority === 'high' ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300' : undefined}>{txa('{v1} öncelik', { v1: legalRequestPriorityLabel(selectedRequest.priority) })}</Chip>
                </span>
                <h2 className="mt-2 text-[18px] font-bold tracking-tight text-foreground">{selectedRequest.subject || txa('Konusuz talep')}</h2>
                <p className="text-[12.5px] text-muted-foreground">{selectedRequest.full_name} · {selectedRequest.email}</p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl bg-muted/30 px-4 py-3 text-[12.5px]">
                <div className="min-w-0"><dt className="text-[11px] text-muted-foreground">{txa('Başvuran')}</dt><dd className="truncate font-medium">{selectedRequest.full_name}</dd></div>
                <div className="min-w-0"><dt className="text-[11px] text-muted-foreground">{txa('Rolü')}</dt><dd className="truncate font-medium">{selectedRequest.claimant_role || txa('Belirtilmedi')}</dd></div>
                <div className="min-w-0"><dt className="text-[11px] text-muted-foreground">{txa('Gönderim')}</dt><dd className="truncate font-medium">{new Date(selectedRequest.created_at).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' })}</dd></div>
                <div className="min-w-0"><dt className="text-[11px] text-muted-foreground">{txa('Son güncelleme')}</dt><dd className="truncate font-medium">{formatRelativeAge(selectedRequest.updated_at)}</dd></div>
              </dl>

              <Block title={txa('Talep açıklaması')}>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">{selectedRequest.description}</p>
              </Block>

              <Block title={txa('Hedef bağlantılar ({v1})', { v1: selectedRequest.target_urls.length })}>
                {selectedRequest.target_urls.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {selectedRequest.target_urls.map((url) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-[12.5px] text-foreground transition-colors hover:text-primary">
                          <span className="min-w-0 break-all">{url}</span>
                          <ExternalLink className="size-3.5 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[12.5px] text-muted-foreground">{txa('Bağlantı eklenmemiş.')}</p>}
              </Block>

              {selectedRequest.evidence.length > 0 ? (
                <Block title={txa('Ek kanıtlar')}>
                  <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-foreground">
                    {selectedRequest.evidence.map((item) => <li key={item} className="break-words">{item}</li>)}
                  </ul>
                </Block>
              ) : null}

              <Block title={txa('Beyanlar')}>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    [txa('İyi niyet'), selectedRequest.attestation_good_faith],
                    [txa('Yetki'), selectedRequest.attestation_authority],
                    [txa('Doğruluk'), selectedRequest.attestation_accuracy],
                  ] as Array<[string, boolean]>).map(([label, ok]) => (
                    <Chip key={label} className={ok ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/12 text-rose-700 dark:text-rose-300'}>
                      {ok ? <Check className="size-3" /> : <X className="size-3" />}{txa('{v1} beyanı', { v1: label })}
                    </Chip>
                  ))}
                  <Chip>{txa('E-imza: {v1}', { v1: selectedRequest.electronic_signature || '—' })}</Chip>
                </div>
              </Block>

              <div className="grid gap-3 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Admin notu')}</span>
                  <Textarea rows={3} value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} className="resize-none text-[13px]" placeholder={txa('Ek bilgi isteği, ret gerekçesi ya da iç not.')} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Sonuç özeti')}</span>
                  <Textarea rows={3} value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value)} className="resize-none text-[13px]" placeholder={txa('Uygulanan işlem, kaldırılan adresler ya da son karar.')} />
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" className="gap-1.5" disabled={actionStatus !== null} onClick={() => { void applyStatus('under_review') }}>
                  <ShieldCheck className="size-4" />
                  {actionStatus === 'under_review' ? txa('İşleniyor…') : txa('İncelemeye al')}
                </Button>
                <Button variant="outline" className="gap-1.5" disabled={actionStatus !== null} onClick={() => { void applyStatus('needs_info') }}>
                  <TriangleAlert className="size-4" />
                  {actionStatus === 'needs_info' ? txa('İşleniyor…') : txa('Ek bilgi iste')}
                </Button>
                <Button className="gap-1.5" disabled={actionStatus !== null} onClick={() => { void applyStatus('actioned') }}>
                  <Check className="size-4" />
                  {actionStatus === 'actioned' ? txa('İşleniyor…') : txa('İşlem uygulandı')}
                </Button>
                <Button variant="destructive" className="gap-1.5" disabled={actionStatus !== null} onClick={() => { void applyStatus('rejected') }}>
                  <FileWarning className="size-4" />
                  {actionStatus === 'rejected' ? txa('İşleniyor…') : txa('Reddet')}
                </Button>
              </div>
              <p className="text-[11.5px] text-muted-foreground">{txa('Ek bilgi ve ret için admin notu, "İşlem uygulandı" için sonuç özeti gerekir.')}</p>
            </div>
          ) : (
            <div className="px-5 py-12 text-center text-[12.5px] text-muted-foreground">
              {txa('İncelemek için sol listeden bir yasal talep seçin.')}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function Block({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}
