import { useEffect, useState } from 'react'
import { BarChart3, MousePointer2, Eye, ExternalLink, Gift, Users, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAnnouncementReport, reportFilters, type AnnouncementReport as Report } from '@/services/announcementV2'
import { AnnouncementReportAccounts } from './AnnouncementReportAccounts'
import { intlLocale, txa } from '@/i18n/activeLocale'

const count = (n: number) => n.toLocaleString(intlLocale())
export function AnnouncementReport({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<Report | null>(null)
  const [days, setDays] = useState(30)
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState<keyof typeof reportFilters>('all')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setOffset(0) }, 300); return () => clearTimeout(timer) }, [query])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    void getAnnouncementReport(id, days, offset, filter, search, controller.signal).then(r => { if (!controller.signal.aborted) setData(r) })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? txa(e.message) : txa('Rapor alınamadı.')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, days, offset, filter, search, retry])
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="flex h-[90dvh] max-h-[960px] flex-col overflow-hidden sm:max-w-6xl">
    <header className="shrink-0 pr-8"><DialogTitle className="flex items-center gap-2"><BarChart3 className="size-5 text-primary" />{txa('Etkileşim raporu')}</DialogTitle><p className="mt-1 truncate text-sm text-muted-foreground">{data?.title || txa('Duyuru verileri')}</p></header>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto [scrollbar-gutter:stable]">
      {error && <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm"><p>{error}</p><Button variant="outline" className="mt-2" onClick={() => setRetry(v => v + 1)}>{txa('Tekrar dene')}</Button></div>}
      {!data && loading && <div aria-label={txa('Rapor yükleniyor')} role="status" className="h-96 rounded-xl bg-muted motion-safe:animate-pulse" />}
      {data && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[
          [MousePointer2, txa('Kart tıklaması'), data.totals.clicks, txa('{v1} farklı hesap', { v1: count(data.totals.uniqueClicks) })],
          [Eye, txa('Duyuru açılışı'), data.totals.opens, txa('{v1} hesap açtı · eski kayıtlar dahil', { v1: count(data.totals.uniqueOpens) })],
          [ExternalLink, txa('Bağlantı tıklaması'), data.totals.links, txa('{v1} farklı hesap', { v1: count(data.totals.uniqueLinks) })],
          [Users, txa('Etkileşen hesap'), data.totals.accounts, txa('Tıklayan, açan, yanıtlayan veya ödül alan')],
          [BarChart3, txa('Davet yanıtı'), data.totals.responses, txa('Her hesap için tek, değişmez yanıt')],
          [Gift, txa('Alınan ödül'), data.totals.claims, txa('{v1} coin dağıtıldı', { v1: count(data.totals.coins) })],
        ].map(([Icon, title, value, detail]) => { const MetricIcon = Icon as typeof Eye; return <div key={String(title)} className="rounded-xl border bg-card p-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><MetricIcon className="size-4 shrink-0" />{String(title)}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{count(Number(value))}</p><p className="mt-1 text-xs text-muted-foreground">{String(detail)}</p></div> })}</div>
        <p className="text-xs leading-5 text-muted-foreground">{txa('Özet tüm zamanı kapsar. Yeni sayaçların başlangıcı: {v1}. Önceki tıklamalar geriye dönük üretilemez. Yalnız giriş yapmış hesaplar ölçülür; aynı eylemin 5 saniye içindeki tekrarı sayılmaz. Kart gösterimi ölçülmediği için CTR hesaplanmaz.', { v1: new Date(data.measurementStartedAt).toLocaleString(intlLocale()) })}</p>
        <section className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">{txa('Günlük etkileşim')}</h3><Select value={String(days)} onValueChange={value => setDays(Number(value))}><SelectTrigger className="h-9 w-auto text-xs" aria-label={txa('Günlük etkileşim dönemi')}><SelectValue /></SelectTrigger><SelectContent>{[7,30,90].map(n => <SelectItem key={n} value={String(n)}>{txa('Son {v1} gün', { v1: n })}</SelectItem>)}</SelectContent></Select></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">{txa('Türkiye saatine göre günlük toplamlar')}</caption><thead className="border-b text-muted-foreground"><tr>{[txa('Gün'),txa('Kart'),txa('Açılış'),txa('Bağlantı'),txa('Yanıt'),txa('Ödül')].map(t => <th key={t} className="px-2 py-2 font-medium">{t}</th>)}</tr></thead><tbody>{data.daily.filter(d => d.clicks + d.opens + d.links + d.responses + d.claims > 0).reverse().map(d => <tr key={d.day} className="border-b last:border-0"><td className="whitespace-nowrap px-2 py-2">{new Date(`${d.day}T12:00:00`).toLocaleDateString(intlLocale())}</td>{[d.clicks,d.opens,d.links,d.responses,d.claims].map((v,i) => <td key={i} className="px-2 py-2 tabular-nums">{count(v)}</td>)}</tr>)}</tbody></table></div>
          {!data.daily.some(d => d.clicks + d.opens + d.links + d.responses + d.claims > 0) && <p className="py-8 text-center text-sm text-muted-foreground">{txa('Bu dönemde ölçülen etkileşim yok.')}</p>}
        </section>
        {data.options.length > 0 && <section className="space-y-3 rounded-xl border p-4"><h3 className="text-sm font-semibold">{txa('Davet yanıtlarının dağılımı')}</h3>{data.options.map(o => <div key={o.id}><div className="mb-1 flex justify-between gap-3 text-xs"><span>{o.label}</span><span>{count(o.count)} · %{data.totals.responses ? Math.round(o.count / data.totals.responses * 100) : 0}</span></div><progress aria-label={o.label} max={Math.max(1,data.totals.responses)} value={o.count} className="h-2 w-full accent-primary" /></div>)}</section>}
        <section className="rounded-xl border p-4"><h3 className="text-sm font-semibold">{txa('Hesap durumları')}</h3><p className="mt-1 text-xs text-muted-foreground">{txa('Etkileşen hesapların şu anki durumu; etkileşim anının geçmiş görüntüsü değildir. Gruplar birbiriyle örtüşebilir.')}</p><div className="mt-3 flex flex-wrap gap-2">{Object.entries({ 'Aktif':data.segments.active,'Pasif':data.segments.inactive,'Yasaklı':data.segments.banned,'Premium':data.segments.premium,'Standart':data.segments.standard,'E-posta doğrulanmış':data.segments.verified,'E-posta doğrulanmamış':data.segments.unverified }).map(([label,n]) => <span key={label} className="rounded-md border bg-muted/25 px-3 py-2 text-xs">{txa(label)} <strong className="ml-2 tabular-nums">{count(n)}</strong></span>)}</div></section>
        <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h3 className="mr-auto text-sm font-semibold">{txa('Hesap bazında ayrıntı')}</h3><Input aria-label={txa('Raporda kullanıcı ara')} placeholder={txa('Kullanıcı adı ara…')} value={query} onChange={e => setQuery(e.target.value)} className="w-48" /><Select value={filter} onValueChange={value => { setFilter(value as keyof typeof reportFilters); setOffset(0) }}><SelectTrigger className="h-10 w-auto text-sm" aria-label={txa('Etkileşim filtresi')}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(reportFilters).map(([k,v]) => <SelectItem key={k} value={k}>{txa(v)}</SelectItem>)}</SelectContent></Select></div>
          <AnnouncementReportAccounts data={data} loading={loading} />
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{txa('{v1} hesap · Sayfa {v2}', { v1: count(data.totalAccounts), v2: offset / 25 + 1 })}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || !offset} onClick={() => setOffset(o => Math.max(0,o-25))}>{txa('Önceki')}</Button><Button size="sm" variant="outline" disabled={loading || offset+25>=data.totalAccounts} onClick={() => setOffset(o => o+25)}>{txa('Sonraki')}</Button></div></div>
        </section>
      </>}
    </div>
    <footer className="flex shrink-0 items-center justify-between gap-2 border-t pt-3"><span className="text-xs text-muted-foreground">{txa('Yalnız yöneticiler görür. Rapor erişimi denetim kaydına alınır.')}</span><Button variant="outline" size="sm" disabled={loading} onClick={() => setRetry(v => v+1)}><RefreshCw className="size-4" />{txa('Yenile')}</Button></footer>
  </DialogContent></Dialog>
}
