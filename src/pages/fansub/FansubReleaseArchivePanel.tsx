import { Link } from '@/i18n/router'
import { ArrowUpRight, Calendar, Layers, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildPublicChapterPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { useState } from 'react'
import ProfileShelfDialog from '../profile/ProfileShelfDialog'
import type { FansubChapterPreview } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

const PREVIEW_LIMIT = 4

function formatChapterDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return txa('Tarih yok')
  return parsed.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

function ChapterRow({
  chapter,
  fansubId,
  fansubSlug,
  compact = false,
  hideCover = false,
}: {
  chapter: FansubChapterPreview
  fansubId?: string
  fansubSlug?: string
  compact?: boolean
  hideCover?: boolean
}) {
  const destination = buildPublicChapterPath({
    mangaId: chapter.mangaId,
    mangaSlug: chapter.mangaSlug,
    mangaTitle: chapter.mangaTitle,
    chapterNumber: chapter.chapterNumber,
    fansubId,
    fansubSlug,
    forceVersionQuery: Boolean(fansubId || fansubSlug),
  })
  const coverImage = optimizePublicImageUrl(chapter.coverImage) || chapter.coverImage

  return (
    <Link
      to={destination}
      className="group block rounded-[26px] border border-border/70 bg-[linear-gradient(140deg,hsl(var(--background))_0%,hsl(var(--card)/0.86)_100%)] px-4 py-3 transition-colors hover:border-primary/30 hover:bg-card"
    >
      <div className="flex items-start gap-3">
        {!hideCover ? (
          <img loading="lazy" decoding="async"
            src={coverImage}
            alt=""
            aria-hidden
            className={cn('shrink-0 rounded-[18px] border border-border/70 object-cover', compact ? 'h-14 w-10' : 'h-16 w-11')}
          />
        ) : (
          <div
            aria-hidden
            className={cn(
              'flex shrink-0 items-center justify-center rounded-[18px] border border-border/70 bg-background/70 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
              compact ? 'h-14 w-10' : 'h-16 w-11',
            )}
          >
            {String(chapter.chapterNumber).padStart(2, '0')}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cn('m-0 truncate font-semibold text-foreground group-hover:text-primary', compact ? 'text-sm' : 'text-base')}>
                {chapter.mangaTitle}
              </p>
              <p className={cn('mt-1 m-0 text-muted-foreground', compact ? 'text-xs leading-6' : 'text-sm leading-6')}>
                {`${txa('Bolum {v1}', { v1: chapter.chapterNumber })}${chapter.title ? ` - ${chapter.title}` : ''}`}
              </p>
            </div>

            {chapter.isPending ? (
              <span className="shrink-0 rounded-full border border-amber-500/35 bg-amber-500/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100">
                {txa('Bekliyor')}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" />
              {formatChapterDate(chapter.publishAt || chapter.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" />
              {txa('Yayın arşivi')}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

type FansubReleaseArchivePanelProps = {
  fansubId?: string
  fansubSlug?: string
  chapters: FansubChapterPreview[]
}

export default function FansubReleaseArchivePanel({
  fansubId,
  fansubSlug,
  chapters,
}: FansubReleaseArchivePanelProps) {
  const [open, setOpen] = useState(false)
  const previewChapters = chapters.slice(0, PREVIEW_LIMIT)

  return (
    <>
      <section className="relative isolate overflow-hidden rounded-[34px] border border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_32%),linear-gradient(160deg,hsl(var(--background))_0%,hsl(var(--card))_56%,hsl(var(--muted)/0.72)_100%)] px-5 py-5 shadow-[0_24px_72px_-48px_hsl(var(--foreground)/0.55)] sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-secondary/12 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,transparent_0%,transparent_36%,hsl(var(--foreground)/0.03)_36%,transparent_72%,hsl(var(--foreground)/0.025)_72%,transparent_100%)]" aria-hidden />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
                <Sparkles className="size-3.5 text-primary" />
                {txa('Yayın arşivi')}
              </div>
              <h3 className="mt-4 text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
                {txa('Son bölümler')}
              </h3>
              <p className="mt-2 max-w-[28ch] text-sm leading-7 text-muted-foreground">
                {txa('En yeni dört yayın burada görünür. Tüm akışı pencerede açabilirsin.')}
              </p>
            </div>

            {chapters.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="shrink-0 rounded-full border border-white/10 bg-white/6 px-3 text-xs font-medium text-foreground hover:bg-white/10"
                onClick={() => setOpen(true)}
              >
                {txa('Tümünü gör')}
                <ArrowUpRight className="size-3.5" />
              </Button>
            ) : null}
          </div>

          <div className="mt-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <span>{txa('{v1} kayıt', { v1: chapters.length.toLocaleString(intlLocale()) })}</span>
            <span aria-hidden>•</span>
            <span>{txa('En yeni tarihe gore siralandi')}</span>
          </div>

          <div className="mt-5 grid gap-3">
            {previewChapters.length > 0 ? (
              previewChapters.map((chapter) => (
                <ChapterRow key={chapter.chapterId} chapter={chapter} fansubId={fansubId} fansubSlug={fansubSlug} compact hideCover />
              ))
            ) : (
              <div className="rounded-[26px] border border-dashed border-border/70 bg-white/5 px-4 py-5 text-sm leading-7 text-muted-foreground">
                {txa('Henüz görünen yayın birikmedi.')}
              </div>
            )}
          </div>
        </div>
      </section>

      {open ? (
        <ProfileShelfDialog
          description={txa('Fansubun yayın arşivi yeni tarihten eskiye burada açılır.')}
          onOpenChange={setOpen}
          open={open}
          title={txa('Yayın arşivi')}
        >
          {chapters.length > 0 ? (
            <div className="grid gap-3">
              {chapters.map((chapter) => (
                <ChapterRow key={chapter.chapterId} chapter={chapter} fansubId={fansubId} fansubSlug={fansubSlug} />
              ))}
            </div>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">{txa('Gösterilecek yayın kaydı yok.')}</p>
          )}
        </ProfileShelfDialog>
      ) : null}
    </>
  )
}
