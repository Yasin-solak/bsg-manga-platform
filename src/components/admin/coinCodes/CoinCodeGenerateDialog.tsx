import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Copy, Download, Loader2, Save, ShieldAlert, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { createAdminCoinCodeBatch, type AdminRedeemCodeItem, type RedeemCodeTargetType } from '@/services/redeemCodeService'
import { toast } from '@/services/toastService'
import {
  buildGenerationChecks,
  createDefaultGenerationForm,
  downloadCsv,
  evaluateCoinCodeGenerationRisk,
  formatCodeTarget,
  formatDateTime,
  isGenerationFormReady,
  sampleCoinCode,
  toErrorMessage,
  type GenerationFormState,
} from './coinCodeManagementUtils'
import { coinCodeTemplateStorageSchema, type CoinCodeTemplate } from './coinCodeTemplateSchema'
import { intlLocale, txa } from '@/i18n/activeLocale'

const STORAGE_KEY = 'bsgmanga.admin.coin-code-templates.v1'

const BUILTIN_TEMPLATES: CoinCodeTemplate[] = [
  { id: 'general-user', get label() { return txa('Genel kullanıcı kuponu') }, prefix: 'BSGK', value: 250, count: 100, maxUses: 1, targetType: 'user' },
  { id: 'fansub-special', get label() { return txa('Fansub özel kodu') }, prefix: 'FAN', value: 500, count: 50, maxUses: 1, targetType: 'fansub' },
  { id: 'campaign', get label() { return txa('Kampanya kodları') }, prefix: 'CMP', value: 1_000, count: 200, maxUses: 1, targetType: 'both' },
]

const RISK_META = {
  low: { get label() { return txa('Düşük risk') }, tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  medium: { get label() { return txa('Orta risk') }, tone: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' },
  high: { get label() { return txa('Yüksek risk') }, tone: 'bg-rose-500/12 text-rose-700 dark:text-rose-300' },
  critical: { get label() { return txa('Kritik risk') }, tone: 'bg-rose-500/20 text-rose-800 dark:text-rose-200' },
} as const

function readCustomTemplates(): CoinCodeTemplate[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      const result = coinCodeTemplateStorageSchema.safeParse(entry)
      return result.success ? [{ ...result.data, custom: true }] : []
    })
  } catch {
    return []
  }
}

function writeCustomTemplates(templates: CoinCodeTemplate[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch {
    toast.warning(txa('Şablon bu tarayıcıya kaydedilemedi.'))
  }
}

/**
 * New code group: template, fields, a sample code in the real format, maximum distribution
 * and risk. High/critical risk needs an explicit confirm. After generation the codes are shown in the same
 * dialog (copy / CSV): once closed they do not appear in bulk again,
 * while the list is always accessible.
 */
export function CoinCodeGenerateDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<GenerationFormState>(() => createDefaultGenerationForm())
  const [custom, setCustom] = useState<CoinCodeTemplate[]>([])
  const [riskAccepted, setRiskAccepted] = useState(false)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<AdminRedeemCodeItem[] | null>(null)

  useEffect(() => {
    if (!open) return
    setCustom(readCustomTemplates())
    setCreated(null)
    setRiskAccepted(false)
  }, [open])

  const risk = useMemo(() => evaluateCoinCodeGenerationRisk(form), [form])
  const checks = useMemo(() => buildGenerationChecks(form), [form])
  const ready = isGenerationFormReady(form)
  const needsAccept = risk.riskLevel === 'high' || risk.riskLevel === 'critical'
  const failing = checks.filter((check) => !check.ok)

  const set = <K extends keyof GenerationFormState>(key: K, value: GenerationFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setRiskAccepted(false)
  }

  const applyTemplate = (template: CoinCodeTemplate) => {
    setForm((current) => ({ ...current, prefix: template.prefix, value: template.value, count: template.count, maxUses: template.maxUses, targetType: template.targetType }))
    setRiskAccepted(false)
  }

  const saveTemplate = () => {
    const label = txa('{v1} · {v2} coin', { v1: form.prefix.trim().toUpperCase() || 'KOD', v2: form.value.toLocaleString(intlLocale()) })
    const parsed = coinCodeTemplateStorageSchema.safeParse({ id: `custom-${Date.now()}`, label, prefix: form.prefix, value: form.value, count: form.count, maxUses: form.maxUses, targetType: form.targetType, custom: true })
    if (!parsed.success) {
      toast.warning(txa(parsed.error.issues[0]?.message ?? 'Şablon kaydedilemedi.'))
      return
    }
    const next = [...custom, parsed.data].slice(-8)
    setCustom(next)
    writeCustomTemplates(next)
    toast.success(txa('Şablon bu tarayıcıya kaydedildi.'))
  }

  const removeTemplate = (id: string) => {
    const next = custom.filter((template) => template.id !== id)
    setCustom(next)
    writeCustomTemplates(next)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || (needsAccept && !riskAccepted)) return
    setCreating(true)
    try {
      const items = await createAdminCoinCodeBatch({
        value: form.value,
        count: form.count,
        maxUses: form.maxUses,
        targetType: form.targetType,
        prefix: form.prefix,
        expiresAt: form.expiresAt,
        seriesLabel: form.seriesLabel,
        distributionChannel: form.distributionChannel,
        notes: form.notes,
      })
      setCreated(items)
      toast.success(txa('{v1} kod üretildi.', { v1: items.length }))
      onCreated()
    } catch (error) {
      toast.error(toErrorMessage(error, txa('Kodlar üretilemedi.')))
    } finally {
      setCreating(false)
    }
  }

  const copyAll = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.map((item) => item.code).join('\n'))
      toast.success(txa('{v1} kod panoya kopyalandı.', { v1: created.length }))
    } catch {
      toast.error(txa('Panoya kopyalanamadı.'))
    }
  }

  const exportCreated = () => {
    if (!created) return
    downloadCsv(`coin-kodlari-${new Date().toISOString().slice(0, 10)}.csv`, [
      [txa('Kod'), txa('Coin'), txa('Hedef'), txa('Kullanım limiti'), txa('Son kullanma'), txa('Seri'), txa('Kanal')],
      ...created.map((item) => [item.code, item.value, formatCodeTarget(item.targetType), item.maxUses, formatDateTime(item.expiresAt), item.seriesLabel, item.distributionChannel]),
    ])
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!creating) onOpenChange(next) }}>
      <DialogContent className="max-h-[92dvh] max-w-[calc(100vw-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-[640px]" data-testid="coin-code-generate-dialog">
        <DialogHeader>
          <DialogTitle>{created ? txa('{v1} kod üretildi', { v1: created.length }) : txa('Yeni kod grubu')}</DialogTitle>
          <DialogDescription>
            {created ? txa('Kodları şimdi kopyala ya da indir; sonra da Kodlar listesinden erişebilirsin.') : txa('Bir kişi bir kodu yalnız bir kez kullanır; kullanım limiti kaç farklı kişinin kullanabileceğidir. Üretim denetim kaydına yazılır.')}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <>
            <ul className="max-h-64 divide-y divide-border/50 overflow-y-auto rounded-xl border border-border/60 font-mono text-[12.5px]" data-testid="coin-code-created-list">
              {created.map((item) => <li key={item.id} className="px-3 py-1.5">{item.code}</li>)}
            </ul>
            <DialogFooter>
              <Button variant="outline" className="gap-1.5" onClick={exportCreated}><Download className="size-4" />{txa('CSV indir')}</Button>
              <Button variant="outline" className="gap-1.5" onClick={() => { void copyAll() }} data-testid="coin-code-copy-all"><Copy className="size-4" />{txa('Hepsini kopyala')}</Button>
              <Button onClick={() => onOpenChange(false)}>{txa('Bitti')}</Button>
            </DialogFooter>
          </>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(event) => { void submit(event) }}>
            <div className="flex flex-wrap items-center gap-1.5" aria-label={txa('Şablonlar')}>
              {[...BUILTIN_TEMPLATES, ...custom].map((template) => (
                <span key={template.id} className="inline-flex items-center rounded-full border border-border text-[12px]">
                  <button type="button" className="px-2.5 py-1 font-semibold hover:text-primary" onClick={() => applyTemplate(template)}>{template.label}</button>
                  {template.custom ? <button type="button" aria-label={txa('{v1} şablonunu sil', { v1: template.label })} className="pr-2 text-muted-foreground hover:text-foreground" onClick={() => removeTemplate(template.id)}><X className="size-3" /></button> : null}
                </span>
              ))}
              <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[12px]" onClick={saveTemplate}><Save className="size-3.5" />{txa('Şablon olarak kaydet')}</Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coin-prefix">{txa('Önek')}</Label>
                <Input id="coin-prefix" value={form.prefix} maxLength={8} onChange={(event) => set('prefix', event.target.value)} aria-invalid={failing.some((check) => check.id === 'prefix')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coin-value">{txa('Coin')}</Label>
                <Input id="coin-value" type="number" min={1} value={form.value} onChange={(event) => set('value', Number(event.target.value))} aria-invalid={failing.some((check) => check.id === 'value')} data-testid="coin-code-value" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coin-count">{txa('Adet')}</Label>
                <Input id="coin-count" type="number" min={1} max={500} value={form.count} onChange={(event) => set('count', Number(event.target.value))} aria-invalid={failing.some((check) => check.id === 'count')} data-testid="coin-code-count" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coin-uses">{txa('Kaç kişi kullanabilir')}</Label>
                <Input id="coin-uses" type="number" min={1} value={form.maxUses} onChange={(event) => set('maxUses', Number(event.target.value))} aria-invalid={failing.some((check) => check.id === 'maxUses')} data-testid="coin-code-uses" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{txa('Nereye yüklenir')}</Label>
                <Select value={form.targetType} onValueChange={(value) => set('targetType', value as RedeemCodeTargetType)}>
                  <SelectTrigger aria-label={txa('Nereye yüklenir')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{txa('Kişisel bakiye')}</SelectItem>
                    <SelectItem value="fansub">{txa('Fansub kasası')}</SelectItem>
                    <SelectItem value="both">{txa('Bakiye ya da kasa')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coin-expires">{txa('Son kullanma')}</Label>
                <Input id="coin-expires" type="datetime-local" value={form.expiresAt} onChange={(event) => set('expiresAt', event.target.value)} aria-invalid={failing.some((check) => check.id === 'expiresAt')} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <Label htmlFor="coin-series">{txa('Seri adı')}</Label>
                <Input id="coin-series" value={form.seriesLabel} maxLength={80} placeholder={txa('ör. Kış etkinliği')} onChange={(event) => set('seriesLabel', event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="coin-channel">{txa('Dağıtım kanalı')}</Label>
                <Input id="coin-channel" value={form.distributionChannel} maxLength={60} placeholder={txa('ör. Discord çekilişi')} onChange={(event) => set('distributionChannel', event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-3">
                <Label htmlFor="coin-notes">{txa('Not')}</Label>
                <Textarea id="coin-notes" rows={2} maxLength={500} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
              </div>
            </div>

            <section className="space-y-2 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3 text-[12.5px]" data-testid="coin-code-summary">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>{txa('Örnek:')} <span className="font-mono font-semibold">{sampleCoinCode(form.prefix, form.count + form.value)}</span></span>
                <span>{txa('En fazla dağıtım:')} <b className="tabular-nums text-amber-700 dark:text-amber-300">{risk.maxDistributionCoin.toLocaleString(intlLocale())} coin</b></span>
                <span className={cn('rounded-md px-1.5 py-px text-[11px] font-bold', RISK_META[risk.riskLevel].tone)} data-testid="coin-code-risk">{RISK_META[risk.riskLevel].label}</span>
              </div>
              {failing.length ? <p className="text-rose-700 dark:text-rose-300">{failing.map((check) => check.detail).join(' ')}</p> : null}
              {risk.warnings.length ? <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{risk.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
              {needsAccept ? (
                <label className="flex items-start gap-2 pt-1 font-semibold text-rose-700 dark:text-rose-300">
                  <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} data-testid="coin-code-risk-accept" />
                  <span><ShieldAlert className="mr-1 inline size-4" />{txa('Bu grup en fazla {v1} coin dağıtabilir; riski gördüm.', { v1: risk.maxDistributionCoin.toLocaleString(intlLocale()) })}</span>
                </label>
              ) : null}
            </section>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>{txa('Vazgeç')}</Button>
              <Button type="submit" className="gap-1.5" disabled={creating || !ready || (needsAccept && !riskAccepted)} data-testid="coin-code-generate-submit">
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {Number.isFinite(form.count) && form.count > 0 ? txa('{v1} kod üret', { v1: form.count.toLocaleString(intlLocale()) }) : txa('Kod üret')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
