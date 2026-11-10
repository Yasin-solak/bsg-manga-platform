import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookPlus, Check, Link2, Loader2, RefreshCw, Search, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from '@/services/toastService'
import {
  approveSeriesDraft, listPendingSeriesDrafts, listStudioSeries, rejectSeriesDraft, TL_SOURCE_LANGUAGES,
  type TlSeries, type TlSeriesDraft,
} from '@/services/translationStudioService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { AdminEntityHoverCard } from './shared/AdminEntityHoverCard'
import { findSimilarSeries } from './seriesRequestMatching'
import { intlLocale, txa } from '@/i18n/activeLocale'

const REJECT_PRESETS = [
  { id: 'exists', get label() { return txa('Sitede zaten var') }, get message() { return txa('Bu seri sitede zaten var; bölümlerini mevcut seriye yükleyebilirsiniz.') } },
  { id: 'copyright', get label() { return txa('Telif riski') }, get message() { return txa('Seri için telif / lisans riski görüldü.') } },
  { id: 'info', get label() { return txa('Eksik / hatalı bilgi') }, get message() { return txa('Seri bilgileri eksik ya da hatalı; düzeltip yeniden talep açın.') } },
  { id: 'content', get label() { return txa('Uygunsuz içerik') }, get message() { return txa('Seri içerik kurallarımıza uymuyor.') } },
]

type Busy = { id: string, kind: 'approve' | 'link' | 'reject' } | null

/**
 * Translation Studio V3 series requests: a fansub opens a draft for a series not on the site;
 * when an admin approves, the series is created (or linked to an existing one) and chapter projects
 * tied to the draft move to the series and open for publishing. If a similar series exists the card
 * warns (link rather than duplicate). The rejection reason goes to the team as a notification.
 */
export default function AdminSeriesRequestsSection() {
  const [drafts, setDrafts] = useState<TlSeriesDraft[]>([])
  const [similar, setSimilar] = useState<Record<string, TlSeries>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [linkDraft, setLinkDraft] = useState<TlSeriesDraft | null>(null)
  const [rejectDraft, setRejectDraft] = useState<TlSeriesDraft | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const rows = await listPendingSeriesDrafts(signal)
      setDrafts(rows)
      setError(null)
      // Duplicate check: search the site for the same / similar title for the first 20 requests.
      const found: Record<string, TlSeries> = {}
      await Promise.all(rows.slice(0, 20).map(async (draft) => {
        try {
          const match = findSimilarSeries(draft.title, await listStudioSeries('', draft.title, signal))
            ?? (draft.originalTitle ? findSimilarSeries(draft.originalTitle, await listStudioSeries('', draft.originalTitle, signal)) : null)
          if (match) found[draft.id] = match
        } catch {
          // benzer seri aramasi yardimci bilgi; hata sayfayi bozmaz
        }
      }))
      if (!signal?.aborted) setSimilar(found)
    } catch (reason) {
      if (!signal?.aborted) setError(toUserFacingErrorMessage(reason, txa('Seri talepleri okunamadı.')))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const run = async (draft: TlSeriesDraft, kind: NonNullable<Busy>['kind'], action: () => Promise<unknown>, success: string) => {
    setBusy({ id: draft.id, kind })
    try {
      await action()
      toast.success(success)
      setDrafts((current) => current.filter((entry) => entry.id !== draft.id))
      setLinkDraft(null)
      setRejectDraft(null)
    } catch (reason) {
      toast.error(toUserFacingErrorMessage(reason, txa('İşlem tamamlanamadı.')))
    } finally {
      setBusy(null)
    }
  }

  const linkTo = (draft: TlSeriesDraft, series: TlSeries) => run(draft, 'link', () => approveSeriesDraft(draft.id, series.id), txa('"{v1}", "{v2}" serisine bağlandı', { v1: draft.title, v2: series.title }))

  const oldest = drafts.reduce<string | null>((min, draft) => (!min || draft.createdAt < min ? draft.createdAt : min), null)

  return (
    <section className="flex flex-col gap-4" data-testid="admin-series-requests-section">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-black leading-tight tracking-tight text-foreground">{txa('Seri talepleri')}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {loading && !drafts.length
              ? txa('Yükleniyor…')
              : drafts.length
                ? txa("{v1} seri onay bekliyor{v2} · fansubların Çeviri Stüdyosu'nda açtığı, sitede olmayan seriler", { v1: drafts.length, v2: oldest ? txa(' · en eskisi {v1}', { v1: new Date(oldest).toLocaleDateString(intlLocale()) }) : '' })
                : txa("Fansubların Çeviri Stüdyosu'nda açtığı, sitede olmayan seriler.")}
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" onClick={() => { void load() }} disabled={loading}>
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          {txa('Yenile')}
        </Button>
      </header>

      {error ? (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-[13px]">
          <TriangleAlert className="size-4 text-rose-500" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => { void load() }}>{txa('Tekrar dene')}</Button>
        </div>
      ) : null}

      {loading && !drafts.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {[0, 1].map((index) => <div key={index} className="h-[150px] animate-pulse rounded-[20px] border border-border/60 bg-muted/30" />)}
        </div>
      ) : !error && drafts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check className="size-5" /></span>
          <b className="text-[14px]">{txa('Bekleyen seri talebi yok')}</b>
          <span className="max-w-[420px] text-[12.5px] text-muted-foreground">{txa('Bir fansub stüdyoda sitede olmayan bir seri için bölüm açtığında talep burada görünür.')}</span>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2" data-testid="admin-series-requests">
        {drafts.map((draft) => {
          const match = similar[draft.id]
          const isBusy = busy?.id === draft.id
          return (
            <article key={draft.id} className="flex gap-4 rounded-[20px] border border-border/70 bg-card/60 p-4" data-testid={`admin-series-request-${draft.id}`}>
              {draft.coverUrl
                ? <img src={draft.coverUrl} alt="" className="h-[118px] w-[84px] flex-none rounded-lg object-cover" />
                : <div className="flex h-[118px] w-[84px] flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground"><BookPlus className="size-5" /></div>}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[15px] font-bold">
                    <span className="truncate">{draft.title}</span>
                    {draft.isMature && (
                      <span className="flex-none rounded bg-destructive px-1.5 py-0.5 text-[10.5px] font-bold text-destructive-foreground" title={txa('Yetişkin seri: onayda +18 işaretlenir')} data-testid="admin-series-request-mature">+18</span>
                    )}
                    {/* Ret ikincil eylem: kosede, onay dugmeleri tek satira sigsin. */}
                    <Button size="sm" variant="ghost" className="ml-auto h-7 flex-none gap-1 px-2 text-[12px] text-rose-600 hover:text-rose-600 dark:text-rose-300" disabled={isBusy} onClick={() => setRejectDraft(draft)}>
                      <X className="size-3.5" />
                      {txa('Reddet…')}
                    </Button>
                  </p>
                  <p className="truncate text-[12.5px] text-muted-foreground">
                    {draft.originalTitle || txa('Özgün adı yok')} · {TL_SOURCE_LANGUAGES[draft.sourceLanguage].label}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    <AdminEntityHoverCard kind="fansub" entityKey={draft.fansubId}>{draft.fansubName}</AdminEntityHoverCard>
                    {' · '}{new Date(draft.createdAt).toLocaleDateString(intlLocale())}
                    {draft.chapters.length ? txa(' · {v1} bölüm ({v2}{v3})', { v1: draft.chapters.length, v2: draft.chapters.slice(0, 6).join(', '), v3: draft.chapters.length > 6 ? '…' : '' }) : txa(' · henüz bölüm yok')}
                  </p>
                </div>
                {draft.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {draft.genres.slice(0, 6).map((genre) => <span key={genre} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{genre}</span>)}
                    {draft.genres.length > 6 ? <span className="text-[11px] text-muted-foreground">+{draft.genres.length - 6}</span> : null}
                  </div>
                )}

                {match ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/[0.09] px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300" data-testid="admin-series-request-similar">
                    <TriangleAlert className="size-3.5 flex-none" />
                    <span className="min-w-0 flex-1 truncate">{txa('Sitede benzer seri var:')} <b><AdminEntityHoverCard kind="manga" entityKey={match.id}>{match.title}</AdminEntityHoverCard></b></span>
                    <Button size="sm" variant="outline" className="h-7 border-amber-500/40 px-2.5 text-[12px]" disabled={isBusy} onClick={() => { void linkTo(draft, match) }}>
                      {txa('Buna bağla')}
                    </Button>
                  </div>
                ) : null}

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={isBusy}
                    onClick={() => { void run(draft, 'approve', () => approveSeriesDraft(draft.id), txa('"{v1}" seri olarak eklendi', { v1: draft.title })) }}
                  >
                    {isBusy && busy?.kind === 'approve' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    {txa('Yeni seri olarak onayla')}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={isBusy} onClick={() => setLinkDraft(draft)}>
                    <Link2 className="size-4" />
                    {txa('Mevcut seriye bağla')}
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <SeriesLinkDialog
        draft={linkDraft}
        busy={busy?.kind === 'link'}
        onClose={() => setLinkDraft(null)}
        onPick={(draft, series) => { void linkTo(draft, series) }}
      />
      <SeriesRejectDialog
        draft={rejectDraft}
        busy={busy?.kind === 'reject'}
        onClose={() => setRejectDraft(null)}
        onConfirm={(draft, note) => { void run(draft, 'reject', () => rejectSeriesDraft(draft.id, note), txa('Seri talebi reddedildi; ekibe bildirildi')) }}
      />
    </section>
  )
}

/** Linking to an existing series: search, selection and result summary in one dialog. */
function SeriesLinkDialog({ draft, busy, onClose, onPick }: {
  draft: TlSeriesDraft | null
  busy: boolean
  onClose: () => void
  onPick: (draft: TlSeriesDraft, series: TlSeries) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TlSeries[] | null>(null)
  const [picked, setPicked] = useState<TlSeries | null>(null)

  useEffect(() => {
    setQuery(draft?.title ?? '')
    setPicked(null)
  }, [draft?.id, draft?.title])

  useEffect(() => {
    if (!draft) return undefined
    const controller = new AbortController()
    setResults(null)
    const timer = setTimeout(() => {
      listStudioSeries('', query, controller.signal).then((rows) => setResults(rows.slice(0, 10))).catch(() => setResults([]))
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [draft, query])

  const chapters = draft?.chapters.length ?? 0
  const summary = useMemo(() => (draft && picked
    ? txa('"{v1}" talebi "{v2}" serisine bağlanır; {v3}.', { v1: draft.title, v2: picked.title, v3: chapters ? txa('{v1} bölüm projesi bu seriye taşınır', { v1: chapters }) : txa('henüz bölüm projesi yok') })
    : null), [chapters, draft, picked])

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] gap-0 p-0 sm:max-w-[560px]" data-testid="admin-series-link-dialog">
        <DialogHeader className="px-6 pb-3 pt-5 text-left">
          <DialogTitle>{txa('Mevcut seriye bağla')}</DialogTitle>
          <DialogDescription>{txa('Talep yeni seri açmadan sitedeki seriye bağlanır.')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={txa('Seri ara')} aria-label={txa('Bağlanacak seriyi ara')} className="pl-9" />
          </div>
          <div className="flex max-h-[300px] flex-col gap-1 overflow-y-auto">
            {results === null ? <span className="px-1 py-3 text-center text-[12.5px] text-muted-foreground">{txa('Aranıyor…')}</span> : null}
            {results?.length === 0 ? <span className="px-1 py-3 text-center text-[12.5px] text-muted-foreground">{txa('Sonuç yok. Farklı bir ad dene.')}</span> : null}
            {results?.map((series) => (
              <button
                key={series.id}
                type="button"
                aria-pressed={picked?.id === series.id}
                onClick={() => setPicked(series)}
                className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors', picked?.id === series.id ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/60')}
              >
                {series.coverUrl ? <img src={series.coverUrl} alt="" className="h-11 w-8 rounded object-cover" /> : <span className="h-11 w-8 rounded bg-muted" />}
                <span className="min-w-0 flex-1 truncate font-medium">{series.title}</span>
                <span className="text-[11px] text-muted-foreground">{TL_SOURCE_LANGUAGES[series.sourceLanguage].label}</span>
              </button>
            ))}
          </div>
          {summary ? <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-[12.5px]">{summary}</p> : null}
        </div>
        <DialogFooter className="border-t border-border/60 px-6 py-3">
          <Button variant="ghost" disabled={busy} onClick={onClose}>{txa('Vazgeç')}</Button>
          <Button disabled={!picked || busy || !draft} onClick={() => { if (draft && picked) onPick(draft, picked) }} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            {txa('Bağla')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SeriesRejectDialog({ draft, busy, onClose, onConfirm }: {
  draft: TlSeriesDraft | null
  busy: boolean
  onClose: () => void
  onConfirm: (draft: TlSeriesDraft, note: string) => void
}) {
  const [note, setNote] = useState('')
  const [presetId, setPresetId] = useState<string | null>(null)
  useEffect(() => { setNote(''); setPresetId(null) }, [draft?.id])

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] gap-0 p-0 sm:max-w-[520px]" data-testid="admin-series-reject-dialog">
        <DialogHeader className="px-6 pb-3 pt-5 text-left">
          <DialogTitle>{txa('Seri talebini reddet')}</DialogTitle>
          <DialogDescription className="truncate">{draft?.title} · {draft?.fansubName}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pb-5">
          <p className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
            {txa('Ekip bu seriyle yayın yapamaz; gerekçe ekibe bildirim olarak gider.')}
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={txa('Hazır gerekçeler')}>
            {REJECT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={presetId === preset.id}
                onClick={() => { setPresetId(preset.id); setNote(preset.message) }}
                className={cn('rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors', presetId === preset.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
              {txa('Gerekçe (isteğe bağlı)')}
              <span className="font-medium normal-case tracking-normal tabular-nums">{note.length}/500</span>
            </span>
            <Textarea value={note} onChange={(event) => { setNote(event.target.value.slice(0, 500)); setPresetId(null) }} rows={3} className="resize-none text-[13px]" placeholder={txa('Ekibe iletilecek kısa bir not.')} />
          </label>
        </div>
        <DialogFooter className="border-t border-border/60 px-6 py-3">
          <Button variant="ghost" disabled={busy} onClick={onClose}>{txa('Vazgeç')}</Button>
          <Button variant="destructive" disabled={busy || !draft} onClick={() => { if (draft) onConfirm(draft, note.trim()) }} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            {txa('Reddet')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
