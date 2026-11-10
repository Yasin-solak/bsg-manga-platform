import { Link } from '@/i18n/router'
import { ArrowRight, Crown, Users } from 'lucide-react'
import FansubIdentityTagChip from '@/components/common/FansubIdentityTagChip'
import { Button } from '@/components/ui/button'
import { FansubDiscoverBadge, FansubGoldFrame } from '@/components/common/FansubBoostChrome'
import { resolveFansubNameStylePresentation } from '@/components/common/fansubNameStyle'
import { cn } from '@/lib/utils'
import type { ChapterCreditPresentation } from './chapterCreditPresentation'
import { txa } from '@/i18n/activeLocale'

type ChapterEndCreditRailProps = {
  presentation: ChapterCreditPresentation
  compact?: boolean
  className?: string
}

export function ChapterEndCreditRail({
  presentation,
  compact = false,
  className,
}: ChapterEndCreditRailProps) {
  const nameStyle = resolveFansubNameStylePresentation(presentation.fansub.activeNameStyle)
  const visibleSupporters = compact
    ? presentation.supporters.slice(0, 1)
    : presentation.supporters
  const hiddenSupporterCount = presentation.hiddenSupporterCount + Math.max(0, presentation.supporters.length - visibleSupporters.length)

  return (
    <section
      data-testid={compact ? 'chapter-credit-rail-compact' : 'chapter-credit-rail'}
      data-has-discover-badge={presentation.fansub.hasDiscoverBadge ? 'true' : 'false'}
      data-has-gold-frame={presentation.fansub.hasGoldFrame ? 'true' : 'false'}
      data-supporter-count={String(visibleSupporters.length)}
      data-is-minimal={presentation.isMinimal ? 'true' : 'false'}
      className={cn(
        'overflow-hidden rounded-[24px] border border-amber-400/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.022),rgba(255,255,255,0.014))] shadow-[0_12px_28px_-36px_rgba(251,191,36,0.28)]',
        compact ? 'p-3.5 sm:p-4' : 'p-4.5 sm:p-5',
        className,
      )}
    >
      <div className={cn('flex flex-col', compact ? 'gap-2.5' : 'gap-3')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn(
              'rounded-full border border-amber-400/12 bg-amber-400/[0.045] font-semibold uppercase tracking-[0.18em] text-amber-100/66',
              compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]',
            )}>
              {presentation.badgeLabel}
            </span>
            {presentation.fansub.hasDiscoverBadge ? <FansubDiscoverBadge compact /> : null}
          </div>
          {presentation.metrics.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {presentation.metrics.map((metric) => (
                <span
                  key={metric.label}
                  className={cn(
                    'rounded-full border border-white/7 bg-white/[0.024] font-medium text-white/52',
                    compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
                  )}
                >
                  <span className="text-white/42">{metric.label}:</span> {metric.value}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className={cn('flex min-w-0 items-start', compact ? 'gap-2.5' : 'gap-3')}>
          <FansubGoldFrame active={presentation.fansub.hasGoldFrame} className="shrink-0">
            {presentation.fansub.avatarUrl ? (
              <img
                src={presentation.fansub.avatarUrl}
                alt={presentation.fansub.name}
                className={cn('rounded-full object-cover', compact ? 'size-11 sm:size-12' : 'size-12 sm:size-13')}
                loading="lazy"
              />
            ) : (
              <div className={cn(
                'flex items-center justify-center rounded-full bg-amber-500/14 font-black text-amber-100',
                compact ? 'size-11 text-sm sm:size-12' : 'size-12 text-base sm:size-13',
              )}>
                {presentation.fansub.name.trim().slice(0, 1).toUpperCase()}
              </div>
            )}
          </FansubGoldFrame>

          <div className="min-w-0 flex-1">
            <p className={cn(
              'font-semibold uppercase tracking-[0.16em] text-white/42',
              compact ? 'text-[10px]' : 'text-[11px]',
            )}>
              {presentation.eyebrowLabel}
            </p>
            <p className={cn('mt-1 font-semibold text-white/84', compact ? 'text-[13px]' : 'text-sm')}>
              <span className={cn('inline', nameStyle.className)} style={nameStyle.inlineStyle}>
                {presentation.fansub.name}
              </span>
            </p>
            <h2 className={cn(
              'mt-1 line-clamp-2 font-semibold text-white [overflow-wrap:anywhere]',
              compact ? 'text-[15px] leading-5' : 'text-base leading-5.5 sm:text-[1.02rem]',
            )}>
              {presentation.title}
            </h2>
            <p className={cn(
              'line-clamp-2 text-white/62 [overflow-wrap:anywhere]',
              compact ? 'mt-1 text-[13px] leading-[1.35rem]' : 'mt-1.5 text-sm leading-5',
            )}>
              {presentation.body}
            </p>
          </div>
        </div>

        {presentation.supporters.length > 0 ? (
          <div className={cn(
            'flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/6 bg-white/[0.02]',
            compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
          )}>
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn(
                'inline-flex items-center justify-center rounded-full bg-white/[0.045] text-white/52',
                compact ? 'size-5.5' : 'size-6.5',
              )}>
                <Users className={cn(compact ? 'size-3' : 'size-3.5')} />
              </span>
              <div className="min-w-0">
                <p className={cn('font-medium text-white/68', compact ? 'text-[11px]' : 'text-xs')}>{txa('Destek ozeti')}</p>
                {!compact ? (
                  <p className="text-[11px] text-white/40">
                    {txa('Bu bolumde gorunen supporter secimleri')}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {visibleSupporters.map((supporter) => (
                <Link
                  key={supporter.id}
                  to={supporter.href}
                  className={cn(
                    'inline-flex min-w-0 items-center gap-2 rounded-full border border-white/7 bg-black/10 transition-colors hover:border-white/12 hover:bg-black/16',
                    compact ? 'px-1.5 py-0.75' : 'px-2 py-1.25',
                  )}
                >
                  {supporter.avatarUrl ? (
                    <img
                      src={supporter.avatarUrl}
                      alt={supporter.username}
                      className={cn('rounded-full object-cover', compact ? 'size-5.5' : 'size-6')}
                      loading="lazy"
                    />
                  ) : (
                    <span className={cn(
                      'flex items-center justify-center rounded-full bg-white/10 font-semibold text-white/74',
                      compact ? 'size-5.5 text-[10px]' : 'size-6 text-[11px]',
                    )}>
                      {supporter.username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className={cn(
                      'block truncate font-medium text-white/78',
                      compact ? 'max-w-[82px] text-[11px]' : 'max-w-[96px] text-xs',
                    )}>
                      {supporter.username}
                    </span>
                    <FansubIdentityTagChip
                      tag={supporter.activeFansubIdentityTag}
                      size='xs'
                      className='mt-1 border-white/10 bg-white/[0.035] text-white/82'
                    />
                  </span>
                  <span className={cn(
                    'inline-flex max-w-[92px] items-center gap-1 rounded-full border border-amber-400/12 bg-amber-400/[0.045] font-medium text-amber-200/74',
                    compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]',
                  )}>
                    <Crown className={cn(compact ? 'size-2' : 'size-2.5')} />
                    <span className="truncate">{supporter.badgeLabel}</span>
                  </span>
                </Link>
              ))}
              {hiddenSupporterCount > 0 ? (
                <span className={cn(
                  'rounded-full border border-white/7 bg-white/[0.026] font-medium text-white/50',
                  compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
                )}>
                  +{hiddenSupporterCount}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {presentation.ctaHref ? (
          <div className={cn('flex items-center', presentation.isMinimal ? 'pt-0' : 'pt-0.5')}>
            <Button
              asChild
              type="button"
              variant="outline"
              className={cn(
                'rounded-full border-white/12 bg-white/[0.03] font-medium text-white/80 hover:bg-white/[0.06] hover:text-white',
                compact ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm',
              )}
            >
              <Link to={presentation.ctaHref}>
                {presentation.ctaLabel}
                <ArrowRight className={cn('ml-2', compact ? 'size-3.5' : 'size-4')} />
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default ChapterEndCreditRail
