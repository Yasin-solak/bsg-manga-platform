import { useCallback, useEffect, useRef, useState } from 'react'
import { BoundingBox, CheckCircle, Info, Scan, TextAa, Translate, Warning, WarningCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import {
  getAiUsageToday, getScanSummary, planTiles, scanTile, setPageScanStage, translatePage, withBusyRetry,
  type TlAiUsage, type TlPage, type TlScanSummary,
} from '@/services/translationStudioService'
import { snapPageItemsToBalloons } from './balloonSnap'
import { PrimaryButton, ProgressBar, StepHeading, Toggle } from './studioUi'
import { useRawThumbnail } from './useRawThumbnail'
import { createScopedLogger } from '@/services/logger'
import { describeStudioError, type StudioErrorInfo } from './studioErrors'
import { txa } from '@/i18n/activeLocale'

const scanLogger = createScopedLogger('translationStudio.scan')

/*
 * The scan is driven by the client: a page splits into tiles, each tile is scanned with
 * /api/ceviri/scan (area + OCR in one call), then the page is translated with
 * /api/ceviri/translate. Progress is written to scan_stage in the DB,
 * so it continues from where it left off even if the tab closes; job records are idempotent,
 * so there is no repeat charge.
 */

// 0 queued, 1 scanning, 2 read, 3 translating, 4 done, -1 error
type Phase = -1 | 0 | 1 | 2 | 3 | 4

const FIND_TYPES = [
  { get title() { return txa('Konuşma balonları') }, get text() { return txa('Balonun sınırı ve içindeki metin') }, color: 'var(--tl-p)' },
  { get title() { return txa('Anlatım kutuları') }, get text() { return txa('Köşeli kutular, iç ses, zaman geçişleri') }, color: 'var(--tl-amber)' },
  { title: 'SFX', get text() { return txa('Çizime karışmış ses efektleri') }, color: 'var(--tl-red)' },
  { get title() { return txa('Tabela ve yazılar') }, get text() { return txa('Arka plandaki levha, not, ekran yazıları') }, color: 'var(--tl-green)' },
]

const TYPE_TOTALS = [
  { key: 'balon', get label() { return txa('Balon') }, color: 'var(--tl-p)' },
  { key: 'anlatim', get label() { return txa('Anlatım') }, color: 'var(--tl-amber)' },
  { key: 'sfx', label: 'SFX', color: 'var(--tl-red)' },
  { key: 'tabela', get label() { return txa('Tabela') }, color: 'var(--tl-green)' },
] as const

const PAGE_CONCURRENCY = 2

function initialPhase(page: TlPage): Phase {
  if (page.scanStage === 'suggested' || page.scanStage === 'cleaned') return 4
  if (page.scanStage === 'read') return 2
  // On reload a failed page showed "queued" and hid the retry button.
  if (page.scanStage === 'failed') return -1
  return 0
}

export function StepScan({ fansubId, pages, onDoneChange, aiDisabled = false, onManual }: {
  fansubId: string
  pages: TlPage[]
  onDoneChange: (done: boolean) => void
  /** 18+ series: AI is off, no scanning; directed to manual editing. */
  aiDisabled?: boolean
  onManual?: () => void
}) {
  const readyPages = pages.filter((page) => page.rawStatus === 'ready' && page.width && page.height)
  const [suggest, setSuggest] = useState(true)
  const [phases, setPhases] = useState<Record<string, Phase>>(() => Object.fromEntries(readyPages.map((page) => [page.id, initialPhase(page)])))
  const [errors, setErrors] = useState<Record<string, StudioErrorInfo>>({})
  // On an error affecting all pages such as quota / configuration the queue stops (no wasted requests).
  const haltRef = useRef<StudioErrorInfo | null>(null)
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<TlScanSummary | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Pilot: the team's AI page allowance today (refreshed before and after scanning).
  const [usage, setUsage] = useState<TlAiUsage | null>(null)

  const target: Phase = suggest ? 4 : 2
  const allDone = readyPages.length > 0 && readyPages.every((page) => (phases[page.id] ?? 0) >= target)
  const started = running || Object.values(phases).some((phase) => phase !== 0)
  const finished = !running && readyPages.length > 0
    && readyPages.every((page) => (phases[page.id] ?? 0) >= target || phases[page.id] === -1)

  useEffect(() => { onDoneChange(allDone || (finished && Object.values(phases).some((phase) => phase >= 2))) }, [allDone, finished, onDoneChange, phases])
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (aiDisabled || running) return
    getAiUsageToday(fansubId).then(setUsage).catch(() => setUsage(null))
  }, [aiDisabled, fansubId, running])

  useEffect(() => {
    if (!finished) return undefined
    const controller = new AbortController()
    getScanSummary(readyPages.map((page) => page.id), controller.signal).then(setSummary).catch(() => setSummary(null))
    return () => controller.abort()
    // Ozet yalniz tarama bitisinde yenilenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  const setPhase = (pageId: string, phase: Phase) => setPhases((current) => ({ ...current, [pageId]: phase }))

  const run = useCallback(async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setSummary(null)
    setErrors({})
    haltRef.current = null
    const queue = readyPages.filter((page) => {
      const phase = phases[page.id] ?? 0
      return phase === -1 || phase < target
    })
    // Pages to retry show "Queued", not 'Error', until their turn.
    setPhases((current) => {
      const next = { ...current }
      for (const page of queue) if (next[page.id] === -1) next[page.id] = 0
      return next
    })
    const work = async (page: TlPage) => {
      let phase: Phase = phases[page.id] === -1 ? 0 : (phases[page.id] ?? 0)
      try {
        if (phase < 2) {
          setPhase(page.id, 1)
          for (const tile of planTiles(page.width as number, page.height as number)) {
            if (controller.signal.aborted) return
            await withBusyRetry(() => scanTile(page.id, tile, controller.signal), controller.signal)
          }
          // Fit boxes to balloons: translation goes in the balloon, not a narrow vertical column.
          // Failure does not fail the page; the box stays as detected.
          await snapPageItemsToBalloons(page.id, controller.signal).catch(() => 0)
          phase = 2
          setPhase(page.id, 2)
        }
        if (suggest && phase < 4) {
          setPhase(page.id, 3)
          await withBusyRetry(() => translatePage(page.id, controller.signal), controller.signal)
          setPhase(page.id, 4)
        }
      } catch (error) {
        if (controller.signal.aborted) return
        const info = describeStudioError(error, txa('Tarama başarısız.'))
        // The reason code goes to the diagnostic record (which error how often, for production diagnosis).
        scanLogger.warn(txa('sayfa taranamadi'), { pageId: page.id, code: info.code, retryable: info.retryable })
        if (['quota_exhausted', 'provider_auth', 'not_configured', 'ai_disabled_mature', 'daily_limit'].includes(info.code)) haltRef.current = info
        setErrors((current) => ({ ...current, [page.id]: info }))
        setPhase(page.id, -1)
        await setPageScanStage(page.id, 'failed', `${info.title}: ${info.hint}`).catch(() => {})
      }
    }
    const workers = Array.from({ length: Math.min(PAGE_CONCURRENCY, queue.length) }, async () => {
      while (queue.length && !controller.signal.aborted && !haltRef.current) await work(queue.shift() as TlPage)
    })
    await Promise.all(workers)
    if (!controller.signal.aborted) setRunning(false)
  }, [phases, readyPages, suggest, target])

  const countAt = (min: Phase) => readyPages.filter((page) => (phases[page.id] ?? 0) >= min).length
  const total = readyPages.length
  const phaseRows = [
    { label: txa('Alanlar bulundu'), icon: BoundingBox, count: countAt(2), color: 'var(--tl-p)' },
    { label: txa('Metin okundu'), icon: TextAa, count: countAt(2), color: 'var(--tl-p)' },
    ...(suggest ? [{ label: txa('Çeviri önerildi'), icon: Translate, count: countAt(4), color: 'var(--tl-green)' }] : []),
  ]
  const overall = total ? phaseRows.reduce((sum, row) => sum + row.count, 0) / (phaseRows.length * total) : 0
  const failedCount = Object.values(phases).filter((phase) => phase === -1).length
  // Pages to scan (not yet sent to AI), compared with the remaining allowance.
  const needed = readyPages.filter((page) => (phases[page.id] ?? 0) < target).length
  const remaining = usage && !usage.unlimited ? Math.max(0, usage.limit - usage.used) : null
  // Sekme kapanip yarida kalan tarama: bitmis sayilmaz, kaldigi yerden devam ettirilir.
  const pendingCount = readyPages.filter((page) => {
    const phase = phases[page.id] ?? 0
    return phase >= 0 && phase < target
  }).length

  return (
    <div className='tl-screen flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-6 pb-5 pt-7 sm:px-10'>
      <StepHeading step={4} title={txa('Otomatik tarama')} subtitle={txa('Sistem her sayfada çevrilecek alanları bulur, metni okur ve öneri hazırlar.')} />

      {aiDisabled ? (
        <div className='flex max-w-[760px] flex-col gap-4 rounded-2xl border border-[var(--tl-red)]/40 bg-[var(--tl-card)] p-6' data-testid='tl-scan-mature'>
          <span className='flex items-center gap-2.5 text-lg font-extrabold'>
            <span className='flex h-7 items-center rounded-md bg-[var(--tl-red)] px-2 text-xs font-extrabold text-white'>+18</span>
            {txa('Bu seride yapay zekâ kapalı')}
          </span>
          <span className='text-[13.5px] font-medium leading-relaxed text-[var(--tl-fg2)]'>
            {txa('Seri yetişkin içerik olarak işaretli. Bu nedenle sayfalar ve metinler')} <strong>{txa('hiçbir yapay zekâ servisine gönderilmez')}</strong>:
            {txa('otomatik alan bulma, metin okuma ve çeviri önerisi kullanılamaz.')}
          </span>
          <span className='text-[13.5px] font-medium leading-relaxed text-[var(--tl-fg2)]'>
            {txa('Editörde alanları “Alan çiz” (M) ile ekleyip orijinal metni ve çeviriyi kendin girebilirsin; temizlik, dizgi ve yayın araçları normal çalışır.')}
          </span>
          <div>
            <PrimaryButton onClick={onManual} data-testid='tl-scan-manual'>{txa('Elle düzenlemeye geç')}</PrimaryButton>
          </div>
        </div>
      ) : !started ? (
        <div className='flex max-w-[1100px] flex-col gap-[22px]'>
          <span className='text-lg font-bold tracking-[0.02em]'>{txa('NELER BULUNUR')}</span>
          <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
            {FIND_TYPES.map((type) => (
              <div key={type.title} className='flex flex-col gap-2.5 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-[18px]'>
                <span className='h-[18px] w-7 rounded-[5px] border-2 border-dashed' style={{ borderColor: type.color }} />
                <span className='text-sm font-bold'>{type.title}</span>
                <span className='text-[12.5px] font-medium leading-normal text-[var(--tl-mut)]'>{type.text}</span>
              </div>
            ))}
          </div>
          <span className='mt-1.5 text-lg font-bold tracking-[0.02em]'>{txa('SEÇENEKLER')}</span>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <button
              type='button'
              onClick={() => setSuggest((value) => !value)}
              aria-pressed={suggest}
              className='flex items-center gap-3.5 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] px-[18px] py-4 text-left text-[var(--tl-fg)]'
            >
              <span className='flex flex-1 flex-col gap-1'>
                <span className='text-sm font-bold'>{txa('Çeviri önerisi üret')}</span>
                <span className='text-[12.5px] font-medium text-[var(--tl-mut)]'>{txa('Her alan için Türkçe öneri ve font önerisi hazırlanır')}</span>
              </span>
              <Toggle on={suggest} />
            </button>
            <div className='flex items-center gap-3.5 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] px-[18px] py-4'>
              <span className='flex flex-1 flex-col gap-1'>
                <span className='text-sm font-bold'>{txa('Sayfaları temizle')}</span>
                <span className='text-[12.5px] font-medium text-[var(--tl-mut)]'>{txa('Orijinal metin editörde, sayfa açıldığında silinir ve arka plan onarılır')}</span>
              </span>
              <Toggle on disabled />
            </div>
          </div>
          <div className='mt-1.5 flex flex-wrap items-center gap-3.5'>
            <PrimaryButton size='lg' onClick={() => { void run() }} disabled={!total} data-testid='tl-scan-start'>
              <Scan weight='bold' size={17} />
              {txa('Taramayı başlat')}
            </PrimaryButton>
            <span className='text-[13px] font-semibold text-[var(--tl-mut)]'>
              {txa('{v1} sayfa · sekmeyi kapatırsan kaldığı yerden devam eder', { v1: total })}
            </span>
          </div>
          {usage && (
            <span
              className={cn('flex items-center gap-2 text-[12.5px] font-semibold', remaining !== null && remaining < needed ? 'text-[var(--tl-amber)]' : 'text-[var(--tl-mut)]')}
              data-testid='tl-scan-quota'
            >
              <Info weight='bold' size={14} />
              {usage.unlimited
                ? txa('Bugün {v1} sayfa yapay zekâya gönderildi · site yöneticisi, sınır yok', { v1: usage.used })
                : txa('Ekibin bugünkü yapay zekâ hakkı: {v1} / {v2} sayfa kaldı', { v1: remaining ?? 0, v2: usage.limit })}
              {remaining !== null && remaining < needed && txa(' · {v1} sayfa bugün taranamaz, yarın devam edebilir ya da elle girebilirsin', { v1: needed - remaining })}
            </span>
          )}
        </div>
      ) : (
        <div className='grid min-h-0 flex-1 grid-cols-1 gap-7 lg:grid-cols-[420px_minmax(0,1fr)]'>
          <div className='flex flex-col gap-3'>
            <div className='flex items-center justify-between'>
              <span className='text-lg font-bold tracking-[0.02em]'>{running ? txa('TARANIYOR') : pendingCount > 0 ? txa('TARAMA DURDU') : txa('TARAMA BİTTİ')}</span>
              <span className='text-[13px] font-bold text-[var(--tl-p)]'>{Math.round(overall * 100)}%</span>
            </div>
            {phaseRows.map((row) => (
              <div key={row.label} className='flex flex-col gap-2.5 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] px-4 py-3.5'>
                <div className='flex items-center gap-3'>
                  <span className='flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--tl-acc)]' style={{ color: row.color }}>
                    <row.icon weight='bold' size={16} />
                  </span>
                  <span className='flex-1 text-[13.5px] font-bold'>{row.label}</span>
                  <span className='text-xs font-bold' style={{ color: row.color }}>{row.count} / {total}</span>
                </div>
                <ProgressBar value={total ? row.count / total : 0} color={row.color} className='h-1' />
              </div>
            ))}

            {!running && pendingCount > 0 && (
              <div className='flex items-center gap-3 rounded-xl border border-[var(--tl-p35)] bg-[var(--tl-card)] px-4 py-3'>
                <Info weight='fill' size={18} className='text-[var(--tl-p)]' />
                <span className='flex-1 text-[12.5px] font-semibold text-[var(--tl-fg2)]'>{txa('{v1} sayfa taranmayı bekliyor.', { v1: pendingCount })}</span>
                <PrimaryButton size='sm' onClick={() => { void run() }} data-testid='tl-scan-resume'>{txa('Taramaya devam et')}</PrimaryButton>
              </div>
            )}

            {!running && failedCount > 0 && (
              <div className='flex flex-col gap-2.5 rounded-xl border border-[var(--tl-red)]/40 bg-[var(--tl-card)] px-4 py-3' data-testid='tl-scan-errors'>
                <div className='flex items-center gap-3'>
                  <WarningCircle weight='fill' size={18} className='text-[var(--tl-red)]' />
                  <span className='flex-1 text-[12.5px] font-semibold text-[var(--tl-fg2)]'>{txa('{v1} sayfa taranamadı.', { v1: failedCount })}</span>
                  {Object.values(errors).some((info) => info.retryable) && <PrimaryButton size='sm' onClick={() => { void run() }}>{txa('Tekrar dene')}</PrimaryButton>}
                </div>
                {/* Nedene gore gruplanir: ne oldugu ve ne yapilacagi. */}
                {Object.values(Object.values(errors).reduce<Record<string, { info: StudioErrorInfo, count: number }>>((groups, info) => {
                  groups[info.code] = { info, count: (groups[info.code]?.count ?? 0) + 1 }
                  return groups
                }, {})).map(({ info, count }) => (
                  <div key={info.code} className='flex flex-col gap-0.5 rounded-lg bg-[var(--tl-bg)] px-3 py-2' data-testid='tl-scan-error-group' data-code={info.code}>
                    <span className='text-[12.5px] font-bold text-[var(--tl-fg)]'>{txa('{v1} · {v2} sayfa', { v1: info.title, v2: count })}</span>
                    <span className='text-[12px] font-medium text-[var(--tl-mut)]'>{info.hint}</span>
                  </div>
                ))}
                {haltRef.current && <span className='text-[12px] font-semibold text-[var(--tl-amber)]'>{txa('Kalan sayfalar bu nedenle taranmadı.')}</span>}
              </div>
            )}

            {!running && summary && (
              <div className='tl-screen mt-1.5 flex flex-col gap-3.5 rounded-[14px] border border-[var(--tl-p35)] bg-[var(--tl-card)] p-[18px]'>
                <span className='flex items-center gap-2 text-[15px] font-extrabold'>
                  <CheckCircle weight='fill' size={18} className='text-[var(--tl-green)]' />
                  {txa('{v1} alan bulundu', { v1: summary.total })}
                </span>
                <div className='grid grid-cols-4 gap-2'>
                  {TYPE_TOTALS.map((type) => (
                    <div key={type.key} className='flex flex-col gap-1 rounded-[10px] border border-[var(--tl-line)] p-2.5'>
                      <span className='text-lg font-extrabold' style={{ color: type.color }}>{summary.byType[type.key]}</span>
                      <span className='text-[11.5px] font-semibold text-[var(--tl-mut)]'>{type.label}</span>
                    </div>
                  ))}
                </div>
                <span className='flex items-start gap-2 text-[12.5px] font-semibold leading-normal text-[var(--tl-fg2)]'>
                  {summary.lowConfidence > 0
                    ? <Warning weight='bold' size={14} className='mt-0.5 text-[var(--tl-amber)]' />
                    : <Info weight='bold' size={14} className='mt-0.5 text-[var(--tl-mut)]' />}
                  {summary.lowConfidence > 0
                    ? txa('{v1} alanda okuma güveni düşük; editörde önce bunlar gösterilir. Bulunamayan yerleri elle ekleyebilirsin.', { v1: summary.lowConfidence })
                    : txa('Bulunamayan yerleri editörde elle ekleyebilirsin.')}
                </span>
              </div>
            )}
          </div>

          <div className='grid min-h-0 grid-cols-[repeat(auto-fill,minmax(110px,1fr))] content-start gap-4 overflow-y-auto'>
            {readyPages.map((page, index) => (
              <ScanTile
                key={page.id}
                page={page}
                position={index}
                phase={phases[page.id] ?? 0}
                segments={suggest ? 3 : 2}
                count={summary?.perPage[page.id]}
                error={errors[page.id] ? `${errors[page.id].title} · ${errors[page.id].hint}` : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const PHASE_LABEL: Record<number, string> = { 0: 'Sırada', 1: 'Alan aranıyor…', 2: 'Okundu', 3: 'Öneriliyor…' }

function ScanTile({ page, position, phase, segments, count, error }: {
  page: TlPage
  position: number
  phase: Phase
  segments: number
  count?: number
  error?: string
}) {
  const thumb = useRawThumbnail(page.id)
  const done = phase === 4 || (segments === 2 && phase >= 2)
  const active = phase === 1 || phase === 3
  const filled = phase <= 0 ? 0 : phase >= 4 ? 3 : phase >= 2 ? 2 : 0
  const label = phase === -1 ? txa('Hata') : done ? (count !== undefined ? `${count} alan` : txa('Bitti')) : PHASE_LABEL[phase]
  return (
    <div className='flex flex-col gap-[7px]' title={error}>
      <div className={cn(
        'tl-hatch relative box-border flex aspect-[2/3] items-end overflow-hidden rounded-lg border p-2',
        active ? 'border-[var(--tl-p35)]' : phase === -1 ? 'border-[var(--tl-red)]' : 'border-[var(--tl-line)]',
      )}
      >
        {thumb && <img src={thumb} alt='' className='absolute inset-0 h-full w-full object-cover opacity-80' />}
        <span className='relative truncate font-mono text-[11px] text-[var(--tl-dim)] [text-shadow:0_1px_2px_#000]'>
          {page.fileName ?? `sayfa_${String(position + 1).padStart(2, '0')}`}
        </span>
        {done && <CheckCircle weight='fill' size={17} className='absolute right-2 top-2 text-[var(--tl-green)]' />}
      </div>
      <div className='flex gap-[3px]'>
        {Array.from({ length: segments }, (_, index) => (
          <span key={index} className={cn('h-[3px] flex-1 rounded-full', index < Math.min(filled, segments) ? 'bg-[var(--tl-p)]' : 'bg-[var(--tl-acc2)]')} />
        ))}
      </div>
      <span className={cn(
        'truncate text-[11.5px] font-semibold',
        phase === -1 ? 'text-[var(--tl-red)]' : done ? 'text-[var(--tl-fg2)]' : active ? 'text-[var(--tl-p)]' : 'text-[var(--tl-dim)]',
      )}
      >
        {label}
      </span>
    </div>
  )
}
