import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, RefreshCw, ShieldAlert } from 'lucide-react'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { AdminStatCard } from '@/components/admin/shared/AdminStatCard'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { confirmDialog } from '@/services/confirmService'
import { toast } from '@/services/toastService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import {
  getTranslationStudioOverview, reviewTranslationContent, setDefaultDailyLimit, setFansubDailyLimit,
  TRANSLATION_ERROR_LABELS, TRANSLATION_STAGE_LABELS, TRANSLATION_TASK_LABELS,
  type TranslationStudioFansubRow, type TranslationStudioFlag, type TranslationStudioOverview,
} from '@/services/translationAdminService'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Translation Studio admin panel: AI usage and cost, daily page limits per fansub,
 * error distribution, model usage and content review
 * (projects with a content block on a non-18+ series).
 */

const PERIODS = [{ days: 1, get label() { return txa('Bugün') } }, { days: 7, get label() { return txa('7 gün') } }, { days: 30, get label() { return txa('30 gün') } }] as const

const usd = (value: number) => `$${value < 1 ? value.toFixed(3) : value.toFixed(2)}`
const int = (value: number) => value.toLocaleString(intlLocale())
const percent = (part: number, whole: number) => (whole ? txa('%{v1}', { v1: Math.round((part / whole) * 100) }) : '—')
const dateTime = (value: string | null) => (value ? new Date(value).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '—')

export default function AdminTranslationStudioSection() {
  const [days, setDays] = useState<number>(7)
  const [data, setData] = useState<TranslationStudioOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      setData(await getTranslationStudioOverview(days, signal))
      setError(null)
    } catch (reason) {
      if (!signal?.aborted) setError(toUserFacingErrorMessage(reason, txa('Çeviri Stüdyosu özeti okunamadı.')))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [days])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const totals = data?.totals
  return (
    <div className="space-y-6" data-testid="admin-translation-studio">
      <AdminSectionHeader
        title={txa('Çeviri Stüdyosu')}
        description={txa('Yapay zekâ kullanımı, maliyet, fansub limitleri ve içerik denetimi.')}
        actions={(
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              {PERIODS.map((period) => (
                <button
                  key={period.days}
                  type="button"
                  onClick={() => setDays(period.days)}
                  className={cn('rounded-md px-3 py-1 text-xs font-semibold', days === period.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                >
                  {period.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => { void load() }} disabled={loading}>
              <RefreshCw className="mr-2 size-4" />
              {txa('Yenile')}
            </Button>
          </div>
        )}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && totals && (
        <>
          {data.flags.length > 0 && <ContentFlags flags={data.flags} onChanged={() => { void load() }} />}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <AdminStatCard label={txa('Yapay zekâ maliyeti')} value={usd(totals.costUsd)} />
            <AdminStatCard label={txa('Sayılan sayfa (limit)')} value={int(totals.pages)} />
            <AdminStatCard label={txa('Bugün sayılan sayfa')} value={int(totals.todayPages)} />
            <AdminStatCard label={txa('İş / başarı')} value={`${int(totals.jobs)} · ${percent(totals.jobs - totals.failed, totals.jobs)}`} />
            <AdminStatCard label={txa('İçerik engeli')} value={int(totals.blocked)} />
            <AdminStatCard label={txa('Token (girdi / çıktı)')} value={`${Math.round(totals.inputTokens / 1000)}k / ${Math.round(totals.outputTokens / 1000)}k`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <DailyChart daily={data.daily} />
            <AdminSurface className="space-y-3 p-4">
              <p className="text-sm font-semibold">{txa('Projeler')}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label={txa('Toplam')} value={int(totals.projects)} />
                <Metric label={txa('Yayınlanan')} value={int(totals.published)} />
                <Metric label={txa('Seri talebi')} value={int(totals.pendingDrafts)} />
              </div>
              <div className="space-y-1.5">
                {Object.entries(data.stages).sort((a, b) => b[1] - a[1]).map(([stage, count]) => (
                  <Bar key={stage} label={TRANSLATION_STAGE_LABELS[stage] ?? stage} value={count} max={totals.projects} />
                ))}
              </div>
              <p className="pt-1 text-xs text-muted-foreground">{txa('Aktif fansub (dönemde yapay zekâ kullanan): {v1}', { v1: int(totals.activeFansubs) })}</p>
            </AdminSurface>
          </div>

          <FansubTable rows={data.fansubs} defaultLimit={data.defaultLimit} onChanged={() => { void load() }} />

          <div className="grid gap-4 lg:grid-cols-2">
            <AdminSurface className="space-y-2 p-4">
              <p className="text-sm font-semibold">{txa('Hata nedenleri')}</p>
              {Object.keys(data.errors).length === 0
                ? <p className="text-sm text-muted-foreground">{txa('Bu dönemde hata yok.')}</p>
                : Object.entries(data.errors).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
                  <Bar key={code} label={TRANSLATION_ERROR_LABELS[code] ?? code} value={count} max={totals.failed} tone={code === 'content_blocked' ? 'danger' : 'default'} />
                ))}
            </AdminSurface>
            <AdminSurface className="space-y-2 p-4">
              <p className="text-sm font-semibold">{txa('Model kullanımı')}</p>
              {data.models.length === 0
                ? <p className="text-sm text-muted-foreground">{txa('Bu dönemde yapay zekâ çağrısı yok.')}</p>
                : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr><th className="py-1 font-medium">{txa('Görev')}</th><th className="font-medium">{txa('Model')}</th><th className="text-right font-medium">{txa('İş')}</th><th className="text-right font-medium">{txa('Maliyet')}</th></tr>
                    </thead>
                    <tbody>
                      {data.models.map((row) => (
                        <tr key={`${row.task}-${row.provider}-${row.model}`} className="border-t border-border">
                          <td className="py-1.5">{TRANSLATION_TASK_LABELS[row.task] ?? row.task}</td>
                          <td className="text-muted-foreground">{row.model}</td>
                          <td className="text-right tabular-nums">{int(row.jobs)}</td>
                          <td className="text-right tabular-nums">{usd(row.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </AdminSurface>
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string, value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function Bar({ label, value, max, tone = 'default' }: { label: string, value: number, max: number, tone?: 'default' | 'danger' }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span>{label}</span><span className="tabular-nums text-muted-foreground">{int(value)}</span></div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className={cn('h-1.5 rounded-full', tone === 'danger' ? 'bg-destructive' : 'bg-primary')} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  )
}

function DailyChart({ daily }: { daily: TranslationStudioOverview['daily'] }) {
  const maxPages = Math.max(1, ...daily.map((day) => day.pages))
  const maxCost = Math.max(0.0001, ...daily.map((day) => day.costUsd))
  return (
    <AdminSurface className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{txa('Günlük kullanım')}</p>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" />{txa('Sayfa')}</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-amber-500" />{txa('Maliyet')}</span>
        </div>
      </div>
      <div className="flex h-40 items-end gap-1" data-testid="admin-translation-daily">
        {daily.map((day) => (
          <div key={day.day} className="group relative flex h-full flex-1 items-end justify-center gap-px" title={txa('{v1}: {v2} sayfa · {v3}', { v1: new Date(day.day).toLocaleDateString(intlLocale()), v2: day.pages, v3: usd(day.costUsd) })}>
            <div className="w-1/2 rounded-t bg-primary/80" style={{ height: `${(day.pages / maxPages) * 100}%`, minHeight: day.pages ? 2 : 0 }} />
            <div className="w-1/2 rounded-t bg-amber-500/80" style={{ height: `${(day.costUsd / maxCost) * 100}%`, minHeight: day.costUsd ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground">
        <span>{daily[0] ? new Date(daily[0].day).toLocaleDateString(intlLocale()) : ''}</span>
        <span>{daily.length ? new Date(daily[daily.length - 1].day).toLocaleDateString(intlLocale()) : ''}</span>
      </div>
    </AdminSurface>
  )
}

function FansubTable({ rows, defaultLimit, onChanged }: { rows: TranslationStudioFansubRow[], defaultLimit: number, onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [defaultDraft, setDefaultDraft] = useState(String(defaultLimit))
  const [saving, setSaving] = useState(false)
  useEffect(() => setDefaultDraft(String(defaultLimit)), [defaultLimit])

  const save = async (action: () => Promise<void>, message: string) => {
    setSaving(true)
    try {
      await action()
      toast.success(message)
      setEditing(null)
      onChanged()
    } catch (reason) {
      toast.error(toUserFacingErrorMessage(reason, txa('Kaydedilemedi.')))
    } finally {
      setSaving(false)
    }
  }
  const parsedDefault = Number(defaultDraft)
  return (
    <AdminSurface className="p-4" data-testid="admin-translation-fansubs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{txa('Fansublar ve günlük sayfa limiti')}</p>
          <p className="text-xs text-muted-foreground">{txa('Sayfa, ekip için günde bir kez sayılır (tarama + çeviri + yeniden okuma). Gün İstanbul saatine göre döner.')}</p>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (Number.isInteger(parsedDefault) && parsedDefault >= 0) void save(() => setDefaultDailyLimit(parsedDefault), txa('Varsayılan limit kaydedildi'))
          }}
        >
          <span className="text-xs text-muted-foreground">{txa('Varsayılan')}</span>
          <Input value={defaultDraft} onChange={(event) => setDefaultDraft(event.target.value.replace(/\D/g, ''))} className="h-8 w-20" inputMode="numeric" data-testid="admin-translation-default-limit" />
          <Button size="sm" type="submit" disabled={saving || String(defaultLimit) === defaultDraft || !defaultDraft}>{txa('Kaydet')}</Button>
        </form>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">{txa('Fansub')}</th>
              <th className="font-medium">{txa('Bugün / limit')}</th>
              <th className="text-right font-medium">{txa('Dönem sayfa')}</th>
              <th className="text-right font-medium">{txa('Maliyet')}</th>
              <th className="text-right font-medium">{txa('İş')}</th>
              <th className="text-right font-medium">{txa('Hata')}</th>
              <th className="text-right font-medium">{txa('Engel')}</th>
              <th className="text-right font-medium">{txa('Proje / yayın')}</th>
              <th className="text-right font-medium">{txa('Son etkinlik')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const ratio = row.dailyLimit ? row.todayPages / row.dailyLimit : 1
              return (
                <tr key={row.id} className="border-t border-border align-middle">
                  <td className="py-2 font-medium">{row.name}</td>
                  <td>
                    {editing === row.id ? (
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const value = draft.trim() === '' ? null : Number(draft)
                          if (value === null || (Number.isInteger(value) && value >= 0)) void save(() => setFansubDailyLimit(row.id, value), txa('{v1} limiti kaydedildi', { v1: row.name }))
                        }}
                      >
                        <Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))} placeholder={txa('{v1} (varsayılan)', { v1: defaultLimit })} className="h-7 w-28" inputMode="numeric" />
                        <Button size="sm" type="submit" disabled={saving} className="h-7 px-2"><Check className="size-3.5" /></Button>
                        <button type="button" className="text-xs text-muted-foreground" onClick={() => setEditing(null)}>{txa('Vazgeç')}</button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setEditing(row.id); setDraft(row.customLimit ? String(row.dailyLimit) : '') }}
                        className="flex w-44 flex-col gap-1 text-left"
                        title={txa('Limiti değiştir (boş = varsayılan, 0 = yapay zekâ kapalı)')}
                        data-testid="admin-translation-limit"
                      >
                        <span className="text-xs tabular-nums">
                          {int(row.todayPages)} / {row.dailyLimit === 0 ? txa('kapalı') : int(row.dailyLimit)}
                          {row.customLimit && <span className="ml-1.5 rounded bg-primary/15 px-1 text-[10px] text-primary">{txa('özel')}</span>}
                        </span>
                        <span className="h-1.5 w-full rounded-full bg-muted">
                          <span className={cn('block h-1.5 rounded-full', ratio >= 1 ? 'bg-destructive' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{int(row.periodPages)}</td>
                  <td className="text-right tabular-nums">{usd(row.costUsd)}</td>
                  <td className="text-right tabular-nums">{int(row.jobs)}</td>
                  <td className="text-right tabular-nums">{row.failed ? `${int(row.failed)} (${percent(row.failed, row.jobs)})` : '—'}</td>
                  <td className={cn('text-right tabular-nums', row.blocked > 0 && 'font-semibold text-destructive')}>{row.blocked || '—'}</td>
                  <td className="text-right tabular-nums">{int(row.projects)} / {int(row.published)}</td>
                  <td className="text-right text-xs text-muted-foreground">{dateTime(row.lastActivity)}</td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">{txa('Henüz stüdyo kullanan fansub yok.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminSurface>
  )
}

function ContentFlags({ flags, onChanged }: { flags: TranslationStudioFlag[], onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const decide = async (flag: TranslationStudioFlag, decision: 'mature' | 'ok') => {
    if (decision === 'mature') {
      const confirmed = await confirmDialog({
        title: txa('Seriyi +18 işaretle'),
        message: txa('"{v1}" +18 olarak işaretlenecek. Bu serinin tüm bölümlerinde yapay zekâ kapanır ve seri yetişkin içerik olarak gösterilir.', { v1: flag.title }),
        confirmText: txa('+18 işaretle'),
        cancelText: txa('Vazgeç'),
        variant: 'danger',
      })
      if (!confirmed) return
    }
    setBusy(flag.projectId)
    try {
      await reviewTranslationContent(flag.projectId, decision)
      toast.success(decision === 'mature' ? txa('"{v1}" +18 işaretlendi', { v1: flag.title }) : txa('Uyarı kapatıldı'))
      onChanged()
    } catch (reason) {
      toast.error(toUserFacingErrorMessage(reason, txa('Karar kaydedilemedi.')))
    } finally {
      setBusy(null)
    }
  }
  return (
    <AdminSurface tone="accent" className="space-y-3 border-destructive/40 bg-destructive/5 p-4" data-testid="admin-translation-flags">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-5 text-destructive" />
        <div>
          <p className="text-sm font-semibold">{txa('İçerik denetimi: +18 olmayan seride içerik engeli')}</p>
          <p className="text-xs text-muted-foreground">
            {txa('Yapay zekâ bu projelerin sayfalarını güvenlik politikası nedeniyle işlemedi. Seri aslında yetişkin içerikse +18 işaretleyin; şiddet vb. yanlış alarm ise uyarıyı kapatın (yeni engel gelirse tekrar listelenir).')}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {flags.map((flag) => (
          <div key={flag.projectId} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
            <AlertTriangle className="size-4 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{txa('{v1} · Bölüm {v2}', { v1: flag.title, v2: flag.chapter })}</p>
              <p className="text-xs text-muted-foreground">{txa('{v1} · {v2} sayfada {v3} engel · son {v4}', { v1: flag.fansubName ?? txa('Fansub'), v2: flag.pages, v3: flag.blocked, v4: dateTime(flag.lastAt) })}</p>
            </div>
            <Button size="sm" variant="destructive" disabled={busy === flag.projectId} onClick={() => { void decide(flag, 'mature') }}>{txa('+18 işaretle')}</Button>
            <Button size="sm" variant="outline" disabled={busy === flag.projectId} onClick={() => { void decide(flag, 'ok') }}>{txa('Sorun yok')}</Button>
          </div>
        ))}
      </div>
    </AdminSurface>
  )
}
