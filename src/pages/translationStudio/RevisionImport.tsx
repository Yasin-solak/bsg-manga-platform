import { useEffect, useRef, useState } from 'react'
import { ArrowsClockwise, WarningCircle } from '@phosphor-icons/react'
import { importRevisionPage } from '@/services/translationSeriesService'
import type { TlPage } from '@/services/translationStudioService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { GhostButton, ProgressBar, StepHeading } from './studioUi'
import { txa } from '@/i18n/activeLocale'

/*
 * Revision import: pages of the published classic chapter come into the revision project as RAW
 * (the server copies, /api/ceviri/import). When done the normal upload screen
 * opens; a page that failed can be uploaded by hand or removed there.
 */

const CONCURRENCY = 2

export function RevisionImport({ crumb, pages, onPagesChange, onDone }: {
  crumb: string
  pages: TlPage[]
  onPagesChange: (updater: (pages: TlPage[]) => TlPage[]) => void
  onDone: () => void
}) {
  const [total] = useState(() => pages.filter((page) => page.rawStatus === 'empty').length)
  const [done, setDone] = useState(0)
  const [failures, setFailures] = useState<string[]>([])
  const [finished, setFinished] = useState(false)
  const initialPages = useRef(pages)

  useEffect(() => {
    // If StrictMode reruns it the job restarts; the server does not recopy a ready page.
    const controller = new AbortController()
    setDone(0)
    setFailures([])
    setFinished(false)
    const queue = initialPages.current.filter((page) => page.rawStatus === 'empty')
    const worker = async () => {
      for (let page = queue.shift(); page; page = queue.shift()) {
        const target = page
        try {
          const { width, height } = await importRevisionPage(target.id, controller.signal)
          onPagesChange((current) => current.map((item) => (item.id === target.id
            ? { ...item, rawStatus: 'ready', width, height, scanStage: 'uploaded' } : item)))
        } catch (error) {
          if (controller.signal.aborted) return
          setFailures((current) => [...current, `${target.fileName ?? txa('Sayfa {v1}', { v1: target.pageIndex + 1 })}: ${toUserFacingErrorMessage(error, txa('alınamadı'))}`])
        }
        setDone((count) => count + 1)
      }
    }
    void Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() => {
      if (!controller.signal.aborted) setFinished(true)
    })
    return () => controller.abort()
  }, [onPagesChange])

  useEffect(() => {
    if (finished && failures.length === 0) onDone()
  }, [failures.length, finished, onDone])

  return (
    <div className='tl-screen flex min-h-0 flex-1 flex-col gap-[22px] px-6 pb-5 pt-7 sm:px-10' data-testid='tl-revision-import'>
      <StepHeading step={3} title={txa('Bölüm sayfaları alınıyor')} subtitle={txa('{v1} · yayındaki sayfalar revizyon için ham olarak kopyalanıyor', { v1: crumb })} />
      <div className='flex max-w-[640px] flex-col gap-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5'>
        <span className='flex items-center gap-2 text-sm font-bold'>
          <ArrowsClockwise weight='bold' size={16} className={finished ? 'text-[var(--tl-green)]' : 'animate-spin text-[var(--tl-p)]'} />
          {done} / {txa('{v1} sayfa', { v1: total })}
        </span>
        <ProgressBar value={total ? done / total : 1} />
        <span className='text-[12.5px] font-semibold text-[var(--tl-mut)]'>
          {txa('Yayındaki bölüm bu sırada okuyucuda aynen kalır; yeni sürüm yalnız onaydan sonra yayına geçer.')}
        </span>
      </div>
      {failures.length > 0 && (
        <div className='flex max-w-[640px] flex-col gap-2 rounded-xl border border-[var(--tl-line)] p-4'>
          <span className='flex items-center gap-2 text-[13px] font-bold text-[var(--tl-amber)]'>
            <WarningCircle weight='fill' size={16} />
            {txa('{v1} sayfa otomatik alınamadı', { v1: failures.length })}
          </span>
          {failures.slice(0, 6).map((line) => (
            <span key={line} className='text-xs font-semibold text-[var(--tl-mut)]'>{line}</span>
          ))}
          {finished && (
            <GhostButton onClick={onDone} className='mt-1 h-9 self-start px-3.5 text-[12.5px]'>
              {txa('Yükleme ekranına geç (eksikleri elle yükle)')}
            </GhostButton>
          )}
        </div>
      )}
    </div>
  )
}
