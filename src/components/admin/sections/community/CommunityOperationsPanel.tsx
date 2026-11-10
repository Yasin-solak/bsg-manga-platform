import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, PauseCircle, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { communityOperations, type CommunityOperations } from '@/services/communityOperationsService'
import { toast } from '@/services/toastService'
import { formatCommunityDate } from './communityAdminUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

const MB = 1048576

function Field({ label, hint, children }: { label: string, hint: string, children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">{label}</span>
      {children}
      <span className="text-[11.5px] text-muted-foreground">{hint}</span>
    </label>
  )
}

/**
 * Community operations: quotas and background jobs (used to be on the Operations page).
 * Refreshes every 30 s while visible; a draft is not overwritten during editing.
 */
export function CommunityOperationsPanel() {
  const [data, setData] = useState<CommunityOperations | null>(null)
  const [draft, setDraft] = useState<CommunityOperations['config'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [sampledAt, setSampledAt] = useState(0)
  const dirty = useRef(false)
  const saving = useRef(false)
  const request = useRef(0)

  useEffect(() => {
    let live = true
    let pending = false
    const refresh = async () => {
      if (pending || saving.current || document.visibilityState !== 'visible') return
      pending = true
      const sequence = ++request.current
      try {
        const value = await communityOperations()
        if (live && sequence === request.current) {
          setData(value)
          setSampledAt(Date.now())
          setDraft((previous) => (dirty.current ? previous : value.config))
          setError('')
        }
      } catch (reason) {
        if (live && sequence === request.current) setError(reason instanceof Error ? txa(reason.message) : txa('Durum alınamadı.'))
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    const visible = () => void refresh()
    document.addEventListener('visibilitychange', visible)
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [revision])

  const update = (patch: Partial<CommunityOperations['config']>) => {
    if (!draft) return
    dirty.current = true
    setDraft({ ...draft, ...patch })
  }

  const save = async () => {
    if (!draft || busy) return
    saving.current = true
    request.current++
    setBusy(true)
    try {
      const value = await communityOperations(draft)
      dirty.current = false
      setData(value)
      setDraft(value.config)
      setSampledAt(Date.now())
      toast.success(txa('Topluluk kotaları kaydedildi.'))
    } catch (reason) {
      toast.error(reason instanceof Error ? txa(reason.message) : txa('Kaydedilemedi.'))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  const delayed = Boolean(data?.enabled && data.oldest_queued_at && sampledAt - Date.parse(data.oldest_queued_at) > 120000)

  return (
    <div className="flex flex-col gap-4" data-testid="admin-community-operations">
      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</p> : null}
      {!data || !draft ? (
        !error ? <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> : null
      ) : (
        <>
          <section className="rounded-[20px] border border-border/70 bg-card/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-bold">{txa('Arka plan işleri')}</h3>
                <p className="text-[12px] text-muted-foreground">
                  {txa('{v1} mesaj bildirim kuyruğunda · Son kontrol {v2} · görünürken 30 sn’de bir yenilenir', { v1: data.queued.toLocaleString(intlLocale()), v2: new Date(sampledAt).toLocaleTimeString(intlLocale()) })}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full" disabled={busy} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="size-3.5" />{txa('Durumu yenile')}</Button>
            </div>
            {delayed ? (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-[12.5px] text-rose-700 dark:text-rose-300">
                <AlertTriangle className="mt-px size-4 shrink-0" />{txa('Bildirim kuyruğu 2 dakikadan uzun süredir bekliyor. Arka plan işini kontrol et.')}
              </p>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(['notifications', 'maintenance'] as const).map((name) => {
                const job = data.jobs.find((item) => item.job === name)
                const paused = name === 'notifications' && !data.enabled
                const stale = !paused && (!job?.last_success_at || sampledAt - Date.parse(job.last_success_at) > 180000)
                const failed = !paused && (stale || Boolean(job?.error_code))
                const Icon = paused ? PauseCircle : failed ? XCircle : CheckCircle2
                return (
                  <div key={name} className="flex items-start gap-3 rounded-xl border border-border/60 px-3.5 py-2.5" data-testid={`admin-community-job-${name}`}>
                    <Icon className={cn('mt-0.5 size-4 shrink-0', paused ? 'text-muted-foreground' : failed ? 'text-rose-500' : 'text-emerald-500')} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">{name === 'notifications' ? txa('Bildirim teslimatı') : txa('Veri temizliği')}</span>
                      <span className={cn('block text-[12px]', failed ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground')}>
                        {paused ? txa('Topluluk kapalı olduğu için planlı olarak durduruldu') : job?.error_code ? txa('İş başarısız · {v1}', { v1: job.error_code }) : stale ? txa('Güncel başarılı çalışma kaydı yok') : txa('Çalışıyor')}
                      </span>
                      <span className="block text-[11.5px] text-muted-foreground">{txa('Son başarı {v1} · {v2} ms', { v1: job?.last_success_at ? formatCommunityDate(job.last_success_at) : txa('henüz yok'), v2: job?.duration_ms ?? '—' })}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <form className="rounded-[20px] border border-border/70 bg-card/60 p-5" onSubmit={(event) => { event.preventDefault(); void save() }}>
            <h3 className="text-[14px] font-bold">{txa('Kotalar')}</h3>
            <p className="text-[12px] text-muted-foreground">{txa('Sınırı düşürmek mevcut üyeleri ya da dosyaları silmez; yalnız yeni işlemleri sınırlar.')}</p>
            <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={txa('Hesap başına oda')} hint={txa('Arşivlenen odalar da kotaya dahildir. (1–100)')}>
                <Input type="number" min={1} max={100} value={draft.rooms_per_owner} onChange={(event) => update({ rooms_per_owner: Number(event.target.value) })} className="h-9" />
              </Field>
              <Field label={txa('Sunucu başına üye')} hint="10–100.000">
                <Input type="number" min={10} max={100000} value={draft.members_per_server} onChange={(event) => update({ members_per_server: Number(event.target.value) })} className="h-9" />
              </Field>
              <Field label={txa('Sunucu dosya kapasitesi (MB)')} hint={txa('Ekler ve görseller bu sınıra sayılır.')}>
                <Input type="number" min={10} max={1048576} value={draft.storage_bytes_per_server / MB} onChange={(event) => update({ storage_bytes_per_server: Number(event.target.value) * MB })} className="h-9" />
              </Field>
              <Field label={txa('Dakikada yeni katılım')} hint={txa('Sunucu başına; ani akını yavaşlatır. (1–1000)')}>
                <Input type="number" min={1} max={1000} value={draft.joins_per_minute} onChange={(event) => update({ joins_per_minute: Number(event.target.value) })} className="h-9" />
              </Field>
            </fieldset>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
              <p className="text-[11.5px] text-muted-foreground">
                {txa('Mesaj geçmişi süresiz tutulur. Süresi dolan davetler {v1} gün, şikâyetler {v2} gün, yönetim kayıtları {v3} gün sonra temizlenir.', { v1: draft.expired_invite_days, v2: draft.report_days, v3: draft.audit_days })}
              </p>
              <Button type="submit" size="sm" disabled={busy} data-testid="admin-community-operations-save">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}{txa('Kotaları kaydet')}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
