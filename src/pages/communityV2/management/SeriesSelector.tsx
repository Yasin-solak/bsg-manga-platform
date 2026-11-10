import { useEffect, useState } from 'react'
import { communityV2, type CommunitySeriesCandidate } from '@/services/communityV2Service'
import { communityError } from '../communityHelpers'
import { txa } from '@/i18n/activeLocale'

export function SeriesSelector({ serverId, value, onChange, disabled }: {
  serverId: string; value: CommunitySeriesCandidate | null; onChange: (value: CommunitySeriesCandidate | null) => void; disabled: boolean;
}) {
  const [search, setSearch] = useState(''), [page, setPage] = useState(0), [revision, setRevision] = useState(0)
  const [rows, setRows] = useState<CommunitySeriesCandidate[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const timer = setTimeout(() => {
      void communityV2.seriesCandidates(serverId, search, page * 20, controller.signal).then(next => { if (!controller.signal.aborted) setRows(next) })
        .catch(e => { if (!controller.signal.aborted) { setRows([]); setError(communityError(e)) } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 200)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [serverId, search, page, revision])
  return <fieldset className="cv2-series-selector" disabled={disabled}><legend>{txa('Seri bağlantısı (isteğe bağlı)')}</legend>
    <p className="cv2-hint">{txa('Yalnız fansubun yayımlanmış bölümü bulunan seriler bağlanabilir. Kaydedilen bağlantı değiştirilemez; her seri için arşiv dahil tek kanal açılır.')}</p>
    {value && <p className="cv2-notice">{txa('Seçilen: {v1}', { v1: value.title })} <button type="button" onClick={() => onChange(null)}>{txa('Seçimi kaldır')}</button></p>}
    <label>{txa('Seri ara')}<input value={search} maxLength={80} placeholder={txa('Seri adı…')} onChange={e => { setSearch(e.target.value); setPage(0) }} /></label>
    {error && <p role="alert" className="cv2-error">{error} <button type="button" onClick={() => setRevision(v => v + 1)}>{txa('Yeniden dene')}</button></p>}
    {loading ? <p role="status">{txa('Seriler yükleniyor…')}</p> : rows.slice(0, 20).map(row => <label className="cv2-check" key={row.id}>
      <input type="radio" name="channel-series" checked={value?.id === row.id} disabled={row.already_linked} onChange={() => onChange(row)} />
      <span>{row.title}{row.already_linked && <small> {txa('· Kanalı mevcut')}</small>}</span>
    </label>)}
    {!loading && !error && !rows.length && <p className="cv2-hint">{txa('Uygun seri bulunamadı.')}</p>}
    {(page > 0 || rows.length > 20) && <div className="cv2-pagination"><button type="button" disabled={!page || loading} onClick={() => setPage(p => p - 1)}>{txa('Önceki')}</button><span>{txa('Sayfa {v1}', { v1: page + 1 })}</span><button type="button" disabled={rows.length <= 20 || loading} onClick={() => setPage(p => p + 1)}>{txa('Sonraki')}</button></div>}
  </fieldset>
}
