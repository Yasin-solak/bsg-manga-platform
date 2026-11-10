import { Link } from '@/i18n/router'
import { ArrowUpRight, Bell } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { FansubPinnedNotice } from '@/services/fansubNoticeService'
import { resolveFansubNoticeActionLabel, resolveFansubNoticeActionTargetHref } from '@/lib/fansubNotices'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

type FansubPinnedNoticeBannerProps = {
  notice: FansubPinnedNotice
  fansubSlug?: string
  previewMode?: boolean
  className?: string
}

export default function FansubPinnedNoticeBanner({
  notice,
  fansubSlug,
  previewMode = false,
  className,
}: FansubPinnedNoticeBannerProps) {
  const actionUrl = resolveFansubNoticeActionTargetHref(
    { id: notice.fansubId, slug: fansubSlug },
    notice.actionTarget,
    notice.actionUrl,
  )
  const actionLabel = resolveFansubNoticeActionLabel(notice.actionTarget, notice.actionLabel)
  const hasAction = actionLabel.length > 0 && actionUrl.length > 0

  return (
    <section
      className={cn(
        'overflow-hidden rounded-[24px] border border-amber-300/50 bg-[linear-gradient(135deg,rgba(251,191,36,0.16),rgba(251,146,60,0.08),rgba(255,255,255,0.96))] shadow-[0_18px_48px_-28px_rgba(245,158,11,0.5)] dark:border-amber-400/25 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(120,53,15,0.3),rgba(9,9,11,0.92))]',
        className,
      )}
    >
      <div className={cn('flex flex-col gap-4 px-4 py-4 sm:px-5', previewMode && 'gap-1.5 px-2.5 py-2')}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn('gap-1 rounded-full bg-amber-500/90 text-white shadow-sm', previewMode && 'px-2 py-0.5 text-[10px]')}>
            <Bell className="size-3" />
            {notice.isActive ? txa('Aktif duyuru') : txa('Pasif taslak')}
          </Badge>
        </div>

        <div className="space-y-1">
          <h3 className={cn('text-base font-semibold tracking-tight text-foreground sm:text-lg', previewMode && 'text-sm sm:text-sm')}>
            {notice.title}
          </h3>
          <p className={cn('whitespace-pre-wrap text-sm leading-6 text-foreground/85', previewMode && 'line-clamp-2 whitespace-normal text-[10px] leading-4')}>
            {notice.body}
          </p>
        </div>

        {hasAction ? (
          <Link
            to={actionUrl}
            className={cn(
              'inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/45 bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background',
              previewMode && 'gap-1.5 px-1.5 py-0.5 text-[10px]'
            )}
          >
            {actionLabel}
            <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </section>
  )
}
