import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowsDownUp, CaretLeft, CaretRight, CheckCircle, CircleDashed, DotsSixVertical, PaperPlaneTilt, Rows, SquareHalf, WarningCircle,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { studioAccessToken } from '@/services/studioAuth'
import { createChapter } from '@/services/mangaService/creation'
import { uploadChapterPages } from '@/services/storageService'
import { mergeChapterPageDimensionMap, toStorableChapterPageDimensions } from '@/lib/chapterPageDimensions'
import { submitChapterRevision } from '@/services/translationSeriesService'
import { loadCleanup, loadPageItems, loadPageStatuses, type TlPageStatus } from '@/services/translationEditorService'
import { isChapterApproved, linkPublishedChapter, rawPageUrl, reorderPages, uploadCleanPage, type TlPage, type TlProject } from '@/services/translationStudioService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { canvasToFile, renderPagePair } from './finalRender'
import { txa } from '@/i18n/activeLocale'

/*
 * Publish: each page renders to a final image with clean base + Turkish text; the reader
 * preview shows this REAL output (what you see is what publishes). Publishing uses the existing
 * createChapter flow: images upload to the chapter store, a chapters
 * row opens and the project links to that chapter. No reader-side change is needed.
 *
 * Revision project (project.revisionOf): new images still upload to the chapter store
 * but the live chapter DOES NOT CHANGE; the page list goes to approval as a revision with
 * tl_submit_chapter_revision. Until approved the reader sees the old version (no scheduling).
 */

interface Rendered { url: string, file: File, clean: File }

export function StepPublish({ project, pages, canPublish, onEditPage, onPublished, onToast }: {
  project: TlProject
  /** Chapter insert RLS is open only to a fansub admin (or site moderation). */
  canPublish: boolean
  pages: TlPage[]
  onEditPage: (index: number) => void
  onPublished: () => void
  onToast: (message: string) => void
}) {
  const readyPages = useMemo(() => pages.filter((page) => page.rawStatus === 'ready' && page.width && page.height), [pages])
  const [order, setOrder] = useState<string[]>(() => readyPages.map((page) => page.id))
  const [statuses, setStatuses] = useState<Record<string, TlPageStatus>>({})
  const [rendered, setRendered] = useState<Record<string, Rendered>>({})
  const [renderError, setRenderError] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<'scroll' | 'single'>('scroll')
  const [current, setCurrent] = useState(0)
  const [when, setWhen] = useState<'hemen' | 'zamanla'>('hemen')
  const [publishAt, setPublishAt] = useState(() => {
    const date = new Date(Date.now() + 24 * 3600 * 1000)
    date.setMinutes(0, 0, 0)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const [publishing, setPublishing] = useState(false)
  const dragId = useRef<string | null>(null)
  const renderedRef = useRef(rendered)
  renderedRef.current = rendered

  useEffect(() => { setOrder(readyPages.map((page) => page.id)) }, [readyPages])
  useEffect(() => () => { for (const entry of Object.values(renderedRef.current)) URL.revokeObjectURL(entry.url) }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadPageStatuses(readyPages.map((page) => page.id), 'tr', controller.signal).then(setStatuses).catch(() => {})
    return () => controller.abort()
  }, [readyPages])

  // Produce final images in turn (one by one so memory does not pile up on large pages).
  useEffect(() => {
    const controller = new AbortController()
    setRenderError(null)
    void (async () => {
      const token = await studioAccessToken().catch(() => null)
      for (const page of readyPages) {
        if (controller.signal.aborted) return
        if (renderedRef.current[page.id]) continue
        try {
          const response = await fetch(rawPageUrl(page.id), { headers: { Authorization: `Bearer ${token ?? ''}` }, signal: controller.signal })
          if (!response.ok) throw new Error(txa('Sayfa görseli okunamadı.'))
          const bitmap = await createImageBitmap(await response.blob())
          const [items, cleanup] = await Promise.all([
            loadPageItems(page.id, 'tr', controller.signal),
            loadCleanup(page.id, controller.signal),
          ])
          const { clean, final } = await renderPagePair({
            source: bitmap, width: page.width as number, height: page.height as number,
            items, strokes: cleanup.strokes, signal: controller.signal,
          })
          bitmap.close()
          const index = readyPages.indexOf(page)
          const file = await canvasToFile(final, `sayfa-${String(index + 1).padStart(3, '0')}.webp`)
          // The clean base must be lossless: text positions stay identical pixel by pixel.
          const cleanFile = await canvasToFile(clean, `temiz-${String(index + 1).padStart(3, '0')}.webp`, 1)
          final.width = 0
          clean.width = 0
          if (controller.signal.aborted) return
          setRendered((currentMap) => ({ ...currentMap, [page.id]: { url: URL.createObjectURL(file), file, clean: cleanFile } }))
        } catch (error) {
          if (controller.signal.aborted) return
          setRenderError(toUserFacingErrorMessage(error, txa('Önizleme hazırlanamadı.')))
          return
        }
      }
    })()
    return () => controller.abort()
  }, [readyPages])

  const orderedPages = order.map((id) => readyPages.find((page) => page.id === id)).filter((page): page is TlPage => Boolean(page))
  const renderedCount = orderedPages.filter((page) => rendered[page.id]).length
  const allRendered = renderedCount === orderedPages.length && orderedPages.length > 0
  const pendingPages = readyPages.filter((page) => { const status = statuses[page.id]; return status && status.total > status.approved })
  const pendingItems = pendingPages.reduce((sum, page) => sum + (statuses[page.id].total - statuses[page.id].approved), 0)
  const missingItems = readyPages.reduce((sum, page) => sum + (statuses[page.id]?.missing ?? 0), 0)
  const untouched = readyPages.filter((page) => { const status = statuses[page.id]; return status && status.total > 0 && status.approved === 0 }).length
  const approvedPages = readyPages.filter((page) => { const status = statuses[page.id]; return status && status.total === status.approved }).length
  const orderChanged = order.some((id, index) => readyPages[index]?.id !== id)

  const publish = useCallback(async () => {
    if (!project.mangaId) { onToast(txa('Yeni seri admin onayından sonra yayınlanabilir.')); return }
    if (!canPublish) { onToast(txa('Bölümü yayınlamak için yayınlama izni gerekir (Roller ve İzinler).')); return }
    if (!allRendered || publishing) return
    const isRevision = Boolean(project.revisionOf)
    const iso = when === 'zamanla' && !isRevision ? new Date(publishAt).toISOString() : null
    if (iso && new Date(iso).getTime() < Date.now() + 60_000) { onToast(txa('Yayın zamanı ileri bir tarih olmalı.')); return }
    setPublishing(true)
    try {
      if (orderChanged) {
        // The reader clean base mapping must match publish order; pages not ready go last.
        const rest = pages.filter((page) => !order.includes(page.id)).map((page) => page.id)
        await reorderPages(project.id, [...order, ...rest])
      }
      // Clean bases first: so reader languages are ready at publish; if one cannot upload the chapter does not open.
      for (const page of orderedPages) await uploadCleanPage(page.id, rendered[page.id].clean)
      const files = orderedPages.map((page, index) => new File([rendered[page.id].file], `sayfa-${String(index + 1).padStart(3, '0')}.webp`, { type: 'image/webp' }))
      if (isRevision) {
        const uploaded = await uploadChapterPages(files, project.mangaId, project.chapterNumber, project.fansubId)
        if (uploaded.length !== files.length) throw new Error(txa('Bazı sayfalar yüklenemedi.'))
        await submitChapterRevision(
          project.id,
          uploaded.map((page) => page.ref),
          toStorableChapterPageDimensions(mergeChapterPageDimensionMap({}, uploaded)) ?? null,
        )
        onToast(txa('Revizyon onaya gönderildi; onaylanana kadar mevcut sürüm yayında kalır.'))
        onPublished()
        return
      }
      const chapter = await createChapter(project.fansubId, {
        mangaId: project.mangaId,
        chapterNumber: project.chapterNumber,
        chapterTitle: project.chapterTitle ?? undefined,
        pageFiles: files,
        publishAt: iso ?? undefined,
      })
      await linkPublishedChapter(project.id, chapter.id, iso)
      const approved = await isChapterApproved(chapter.id)
      onToast(approved === false
        ? txa('Bölüm gönderildi; moderasyon onayından sonra okuyucuda görünür.')
        : iso ? txa('Yayın zamanlandı') : txa('Bölüm yayınlandı'))
      onPublished()
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Bölüm yayınlanamadı.')))
    } finally {
      setPublishing(false)
    }
  }, [allRendered, canPublish, onPublished, onToast, order, orderChanged, orderedPages, pages, project, publishAt, publishing, rendered, when])

  const firstPendingIndex = pendingPages.length ? readyPages.indexOf(pendingPages[0]) : 0
  const checks = [
    { icon: CheckCircle, color: 'var(--tl-green)', title: txa('{v1} sayfa yüklendi', { v1: readyPages.length }), text: txa('Tarama tamam'), onClick: () => onEditPage(0) },
    pendingItems
      ? { icon: WarningCircle, color: 'var(--tl-amber)', title: txa('{v1} sayfada {v2} öğe onay bekliyor', { v1: pendingPages.length, v2: pendingItems }), text: missingItems ? txa('{v1} öğenin çevirisi eksik; boş yayınlanır', { v1: missingItems }) : txa('Öneriler onaylanmadı'), onClick: () => onEditPage(firstPendingIndex) }
      : { icon: CheckCircle, color: 'var(--tl-green)', title: txa('Tüm öğeler onaylı'), text: txa('Yayına hazır'), onClick: () => onEditPage(0) },
    ...(untouched ? [{ icon: CircleDashed, color: 'var(--tl-dim)', title: txa('{v1} sayfa incelenmedi', { v1: untouched }), text: txa('Otomatik öneriyle yayınlanır'), onClick: () => onEditPage(readyPages.findIndex((page) => statuses[page.id]?.approved === 0)) }] : []),
  ]

  const currentPage = orderedPages[Math.min(current, orderedPages.length - 1)]
  const cta = !project.mangaId ? txa('Seri onayı bekleniyor') : !canPublish ? txa('Yayınlama izni gerekir') : publishing ? txa('Yayınlanıyor…') : !allRendered ? txa('Hazırlanıyor {v1} / {v2}', { v1: renderedCount, v2: orderedPages.length }) : project.revisionOf ? txa('Revizyonu onaya gönder') : when === 'zamanla' ? txa('Yayını zamanla') : txa('Bölümü yayınla')

  return (
    <div className='tl-screen grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 xl:grid-cols-[380px_minmax(0,1fr)_420px] xl:overflow-hidden'>
      <div className='flex min-h-0 flex-col gap-4'>
        <span className='text-lg font-bold tracking-[0.02em]'>{txa('YAYIN')}</span>
        <div className='flex items-center gap-3.5 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-3'>
          {project.coverUrl ? <img src={project.coverUrl} alt='' className='h-[66px] w-11 rounded-[7px] object-cover' /> : <span className='tl-hatch h-[66px] w-11 rounded-[7px]' />}
          <span className='flex flex-1 flex-col gap-1'>
            <span className='text-sm font-bold'>{txa('{v1} · Bölüm {v2}', { v1: project.seriesTitle, v2: project.chapterNumber })}</span>
            <span className='text-xs font-semibold text-[var(--tl-mut)]'>{txa('{v1} sayfa', { v1: readyPages.length })}{project.chapterTitle ? ` · ${project.chapterTitle}` : ''}</span>
          </span>
        </div>
        <div className='flex flex-col gap-0.5 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-1.5'>
          {checks.map((check) => (
            <button key={check.title} type='button' onClick={check.onClick} className='flex items-center gap-3 rounded-[9px] border-0 bg-transparent p-2.5 text-left text-[var(--tl-fg)] hover:bg-[var(--tl-acc)]'>
              <check.icon weight={check.icon === CircleDashed ? 'bold' : 'fill'} size={18} style={{ color: check.color }} />
              <span className='flex flex-1 flex-col gap-0.5'>
                <span className='text-[13.5px] font-bold'>{check.title}</span>
                <span className='text-xs font-semibold text-[var(--tl-mut)]'>{check.text}</span>
              </span>
            </button>
          ))}
        </div>
        {project.revisionOf && (
          <span className='rounded-xl border border-[var(--tl-p35)] bg-[var(--tl-p15)] p-3 text-[12.5px] font-semibold leading-relaxed text-[var(--tl-fg2)]' data-testid='tl-publish-revision-note'>
            {txa('Bu bir revizyon: yayındaki bölüm onaylanana kadar okuyucuda aynen kalır. Onaydan sonra yeni sürüm yayına geçer, eski sürüm arşivlenir.')}
          </span>
        )}
        <div className={cn('flex flex-col gap-2', project.revisionOf && 'hidden')}>
          <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Yayın zamanı')}</span>
          <div className='flex gap-1.5'>
            {([['hemen', txa('Hemen')], ['zamanla', txa('Zamanla')]] as const).map(([key, label]) => (
              <button
                key={key}
                type='button'
                onClick={() => setWhen(key)}
                className={cn('h-10 flex-1 rounded-[10px] border text-[13px] font-bold', when === key ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] bg-transparent text-[var(--tl-mut)]')}
              >
                {label}
              </button>
            ))}
          </div>
          {when === 'zamanla' && (
            <input
              type='datetime-local'
              value={publishAt}
              onChange={(event) => setPublishAt(event.target.value)}
              className='h-10 rounded-[10px] border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 text-[13.5px] font-semibold text-[var(--tl-fg)] outline-none [color-scheme:dark]'
            />
          )}
        </div>
        {renderError && <span className='text-[12.5px] font-semibold text-[var(--tl-red)]'>{renderError}</span>}
        <div className='flex-1' />
        <button
          type='button'
          onClick={() => { void publish() }}
          disabled={!project.mangaId || !canPublish || !allRendered || publishing}
          className='flex h-12 items-center justify-center gap-2 rounded-[11px] border-0 bg-[var(--tl-p)] text-[14.5px] font-extrabold text-[var(--tl-pfg)] disabled:opacity-50'
          data-testid='tl-publish'
        >
          <PaperPlaneTilt weight='bold' size={16} />
          {cta}
        </button>
      </div>

      <div className='flex min-h-[480px] flex-col gap-3 xl:min-h-0'>
        <div className='flex items-center gap-3'>
          <span className='text-lg font-bold tracking-[0.02em]'>{txa('OKUYUCU ÖNİZLEME')}</span>
          <div className='flex-1' />
          <div className='flex gap-[3px] rounded-[10px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-[3px]'>
            {([['scroll', txa('Dikey kaydırma'), Rows], ['single', txa('Sayfa sayfa'), SquareHalf]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type='button'
                onClick={() => setPreviewMode(key)}
                className={cn('flex h-7 items-center gap-1.5 rounded-[7px] border-0 px-[11px] text-xs font-bold', previewMode === key ? 'bg-[var(--tl-acc2)] text-[var(--tl-fg)]' : 'bg-transparent text-[var(--tl-mut)]')}
              >
                <Icon weight='bold' size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
        {previewMode === 'scroll' ? (
          <div
            className='flex min-h-0 flex-1 flex-col items-center overflow-y-auto rounded-xl bg-black/30 pb-6 pt-1'
            onScroll={(event) => {
              const target = event.currentTarget
              const children = Array.from(target.children) as HTMLElement[]
              const index = children.findIndex((child) => child.offsetTop + child.offsetHeight > target.scrollTop + 40)
              if (index >= 0) setCurrent(index)
            }}
          >
            {orderedPages.map((page) => (
              <PreviewImage key={page.id} rendered={rendered[page.id]} ratio={(page.height as number) / (page.width as number)} />
            ))}
          </div>
        ) : (
          <div className='flex min-h-0 flex-1 items-center justify-center gap-5 rounded-xl bg-black/30 p-4'>
            <button type='button' onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0} className='flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tl-line)] bg-[var(--tl-card)] text-[var(--tl-fg2)] disabled:opacity-40'>
              <CaretLeft weight='bold' size={16} />
            </button>
            <div className='flex h-full min-w-0 flex-1 items-center justify-center'>
              {currentPage && rendered[currentPage.id]
                ? <img src={rendered[currentPage.id].url} alt='' className='max-h-full max-w-full object-contain' />
                : <span className='text-[13px] font-semibold text-[var(--tl-mut)]'>{txa('Hazırlanıyor…')}</span>}
            </div>
            <button type='button' onClick={() => setCurrent(Math.min(orderedPages.length - 1, current + 1))} disabled={current >= orderedPages.length - 1} className='flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tl-line)] bg-[var(--tl-card)] text-[var(--tl-fg2)] disabled:opacity-40'>
              <CaretRight weight='bold' size={16} />
            </button>
          </div>
        )}
        <div className='flex items-center justify-center text-[12.5px] font-bold text-[var(--tl-fg2)]'>{txa('Sayfa {v1} / {v2}', { v1: Math.min(current + 1, orderedPages.length), v2: orderedPages.length })}</div>
      </div>

      <div className='flex min-h-0 flex-col gap-3'>
        <div className='flex items-center justify-between'>
          <span className='text-lg font-bold tracking-[0.02em]'>{txa('SAYFALAR')}</span>
          <span className='text-xs font-semibold text-[var(--tl-mut)]'>{txa('{v1} / {v2} onaylı', { v1: approvedPages, v2: readyPages.length })}</span>
        </div>
        <div className='flex items-center gap-2.5 text-xs font-semibold text-[var(--tl-mut)]'>
          <DotsSixVertical weight='bold' size={14} />
          <span className='flex-1'>{txa('Sıralamak için sürükle')}</span>
          {orderChanged && (
            <button type='button' onClick={() => setOrder(readyPages.map((page) => page.id))} className='flex h-[26px] items-center gap-1 rounded-[7px] border border-[var(--tl-line)] bg-transparent px-[9px] text-[11.5px] font-bold text-[var(--tl-fg2)]'>
              <ArrowsDownUp weight='bold' size={11} />
              {txa('Sırayı sıfırla')}
            </button>
          )}
        </div>
        <div className='grid min-h-0 flex-1 grid-cols-4 content-start gap-3 overflow-y-auto'>
          {orderedPages.map((page, index) => {
            const status = statuses[page.id]
            const done = status && status.total === status.approved
            const untouchedPage = status && status.total > 0 && status.approved === 0
            const moved = readyPages[index]?.id !== page.id
            return (
              <button
                key={page.id}
                type='button'
                draggable
                onClick={() => setCurrent(index)}
                onDragStart={() => { dragId.current = page.id }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  const from = dragId.current
                  if (!from || from === page.id) return
                  setOrder((currentOrder) => {
                    const next = currentOrder.filter((id) => id !== from)
                    next.splice(next.indexOf(page.id), 0, from)
                    return next
                  })
                }}
                onDragEnd={() => { dragId.current = null }}
                className='flex cursor-grab flex-col gap-1.5 border-0 bg-transparent p-0'
              >
                <span
                  className='relative block aspect-[2/3] w-full overflow-hidden rounded-[7px] bg-[var(--tl-fg)]'
                  style={{ border: index === current ? '2px solid var(--tl-p)' : '1px solid var(--tl-line)' }}
                >
                  {rendered[page.id] && <img src={rendered[page.id].url} alt='' className='h-full w-full object-cover object-top' />}
                  <span className='absolute bottom-[5px] left-[5px] rounded bg-black/55 px-[5px] py-px font-mono text-[10px] text-[var(--tl-fg)]'>
                    {page.fileName ?? `sayfa_${index + 1}`}
                  </span>
                  {moved && <span className='absolute right-[5px] top-[5px] h-2 w-2 rounded-full bg-[var(--tl-p)]' />}
                </span>
                <span className={cn('flex items-center justify-between text-[11.5px] font-bold', index === current ? 'text-[var(--tl-p)]' : 'text-[var(--tl-fg2)]')}>
                  {String(index + 1).padStart(2, '0')}
                  {done ? <CheckCircle weight='fill' size={13} className='text-[var(--tl-green)]' />
                    : untouchedPage ? <CircleDashed weight='bold' size={13} className='text-[var(--tl-dim)]' />
                      : <WarningCircle weight='fill' size={13} className='text-[var(--tl-amber)]' />}
                </span>
              </button>
            )
          })}
        </div>
        <div className='flex gap-3.5 text-[11.5px] font-semibold text-[var(--tl-mut)]'>
          <span className='flex items-center gap-[5px]'><CheckCircle weight='fill' className='text-[var(--tl-green)]' />{txa('Onaylı')}</span>
          <span className='flex items-center gap-[5px]'><WarningCircle weight='fill' className='text-[var(--tl-amber)]' />{txa('Onay bekliyor')}</span>
          <span className='flex items-center gap-[5px]'><CircleDashed weight='bold' className='text-[var(--tl-dim)]' />{txa('İncelenmedi')}</span>
        </div>
      </div>
    </div>
  )
}

function PreviewImage({ rendered, ratio }: { rendered?: Rendered, ratio: number }) {
  return (
    <div className='w-full max-w-[720px] flex-none'>
      {rendered
        ? <img src={rendered.url} alt='' className='block w-full' />
        : <div className='tl-hatch flex w-full items-center justify-center text-xs font-semibold text-[var(--tl-mut)]' style={{ aspectRatio: `1 / ${ratio}` }}>{txa('Hazırlanıyor…')}</div>}
    </div>
  )
}
