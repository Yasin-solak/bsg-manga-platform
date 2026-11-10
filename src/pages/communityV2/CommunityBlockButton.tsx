import { useState } from 'react'
import { Ban } from 'lucide-react'
import { blockUser, unblockUser, getUserBlockState } from '@/services/userService/blocks'
import { CommunityModal } from './CommunityShared'
import { communityError } from './communityHelpers'
import { txa } from '@/i18n/activeLocale'

export function CommunityBlockButton({ userId, username, changed }: { userId: string; username: string; changed: () => void }) {
  const [open, setOpen] = useState(false), [blocked, setBlocked] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function inspect() {
    setOpen(true); setError(''); setBlocked(null)
    try { const state = await getUserBlockState(userId); setBlocked(state.blockedByCurrentUser) }
    catch (e) { setError(communityError(e)) }
  }
  async function act() {
    if (busy || blocked === null) return
    setBusy(true); setError('')
    try { await (blocked ? unblockUser(userId) : blockUser(userId)); changed(); setOpen(false) }
    catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return <><button aria-label={txa('@{v1} için engelleme ayarları', { v1: username })} title={txa('Engelleme ayarları')} onClick={() => void inspect()}><Ban size={14} /></button>{open && <CommunityModal title={`@${username}`} description={txa('Hesap engeli bütün sitede geçerlidir. Sohbette karşılıklı mesaj, etiket, çevrimiçi ve bildirim etkileşimleri gizlenir; sunucu üyeliği değişmez.')} onClose={() => { if (!busy) setOpen(false) }}>
    {error && <p role="alert" className="cv2-error">{error}</p>}{blocked === null ? <p>{txa('Engelleme durumu kontrol ediliyor…')}</p> : <button className="cv2-primary" disabled={busy} onClick={() => void act()}>{busy ? txa('Kaydediliyor…') : blocked ? txa('Engelimi kaldır') : txa('Hesabı engelle')}</button>}
  </CommunityModal>}</>
}
