import { useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowRight, Check, Plus } from '@phosphor-icons/react'
import type { LatestChapterItem } from '@/services/latestChapterFeedService'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { DesktopCover } from './desktop/DesktopPoster'
import { useDesktopFollow } from './desktop/useDesktopFollow'
import { filterDesktopChapters, type ChapterTab } from './desktop/chapterFilters'
import { formatRelativeTime } from './homeUtils'
import { useTx } from '@/i18n/LocaleProvider'
import { txa } from '@/i18n/activeLocale'

const tabs = [['all', 'Tümü'], ['today', 'Bugün'], ['yesterday', 'Dün'], ['week', 'Bu Hafta']] as const
export function HomeNewChapters({ chapters, loading = false }: { chapters: LatestChapterItem[]; loading?: boolean }) {
  const [active, setActive] = useState<ChapterTab>('all')
  const [limit, setLimit] = useState(6)
  const follow = useDesktopFollow('manga')
  const tx = useTx()
  const filtered = useMemo(() => filterDesktopChapters(chapters, active), [chapters, active])
  return <section className="dh-chapters"><header className="dh-heading"><div className="dh-heading-group"><h2>{tx('YENİ BÖLÜMLER')}</h2><div className="dh-tabs" aria-label={tx('Bölüm yayın zamanı')}>{tabs.map(([key, label]) => <button key={key} aria-pressed={active === key} onClick={() => { setActive(key); setLimit(6) }}>{tx(label)}</button>)}</div></div><Link to="/yayin-takvimi">{tx('Yayın takvimi')} <ArrowRight /></Link></header>
    {follow.error && <p className="dh-empty" role="status">{tx('Takip durumu yüklenemedi.')} <button className="underline" onClick={follow.retry}>{tx('Tekrar dene')}</button></p>}
    <div className="dh-chapter-grid">{filtered.slice(0, limit).map(row => <article key={row.chapterId} className="dh-chapter">
      <Link className="dh-chapter-cover" aria-label={tx('{title} {number}. bölümü oku', { title: row.mangaTitle, number: row.chapterNumber })} to={buildPublicChapterPath(row)}><DesktopCover manga={{ title: row.mangaTitle, coverImage: row.mangaCoverImage }} /></Link>
      <Link className="dh-chapter-info" to={buildPublicMangaPath({ id: row.mangaId, slug: row.mangaSlug, title: row.mangaTitle })}><small>{tx('BÖLÜM {number}', { number: row.chapterNumber })}</small><h3>{row.mangaTitle}</h3><p>{row.fansubAvatarUrl && <img src={row.fansubAvatarUrl} alt="" />}<span>{row.fansubName || txa('BSG Manga')}</span><time dateTime={row.publishAt || undefined}>{row.publishAt && formatRelativeTime(row.publishAt)}</time></p></Link>
      <button className="dh-follow" aria-label={`${row.mangaTitle}: ${follow.ids.has(row.mangaId) ? tx('takipten çıkar') : tx('takip et')}`} aria-pressed={follow.ids.has(row.mangaId)} disabled={!follow.ready || follow.busy.has(row.mangaId)} onClick={() => void follow.toggle(row.mangaId)}>{follow.ids.has(row.mangaId) ? <Check /> : <Plus />}</button>
    </article>)}</div>
    {!filtered.length && <p className="dh-empty" role="status">{loading ? tx('Bölümler yükleniyor…') : tx('Bu aralıkta gösterilecek bölüm yok. Tüm yayınlar için yayın takvimini açabilirsin.')}</p>}
    {filtered.length > limit && <button className="dh-more" onClick={() => setLimit(n => n + 6)}>{tx('Daha fazla göster')}</button>}
  </section>
}
