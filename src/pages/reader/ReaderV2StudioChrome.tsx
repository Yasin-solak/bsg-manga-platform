import { Maximize2, Minimize2, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReaderTranslationState } from '@/pages/reader/useReaderTranslation'
import { READER_LANGUAGES } from '@/services/translationReaderService'
import { txa } from '@/i18n/activeLocale'

interface ReaderV2StudioActionsProps {
  translation: ReaderTranslationState
  machineTranslation: boolean
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onToggleSettings: () => void
}

export function ReaderV2StudioActions({ translation, machineTranslation, isFullscreen,
  onToggleFullscreen, onToggleSettings }: ReaderV2StudioActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {translation.available ? (
        <label className="flex items-center gap-1 text-[11px] text-white/70">
          <span className="sr-only">{txa('Okuma dili')}</span>
          <select aria-label={txa('Okuma dili')} value={translation.language}
            onChange={(event) => translation.selectLanguage(event.target.value)}
            className="h-8 max-w-24 rounded border border-white/20 bg-neutral-900 px-1.5 text-xs text-white">
            {READER_LANGUAGES.map((entry) => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
          </select>
        </label>
      ) : null}
      {machineTranslation ? (
        <span className="hidden rounded bg-amber-400/15 px-2 py-1 text-[10px] font-semibold text-amber-100 sm:inline">
          {txa('Makine çevirisi')}
        </span>
      ) : null}
      <Button size="sm" variant="ghost" aria-label={isFullscreen ? txa('Tam ekrandan çık') : txa('Tam ekran')}
        className="h-8 w-8 p-0 text-white/70 hover:text-white" onClick={onToggleFullscreen}>
        {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </Button>
      <Button size="sm" variant="ghost" aria-label={txa('Okuyucu ayarları')}
        className="h-8 w-8 p-0 text-white/70 hover:text-white" onClick={onToggleSettings}>
        <Settings2 className="size-4" />
      </Button>
    </div>
  )
}

export function ReaderV2StudioNotice({ translation }: { translation: ReaderTranslationState }) {
  if (translation.status !== 'pending' && translation.status !== 'error' && translation.status !== 'loading') return null
  const message = translation.status === 'error'
    ? translation.error ?? txa('Çeviri hazırlanamadı.')
    : translation.status === 'loading'
      ? txa('Çeviri katmanı yükleniyor…')
      : txa('Çeviri hazırlanıyor; hazır olmayan balonlarda geçici olarak Türkçe metin gösteriliyor.')
  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-[9009] flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-[90vw] items-center gap-2 rounded border border-amber-200/20 bg-neutral-950/90 px-3 py-2 text-xs text-amber-100 shadow backdrop-blur">
        <span>{message}</span>
        {translation.status !== 'loading' ? (
          <button type="button" className="shrink-0 font-semibold underline" onClick={translation.retry}>
            {translation.status === 'error' ? txa('Yeniden dene') : txa('Devam et')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
