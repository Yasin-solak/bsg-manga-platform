/**
 * Reader v2 settings panel.
 *
 * In v1 settings sat in a single horizontal row and were clipped on narrow screens.
 * Here it is a panel: opens from the right on desktop, from the bottom on phones;
 * options list vertically with no clipping.
 */

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReaderV2FitMode, ReaderV2Layout, ReaderV2ModePreference } from '@/pages/reader/readerV2LayoutEngine'
import {
  READER_V2_AUTO_ADVANCE_MAX_SECONDS,
  READER_V2_AUTO_ADVANCE_MIN_SECONDS,
  READER_V2_AUTO_SCROLL_SPEED_MAX,
  READER_V2_AUTO_SCROLL_SPEED_MIN,
  READER_V2_AUTO_SCROLL_SPEED_STEP,
  READER_V2_ZOOM_LEVELS,
  type ReaderV2Preferences,
} from '@/pages/reader/readerV2Preferences'
import { txa } from '@/i18n/activeLocale'

interface ReaderV2SettingsPanelProps {
  open: boolean
  onClose: () => void
  preferences: ReaderV2Preferences
  onChange: (patch: Partial<ReaderV2Preferences>) => void
  layout: ReaderV2Layout
}

const MODE_OPTIONS: Array<{ value: ReaderV2ModePreference; label: string; hint: string }> = [
  { value: 'auto', get label() { return txa('Otomatik') }, get hint() { return txa('Icerige gore secilir') } },
  { value: 'strip', get label() { return txa('Serit') }, get hint() { return txa('Kesintisiz dikey akis') } },
  { value: 'page', get label() { return txa('Sayfa') }, get hint() { return txa('Sayfa sayfa, yatay') } },
]

const FIT_OPTIONS: Array<{ value: ReaderV2FitMode; label: string }> = [
  { value: 'width', get label() { return txa('Genislige sigdir') } },
  { value: 'height', get label() { return txa('Yukseklige sigdir') } },
  { value: 'original', get label() { return txa('Orijinal') } },
]

function OptionRow({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string
  hint?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-primary/50 bg-primary/15 text-white'
          : 'border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.07]',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint ? <span className="block text-[11px] text-white/50">{hint}</span> : null}
      </span>
      {selected ? <span className="size-2 shrink-0 rounded-full bg-primary" /> : null}
    </button>
  )
}

/** Sayisal ayar satiri: deger her zaman gorunur (v1'de yalnizca surgu vardi). */
function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (next: number) => void
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="shrink-0 text-xs font-bold text-primary">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-primary"
      />
      <p className="m-0 text-[11px] text-white/50">{hint}</p>
    </div>
  )
}

export function ReaderV2SettingsPanel({
  open,
  onClose,
  preferences,
  onChange,
  layout,
}: ReaderV2SettingsPanelProps) {
  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[9100] bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <aside
        data-testid="reader-v2-settings"
        role="dialog"
        aria-label={txa('Okuyucu ayarlari')}
        className={cn(
          'fixed z-[9200] flex flex-col gap-4 overflow-y-auto border-white/10 bg-neutral-950/95 p-4 text-white backdrop-blur',
          // Telefon: alttan cekmece. Masaustu: sagdan panel.
          'inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl border-t',
          'sm:inset-y-0 sm:left-auto sm:right-0 sm:w-80 sm:max-h-none sm:rounded-none sm:border-l sm:border-t-0',
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-white/80">{txa('Okuyucu ayarlari')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={txa('Ayarlari kapat')}
            className="rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <section className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">{txa('Okuma modu')}</p>
          {MODE_OPTIONS.map((option) => (
            <OptionRow
              key={option.value}
              label={option.label}
              hint={option.value === 'auto'
                ? txa('{v1} (su an: {v2})', { v1: option.hint, v2: layout.mode === 'strip' ? 'serit' : 'sayfa' })
                : option.hint}
              selected={preferences.modePreference === option.value}
              onSelect={() => onChange({ modePreference: option.value })}
            />
          ))}
        </section>

        {/* Sigdirma secenekleri mobilde gizli: dar ekranda serit zaten ekrana
            oturuyor ve secenekler gorunur bir fark yaratmiyor (kullanici
            istegi). */}
        <section className="hidden space-y-2 md:block">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">{txa('Goruntuleme')}</p>
          {FIT_OPTIONS.map((option) => (
            <OptionRow
              key={option.value}
              label={option.label}
              selected={preferences.fitMode === option.value}
              onSelect={() => onChange({ fitMode: option.value })}
            />
          ))}
        </section>

        {layout.mode === 'strip' ? (
          <section className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">{txa('Serit')}</p>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">{txa('Kesintisiz (webtoon)')}</span>
                <span className="block text-[11px] text-white/50">{txa('Sayfa araligini kaldirir')}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.seamless}
                aria-label={txa('Kesintisiz serit')}
                onClick={() => onChange({ seamless: !preferences.seamless })}
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                  preferences.seamless ? 'bg-primary' : 'bg-white/20',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]',
                    preferences.seamless ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </label>
          </section>
        ) : null}

        <section className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">{txa('Otomatik okuma')}</p>
          {layout.mode === 'strip' ? (
            <SliderRow
              label={txa('Kaydirma hizi')}
              hint={txa('Saniyede kac piksel akacagi. A tusu baslatir/durdurur.')}
              value={preferences.autoScrollSpeed}
              min={READER_V2_AUTO_SCROLL_SPEED_MIN}
              max={READER_V2_AUTO_SCROLL_SPEED_MAX}
              step={READER_V2_AUTO_SCROLL_SPEED_STEP}
              suffix=" px/sn"
              onChange={(next) => onChange({ autoScrollSpeed: next })}
            />
          ) : (
            <SliderRow
              label={txa('Sayfa suresi')}
              hint={txa('Her sayfada kac saniye kalinacagi. A tusu baslatir/durdurur.')}
              value={preferences.autoAdvanceSeconds}
              min={READER_V2_AUTO_ADVANCE_MIN_SECONDS}
              max={READER_V2_AUTO_ADVANCE_MAX_SECONDS}
              step={1}
              suffix=" sn"
              onChange={(next) => onChange({ autoAdvanceSeconds: next })}
            />
          )}
        </section>

        {/* Yakinlastirma yalnizca GENIS ekranda: mobilde serit kolonu zaten
            ekran genisliginde oldugu icin bu ayar gorunur bir sey degistirmiyor
            (kullanici "mobilde bir ise yaramiyor" dedi) ve tarayicinin kendi
            parmak-zoom'u zaten var. */}
        <section className="hidden space-y-2 md:block">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">{txa('Yakinlastirma')}</p>
          <div className="flex flex-wrap gap-1.5">
            {READER_V2_ZOOM_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => onChange({ zoomLevel: level })}
                aria-pressed={preferences.zoomLevel === level}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                  preferences.zoomLevel === level
                    ? 'bg-primary text-black'
                    : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12]',
                )}
              >
                %{level}
              </button>
            ))}
          </div>
        </section>

        {/* "Sessiz okuma" anahtari KALDIRILDI: barlar artik ayri bir tercihe
            gerek kalmadan sayfa hareketiyle gizleniyor, geri donunce geliyor
            (readerV2ChromeEngine). Ayar olarak sunmak gereksiz bir adimdi. */}
        <p className="mt-auto text-[11px] leading-5 text-white/40">
          {txa('Barlar okudukca gizlenir, geri kaydirinca geri gelir.')}
          <br />
        </p>

        {/* Klavye kisayollari yalnizca masaustunde anlamli. */}
        <p className="hidden text-[11px] leading-5 text-white/40 md:block">
          {txa('Kisayollar: ok tuslari sayfa/kaydirma,')} <kbd>A</kbd> {txa('otomatik okuma,')}
          {' '}<kbd>F</kbd> {txa('tam ekran,')} <kbd>Home</kbd>/<kbd>End</kbd> {txa('bolum basi/sonu,')}
          {' '}<kbd>Esc</kbd> {txa('paneli kapatir.')}
        </p>
      </aside>
    </>
  )
}
