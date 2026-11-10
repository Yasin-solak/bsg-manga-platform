import { useEffect, useState } from 'react'
import { communityPersonal } from '@/services/communityPersonalService'
import { communityV2, type CommunityMember, type CommunityMessage } from '@/services/communityV2Service'
import { CommunityLoading, CommunityModal } from './CommunityShared'
import { communityError } from './communityHelpers'
import { decodeCommunityMentions } from '@/lib/communityMentions'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function CommunitySearch({ serverId, channelId, onClose, onJump }: { serverId: string; channelId: string; onClose: () => void; onJump: (id: string) => void }) {
  const [search, setSearch] = useState(''), [author, setAuthor] = useState(''), [memberSearch, setMemberSearch] = useState('')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [files, setFiles] = useState(false)
  const [members, setMembers] = useState<CommunityMember[]>([]), [rows, setRows] = useState<CommunityMessage[]>([]), [next, setNext] = useState<string | undefined>()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(false)
  useEffect(() => { let live = true; const timer = setTimeout(() => { void communityV2.members(serverId, memberSearch, 0, false, channelId).then(v => { if (live) setMembers(v) }).catch(e => { if (live) setError(communityError(e)) }) }, 200); return () => { live = false; clearTimeout(timer) } }, [serverId, channelId, memberSearch])
  useEffect(() => { setRows([]); setNext(undefined); setSearched(false) }, [search, author, from, to, files])
  async function run(more = false) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const end = to ? new Date(`${to}T00:00:00`) : null
      if (end) end.setDate(end.getDate() + 1)
      const found = await communityPersonal.search(channelId, { search, author_id: author || undefined, from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: end?.toISOString(), has_files: files, before: more ? next : undefined })
      const page = found.slice(0, 25)
      setRows(previous => more ? [...previous, ...page].slice(-250) : page); setNext(found.length > 25 ? page[page.length - 1]?.seq : undefined); setSearched(true)
    } catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return <CommunityModal title={txa('Kanalda mesaj ara')} description={txa('Yalnız erişebildiğin bu kanalın mesajları aranır. Engellenen hesapların mesajları sonuçlarda görünmez.')} onClose={onClose} wide>
    <form className="cv2-role-form" onSubmit={e => { e.preventDefault(); void run() }}><fieldset disabled={busy}><label>{txa('Kelime veya ifade')}<input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder={txa('Örneğin: yeni bölüm')} /></label><label>{txa('Yazarı bul')}<input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} /></label><label>{txa('Yazar')}<select value={author} onChange={e => setAuthor(e.target.value)}><option value="">{txa('Herkes')}</option>{members.map(m => <option key={m.user_id} value={m.user_id}>@{m.username}</option>)}</select></label><div className="cv2-filter-grid"><label>{txa('Başlangıç')}<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label>{txa('Bitiş')}<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label></div><label className="cv2-check"><input type="checkbox" checked={files} onChange={e => setFiles(e.target.checked)} />{txa('Yalnız dosyalı mesajlar')}</label></fieldset><button className="cv2-primary" disabled={busy || (!!search.trim() && search.trim().length < 2)}>{txa('Ara')}</button></form>
    {error && <p role="alert" className="cv2-error">{error}</p>}{busy && <CommunityLoading />}{rows.map(row => <button className="cv2-search-result" key={row.id} onClick={() => onJump(row.id)}><strong>{row.display_name || row.username} <small>@{row.username}</small></strong><time>{new Date(row.created_at).toLocaleString(intlLocale())}</time><span>{decodeCommunityMentions(row.body, row.mentions).slice(0, 250) || txa('Dosya paylaşımı')}</span></button>)}{searched && !rows.length && !busy && <p>{txa('Bu filtrelere uygun mesaj yok.')}</p>}{next && <button disabled={busy} onClick={() => void run(true)}>{txa('Daha eski sonuçlar')}</button>}
  </CommunityModal>
}
