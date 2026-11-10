import { useState, type ReactNode } from 'react'
import { Check, Paintbrush, Pipette, Sparkles, X } from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  hasValidHoverCardTheme,
  normalizeHoverThemeColor,
  type HoverCardThemeColors,
} from './hoverCardTheme'
import { txa } from '@/i18n/activeLocale'

export interface HoverThemePreset extends HoverCardThemeColors {
  id: string
  name: string
}

export const HOVER_THEME_PRESETS: HoverThemePreset[] = [
  { id: 'neon-uzay', get name() { return txa('Neon Uzay') }, mainColor: '#14b8a6', accentColor: '#5b21b6' },
  { id: 'fusya-gece', get name() { return txa('Fusya Gece') }, mainColor: '#d916b8', accentColor: '#1a1024' },
  { id: 'kizil-alacakaranlik', get name() { return txa('Kızıl Alacakaranlık') }, mainColor: '#b91c1c', accentColor: '#180609' },
  { id: 'sakura-ink', get name() { return txa('Sakura Ink') }, mainColor: '#4d253f', accentColor: '#f08ab7' },
  { id: 'bulut-teal', get name() { return txa('Bulut Teal') }, mainColor: '#0b7a98', accentColor: '#9aad7f' },
  { id: 'krem-zeytin', get name() { return txa('Krem Zeytin') }, mainColor: '#d4c86f', accentColor: '#91a66d' },
  { id: 'gece-yarisi', get name() { return txa('Gece Yarısı') }, mainColor: '#1e293b', accentColor: '#0c0f16' },
  { id: 'grafit-altin', get name() { return txa('Grafit Altın') }, mainColor: '#1f2937', accentColor: '#f5c451' },
]

const DEFAULT_DRAFT: HoverCardThemeColors = HOVER_THEME_PRESETS[0]

export interface HoverThemePickerProps {
  value: HoverCardThemeColors | null
  onChange: (value: HoverCardThemeColors | null) => void
  disabled?: boolean
  /** Without access the controls lock and lockedSlot shows. */
  hasAccess?: boolean
  lockedSlot?: ReactNode
}

function ColorChannelCard({
  label,
  hint,
  color,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  color: string
  disabled: boolean
  onChange: (color: string) => void
}) {
  return (
    <label
      className={cn(
        'group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-border/60 p-3 transition-colors',
        'hover:border-primary/45',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        className="pointer-events-none absolute inset-y-0 right-0 w-24 opacity-25 blur-xl transition-opacity group-hover:opacity-40"
        style={{ background: color }}
        aria-hidden
      />
      <span className="relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 shadow-inner" style={{ background: color }}>
        <input
          type="color"
          value={color}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label={txa('{v1} sec', { v1: label })}
        />
        <Pipette className="pointer-events-none size-4 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-90" />
      </span>
      <span className="relative min-w-0">
        <span className="block text-sm font-black text-foreground">{label}</span>
        <span className="block text-[11px] font-medium text-muted-foreground">{hint}</span>
        <span className="mt-0.5 block font-mono text-[11px] font-bold text-foreground/70">{color.toUpperCase()}</span>
      </span>
    </label>
  )
}

/**
 * Two-color (Main + Theme Color) theme picker for profile/hover cards.
 * Gated by premium on the user side and the boost capability on the fansub side;
 * the gating logic is on the caller's side.
 */
export default function HoverThemePicker({
  value,
  onChange,
  disabled = false,
  hasAccess = true,
  lockedSlot,
}: HoverThemePickerProps) {
  const [draft, setDraft] = useState<HoverCardThemeColors>(value ?? DEFAULT_DRAFT)
  const activeTheme = hasValidHoverCardTheme(value) ? value : null
  const workingTheme = activeTheme ?? draft
  const controlsDisabled = disabled || !hasAccess

  const applyColor = (key: keyof HoverCardThemeColors, rawColor: string) => {
    const safeColor = normalizeHoverThemeColor(rawColor, draft[key])
    const nextDraft = { ...(activeTheme ?? draft), [key]: safeColor }
    setDraft(nextDraft)
    onChange(nextDraft)
  }

  const applyPreset = (preset: HoverThemePreset) => {
    const nextTheme = { mainColor: preset.mainColor, accentColor: preset.accentColor }
    setDraft(nextTheme)
    onChange(nextTheme)
  }

  const isPresetActive = (preset: HoverThemePreset) =>
    Boolean(activeTheme
      && activeTheme.mainColor === preset.mainColor
      && activeTheme.accentColor === preset.accentColor)

  return (
    <div className="space-y-5">
      {/* Aktif tema seridi */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border shadow-[0_24px_60px_rgba(0,0,0,0.3)]',
          activeTheme ? 'border-white/10' : 'border-dashed border-border/60',
        )}
      >
        <div
          className="flex min-h-[88px] items-center justify-between gap-3 px-4 py-4"
          style={{
            background: activeTheme
              ? `linear-gradient(120deg, ${activeTheme.mainColor} 0%, ${activeTheme.accentColor} 100%)`
              : undefined,
          }}
        >
          <div className="min-w-0">
            {activeTheme ? (
              <>
                <p className="m-0 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/75 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
                  <Sparkles className="size-3" />
                  {txa('Tema aktif')}
                </p>
                <p className="m-0 mt-1 font-mono text-xs font-bold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
                  {activeTheme.mainColor.toUpperCase()} <span className="opacity-60">&rarr;</span> {activeTheme.accentColor.toUpperCase()}
                </p>
              </>
            ) : (
              <>
                <p className="m-0 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  <Paintbrush className="size-3" />
                  {txa('Tema kapalı')}
                </p>
                <p className="m-0 mt-1 text-xs text-muted-foreground">
                  {txa('Bir hazır tema seç veya kendi renklerini oluştur.')}
                </p>
              </>
            )}
          </div>
          {activeTheme ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={controlsDisabled}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 bg-black/30 px-3 py-1.5 text-[11px] font-black text-white backdrop-blur transition-colors hover:border-white/50 hover:bg-black/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="size-3" />
              {txa('Temayı kaldır')}
            </button>
          ) : null}
        </div>
      </div>

      {/* Renk kanallari */}
      <div className="space-y-2.5">
        <div>
          <h3 className="m-0 text-sm font-black text-foreground">{txa('Renkler')}</h3>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {txa('Ana renk kartin ustunden baslar, Tema Rengi\'ne akar; banner gecisi ve metin kontrasti otomatik ayarlanir.')}
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <ColorChannelCard
            label={txa('Ana')}
            hint={txa('Gradyanın üst ucu, banner geçişi')}
            color={workingTheme.mainColor}
            disabled={controlsDisabled}
            onChange={(color) => applyColor('mainColor', color)}
          />
          <ColorChannelCard
            label={txa('Tema Rengi')}
            hint={txa('Gradyanın alt ucu, kenarlık ve vurgular')}
            color={workingTheme.accentColor}
            disabled={controlsDisabled}
            onChange={(color) => applyColor('accentColor', color)}
          />
        </div>
      </div>

      {/* Hazir temalar */}
      <div className="space-y-2.5 border-t border-border/40 pt-4">
        <div>
          <h3 className="m-0 text-sm font-black text-foreground">{txa('Hazır temalar')}</h3>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{txa('Tek dokunuşla denenmiş kombinasyonlar.')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {HOVER_THEME_PRESETS.map((preset) => {
            const presetActive = isPresetActive(preset)
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                disabled={controlsDisabled}
                aria-pressed={presetActive}
                className={cn(
                  'group relative h-20 overflow-hidden rounded-2xl border text-left transition-all duration-200',
                  'hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,0,0,0.35)] disabled:cursor-not-allowed disabled:opacity-60',
                  presetActive
                    ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_16px_36px_rgba(0,0,0,0.3)]'
                    : 'border-white/10',
                )}
              >
                <span
                  className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.06]"
                  style={{ background: `linear-gradient(135deg, ${preset.mainColor} 0%, ${preset.mainColor} 38%, ${preset.accentColor} 100%)` }}
                  aria-hidden
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-1.5 pt-5">
                  <span className="block truncate text-[11px] font-black text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.7)]">
                    {preset.name}
                  </span>
                </span>
                {presetActive ? (
                  <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border border-white/30 bg-primary text-primary-foreground shadow">
                    <Check className="size-3" />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {!hasAccess && lockedSlot ? lockedSlot : null}
    </div>
  )
}
