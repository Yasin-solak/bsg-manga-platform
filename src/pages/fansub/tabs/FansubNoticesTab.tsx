import { Link } from '@/i18n/router'
import { ArrowUpRight, Megaphone, PushPin } from '@phosphor-icons/react'
import type { FansubPinnedNotice } from '@/services/fansubNoticeService'
import { Panel, PanelEmpty } from '../../profile/ProfileTabKit'
import { presentFansubNotice, sortFansubNotices } from '../noticePresentation'
import { relativeAgo } from './fansubTabUtils'
import { txa } from '@/i18n/activeLocale'

/*
 * Notices tab (v2): the newest notice in a large highlighted card (title, full text, action),
 * others on a timeline. Sorted by recency (noticePresentation).
 */

export function FansubNoticesTab({ fansubId, fansubSlug, fansubName, notices }: {
  fansubId: string
  fansubSlug?: string
  fansubName: string
  notices: FansubPinnedNotice[]
}) {
  const items = sortFansubNotices(notices).map((notice) => presentFansubNotice(notice, { id: fansubId, slug: fansubSlug }))
  const [featured, ...rest] = items

  return (
    <Panel title={txa('Duyurular')} icon={Megaphone} tone='rose' meta={items.length ? txa('{v1} aktif duyuru', { v1: items.length }) : undefined} testId='fansub-notices-tab'>
      {featured ? (
        <div className='flex flex-col gap-5'>
          <article className='relative isolate overflow-hidden rounded-2xl border border-rose-400/25 bg-gradient-to-br from-rose-500/15 via-fuchsia-500/[0.06] to-transparent p-5' data-testid='fansub-notice-featured'>
            <Megaphone aria-hidden weight='fill' size={120} className='absolute -right-6 -top-6 -z-10 rotate-12 text-rose-400/10' />
            <span className='flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-rose-300'>
              <PushPin weight='fill' size={12} />
              {txa('Güncel duyuru')} · {relativeAgo(featured.updatedAt)}
            </span>
            <h3 className='mt-2 text-[20px] font-black leading-snug tracking-tight [overflow-wrap:anywhere]'>{featured.title}</h3>
            <p className='mt-2 whitespace-pre-line text-[14px] leading-relaxed text-foreground/80 [overflow-wrap:anywhere]'>{featured.body}</p>
            <Link to={featured.href} className='mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl bg-foreground px-4 text-[13px] font-extrabold text-background hover:opacity-90'>
              {featured.actionLabel}
              <ArrowUpRight weight='bold' size={14} />
            </Link>
          </article>

          {rest.length ? (
            <ol className='relative flex flex-col gap-4 border-l border-border/70 pl-5'>
              {rest.map((notice) => (
                <li key={notice.id} className='relative'>
                  <span aria-hidden className='absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-background bg-rose-400' />
                  <span className='text-[11.5px] font-semibold text-muted-foreground'>{relativeAgo(notice.updatedAt)} · {notice.targetLabel}</span>
                  <h4 className='mt-0.5 text-[14.5px] font-bold [overflow-wrap:anywhere]'>{notice.title}</h4>
                  <p className='mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]'>{notice.body}</p>
                  <Link to={notice.href} className='mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-bold text-primary hover:underline'>
                    {notice.actionLabel}
                    <ArrowUpRight weight='bold' size={12} />
                  </Link>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : (
        <PanelEmpty icon={Megaphone} title={txa('Aktif duyuru yok')} hint={txa('{v1} şu an bir duyuru yayınlamıyor. Yeni duyurular burada en üstte görünür.', { v1: fansubName })} />
      )}
    </Panel>
  )
}
