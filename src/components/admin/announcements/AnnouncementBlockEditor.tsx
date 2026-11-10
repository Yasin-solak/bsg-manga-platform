import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Bold, Highlighter, ImagePlus, Italic, Plus, Trash2, AtSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { announcementTextForEditor, announcementTextFromEditor, type AnnouncementBlock, type AnnouncementReference } from '@/services/announcementV2'
import { AnnouncementMentionInput } from './AnnouncementMentionInput'
import { AnnouncementImageInput } from './AnnouncementImageInput'
import { AnnouncementReferencePicker } from './AnnouncementReferencePicker'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementBlockEditor({ blocks, onChange, references, onReference, announcementId, onBusy }: { blocks: AnnouncementBlock[]; onChange: (v: AnnouncementBlock[]) => void; references: Record<string, AnnouncementReference | null>; onReference: (r: AnnouncementReference) => void; announcementId: string; onBusy: (busy: boolean) => void }) {
  const refs = useRef<Record<number, HTMLTextAreaElement | null>>({})
  const [picker, setPicker] = useState<number | 'block' | null>(null)
  const change = (i: number, b: AnnouncementBlock) => onChange(blocks.map((old, j) => j === i ? b : old))
  const add = (b: AnnouncementBlock) => { if (blocks.length < 24) onChange([...blocks, b]) }
  function format(i: number, marker: string) {
    const el = refs.current[i], b = blocks[i]
    if (!el || b.type !== 'text') return
    const start = el.selectionStart, end = el.selectionEnd
    const displayText = announcementTextForEditor(b.text, references)
    const selected = displayText.slice(start, end) || txa('Vurgulanan metin')
    change(i, { ...b, text: announcementTextFromEditor(displayText.slice(0, start) + marker + selected + marker + displayText.slice(end), references) })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + marker.length, start + marker.length + selected.length) })
  }
  function move(i: number, delta: number) {
    const next = [...blocks]; [next[i], next[i + delta]] = [next[i + delta], next[i]]; onChange(next)
  }
  function insertReference(r: AnnouncementReference) {
    onReference(r)
    if (typeof picker === 'number' && blocks[picker]?.type === 'text' && (r.kind === 'user' || r.kind === 'fansub')) {
      const b = blocks[picker] as Extract<AnnouncementBlock, { type: 'text' }>
      change(picker, { ...b, text: `${b.text} @[${r.kind}:${r.id}]` })
    } else add({ type: 'reference', kind: r.kind, id: r.id })
  }
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{txa('Metni seçip biçimlendir. Etiketler kendiliğinden bildirim göndermez.')}</p>
    {blocks.map((b, i) => <section key={i} className="rounded-xl border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{i + 1}. {b.type === 'text' ? txa('Metin') : b.type === 'image' ? txa('Görsel') : txa('Seçili içerik')}</span><div className="flex gap-1">
        <Button variant="ghost" size="icon" className="size-7" aria-label={txa('{v1}. bloğu yukarı taşı', { v1: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label={txa('{v1}. bloğu aşağı taşı', { v1: i + 1 })} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-7 text-destructive" aria-label={txa('{v1}. bloğu sil', { v1: i + 1 })} disabled={blocks.length === 1} onClick={() => onChange(blocks.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
      </div></div>
      {b.type === 'text' && <><div className="mb-2 flex flex-wrap gap-1">
        <Button variant="outline" size="icon" className="size-8" aria-label={txa('Kalın')} onClick={() => format(i, '**')}><Bold className="size-4" /></Button>
        <Button variant="outline" size="icon" className="size-8" aria-label={txa('İtalik')} onClick={() => format(i, '*')}><Italic className="size-4" /></Button>
        <Button variant="outline" size="icon" className="size-8" aria-label={txa('Metni vurgula')} onClick={() => format(i, '==')}><Highlighter className="size-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setPicker(i)}><AtSign className="size-4" />{txa('Etiket / içerik')}</Button>
      </div><AnnouncementMentionInput inputRef={el => { refs.current[i] = el }} label={txa('{v1}. metin bloğu', { v1: i + 1 })} text={b.text} references={references} onReference={onReference} onChange={text => change(i, { ...b, text })} />
        <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={b.highlight || false} onChange={e => change(i, { ...b, highlight: e.target.checked })} />{txa('Paragrafın tamamını vurgula')}</label></>}
      {b.type === 'image' && <AnnouncementImageInput block={b} announcementId={announcementId} onChange={block => change(i, block)} onBusy={onBusy} />}
      {b.type === 'reference' && <p className="break-words text-sm font-semibold">{references[`${b.kind}:${b.id}`]?.title || txa('İçerik şu anda erişilebilir değil')}</p>}
    </section>)}
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={blocks.length >= 24} onClick={() => add({ type: 'text', text: '' })}><Plus className="size-4" />{txa('Metin')}</Button><Button variant="outline" size="sm" disabled={blocks.length >= 24} onClick={() => setPicker('block')}>{txa('İçerik seç')}</Button><Button variant="outline" size="sm" disabled={blocks.length >= 24} onClick={() => add({ type: 'image', url: '', alt: '' })}><ImagePlus className="size-4" />{txa('Görsel')}</Button></div>
    <AnnouncementReferencePicker open={picker !== null} onClose={() => setPicker(null)} onSelect={insertReference} />
  </div>
}
