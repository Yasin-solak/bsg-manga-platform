import { Image as ImageIcon } from '@phosphor-icons/react'
import { TL_SOURCE_LANGUAGES, type TlSourceLanguage } from '@/services/translationStudioService'
import { inputClass } from './studioHelpers'
import { ChoiceButton, FieldLabel, GhostButton, StepHeading } from './studioUi'
import { txa } from '@/i18n/activeLocale'

export interface ChapterForm {
  chapterNumber: string
  chapterTitle: string
  sourceLanguage: TlSourceLanguage
}

export function StepChapter({ seriesTitle, seriesMeta, coverUrl, form, onChange, onChangeSeries, error }: {
  seriesTitle: string
  seriesMeta: string
  coverUrl: string | null
  form: ChapterForm
  onChange: (form: ChapterForm) => void
  onChangeSeries: () => void
  error: string | null
}) {
  return (
    <div className='tl-screen flex min-h-0 flex-1 justify-center overflow-y-auto p-6 sm:p-10'>
      <div className='flex w-full max-w-[720px] flex-col gap-[26px]'>
        <StepHeading step={2} title={txa('Bölüm bilgileri')} subtitle={txa('Hangi bölümü, hangi dilden çeviriyorsun?')} />

        <div className='flex items-center gap-3.5 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-3'>
          {coverUrl
            ? <img src={coverUrl} alt='' className='h-[66px] w-11 rounded-[7px] object-cover' />
            : (
              <span className='flex h-[66px] w-11 items-center justify-center rounded-[7px] bg-[var(--tl-acc)] text-[var(--tl-dim)]'>
                <ImageIcon weight='bold' size={18} />
              </span>
            )}
          <span className='flex flex-1 flex-col gap-1'>
            <span className='text-sm font-bold'>{seriesTitle}</span>
            <span className='text-xs font-semibold text-[var(--tl-mut)]'>{seriesMeta}</span>
          </span>
          <GhostButton onClick={onChangeSeries} className='h-8 rounded-[9px] px-3 text-[12.5px]'>{txa('Değiştir')}</GhostButton>
        </div>

        <div className='grid grid-cols-[160px_minmax(0,1fr)] gap-3.5'>
          <FieldLabel label={txa('Bölüm no')}>
            <input
              className={`${inputClass} font-extrabold`}
              inputMode='decimal'
              value={form.chapterNumber}
              placeholder='12'
              onChange={(event) => onChange({ ...form, chapterNumber: event.target.value.replace(/[^0-9.,]/g, '').slice(0, 8) })}
              data-testid='tl-chapter-number'
            />
          </FieldLabel>
          <FieldLabel label={txa('Bölüm başlığı (isteğe bağlı)')}>
            <input
              className={inputClass}
              value={form.chapterTitle}
              maxLength={200}
              placeholder={txa('ör. Yağmurdaki Söz')}
              onChange={(event) => onChange({ ...form, chapterTitle: event.target.value })}
            />
          </FieldLabel>
        </div>

        <div className='flex flex-col gap-[7px] text-[12.5px] font-bold text-[var(--tl-mut)]'>
          {txa('Ham sayfaların dili')}
          <div className='flex gap-1.5'>
            {(Object.keys(TL_SOURCE_LANGUAGES) as TlSourceLanguage[]).map((language) => (
              <ChoiceButton
                key={language}
                active={form.sourceLanguage === language}
                onClick={() => onChange({ ...form, sourceLanguage: language })}
                className='h-[42px] flex-1 rounded-[10px] text-[13px]'
              >
                {TL_SOURCE_LANGUAGES[language].label}
              </ChoiceButton>
            ))}
          </div>
        </div>

        <div className='flex flex-col gap-[7px] text-[12.5px] font-bold text-[var(--tl-mut)]'>
          {txa('Çeviri dili')}
          <div className='flex h-[42px] items-center gap-3 rounded-[10px] border border-[var(--tl-p35)] bg-[var(--tl-p15)] px-3.5 text-[13px] font-bold text-[var(--tl-p)]'>
            {txa('Türkçe')}
            <span className='ml-auto text-xs font-semibold text-[var(--tl-fg2)]'>{txa('Diğer diller yayından sonra otomatik üretilir')}</span>
          </div>
        </div>

        {error && <span className='text-[13px] font-semibold text-[var(--tl-red)]'>{error}</span>}
      </div>
    </div>
  )
}

