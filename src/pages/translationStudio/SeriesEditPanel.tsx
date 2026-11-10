import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Info } from '@phosphor-icons/react'
import { submitSeriesRevision, type TlFansubSeries } from '@/services/translationSeriesService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { GenrePicker } from './GenrePicker'
import { inputClass } from './studioHelpers'
import { FieldLabel, GhostButton, PrimaryButton } from './studioUi'
import { txa } from '@/i18n/activeLocale'

/*
 * Series info editing: the change goes to the existing revision system (pending_content_revisions)
 * as "edit". Until approved the old info stays live on the site.
 */

export function SeriesEditPanel({ fansubId, series, onClose, onSubmitted }: {
  fansubId: string
  series: TlFansubSeries
  onClose: () => void
  onSubmitted: (message: string) => void
}) {
  const [title, setTitle] = useState(series.title)
  const [description, setDescription] = useState(series.description)
  const [genres, setGenres] = useState<string[]>(series.genres)
  const [isMature, setIsMature] = useState(series.isMature)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }, [coverPreview])

  const pickCover = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setCover(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  const submit = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await submitSeriesRevision(series, { fansubId, seriesId: series.id, title, description, genres, isMature, cover })
      onSubmitted(txa('Değişiklik onaya gönderildi; onaylanana kadar mevcut bilgiler yayında kalır.'))
    } catch (reason) {
      setError(toUserFacingErrorMessage(reason, txa('Değişiklik onaya gönderilemedi.')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='grid grid-cols-1 items-start gap-6 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5 md:grid-cols-[180px_minmax(0,1fr)]' data-testid='tl-series-edit'>
      <button
        type='button'
        onClick={() => coverInput.current?.click()}
        className='relative flex aspect-[2/3] w-full max-w-[180px] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-[1.5px] border-dashed border-[var(--tl-line2)] bg-transparent text-[var(--tl-fg2)] hover:border-[var(--tl-p35)]'
      >
        {coverPreview ?? series.coverUrl
          ? <img src={coverPreview ?? series.coverUrl ?? ''} alt={txa('Kapak')} className='absolute inset-0 h-full w-full object-cover' />
          : <ImageIcon weight='bold' size={24} className='text-[var(--tl-p)]' />}
        <span className='absolute bottom-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white'>{txa('Kapağı değiştir')}</span>
      </button>
      <input ref={coverInput} type='file' accept='image/png,image/jpeg,image/webp' className='hidden' onChange={(event) => pickCover(event.target.files?.[0])} />

      <div className='flex flex-col gap-4'>
        <FieldLabel label={txa('Seri adı')}>
          <input className={inputClass} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        </FieldLabel>
        <FieldLabel label={txa('Açıklama')}>
          <textarea
            className={`${inputClass} h-28 resize-y py-2.5 leading-relaxed`}
            value={description}
            maxLength={5000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FieldLabel>
        <div className='flex flex-col gap-[7px] text-[12.5px] font-bold text-[var(--tl-mut)]'>
          {txa('Tür')}
          <GenrePicker value={genres} onChange={setGenres} />
        </div>
        <label className='flex items-start gap-2.5 rounded-xl border border-[var(--tl-line)] px-3.5 py-3 text-[12.5px] font-semibold text-[var(--tl-fg2)]'>
          <input type='checkbox' checked={isMature} onChange={(event) => setIsMature(event.target.checked)} className='mt-0.5' />
          <span className='flex flex-col gap-0.5'>
            <span className='font-bold text-[var(--tl-fg)]'>{txa('+18 (yetişkin içerik)')}</span>
            <span className='text-[var(--tl-mut)]'>{txa('Onaylanırsa stüdyoda yapay zekâ bu seri için kapanır.')}</span>
          </span>
        </label>
        <span className='flex items-center gap-2 text-[12.5px] font-semibold text-[var(--tl-mut)]'>
          <Info weight='bold' size={14} />
          {txa('Değişiklikler admin onayına gider; onaya kadar okuyucular mevcut bilgileri görür.')}
        </span>
        {error && <span className='text-[12.5px] font-semibold text-[var(--tl-red)]'>{error}</span>}
        <div className='flex gap-2'>
          <PrimaryButton onClick={() => { void submit() }} disabled={saving || !title.trim()} data-testid='tl-series-edit-submit'>
            {saving ? txa('Gönderiliyor…') : txa('Onaya gönder')}
          </PrimaryButton>
          <GhostButton onClick={onClose} className='h-[42px] px-4 text-sm'>{txa('Vazgeç')}</GhostButton>
        </div>
      </div>
    </div>
  )
}
