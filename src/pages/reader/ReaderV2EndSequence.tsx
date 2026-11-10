/**
 * Chapter end sequence (v2).
 *
 * In v1 chapter end was a panel pinned under the reader; overflowing images swallowed
 * clicks and it was clipped on narrow screens. Here chapter end continues the SAME
 * scroll flow: after the pages it comes like normal content,
 * with no pinned layer.
 *
 * Block order and gates are in the pure engine (readerV2EndSequenceEngine); this file
 * draws.
 */

import { Link } from '@/i18n/router'
import { ArrowRight, BookOpen, Coins, Crown, HeartHandshake, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FansubDiscoverBadge, FansubGoldFrame } from '@/components/common/FansubBoostChrome'
import { resolveFansubNameStylePresentation } from '@/components/common/fansubNameStyle'
import type { ReaderV2CreditPresentation } from '@/pages/reader/readerV2CreditPresentation'
import type { ReaderV2EndBlock, ReaderV2SupportAction } from '@/pages/reader/readerV2EndSequenceEngine'
import { txa } from '@/i18n/activeLocale'

interface ReaderV2EndSequenceProps {
  /** For the visibility trigger: credit data is fetched when this block comes into view. */
  containerRef?: React.Ref<HTMLDivElement>
  blocks: ReaderV2EndBlock[]
  supportActions: ReaderV2SupportAction[]
  /** Destek eylemleri kredi kartinin icinde mi cizilecek (bkz. motor). */
  supportInsideCredit: boolean
  chapterNotes: string | null | undefined
  nextChapterNumber: number | null
  onGoNextChapter: () => void
  mangaTitle: string
  mangaHref: string
  mangaCoverUrl?: string | null
  credit: ReaderV2CreditPresentation | null
  creditLoading: boolean
  /**
   * Support actions work INSIDE the chapter (user feedback): a dialog opens rather than
   * interrupting the reading flow to go to the fansub page.
   */
  onBoost: () => void
  onDonate: () => void
  /** Comment block; passed in since the page owns the data. */
  commentsNode?: React.ReactNode
  /** Follow + notification invite; the page carries its state. */
  notifyNode?: React.ReactNode
}

function SectionCard({
  children,
  className,
  testId,
}: {
  children: React.ReactNode
  className?: string
  testId?: string
}) {
  return (
    <section
      data-testid={testId}
      className={cn('rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5', className)}
    >
      {children}
    </section>
  )
}

export function ReaderV2EndSequence({
  containerRef,
  blocks,
  supportActions,
  supportInsideCredit,
  chapterNotes,
  nextChapterNumber,
  onGoNextChapter,
  mangaTitle,
  mangaHref,
  mangaCoverUrl,
  credit,
  creditLoading,
  onBoost,
  onDonate,
  commentsNode,
  notifyNode,
}: ReaderV2EndSequenceProps) {
  const nameStyle = credit ? resolveFansubNameStylePresentation(credit.fansub.activeNameStyle) : null

  return (
    <div
      ref={containerRef}
      data-testid="reader-v2-end-sequence"
      data-blocks={blocks.join(',')}
      className="mx-auto flex w-full max-w-[840px] flex-col gap-4 px-4 py-10"
    >
      {blocks.map((block) => {
        if (block === 'notes') {
          return (
            <SectionCard key="notes" testId="reader-v2-end-notes" className="border-amber-400/20 bg-amber-400/[0.06]">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200/80">{txa('Bolum notu')}</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/85">{chapterNotes}</p>
            </SectionCard>
          )
        }

        if (block === 'next') {
          return (
            <SectionCard key="next" testId="reader-v2-end-next" className="border-primary/30 bg-primary/[0.08]">
              <div className="flex items-center gap-4">
                {mangaCoverUrl ? (
                  <img
                    src={mangaCoverUrl}
                    alt={mangaTitle}
                    className="hidden h-24 w-[68px] shrink-0 rounded-lg object-cover sm:block"
                    loading="lazy"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">{txa('Bolum bitti')}</p>
                  <p className="mt-1 truncate text-base font-black text-white">{mangaTitle}</p>
                  <p className="text-sm text-white/60">{txa('Sonraki: Bolum {v1}', { v1: nextChapterNumber ?? '' })}</p>
                </div>
                <Button
                  data-testid="reader-v2-end-next-button"
                  onClick={onGoNextChapter}
                  className="shrink-0 gap-1.5 rounded-full font-bold"
                >
                  {txa('Devam et')} <ArrowRight className="size-4" />
                </Button>
              </div>
            </SectionCard>
          )
        }

        if (block === 'finale') {
          return (
            <SectionCard key="finale" testId="reader-v2-end-finale">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/70">
                  <Sparkles className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{txa('Su an icin son bolum')}</p>
                  <p className="text-sm text-white/55">{txa('Yeni bolum gelince buradan devam edebilirsin.')}</p>
                </div>
                <Button asChild variant="secondary" className="shrink-0 gap-1.5 rounded-full">
                  <Link to={mangaHref}>
                    <BookOpen className="size-4" /> {txa('Seriye don')}
                  </Link>
                </Button>
              </div>
            </SectionCard>
          )
        }

        if (block === 'credit') {
          if (creditLoading && !credit) {
            return <div key="credit" className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
          }
          if (!credit) return null

          return (
            <section
              key="credit"
              data-testid="reader-v2-end-credit"
              // The closing strip is ONE card: credit and support used to be two separate stacked cards,
              // two boxes for the same team was needless.
              className="overflow-hidden rounded-2xl border border-amber-400/15 bg-[linear-gradient(180deg,rgba(251,191,36,0.05),rgba(255,255,255,0.02))]"
            >
              <div className="flex flex-col items-center gap-3 px-4 pt-5 text-center sm:px-6">
                <FansubGoldFrame active={credit.fansub.hasGoldFrame} className="shrink-0">
                  {credit.fansub.avatarUrl ? (
                    <img
                      src={credit.fansub.avatarUrl}
                      alt={credit.fansub.name}
                      className="size-14 rounded-full object-cover sm:size-16"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/15 text-lg font-black text-amber-100 sm:size-16">
                      {credit.fansub.name.trim().slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </FansubGoldFrame>

                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/50">
                    {txa('Bu bolumu ceviren ekip')}
                  </p>
                  <div className="mt-1 flex items-center justify-center gap-1.5">
                    <Link
                      to={credit.fansub.href}
                      className={cn('truncate text-lg font-black text-white hover:underline', nameStyle?.className)}
                      style={nameStyle?.inlineStyle}
                    >
                      {credit.fansub.name}
                    </Link>
                    {/* Rozet METIN degil IKON: "TOPLULUK DESTEKLI" yazisi
                        kalabaliklastiriyordu, simge daha hizli okunuyor.
                        Sayisal metrikler (destek seviyesi / destekci sayisi)
                        tamamen kaldirildi — okuma sonunda karar degistirmiyor,
                        destekci avatarlari zaten sosyal kaniti veriyor. */}
                    {credit.fansub.hasDiscoverBadge ? <FansubDiscoverBadge iconOnly /> : null}
                  </div>
                </div>

                <div className="min-w-0">
                  <h3 className="text-base font-black leading-6 text-white [overflow-wrap:anywhere]">
                    {credit.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-white/60 [overflow-wrap:anywhere]">{credit.body}</p>
                </div>
              </div>

              {credit.supporters.length > 0 ? (
                <div
                  data-testid="reader-v2-end-credit-supporters"
                  data-supporter-count={String(credit.supporters.length)}
                  className="mt-4 px-4 sm:px-6"
                >
                  <p className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    <Users className="size-3" /> {txa('Bu bolumu mumkun kilanlar')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                    {credit.supporters.map((supporter) => (
                      <Link
                        key={supporter.id}
                        to={supporter.href}
                        title={supporter.badgeLabel}
                        className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.04] py-1 pl-1 pr-2.5 transition-colors hover:border-amber-400/25 hover:bg-white/[0.08]"
                      >
                        {supporter.avatarUrl ? (
                          <img src={supporter.avatarUrl} alt="" className="size-6 rounded-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex size-6 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white/75">
                            {supporter.username.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="max-w-[110px] truncate text-xs font-semibold text-white/80">
                          {supporter.username}
                        </span>
                        <Crown className="size-3 shrink-0 text-amber-300/70" />
                      </Link>
                    ))}
                    {credit.hiddenSupporterCount > 0 ? (
                      <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/50">
                        +{credit.hiddenSupporterCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Destek eylemleri ayni kartin devami: ayri kart yerine ince bir
                  ayiracla kredinin altina yerlesir (kullanici istegi). */}
              {supportInsideCredit || credit.ctaHref ? (
                <div className="mt-4 border-t border-white/8 bg-black/25 px-4 py-3.5 sm:px-6">
                  {supportInsideCredit ? (
                    <p className="text-center text-[13px] text-white/55">{txa('Bu bolum bedava; emegi degil.')}</p>
                  ) : null}
                  <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
                    {supportInsideCredit && supportActions.includes('takviye') ? (
                      <Button
                        onClick={onBoost}
                        data-testid="reader-v2-end-support-boost"
                        className="h-9 gap-1.5 rounded-full px-4 font-bold"
                      >
                        <Sparkles className="size-4" />{' '}{txa('Takviye ver')}
                      </Button>
                    ) : null}
                    {supportInsideCredit && supportActions.includes('bagis') ? (
                      <Button
                        variant="outline"
                        onClick={onDonate}
                        data-testid="reader-v2-end-support-donate"
                        className="h-9 gap-1.5 rounded-full border-white/12 bg-white/[0.04] px-4 text-white/85 hover:bg-white/[0.09] hover:text-white"
                      >
                        <Coins className="size-4" />{' '}{txa('Bagis yap')}
                      </Button>
                    ) : null}
                    {credit.ctaHref ? (
                      <Button asChild variant="ghost" className="h-9 gap-1.5 rounded-full px-3 text-white/70 hover:text-white">
                        <Link to={credit.ctaHref}>
                          {credit.ctaLabel} <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          )
        }

        if (block === 'support') {
          return (
            <SectionCard key="support" testId="reader-v2-end-support">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <HeartHandshake className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{txa('Bu bolum bedava; emegi degil.')}</p>
                  <p className="text-sm text-white/55">
                    {txa('Ekibi destekle, cevirinin devami gelsin.')}
                  </p>
                </div>
              </div>
              {/* Sayfa degistirmeden: diyalog bolum icinde acilir. */}
              <div className="mt-3 flex flex-wrap gap-2">
                {supportActions.includes('takviye') ? (
                  <Button
                    onClick={onBoost}
                    className="gap-1.5 rounded-full font-bold"
                    data-testid="reader-v2-end-support-boost"
                  >
                    <Sparkles className="size-4" />{' '}{txa('Takviye ver')}
                  </Button>
                ) : null}
                {supportActions.includes('bagis') ? (
                  <Button
                    variant="outline"
                    onClick={onDonate}
                    className="gap-1.5 rounded-full border-white/12 bg-white/[0.03] text-white/85 hover:bg-white/[0.07] hover:text-white"
                    data-testid="reader-v2-end-support-donate"
                  >
                    <Coins className="size-4" />{' '}{txa('Bagis yap')}
                  </Button>
                ) : null}
              </div>
            </SectionCard>
          )
        }

        if (block === 'notify') {
          return notifyNode ? <div key="notify">{notifyNode}</div> : null
        }

        if (block === 'comments') {
          return commentsNode ? <div key="comments">{commentsNode}</div> : null
        }

        return null
      })}
    </div>
  )
}

export default ReaderV2EndSequence
