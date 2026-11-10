import { useCallback, useEffect, useMemo, useState } from 'react'
import { Languages, Loader2, RefreshCw, Save, Search } from 'lucide-react'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { AdminSectionSkeleton } from '@/components/admin/shared/AdminSectionSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { loadEnDictionary, lookupEnDictionary, txa } from '@/i18n/activeLocale'
import { listAdminI18nTexts, saveAdminI18nText, type AdminI18nTextRow } from '@/services/adminI18nTextService'
import { toast } from '@/services/toastService'

type Filter = 'missing' | 'all'

const SOURCE_LABEL: Record<string, string> = {
  announcement: 'Duyuru',
  shop_product: 'Mağaza ürünü',
  shop_season: 'Sezon',
  name_effect: 'İsim efekti',
  murek_item: 'Mürek parçası',
  site_event: 'Etkinlik',
  quest_event: 'Görev etkinliği',
  quest: 'Görev',
}

interface TextRow {
  sourceText: string
  sources: string[]
  enText: string | null
}

function groupRows(rows: AdminI18nTextRow[]): TextRow[] {
  const byText = new Map<string, TextRow>()
  for (const row of rows) {
    const current = byText.get(row.source_text) ?? { sourceText: row.source_text, sources: [], enText: row.en_text }
    const label = SOURCE_LABEL[row.source_table] ?? row.source_table
    if (!current.sources.includes(label)) current.sources.push(label)
    byText.set(row.source_text, current)
  }
  return [...byText.values()]
}

function TextRowEditor({ row, onSaved }: { row: TextRow; onSaved: (sourceText: string, enText: string) => void }) {
  const [value, setValue] = useState(row.enText ?? '')
  const [saving, setSaving] = useState(false)
  const fromDictionary = lookupEnDictionary(row.sourceText)
  const hasDictionary = fromDictionary !== row.sourceText
  const dirty = value.trim() !== (row.enText ?? '')

  const save = async () => {
    setSaving(true)
    try {
      await saveAdminI18nText(row.sourceText, value)
      onSaved(row.sourceText, value.trim())
      toast.success(txa('Çeviri kaydedildi.'))
    } catch (error) {
      toast.error(error instanceof Error ? txa(error.message) : txa('Çeviri kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="grid gap-3 px-5 py-4 lg:grid-cols-2" data-testid="admin-text-translation-row">
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{row.sources.map((source) => txa(source)).join(' · ')}</p>
        <p className="whitespace-pre-wrap break-words text-[13.5px]">{row.sourceText}</p>
      </div>
      <div className="min-w-0 space-y-2">
        <Textarea
          value={value}
          rows={Math.min(5, Math.max(2, Math.ceil(row.sourceText.length / 70)))}
          maxLength={8000}
          onChange={(event) => setValue(event.target.value)}
          placeholder={hasDictionary ? fromDictionary : txa('İngilizcesini yaz')}
          aria-label={txa('İngilizce metin')}
          className="text-[13.5px]"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-muted-foreground">
            {row.enText ? txa('Panelden girildi') : hasDictionary ? txa('Sözlükte var; yazarsan onun yerine geçer') : txa('Eksik: okur Türkçe görür')}
          </span>
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {txa('Kaydet')}
          </Button>
        </div>
      </div>
    </li>
  )
}

export default function AdminTextTranslationsSection() {
  const [rows, setRows] = useState<TextRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('missing')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // The Turkish panel needs the dictionary too: it shows what is missing.
      await loadEnDictionary()
      setRows(groupRows(await listAdminI18nTexts()))
    } catch (loadError) {
      setError(loadError instanceof Error ? txa(loadError.message) : txa('Metinler yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const isMissing = useCallback((row: TextRow) => !row.enText && lookupEnDictionary(row.sourceText) === row.sourceText, [])
  const missingCount = useMemo(() => rows.filter(isMissing).length, [rows, isMissing])
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return rows.filter((row) => (filter === 'all' || isMissing(row)) && (!needle || row.sourceText.toLocaleLowerCase().includes(needle)))
  }, [rows, filter, query, isMissing])

  const onSaved = useCallback((sourceText: string, enText: string) => {
    setRows((current) => current.map((row) => (row.sourceText === sourceText ? { ...row, enText: enText || null } : row)))
  }, [])

  return (
    <div className="space-y-5" data-testid="admin-text-translations">
      <AdminSectionHeader
        title={txa('Metin çevirileri')}
        description={txa('Panelden yazılan, herkese açık yayındaki metinlerin İngilizcesi. Taslaklar ve özel kitleli duyurular burada listelenmez.')}
        actions={<Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw className="size-3.5" />{txa('Yenile')}</Button>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Metin çevirileri')}>
          {(['missing', 'all'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${filter === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {id === 'missing' ? txa('Eksikler ({v1})', { v1: missingCount }) : txa('Tümü ({v1})', { v1: rows.length })}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={txa('Metinlerde ara')} aria-label={txa('Metinlerde ara')} className="pl-9" />
        </div>
      </div>
      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</p> : null}
      {loading && !rows.length ? <AdminSectionSkeleton variant="cards" /> : null}
      {!loading && !error && !visible.length ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] border border-border/70 bg-card/60 px-6 py-12 text-center text-[13px] text-muted-foreground">
          <Languages className="size-5" />
          {filter === 'missing' && !query.trim() ? txa('Eksik metin yok.') : txa('Aramaya uyan metin yok.')}
        </div>
      ) : null}
      {visible.length ? (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-[20px] border border-border/70 bg-card/60">
          {visible.map((row) => <TextRowEditor key={row.sourceText} row={row} onSaved={onSaved} />)}
        </ul>
      ) : null}
    </div>
  )
}
