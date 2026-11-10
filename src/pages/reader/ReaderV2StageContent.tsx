import type { ReactNode } from 'react'
import type { ReaderV2Layout } from '@/pages/reader/readerV2LayoutEngine'
import { resolveReaderV2PagePriority } from '@/pages/reader/readerV2PreloadEngine'
import { ReaderTranslatedPage } from '@/pages/reader/ReaderTranslatedPage'
import type { ReaderOverlayItem } from '@/services/translationReaderService'
import { txa } from '@/i18n/activeLocale'

export type ReaderPageEntry =
  | { kind: 'chapter'; src: string }
  | { kind: 'studio'; index: number; width: number; height: number; language: string; items: ReaderOverlayItem[] }

interface ReaderV2StageContentProps {
  pages: ReaderPageEntry[]
  layout: ReaderV2Layout
  zoomLevel: number
  progressPageIndex: number
  aspectRatios: Array<number | undefined>
  chapterId: string | null
  reportPageAspect: (index: number, width: number, height: number) => void
  reportAspect: (index: number, width: number, height: number) => void
  endSequenceNode: ReactNode
}

function chunkPages<T>(pages: T[], perView: number): T[][] {
  if (perView <= 1) return pages.map((page) => [page])
  const groups: T[][] = []
  for (let index = 0; index < pages.length; index += perView) groups.push(pages.slice(index, index + perView))
  return groups
}

export function ReaderV2StageContent({
  pages, layout, zoomLevel, progressPageIndex, aspectRatios,
  chapterId, reportPageAspect, reportAspect, endSequenceNode,
}: ReaderV2StageContentProps) {
  if (pages.length === 0) {
    return <p className="px-6 py-16 text-center text-sm text-white/60">{txa('Bu bölümde henüz sayfa yok.')}</p>
  }

  if (layout.axis === 'x') {
    return (
      <>
        {chunkPages(pages, layout.perView).map((group, groupIndex) => (
          <section key={`view-${groupIndex}`}
            className="flex h-full w-full shrink-0 snap-center items-center justify-center gap-1 px-2">
            {group.map((page, pageIndex) => {
              const absoluteIndex = groupIndex * layout.perView + pageIndex
              const priority = resolveReaderV2PagePriority(absoluteIndex, progressPageIndex)
              const onLoad = (width: number, height: number) => {
                reportPageAspect(absoluteIndex, width, height)
                reportAspect(absoluteIndex, width, height)
              }
              return page.kind === 'studio' && chapterId ? (
                <ReaderTranslatedPage
                  key={`${chapterId}-${page.index}`}
                  chapterId={chapterId}
                  index={page.index}
                  width={page.width}
                  height={page.height}
                  items={page.items}
                  language={page.language}
                  mode="page"
                  onLoad={onLoad}
                />
              ) : page.kind === 'chapter' ? (
                <img key={`${groupIndex}-${pageIndex}-${page.src}`}
                  src={page.src} alt={txa('Sayfa {v1}', { v1: absoluteIndex + 1 })}
                  className="max-h-full w-auto max-w-full select-none object-contain"
                  loading={priority.loading} {...{ fetchpriority: priority.fetchPriority }} decoding="async"
                  onLoad={(event) => onLoad(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />
              ) : null
            })}
          </section>
        ))}
        {/* Bölüm sonu sayfa modunda da aynı kaydırma kabındaki son snap görünümüdür. */}
        <section className="h-full w-full shrink-0 snap-center overflow-y-auto">{endSequenceNode}</section>
      </>
    )
  }

  return (
    <>
      <div className="mx-auto flex w-full flex-col items-center"
        style={{
          gap: `${layout.gapPx}px`,
          maxWidth: layout.contentMaxWidthPx > 0
            ? `${Math.round(layout.contentMaxWidthPx * (zoomLevel / 100))}px`
            : undefined,
        }}>
        {pages.map((page, index) => {
          const priority = resolveReaderV2PagePriority(index, progressPageIndex)
          const onLoad = (width: number, height: number) => {
            reportPageAspect(index, width, height)
            reportAspect(index, width, height)
          }
          return page.kind === 'studio' && chapterId ? (
            <ReaderTranslatedPage
              key={`${chapterId}-${page.index}`}
              chapterId={chapterId}
              index={page.index}
              width={page.width}
              height={page.height}
              items={page.items}
              language={page.language}
              mode="strip"
              onLoad={onLoad}
            />
          ) : page.kind === 'chapter' ? (
            <img key={`${index}-${page.src}`} src={page.src} alt={txa('Sayfa {v1}', { v1: index + 1 })}
              className="block w-full select-none bg-neutral-900"
              // Reserving space before an image loads keeps scrolling and auto reading steady.
              style={{ aspectRatio: aspectRatios[index] }}
              loading={priority.loading} {...{ fetchpriority: priority.fetchPriority }} decoding="async"
              onLoad={(event) => onLoad(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />
          ) : null
        })}
      </div>
      {endSequenceNode}
    </>
  )
}
