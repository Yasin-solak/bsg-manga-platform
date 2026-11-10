import { Link } from '@/i18n/router'
import { Crown, Lock, Play } from 'lucide-react'
import type { Manga } from '@/types'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import type { HomeContinueReadingProgress } from '../HomeContinueReading'
import type { LatestChapterItem } from '@/services/latestChapterFeedService'
import { formatEarlyAccessLabel, getEarlyAccessState } from '@/lib/earlyAccess'
import { formatRelativeTime } from '../homeUtils'
import { MobileRail, MobileSectionHeader } from './HomeMobilePrimitives'
import { useTx } from '@/i18n/LocaleProvider'
import { txa } from '@/i18n/activeLocale'

/**
 * Mobile home rails: card measures exactly from the design handoff.
 *
 * Continue    : 232px wide, 130px HORIZONTAL cover, chapter chip, progress line
 * New Chapter : row; 56x75 cover, title, meta, fansub chip, CTA on the right
 * For You     : 128px wide, 171px vertical cover, 'New' badge, reason line
 *
 * In the handoff the Continue cover is HORIZONTAL (130px), For You is VERTICAL (171px).
 * Making them the same was easy but wrong: horizontal reads as "unfinished work",
 * vertical as "a new series to discover".
 */

function mangaPath(manga: Manga) {
  return buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
}

/* ------------------------------------------------------------------ Devam Et */

interface ContinueRailProps {
  mangas: Manga[]
  progressByMangaId: Record<string, HomeContinueReadingProgress>
}

export function MobileContinueRail({ mangas, progressByMangaId }: ContinueRailProps) {
  const tx = useTx()
  if (mangas.length === 0) return null

  return (
    <section data-testid="home-mobile-continue">
      <MobileSectionHeader title={tx('Devam Et')} to="/listeler" />
      <MobileRail>
        {mangas.map((manga) => {
          const progress = progressByMangaId[manga.id]
          const percent = Math.max(0, Math.min(100, progress?.progressPercent ?? 0))
          return (
            <Link key={manga.id} to={mangaPath(manga)} className="w-[232px] shrink-0">
              <div className="relative h-[130px] overflow-hidden rounded-[14px] border border-border">
                <img
                  src={manga.coverImage}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover object-[center_30%]"
                />
                {/* Alt karartma: cip ve ilerleme cizgisi acik kapaklarda da okunmali. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent to-55%" />
                {progress?.chapterLabel ? (
                  <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-extrabold text-white backdrop-blur-sm">
                    <Play className="size-3 fill-current" aria-hidden="true" />
                    {progress.chapterLabel}
                  </span>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                  <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
              </div>
              <p className="m-0 mt-2 truncate text-[13px] font-bold text-foreground">
                {manga.title}
              </p>
              <p className="m-0 mt-0.5 text-[11px] font-semibold text-muted-foreground">
                %{percent}
                {manga.lastChapter ? ` · ${manga.lastChapter}` : ''}
              </p>
            </Link>
          )
        })}
      </MobileRail>
    </section>
  )
}

/* ------------------------------------------------------------- Yeni Bolumler */

interface UpdatesListProps {
  items: LatestChapterItem[]
  /** Premium uyeligi; kilit yalnizca uye OLMAYANA gosterilir. */
  isPremium: boolean
}

export function MobileUpdatesList({ items, isPremium }: UpdatesListProps) {
  const tx = useTx()
  if (items.length === 0) return null

  return (
    <section data-testid="home-mobile-updates">
      <MobileSectionHeader title={tx('Yeni Bölümler')} to="/kesfet" />
      <div className="mx-4 overflow-hidden rounded-[14px] border border-border bg-card">
        {items.map((item, index) => {
          const to = buildPublicMangaPath({
            id: item.mangaId,
            slug: item.mangaSlug,
            title: item.mangaTitle,
          })
          const early = getEarlyAccessState({ publishAt: item.publishAt, isPremium })

          return (
            <div
              key={item.chapterId}
              className={cn('flex items-center gap-3 p-3', index > 0 && 'border-t border-border')}
              data-testid="home-mobile-update-row"
            >
              <Link to={to} className="shrink-0">
                <img
                  src={item.mangaCoverImage}
                  alt=""
                  loading="lazy"
                  className="h-[75px] w-14 rounded-[10px] object-cover"
                />
              </Link>

              <Link to={to} className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-bold leading-tight text-foreground">
                  {item.mangaTitle}
                </p>
                <p className="m-0 mt-1 text-xs font-semibold text-muted-foreground">
                  {tx('Bölüm {number}', { number: item.chapterNumber })}
                  {item.publishAt ? ` · ${formatRelativeTime(item.publishAt)}` : ''}
                </p>

                {/*
                  Kilitliyse KALAN SURE, degilse ceviriyi yapan fansub.
                  Ikisini yan yana basmak satiri uc satira cikariyordu; kilitli
                  bolumde okunmasi gereken bilgi zaten "ne zaman acilacak".
                */}
                {early.notYetPublished ? (
                  // Henuz yayinlanmadi: kimse okuyamaz, dolayisiyla Premium
                  // renginde vurgulanmaz. Notr rozet, tarihle.
                  <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                    <Lock className="size-3" aria-hidden="true" />
                    {formatEarlyAccessLabel(early)}
                  </span>
                ) : early.locked ? (
                  <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10.5px] font-bold text-primary">
                    <Lock className="size-3" aria-hidden="true" />
                    {formatEarlyAccessLabel(early)}
                  </span>
                ) : item.fansubName ? (
                  <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                    {item.fansubAvatarUrl ? (
                      <img
                        src={item.fansubAvatarUrl}
                        alt=""
                        loading="lazy"
                        className="size-3.5 rounded-full object-cover"
                      />
                    ) : null}
                    {item.fansubName}
                  </span>
                ) : null}
              </Link>

              <Link
                to={to}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[13px] px-4 text-[13px] font-extrabold',
                  // Premium prompt ONLY on a chapter that is published but in early access:
                  // that is what buying opens. Showing Premium on an unpublished
                  // chapter would sell a door membership cannot
                  // open.
                  early.locked && !early.notYetPublished
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-foreground',
                )}
              >
                {early.locked && !early.notYetPublished ? (
                  <Crown className="size-4" aria-hidden="true" />
                ) : null}
                {early.locked && !early.notYetPublished ? txa('Premium') : tx('Oku')}
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- Sana Ozel */

interface ForYouRailProps {
  mangas: Manga[]
}

export function MobileForYouRail({ mangas }: ForYouRailProps) {
  const tx = useTx()
  if (mangas.length === 0) return null

  return (
    <section data-testid="home-mobile-foryou">
      <MobileSectionHeader title={tx('Sana Özel')} to="/kesfet" />
      <MobileRail>
        {mangas.map((manga) => (
          <Link key={manga.id} to={mangaPath(manga)} className="w-32 shrink-0">
            <div className="relative h-[171px] overflow-hidden rounded-[14px] border border-border">
              <img
                src={manga.coverImage}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
              {manga.isNew ? (
                <span className="absolute left-2 top-2 rounded-[7px] bg-black/60 px-1.5 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-sm">
                  {tx('Yeni')}
                </span>
              ) : null}
            </div>
            <p className="m-0 mt-2 line-clamp-2 text-[12.5px] font-bold leading-[1.35] text-foreground">
              {manga.title}
            </p>
            {/* Handoff'ta "Fantastik sevenlere" gibi ONERI GEREKCESI var.
                Oneri motoru gerekce dondurmuyor; ilk turden uretilen bu satir
                dogru ama kaba bir yaklasim. Gerekce alani gelince degisecek. */}
            {manga.genres?.[0] ? (
              <p className="m-0 mt-0.5 text-[11px] font-bold text-primary">
                {tx('{genre} sevenlere', { genre: tx(manga.genres[0]) })}
              </p>
            ) : null}
          </Link>
        ))}
      </MobileRail>
    </section>
  )
}
