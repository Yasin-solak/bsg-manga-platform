import { useEffect, useRef, useState } from 'react'
import { Check, Image as ImageIcon, Info, MagnifyingGlass, MagnifyingGlassMinus } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import {
  listStudioSeries, TL_SOURCE_LANGUAGES, type TlSeries, type TlSourceLanguage,
} from '@/services/translationStudioService'
import { inputClass } from './studioHelpers'
import { ChoiceButton, FieldLabel, PrimaryButton, Segmented, StepHeading } from './studioUi'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { GenrePicker } from './GenrePicker'
import { txa } from '@/i18n/activeLocale'

export interface SeriesDraftForm {
  title: string
  originalTitle: string
  sourceLanguage: TlSourceLanguage
  genres: string[]
  cover: File | null
  coverPreview: string | null
  /** 18+: AI off. */
  isMature: boolean
}

export type SeriesMode = 'mevcut' | 'yeni'

export function StepSeries({ fansubId, mode, onModeChange, selected, onSelect, draft, onDraftChange }: {
  fansubId: string
  mode: SeriesMode
  onModeChange: (mode: SeriesMode) => void
  selected: TlSeries | null
  onSelect: (series: TlSeries) => void
  draft: SeriesDraftForm
  onDraftChange: (draft: SeriesDraftForm) => void
}) {
  const [query, setQuery] = useState('')
  const [series, setSeries] = useState<TlSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      listStudioSeries(fansubId, query, controller.signal)
        .then((rows) => { setSeries(rows); setError(null) })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) setError(toUserFacingErrorMessage(reason, txa('Seriler yüklenemedi.')))
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, query ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [fansubId, query])

  const pickCover = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    if (draft.coverPreview) URL.revokeObjectURL(draft.coverPreview)
    onDraftChange({ ...draft, cover: file, coverPreview: URL.createObjectURL(file) })
  }

  const emptyMessage = query.trim()
    ? txa('"{v1}" sitede bulunamadı.', { v1: query.trim() })
    : txa('Sitede çevrilebilir seri bulunamadı.')

  return (
    <div className='tl-screen flex min-h-0 flex-1 flex-col gap-[22px] px-6 pb-5 pt-7 sm:px-10'>
      <StepHeading
        step={1}
        title={txa('Hangi seriyi çeviriyorsun?')}
        subtitle={txa('Sitede varsa seç; yoksa yeni seri olarak ekle.')}
        aside={(
          <Segmented<SeriesMode>
            value={mode}
            onChange={onModeChange}
            options={[{ value: 'mevcut', label: txa('Sitedeki seri') }, { value: 'yeni', label: txa('Yeni seri ekle') }]}
          />
        )}
      />

      {mode === 'mevcut' && (
        <>
          <div className='box-border flex h-11 w-full max-w-[460px] items-center gap-2.5 rounded-[11px] border border-[var(--tl-line)] bg-[var(--tl-card)] px-3.5'>
            <MagnifyingGlass weight='bold' size={16} className='text-[var(--tl-mut)]' />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={txa('Seri adı veya orijinal ad')}
              aria-label={txa('Seri ara')}
              className='min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-[var(--tl-fg)] outline-none placeholder:text-[var(--tl-dim)]'
            />
          </div>

          {error && <span className='text-[13px] font-semibold text-[var(--tl-red)]'>{error}</span>}

          <div className='grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] content-start gap-[22px] overflow-y-auto p-1'>
            {loading && series.length === 0 && Array.from({ length: 8 }, (_, index) => (
              <span key={index} className='tl-hatch aspect-[2/3] animate-pulse rounded-xl' />
            ))}
            {series.map((item) => {
              const isSelected = selected?.id === item.id
              return (
                <button
                  key={item.id}
                  type='button'
                  onClick={() => onSelect(item)}
                  aria-pressed={isSelected}
                  className='flex flex-col gap-[9px] border-0 bg-transparent p-0 text-left text-[var(--tl-fg)]'
                >
                  <span
                    className={cn(
                      'relative block aspect-[2/3] overflow-hidden rounded-xl outline-offset-[3px]',
                      isSelected ? 'outline outline-2 outline-[var(--tl-p)]' : 'outline-none',
                    )}
                  >
                    {item.coverUrl
                      ? <img src={item.coverUrl} alt='' loading='lazy' className='absolute inset-0 h-full w-full object-cover' />
                      : <span className='tl-hatch absolute inset-0' />}
                    <span className='absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,.72),transparent_45%)]' />
                    <span className='absolute left-2 top-2 flex h-[22px] items-center gap-1.5 rounded-full bg-black/60 px-[9px] text-[11px] font-bold'>
                      <span className='h-1.5 w-1.5 rounded-full bg-[var(--tl-p)]' />
                      {TL_SOURCE_LANGUAGES[item.sourceLanguage].label}
                    </span>
                    {isSelected && (
                      <span className='absolute right-2 top-2 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--tl-p)] text-[var(--tl-pfg)]'>
                        <Check weight='bold' size={14} />
                      </span>
                    )}
                    {item.isMature && (
                      <span className='absolute bottom-2 left-2 flex h-5 items-center rounded-md bg-[var(--tl-red)] px-2 text-[10.5px] font-extrabold text-white' title={txa('Yetişkin seri: yapay zekâ kapalı')}>
                        +18
                      </span>
                    )}
                    {item.isMine && (
                      <span className='absolute bottom-2 right-2 flex h-5 items-center rounded-md bg-[var(--tl-p)] px-2 text-[10.5px] font-extrabold text-[var(--tl-pfg)]'>
                        {txa('Ekibin')}
                      </span>
                    )}
                  </span>
                  <span className='truncate text-sm font-bold'>{item.title}</span>
                  <span className='truncate text-xs font-semibold text-[var(--tl-mut)]'>
                    {TL_SOURCE_LANGUAGES[item.sourceLanguage].code}{item.genres[0] ? ` · ${item.genres[0]}` : ''}
                  </span>
                </button>
              )
            })}
          </div>

          {!loading && series.length === 0 && !error && (
            <div className='flex w-full max-w-[560px] items-center gap-3.5 rounded-xl border border-dashed border-[var(--tl-line2)] p-[18px]'>
              <MagnifyingGlassMinus weight='bold' size={22} className='text-[var(--tl-mut)]' />
              <span className='flex-1 text-[13.5px] font-semibold text-[var(--tl-fg2)]'>{emptyMessage}</span>
              <PrimaryButton
                size='sm'
                onClick={() => {
                  if (query.trim()) onDraftChange({ ...draft, title: query.trim() })
                  onModeChange('yeni')
                }}
              >
                {txa('Yeni seri olarak ekle')}
              </PrimaryButton>
            </div>
          )}
        </>
      )}

      {mode === 'yeni' && (
        <div className='grid grid-cols-1 items-start gap-8 overflow-y-auto md:grid-cols-[260px_minmax(0,640px)]'>
          <button
            type='button'
            onClick={() => coverInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); pickCover(event.dataTransfer.files[0]) }}
            className='relative flex aspect-[2/3] w-full max-w-[260px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-xl border-[1.5px] border-dashed border-[var(--tl-line2)] bg-transparent text-[var(--tl-fg2)] transition-colors hover:border-[var(--tl-p35)] hover:bg-[var(--tl-p15)]'
          >
            {draft.coverPreview
              ? <img src={draft.coverPreview} alt={txa('Kapak önizleme')} className='absolute inset-0 h-full w-full object-cover' />
              : (
                <>
                  <ImageIcon weight='bold' size={26} className='text-[var(--tl-p)]' />
                  <span className='text-[13px] font-bold'>{txa('Kapak ekle')}</span>
                  <span className='text-[11.5px] font-semibold text-[var(--tl-mut)]'>{txa('2:3 · en az 600px')}</span>
                </>
              )}
          </button>
          <input
            ref={coverInput}
            type='file'
            accept='image/png,image/jpeg,image/webp'
            className='hidden'
            onChange={(event) => pickCover(event.target.files?.[0])}
          />

          <div className='flex flex-col gap-[18px]'>
            <FieldLabel label={txa('Seri adı (Türkçe)')}>
              <input
                className={inputClass}
                value={draft.title}
                maxLength={200}
                placeholder={txa('ör. Gece Nöbetçisi')}
                onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
              />
            </FieldLabel>
            <FieldLabel label={txa('Orijinal ad')}>
              <input
                className={inputClass}
                value={draft.originalTitle}
                maxLength={200}
                placeholder={txa('ör. 夜の番人')}
                onChange={(event) => onDraftChange({ ...draft, originalTitle: event.target.value })}
              />
            </FieldLabel>
            <div className='flex flex-col gap-[7px] text-[12.5px] font-bold text-[var(--tl-mut)]'>
              {txa('Orijinal dil')}
              <div className='flex gap-1.5'>
                {(Object.keys(TL_SOURCE_LANGUAGES) as TlSourceLanguage[]).map((language) => (
                  <ChoiceButton
                    key={language}
                    active={draft.sourceLanguage === language}
                    onClick={() => onDraftChange({ ...draft, sourceLanguage: language })}
                    className='h-10 flex-1 rounded-[10px] text-[13px]'
                  >
                    {TL_SOURCE_LANGUAGES[language].label}
                  </ChoiceButton>
                ))}
              </div>
            </div>
            <div className='flex flex-col gap-[7px] text-[12.5px] font-bold text-[var(--tl-mut)]'>
              {txa('Tür')}
              <GenrePicker value={draft.genres} onChange={(genres) => onDraftChange({ ...draft, genres })} />
            </div>
            <label className='flex items-start gap-2.5 rounded-xl border border-[var(--tl-line)] px-3.5 py-3 text-[12.5px] font-semibold text-[var(--tl-fg2)]'>
              <input
                type='checkbox'
                checked={draft.isMature}
                onChange={(event) => onDraftChange({ ...draft, isMature: event.target.checked })}
                className='mt-0.5'
                data-testid='tl-draft-mature'
              />
              <span className='flex flex-col gap-0.5'>
                <span className='font-bold text-[var(--tl-fg)]'>{txa('+18 (yetişkin içerik)')}</span>
                <span className='text-[var(--tl-mut)]'>{txa('Yetişkin seride yapay zekâ taraması ve çevirisi kapalıdır; sayfalar hiçbir yapay zekâ servisine gönderilmez. Alanları ve metinleri elle girersin.')}</span>
              </span>
            </label>
            <span className='flex items-center gap-2 text-[12.5px] font-semibold text-[var(--tl-mut)]'>
              <Info weight='bold' size={14} />
              {txa('Yeni seri, ilk bölümle birlikte moderasyona düşer.')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
