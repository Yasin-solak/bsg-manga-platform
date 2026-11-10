import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, Hash, LockKeyhole, Send, Pin, X, Search } from 'lucide-react'
import { communityV2, CommunityApiError, type CommunityChannel, type CommunityMessage, type CommunityServer } from '@/services/communityV2Service'
import { hasCommunityHistoryGap, mergeCommunityMessages } from '@/lib/communityMessageHistory'
import { createCommunityLiveRefresh } from '@/lib/communityLiveRefresh'
import { CommunityLoading, CommunityModal } from './CommunityShared'
import { communityError } from './communityHelpers'
import { Link, useSearchParams } from '@/i18n/router'
import { CommunitySearch } from './CommunitySearch'
import { useCommunityPresence } from './useCommunityPresence'
import { buildPublicMangaPath } from '@/lib/routes'
import { channelReadOnlyText } from '@/lib/communityNavigation'
import { decodeCommunityMentions, encodeCommunityMentions, type CommunityMention, type COMMUNITY_REACTIONS } from '@/lib/communityMentions'
import { CommunityMessageInput } from './CommunityMessageInput'
import { CommunityMessageRow } from './CommunityMessageRow'
import { CommunityPins } from './CommunityPins'
import { useCommunityFiles } from './useCommunityFiles'
import { CommunityFileComposer } from './CommunityFileComposer'
import './communityFiles.css'
import { CommunityReportDialog } from './CommunityReportDialog'
import { useCommunitySlowmode } from './useCommunitySlowmode'
import './communityModeration.css'
import { txa } from '@/i18n/activeLocale'

export function CommunityChat({ channel, server, userId, refreshServer, refreshActivity, visible }: { channel: CommunityChannel; server: CommunityServer; userId: string; refreshServer: () => Promise<void>; refreshActivity: () => Promise<void>; visible: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [params, setParams] = useSearchParams()
  const requestedMessage = params.get('mesaj')
  const jumped = useRef('')
  const presence = useCommunityPresence(channel.id, visible)
  const [rows, setRows] = useState<CommunityMessage[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [connected, setConnected] = useState(false)
  const [draft, setDraft] = useState(''), [sending, setSending] = useState(false), [olderBusy, setOlderBusy] = useState(false)
  const [nearEnd, setNearEnd] = useState(true), [editing, setEditing] = useState<CommunityMessage | null>(null), [editBody, setEditBody] = useState(''), [deleting, setDeleting] = useState<CommunityMessage | null>(null)
  const [reporting, setReporting] = useState<CommunityMessage | null>(null)
  const [sendError, setSendError] = useState('')
  const [outgoing, setOutgoing] = useState<{ id: string; text: string; files: string[] } | null>(null)
  const sendPending = useRef(false)
  const [sendClock, setSendClock] = useState<{ server_now: string; next_send_at: string | null } | null>(null)
  const clock = sendClock && Date.parse(sendClock.server_now) > Date.parse(server.server_now) ? sendClock : { server_now: server.server_now, next_send_at: channel.next_send_at }
  const waitSeconds = useCommunitySlowmode(clock.next_send_at, clock.server_now)
  const [actionBusy, setActionBusy] = useState(false)
  const [reply, setReply] = useState<CommunityMessage | null>(null), [pinsOpen, setPinsOpen] = useState(false), [contextView, setContextView] = useState(false)
  const [mentions, setMentions] = useState<CommunityMention[]>([]), [editMentions, setEditMentions] = useState<CommunityMention[]>([])
  const [interactionBusy, setInteractionBusy] = useState(false), [jumpBusy, setJumpBusy] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null), alive = useRef(true), pending = useRef(false), refreshAgain = useRef(false)
  const atEnd = useRef(true), lastRead = useRef('0'), retry = useRef<{ id: string; body: string; replyTo: string | null; files: string } | null>(null)
  const uploads = useCommunityFiles(channel.id)
  const rowsRef = useRef(rows), contextRef = useRef(false), actionPending = useRef(false), historyRevision = useRef(0)
  useLayoutEffect(() => { rowsRef.current = rows }, [rows])
  const timeoutActive = Boolean(server.timeout_until && Date.parse(server.timeout_until) > Date.now())
  const canSend = server.permissions.includes('messages.send') && !timeoutActive && !channel.read_only_reason
  const writable = !timeoutActive && !channel.read_only_reason
  const allowMentions = server.permissions.some(p => p === 'mentions.users' || p === 'mentions.roles')
  const refresh = useCallback(async () => {
    if (pending.current) { refreshAgain.current = true; return }
    pending.current = true
    try {
      const revision = historyRevision.current
      const { latest: next, snapshot } = await communityV2.refreshMessages(channel.id, rowsRef.current.map(r => r.id))
      if (!alive.current) return
      if (revision !== historyRevision.current) { refreshAgain.current = true; return }
      // A refresh does not reopen finished old history. Sequences may have gaps from deleted records.
      if (!rowsRef.current.length || (!contextRef.current && atEnd.current && hasCommunityHistoryGap(rowsRef.current, next))) setHasMore(next.length === 50)
      setRows(previous => {
        const changes = new Map([...snapshot, ...next].map(row => [row.id, row]))
        if (!contextRef.current && (atEnd.current || !previous.length)) return mergeCommunityMessages(previous.map(row => changes.get(row.id) || row), next)
        return previous.map(row => changes.get(row.id) || row)
      })
      setError('')
    } catch (e) {
      if (alive.current) { if (e instanceof CommunityApiError && e.code === '42501') setRows([]); setError(communityError(e)); refreshServer() }
    } finally {
      pending.current = false
      if (alive.current) { setLoading(false); if (refreshAgain.current) { refreshAgain.current = false; void refresh() } }
    }
  }, [channel.id, refreshServer])
  useEffect(() => {
    alive.current = true
    const live = createCommunityLiveRefresh({ refresh: () => { void refresh() }, visible: () => document.visibilityState === 'visible' })
    const unsubscribe = communityV2.subscribe('channel', channel.id, live.invalidate, value => { setConnected(value); live.connection(value) }, { refreshOnSubscribe: false })
    document.addEventListener('visibilitychange', live.wake)
    window.addEventListener('online', live.wake)
    return () => { alive.current = false; live.dispose(); unsubscribe(); document.removeEventListener('visibilitychange', live.wake); window.removeEventListener('online', live.wake) }
  }, [channel.id, refresh])
  useLayoutEffect(() => { if (atEnd.current && !contextRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [rows, outgoing])
  useEffect(() => {
    const seq = rows[rows.length - 1]?.seq
    if (!seq || !visible || editing || deleting || reporting || pinsOpen || searchOpen || requestedMessage || contextView || !nearEnd || loading || document.visibilityState !== 'visible' || BigInt(seq) <= BigInt(lastRead.current)) return
    const timer = setTimeout(() => {
      void communityV2.write('read', { channel_id: channel.id, seq }).then(() => { if (alive.current) { lastRead.current = seq; void refreshActivity() } }).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [rows, nearEnd, loading, channel.id, refreshActivity, visible, editing, deleting, reporting, pinsOpen, searchOpen, requestedMessage, contextView])

  function leaveMessageContext() {
    setParams(previous => { const next = new URLSearchParams(previous); next.delete('mesaj'); return next }, { replace: true })
    jumped.current = ''
    historyRevision.current++
    contextRef.current = false; setContextView(false); atEnd.current = true; setNearEnd(true)
  }

  async function send() {
    const body = encodeCommunityMentions(draft, mentions), replyTo = reply?.id || null
    const fileIds=uploads.files.map(f=>f.id).sort(), files=JSON.stringify(fileIds)
    if ((!body && !fileIds.length) || body.length > 4000 || sendPending.current || waitSeconds > 0 || !canSend || !uploads.ready || (fileIds.length>0&&!server.permissions.includes('attachments.send'))) return
    sendPending.current = true
    setSending(true); setSendError('')
    const attempt = retry.current?.body === body && retry.current.replyTo === replyTo && retry.current.files===files ? retry.current : { id: crypto.randomUUID(), body, replyTo, files }
    retry.current = attempt
    setOutgoing({ id: attempt.id, text: decodeCommunityMentions(body, mentions), files: uploads.files.map(file => file.file.name) })
    setDraft('')
    leaveMessageContext()
    try {
      const result = await communityV2.send({ channel_id: channel.id, client_id: attempt.id, body, reply_to: replyTo, attachment_ids:fileIds })
      uploads.sent()
      if (alive.current) {
        historyRevision.current++
        setRows(previous => mergeCommunityMessages(previous, [result.message]))
        setMentions([]); setReply(null); setSendClock(result); retry.current = null
        // If sent from an old context, the history in between is completed independently.
        if (hasCommunityHistoryGap(rowsRef.current, [result.message])) void refresh()
      }
    } catch (e) { if (alive.current) { setDraft(draft); setSendError(communityError(e)); void refreshServer() } }
    finally {
      sendPending.current = false
      if (alive.current) {
        setSending(false); setOutgoing(null)
        requestAnimationFrame(() => {
          const input = scrollRef.current?.parentElement?.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${txa('Mesajın')}"]`)
          // Return keyboard focus to the field disabled during sending; do not break another selection.
          if (alive.current && input && !input.disabled && (document.activeElement === document.body || input.form?.contains(document.activeElement))) input.focus({ preventScroll: true })
        })
      }
    }
  }
  async function older() {
    if (!rows.length || olderBusy || jumpBusy) return
    setOlderBusy(true)
    const beforeHeight = scrollRef.current?.scrollHeight || 0
    try {
      const next = await communityV2.messages(channel.id, rows[0].seq)
      if (!alive.current) return
      historyRevision.current++
      contextRef.current = true; setContextView(true); atEnd.current = false; setNearEnd(false)
      setRows(previous => [...next, ...previous].slice(0, 250)); setHasMore(next.length === 50)
      requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - beforeHeight })
    } catch (e) { if (alive.current) setError(communityError(e)) }
    finally { if (alive.current) setOlderBusy(false) }
  }
  async function messageAction() {
    const target = editing || deleting
    if (!target) return
    setActionBusy(true)
    try {
      await communityV2.write(editing ? 'edit_message' : 'delete_message', { channel_id: channel.id, message_id: target.id, body: encodeCommunityMentions(editBody, editMentions), version: target.version })
      // All open history refreshes: quotes and reactions in old replies are also cleared by deletion.
      setEditing(null); setDeleting(null); await refresh()
    } catch (e) { setError(communityError(e)) }
    finally { setActionBusy(false) }
  }
  async function interact(row: CommunityMessage, action: 'set_pin' | 'set_reaction', active: boolean, emoji?: typeof COMMUNITY_REACTIONS[number]) {
    if (actionPending.current) return
    actionPending.current = true; setInteractionBusy(true); setError('')
    try { await communityV2.write(action, { channel_id: channel.id, message_id: row.id, active, emoji }); await refresh() }
    catch (e) { if (alive.current) setError(communityError(e)) }
    finally { actionPending.current = false; if (alive.current) setInteractionBusy(false) }
  }
  async function jump(id: string) {
    if (jumpBusy || olderBusy) return
    setSearchOpen(false); setPinsOpen(false); setJumpBusy(true); setError('')
    try {
      const next = await communityV2.messageContext(channel.id, id)
      if (!alive.current) return
      historyRevision.current++; contextRef.current = true; setContextView(true); atEnd.current = false; setNearEnd(false)
      setRows(next); setHasMore(!!next.length && BigInt(next[0].seq) > 1n)
      requestAnimationFrame(() => { const target = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${id}"]`); target?.scrollIntoView({ block: 'center' }); target?.focus({ preventScroll: true }) })
    } catch (e) { if (alive.current) setError(communityError(e)) }
    finally { if (alive.current) setJumpBusy(false) }
  }
  useEffect(() => {
    if (!loading && requestedMessage && requestedMessage !== jumped.current && /^[0-9a-f-]{36}$/i.test(requestedMessage)) { jumped.current = requestedMessage; void jump(requestedMessage) }
    // Hedef başına bir kez açılır; canlı yenilemeler geçmişteki bağlamı değiştirmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, requestedMessage])
  return <section className="cv2-chat" aria-label={txa('{v1} kanalı', { v1: channel.name })}>
    <header className="cv2-chat-heading"><span className="cv2-channel-icon">{channel.is_private ? <LockKeyhole /> : <Hash />}</span><div><h1>{channel.name}</h1><p>{channel.topic || txa('Birlikte okuyalım, birlikte konuşalım.')}</p></div><button aria-label={txa('Kanalda mesaj ara')} title={txa('Mesaj ara')} onClick={() => setSearchOpen(true)}><Search size={17} /></button><button className="cv2-pins-button" aria-label={txa('Sabitlenen mesajları aç')} title={txa('Sabitlenen mesajlar')} onClick={() => setPinsOpen(true)}><Pin size={17} /></button><span className={`cv2-connection ${connected ? 'is-connected' : ''}`}>{connected ? txa('Bağlı') : txa('Bağlanıyor')}</span></header>
    {channel.is_private && <div className="cv2-notice"><LockKeyhole size={14} /> {txa('Bu oda yalnız seçili rollere açık.')}</div>}
    {channel.series && <div className="cv2-notice">{txa('Seri:')} <Link to={buildPublicMangaPath(channel.series)}>{channel.series.title} →</Link></div>}
    {channel.read_only_reason && <div className="cv2-notice">{channelReadOnlyText[channel.read_only_reason]}</div>}
    {error && <div className="cv2-error" role="alert">{error} <button onClick={() => void refresh()}>{txa('Yeniden dene')}</button></div>}
    <div className="cv2-messages" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) { atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; setNearEnd(atEnd.current) } }}>
      {loading ? <CommunityLoading /> : <>
        {hasMore && <button className="cv2-history" disabled={olderBusy} onClick={() => void older()}>{olderBusy ? txa('Geçmiş yükleniyor…') : txa('Önceki mesajları göster')}</button>}
        {!rows.length && !error && !outgoing && <div className="cv2-welcome"><Hash size={32} /><h2>{txa('{v1} kanalına hoş geldin', { v1: channel.name })}</h2><p>{channel.archived_at ? txa('Bu arşivde henüz mesaj yok.') : txa('Bu sohbetin ilk mesajını sen yazabilirsin.')}</p></div>}
        <div role="log" aria-label={txa('Mesajlar')} aria-live="polite" aria-relevant="additions text">
          {rows.map(row => <CommunityMessageRow key={row.id} row={row} userId={userId} permissions={server.permissions} writable={writable} canSend={canSend} busy={interactionBusy || actionBusy}
            onBlockChanged={() => void refresh()} onReport={() => setReporting(row)} onReply={() => { setReply(row); scrollRef.current?.parentElement?.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${txa('Mesajın')}"]`)?.focus() }}
            onEdit={() => { setError(''); setEditing(row); setEditBody(decodeCommunityMentions(row.body, row.mentions)); setEditMentions(row.mentions) }} onDelete={() => { setError(''); setDeleting(row) }}
            onReaction={(emoji, active) => void interact(row, 'set_reaction', active, emoji)} onPin={() => void interact(row, 'set_pin', !row.pinned_at)} onJump={id => void jump(id)} />)}
          {outgoing && !rows.some(row => row.client_id === outgoing.id) && <article className="cv2-message cv2-outgoing" aria-label={txa('Gönderilmekte olan mesaj')} aria-busy="true"><div className="cv2-message-meta"><strong>{txa('Sen')}</strong><small role="status">{txa('Gönderiliyor…')}</small></div><p>{outgoing.text}</p>{outgoing.files.map(name => <small key={name}>📎 {name}</small>)}</article>}
        </div>
      </>}
    </div>
    {(!nearEnd || contextView) && <button className="cv2-new-messages" disabled={jumpBusy} onClick={() => { leaveMessageContext(); void refresh(); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }}><ArrowDown size={15} /> {txa('Son mesajlara git')}</button>}
    <div className="cv2-presence" aria-live="polite"><span>{txa('{v1} kişi bu sohbette aktif', { v1: presence.rows.length })}</span><span>{presence.rows.filter(p => p.typing && p.user_id !== userId).slice(0,3).map(p => p.name).join(', ')}{presence.rows.some(p => p.typing && p.user_id !== userId) ? txa(' yazıyor…') : ''}</span></div>
    <form className="cv2-composer" onSubmit={e => { e.preventDefault(); void send() }}>
      {sendError && <div role="alert" className="cv2-error">{txa('{v1} Mesajın yazı alanında korundu.', { v1: sendError })} <button type="button" disabled={sending || !canSend || waitSeconds > 0} onClick={() => void send()}>{txa('Tekrar gönder')}</button></div>}
      <CommunityFileComposer uploads={uploads} disabled={sending} canUpload={canSend&&server.permissions.includes('attachments.send')}/>
      {reply && <section className="cv2-reply-draft"><div><strong>{txa('{v1} kullanıcısına yanıt', { v1: reply.display_name || reply.username })}</strong><p>{rows.find(r => r.id === reply.id)?.deleted_at ? txa('Yanıtlanan mesaj silindi; başka mesaj seç.') : decodeCommunityMentions(reply.body, reply.mentions).slice(0,150) || txa('📎 {v1} dosya', { v1: reply.attachments.length })}</p></div><button type="button" aria-label={txa('Yanıttan vazgeç')} onClick={() => setReply(null)}><X size={16} /></button></section>}
      <div><CommunityMessageInput channelId={channel.id} value={draft} onChange={value => { setDraft(value); presence.typing() }} mentions={mentions} onMentions={setMentions} disabled={!canSend || sending} label={txa('Mesajın')} allowMentions={allowMentions} onSend={() => void send()}
        placeholder={canSend ? '#' + channel.name + txa(' kanalına yaz') : channel.read_only_reason ? txa('Bu kanal şu anda salt okunur.') : timeoutActive ? txa('Yazma kısıtlaman devam ediyor.') : txa('Bu kanala yazma iznin yok.')} />
        <button type="submit" aria-label={txa('Mesaj gönder')} disabled={!canSend || sending || waitSeconds > 0 || !uploads.ready || (!draft.trim()&&!uploads.files.length) || (uploads.files.length>0&&!server.permissions.includes('attachments.send')) || encodeCommunityMentions(draft, mentions).length > 4000}><Send size={18} /></button></div>
      {canSend && channel.slowmode_seconds > 0 && <p className="cv2-slowmode">{server.permissions.includes('slowmode.bypass') ? txa('Yavaş mod: {v1} saniye · Bu süreden muafsın.', { v1: channel.slowmode_seconds }) : waitSeconds > 0 ? txa('Yeni mesaj için {v1} saniye bekle. Bu sırada yazmaya devam edebilirsin.', { v1: waitSeconds }) : txa('Yavaş mod: mesajlar arasında {v1} saniye.', { v1: channel.slowmode_seconds })}</p>}
      <small>{txa('Enter ile gönder · Shift + Enter ile yeni satır')}{allowMentions && txa(' · @ ile etiketle')}</small>
    </form>
    {searchOpen && <CommunitySearch serverId={server.profile.id} channelId={channel.id} onClose={() => setSearchOpen(false)} onJump={id => void jump(id)} />}
    {reporting && <CommunityReportDialog channelId={channel.id} message={reporting} onClose={() => setReporting(null)} />}
    {pinsOpen && <CommunityPins channelId={channel.id} onClose={() => setPinsOpen(false)} onJump={id => void jump(id)} />}
    {(editing || deleting) && <CommunityModal title={editing ? txa('Mesajı düzenle') : txa('Mesaj silinsin mi?')} description={editing ? txa('Değişiklik diğer üyelere de yansır.') : txa('Mesajın içeriği kaldırılacak.')} onClose={() => { if (!actionBusy) { setEditing(null); setDeleting(null) } }}>
      {error && <p role="alert" className="cv2-error">{error}</p>}
      {editing && <CommunityMessageInput channelId={channel.id} value={editBody} onChange={setEditBody} mentions={editMentions} onMentions={setEditMentions} disabled={actionBusy} label={txa('Düzenlenen mesaj')} allowMentions={allowMentions} />}
      <button className="cv2-primary" disabled={actionBusy || (!!editing && ((!editBody.trim()&&!editing.attachments.length) || encodeCommunityMentions(editBody, editMentions).length > 4000))} onClick={() => void messageAction()}>{actionBusy ? txa('Kaydediliyor…') : editing ? txa('Kaydet') : txa('Mesajı sil')}</button>
    </CommunityModal>}
  </section>
}
