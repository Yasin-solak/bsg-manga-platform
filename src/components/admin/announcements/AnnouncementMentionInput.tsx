import { useEffect, useId, useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { announcementTextForEditor, announcementTextFromEditor, searchAnnouncementReferences, mentionAtCursor, type Announcement, type AnnouncementReference } from '@/services/announcementV2'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementMentionInput({ text, references, onChange, onReference, inputRef, label }: {
  text: string; references: Announcement['references']; onChange: (text: string) => void
  onReference: (r: AnnouncementReference) => void; inputRef: (el: HTMLTextAreaElement | null) => void; label: string
}) {
  const element = useRef<HTMLTextAreaElement | null>(null)
  const menuId = useId()
  const [mention, setMention] = useState<ReturnType<typeof mentionAtCursor>>(null)
  const [items, setItems] = useState<AnnouncementReference[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const [retry, setRetry] = useState(0)
  const display = announcementTextForEditor(text, references)
  const query = mention?.query
  useEffect(() => {
    const controller = new AbortController()
    setItems([]); setError(''); setActive(0)
    if (query === undefined) { setLoading(false); return }
    setLoading(true)
    const timer = setTimeout(() => {
      void Promise.all([
        searchAnnouncementReferences('user', query, controller.signal),
        searchAnnouncementReferences('fansub', query, controller.signal),
      ]).then(([users, fansubs]) => {
        if (!controller.signal.aborted) setItems([...users.slice(0, 6), ...fansubs.slice(0, 6)])
      }).catch(() => { if (!controller.signal.aborted) setError(txa('Öneriler alınamadı.')) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, retry])
  function insert(r: AnnouncementReference) {
    if (!mention || !element.current) return
    const name = r.kind === 'fansub' ? `@{${r.title}}` : r.title
    const next = display.slice(0, mention.start) + name + ' ' + display.slice(mention.end)
    const nextReferences = { ...references, [`${r.kind}:${r.id}`]: r }
    const canonical = announcementTextFromEditor(next, nextReferences)
    if (canonical.length > 4000) { setError(txa('Bu etiket metin sınırını aşıyor.')); return }
    onReference(r); onChange(canonical); setMention(null)
    const cursor = mention.start + name.length + 1
    requestAnimationFrame(() => { element.current?.focus(); element.current?.setSelectionRange(cursor, cursor) })
  }
  return <div className="relative">
    <Textarea ref={el => { element.current = el; inputRef(el) }} aria-label={label} role="combobox" aria-multiline="true"
      aria-autocomplete="list" aria-expanded={!!mention} aria-controls={mention ? menuId : undefined}
      aria-activedescendant={mention && items[active] ? `${menuId}-${active}` : undefined}
      value={display} maxLength={4000} rows={5} placeholder={txa('Duyuru metnini yaz… Kullanıcı veya fansub için @ kullan.')}
      onChange={e => { onChange(announcementTextFromEditor(e.target.value, references)); setMention(mentionAtCursor(e.target.value, e.target.selectionStart)) }}
      onClick={e => setMention(mentionAtCursor(display, e.currentTarget.selectionStart))}
      onBlur={() => setMention(null)}
      onKeyDown={e => {
        if (!mention || e.nativeEvent.isComposing) return
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMention(null) }
        if (items.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault(); setActive(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
        }
        if (e.key === 'Enter' && items[active]) { e.preventDefault(); insert(items[active]) }
      }}
      onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) setMention(mentionAtCursor(display, e.currentTarget.selectionStart)) }} />
    {mention && <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md" id={menuId} role="listbox" aria-label={txa('Kullanıcı ve fansub önerileri')}>
      {loading ? <p role="status" className="p-3 text-xs text-muted-foreground">{txa('Öneriler aranıyor…')}</p> : error ? <button type="button" className="p-3 text-xs" onMouseDown={e => e.preventDefault()} onClick={() => setRetry(v => v + 1)}>{txa('{v1} Tekrar dene', { v1: error })}</button>
        : items.length ? items.map((r, i) => <button id={`${menuId}-${i}`} key={`${r.kind}:${r.id}`} role="option" aria-selected={active === i} type="button" tabIndex={-1}
          className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${active === i ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
          onMouseDown={e => e.preventDefault()} onClick={() => insert(r)}><span className="truncate">{r.title}</span><span className="shrink-0 text-xs text-muted-foreground">{r.kind === 'user' ? txa('Kullanıcı') : txa('Fansub')}</span></button>)
          : <p className="p-3 text-xs text-muted-foreground">{txa('Eşleşen kullanıcı veya fansub yok.')}</p>}
    </div>}
  </div>
}
