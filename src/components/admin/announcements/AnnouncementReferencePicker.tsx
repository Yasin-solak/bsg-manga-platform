import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { referenceLabels, searchAnnouncementReferences, type AnnouncementReference, type ReferenceKind } from '@/services/announcementV2'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementReferencePicker({ open, onClose, onSelect, onlyUsers = false, fixedKind }: { open: boolean; onClose: () => void; onSelect: (r: AnnouncementReference) => void; onlyUsers?: boolean; fixedKind?: ReferenceKind }) {
  const [kind, setKind] = useState<ReferenceKind>('manga')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<AnnouncementReference[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setItems([]); setError('')
    if (!open || query.trim().length < 2) { setBusy(false); return }
    setBusy(true)
    const timer = setTimeout(() => {
      void searchAnnouncementReferences(onlyUsers ? 'user' : fixedKind || kind, query, controller.signal)
        .then(result => { if (!controller.signal.aborted) setItems(result) })
        .catch(() => { if (!controller.signal.aborted) setError(txa('Arama tamamlanamadı.')) })
        .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [kind, query, open, onlyUsers, fixedKind, retry])
  return <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}><DialogContent><DialogTitle>{onlyUsers ? txa('Alıcı seç') : txa('İçerik veya etiket seç')}</DialogTitle>
    {!onlyUsers && !fixedKind && <div className="space-y-1 text-sm"><span>{txa('İçerik türü')}</span><Select value={kind} onValueChange={value => setKind(value as ReferenceKind)}><SelectTrigger className="h-10 w-full" aria-label={txa('İçerik türü')}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(referenceLabels).map(([k, title]) => <SelectItem key={k} value={k}>{title}</SelectItem>)}</SelectContent></Select></div>}
    <Input aria-label={txa('İçerik ara')} value={query} onChange={e => setQuery(e.target.value)} placeholder={txa('En az iki karakter yaz…')} maxLength={80} />
    <div className="max-h-80 min-h-36 overflow-y-auto" aria-live="polite">
      {busy ? <div role="status" aria-label={txa('Aranıyor')} className="space-y-3 py-2">{[0, 1, 2].map(i => <div key={i} className="h-10 rounded bg-muted motion-safe:animate-pulse" />)}</div> : error ? <div>{error}<Button onClick={() => setRetry(v => v + 1)}>{txa('Tekrar dene')}</Button></div> : items.length ? items.map(r => <button key={r.id} type="button" className="block w-full rounded-lg px-3 py-3 text-left text-sm hover:bg-muted" onClick={() => { onSelect(r); onClose(); setQuery('') }}>{r.title}</button>) : <p className="p-3 text-sm text-muted-foreground">{query.trim().length < 2 ? txa('İçerik adını veya kullanıcı adını ara.') : txa('Uygun sonuç bulunamadı.')}</p>}
    </div>
  </DialogContent></Dialog>
}
