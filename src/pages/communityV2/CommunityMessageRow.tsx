import { useState } from 'react'
import { Flag, Pencil, Pin, PinOff, Reply, SmilePlus, Trash2 } from 'lucide-react'
import type { CommunityMessage } from '@/services/communityV2Service'
import { COMMUNITY_REACTIONS } from '@/lib/communityMentions'
import { CommunityIdentity } from './CommunityShared'
import { CommunityMessageBody } from './CommunityMessageBody'
import { CommunityAttachments } from './CommunityAttachments'
import { CommunityBlockButton } from './CommunityBlockButton'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function CommunityMessageRow({ row, userId, permissions, writable, canSend, busy, onReply, onEdit, onDelete, onReaction, onPin, onJump, onReport, onBlockChanged }: {
  row: CommunityMessage; userId: string; permissions: string[]; writable: boolean; canSend: boolean; busy: boolean;
  onBlockChanged: () => void;
  onReport: () => void; onReply: () => void; onEdit: () => void; onDelete: () => void; onReaction: (emoji: typeof COMMUNITY_REACTIONS[number], active: boolean) => void; onPin: () => void; onJump: (id: string) => void;
}) {
  const [picker, setPicker] = useState(false)
  const has = (permission: string) => permissions.includes(permission)
  if (row.blocked) return <article className="cv2-blocked-message" data-message-id={row.id} tabIndex={-1}>{txa('Engelleme nedeniyle mesaj gizlendi.')} <CommunityBlockButton userId={row.author_id} username={row.username} changed={onBlockChanged} /></article>
  return <article className={`cv2-message ${row.mentioned_me ? 'cv2-mentioned' : ''}`} data-message-id={row.id} tabIndex={-1}>
    {row.reply && <button className="cv2-reply-preview" onClick={() => onJump(row.reply!.id)}><Reply size={13} /><strong>{row.reply.display_name || row.reply.username}</strong><span>{row.reply.blocked ? txa('Engelleme nedeniyle gizlendi.') : row.reply.deleted ? txa('Bu mesaj silindi.') : row.reply.body || txa('📎 Dosya paylaşımı')}</span></button>}
    <div className="cv2-message-meta"><CommunityIdentity user={{ ...row, user_id: row.author_id }} /><time dateTime={row.created_at} title={new Date(row.created_at).toLocaleString(intlLocale())}>{new Date(row.created_at).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })}</time>{row.edited_at && !row.deleted_at && <small>{txa('düzenlendi')}</small>}
      {row.pinned_at && <Pin size={13} aria-label={txa('Sabitlenmiş mesaj')} />}
      {!row.deleted_at && <span className="cv2-message-actions">
        {canSend && has('messages.reply') && <button disabled={busy} aria-label={txa('Mesaja yanıt ver')} title={txa('Yanıt ver')} onClick={onReply}><Reply size={14} /></button>}
        {writable && has('reactions.add') && <button disabled={busy} aria-label={txa('Tepki ekle')} title={txa('Tepki ekle')} aria-expanded={picker} onClick={() => setPicker(v => !v)}><SmilePlus size={14} /></button>}
        {writable && has('messages.pin') && <button disabled={busy} aria-label={row.pinned_at ? txa('Sabitlemeyi kaldır') : txa('Mesajı sabitle')} title={row.pinned_at ? txa('Sabitlemeyi kaldır') : txa('Mesajı sabitle')} onClick={onPin}>{row.pinned_at ? <PinOff size={14} /> : <Pin size={14} />}</button>}
        {row.author_id === userId && has('messages.self.edit') && writable && <button disabled={busy} aria-label={txa('Mesajı düzenle')} title={txa('Mesajı düzenle')} onClick={onEdit}><Pencil size={14} /></button>}
        {((row.author_id === userId && has('messages.self.delete')) || has('messages.others.delete')) && <button disabled={busy} aria-label={txa('Mesajı sil')} title={txa('Mesajı sil')} onClick={onDelete}><Trash2 size={14} /></button>}
        {row.author_id !== userId && <button disabled={busy} aria-label={txa('Mesajı bildir')} title={txa('Mesajı bildir')} onClick={onReport}><Flag size={14} /></button>}
      </span>}
    </div>
    {row.author_id !== userId && <CommunityBlockButton userId={row.author_id} username={row.username} changed={onBlockChanged} />}
    <CommunityMessageBody message={row} />
    {!row.deleted_at && <CommunityAttachments files={row.attachments}/>}
    {!row.deleted_at && <>
      {!!row.reactions.length && <div className="cv2-reactions" aria-label={txa('Mesaj tepkileri')}>{row.reactions.map(r => <button key={r.emoji} aria-label={txa('{v1}: {v2} tepki', { v1: r.emoji, v2: r.count })} aria-pressed={r.mine} disabled={busy || !writable || (!r.mine && !has('reactions.add'))} onClick={() => onReaction(r.emoji, !r.mine)}>{r.emoji} <span>{r.count}</span></button>)}</div>}
      {picker && writable && has('reactions.add') && <div className="cv2-reaction-picker" role="group" aria-label={txa('Tepki seç')}>{COMMUNITY_REACTIONS.map(emoji => <button key={emoji} disabled={busy} aria-label={`${emoji} tepkisi`} aria-pressed={row.reactions.some(r => r.emoji === emoji && r.mine)} onClick={() => { onReaction(emoji, !row.reactions.some(r => r.emoji === emoji && r.mine)); setPicker(false) }}>{emoji}</button>)}<button onClick={() => setPicker(false)}>{txa('Kapat')}</button></div>}
    </>}
  </article>
}
