import { FansubHoverCard } from '@/components/common/FansubHoverCard'
import { Link } from '@/i18n/router'
import { Check, Plus, Books, Users } from '@phosphor-icons/react'
import { AvatarFrame } from '@/components/common/AvatarFrame'
import type { LatestChapterItem } from '@/services/latestChapterFeedService'
import { DesktopCover } from './desktop/DesktopPoster'
import { buildPublicFansubPath, buildPublicChapterPath } from '@/lib/routes'
import type { Fansub } from '@/types'
import { useDesktopFollow } from './desktop/useDesktopFollow'
import { useTx } from '@/i18n/LocaleProvider'
import { intlLocale } from '@/i18n/activeLocale'

export function HomeFansubSection({ fansubs, chapters = [] }: { fansubs: Fansub[]; chapters?: LatestChapterItem[] }) {
  const follow = useDesktopFollow('fansub')
  const tx = useTx()
  return <section className="dh-panel"><header className="dh-heading dh-heading-rule"><div><h2>{tx('FANSUBLAR')}</h2><p>{tx('Takip gücü yüksek ekipleri keşfet.')}</p></div><Link to="/fansublar">{tx('Tümünü gör')}</Link></header>
    {follow.error && <p className="dh-empty" role="status">{tx('Takip durumu yüklenemedi.')} <button className="underline" onClick={follow.retry}>{tx('Tekrar dene')}</button></p>}
    <div className="dh-fansubs">{fansubs.map(fansub => <article key={fansub.id}>
      <FansubHoverCard id={fansub.id} slug={fansub.slug} name={fansub.name} avatar={fansub.avatar} description={fansub.description} mangaCount={fansub.mangaCount} followerCount={fansub.followerCount} frameType={fansub.frameType} className="min-w-0"><Link to={buildPublicFansubPath(fansub)} className="dh-fansub-identity"><AvatarFrame src={fansub.avatar} alt={fansub.name} frameType={fansub.frameType || 'default'} size={54} animated /><div><h3>{fansub.name}</h3><p>{fansub.description}</p><span className="dh-team-meta"><Books size={13} />{tx('{count} seri', { count: fansub.mangaCount || 0 })} <Users size={13} />{tx('{count} takipçi', { count: (fansub.followerCount || 0).toLocaleString(intlLocale()) })}</span></div></Link></FansubHoverCard>
      <div className="dh-team-releases">{chapters.filter(chapter => chapter.fansubId === fansub.id).slice(0, 2).map(chapter => <Link key={chapter.chapterId} to={buildPublicChapterPath(chapter)}><DesktopCover manga={{ title: chapter.mangaTitle, coverImage: chapter.mangaCoverImage }} /><span><b>{chapter.mangaTitle}</b><small>{tx('Bölüm {number}', { number: chapter.chapterNumber })}</small></span></Link>)}</div>
      <button className="dh-team-follow" aria-pressed={follow.ids.has(fansub.id)} disabled={!follow.ready || follow.busy.has(fansub.id)} onClick={() => void follow.toggle(fansub.id)}>{follow.ids.has(fansub.id) ? <Check /> : <Plus />}{follow.ids.has(fansub.id) ? tx('Takip ediliyor') : tx('Takip et')}</button>
    </article>)}</div>
  </section>
}
