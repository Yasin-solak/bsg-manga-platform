import { useEffect, useId, useRef, useState } from 'react'
import { communityV2 } from '@/services/communityV2Service'
import { activeCommunityMention, encodeCommunityMentions, mentionText, type CommunityMention } from '@/lib/communityMentions'
import { communityError } from './communityHelpers'
import { txa } from '@/i18n/activeLocale'

export function CommunityMessageInput({ channelId, value, onChange, mentions, onMentions, disabled, label, placeholder, onSend, allowMentions }: {
  channelId: string; value: string; onChange: (value: string) => void; mentions: CommunityMention[]; onMentions: (mentions: CommunityMention[]) => void;
  disabled?: boolean; label: string; placeholder?: string; onSend?: () => void; allowMentions: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null), listId = useId()
  const [cursor, setCursor] = useState(0), [closed, setClosed] = useState(false), [selected, setSelected] = useState(0)
  const [rows, setRows] = useState<CommunityMention[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const active = !disabled && !closed && allowMentions ? activeCommunityMention(value, cursor) : null
  const search = active?.search
  useEffect(() => {
    if (search === undefined) { setRows([]); return }
    const abort = new AbortController(); setLoading(true); setRows([]); setSelected(0); setError('')
    const timer = setTimeout(() => { void communityV2.mentionCandidates(channelId, search, abort.signal).then(next => {
      if (!abort.signal.aborted) setRows(next)
    }).catch(e => { if (!abort.signal.aborted) setError(communityError(e)) }).finally(() => { if (!abort.signal.aborted) setLoading(false) }) }, 150)
    return () => { abort.abort(); clearTimeout(timer) }
  }, [channelId, search])
  function choose(mention: CommunityMention) {
    if (!active) return
    const inserted = mentionText(mention) + ' '
    onChange(value.slice(0, active.start) + inserted + value.slice(active.end))
    onMentions([...mentions.filter(m => mentionText(m) !== mentionText(mention)), mention])
    setClosed(true); setRows([])
    requestAnimationFrame(() => { const pos = active.start + inserted.length; ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); setCursor(pos) })
  }
  const length = encodeCommunityMentions(value, mentions).length
  return <div className="cv2-message-input">
    <textarea ref={ref} aria-label={label} placeholder={placeholder} maxLength={4000} value={value} disabled={disabled}
      aria-controls={active ? listId : undefined} aria-autocomplete={allowMentions ? 'list' : undefined} aria-activedescendant={active && rows[selected] ? `${listId}-${selected}` : undefined}
      onChange={e => { onChange(e.target.value); setCursor(e.target.selectionStart); setClosed(false) }} onClick={e => setCursor(e.currentTarget.selectionStart)} onKeyUp={e => setCursor(e.currentTarget.selectionStart)}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return
        if (active && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setClosed(true); return }
        if (active && rows.length && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setSelected(v => (v + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length); return }
        if (e.key === 'Enter' && !e.shiftKey) {
          if (active && rows[selected]) { e.preventDefault(); choose(rows[selected]); return }
          if (onSend && !active) { e.preventDefault(); onSend() }
        }
      }} />
    {active && <div className="cv2-mention-picker" id={listId} role="listbox" aria-label={txa('Etiketlenecek kullanıcı veya rol')}>
      {loading && <p role="status">{txa('Etiketler aranıyor…')}</p>}{error && <p role="alert">{error}</p>}
      {!loading && !error && !rows.length && <p>{txa('Uygun kullanıcı veya etiketlenebilir rol yok.')}</p>}
      {rows.map((m, i) => <button type="button" role="option" id={`${listId}-${i}`} aria-selected={i === selected} key={`${m.kind}:${m.id}`} onMouseDown={e => e.preventDefault()} onClick={() => choose(m)}>
        <span style={{ color: m.kind === 'role' ? m.color || undefined : undefined }}>{mentionText(m)}</span><small>{m.kind === 'role' ? txa('Rol') : txa('Kullanıcı')}</small>
      </button>)}
    </div>}
    <small className={length > 4000 ? 'cv2-error' : 'cv2-input-count'}>{length}/4000{length > 4000 && txa(' · Etiketlerle birlikte mesaj sınırı aşıldı.')}</small>
  </div>
}
