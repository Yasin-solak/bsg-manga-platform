import { useState, type ReactNode } from 'react'
import { Check, Grid3x3, Palette, Pipette, Sparkles, SwatchBook, X } from 'lucide-react'
import { normalizeHoverThemeColor } from '@/components/common/hoverCardTheme'
import { cn } from '@/lib/utils'
import {
  PROFILE_THEME_PATTERN_LABEL,
  PROFILE_THEME_PATTERNS,
  PROFILE_THEME_PRESETS,
  PROFILE_THEME_STYLE_LABEL,
  PROFILE_THEME_STYLES,
  profileStageVars,
  sameProfileTheme,
  type ProfileTheme,
} from '@/lib/profileTheme'
import { ProfileThemeBackdrop } from './ProfileThemeBackdrop'
import { StudioTabs } from './StudioTabs'
import { txa } from '@/i18n/activeLocale'

/*
 * Profile theme editor: the theme painting the profile scene (background, side cards, buttons) and hover
 * card. A live scene preview on top; ready-made themes, scene style, pattern and two colors below.
 * Premium gating is on the caller's side (hasAccess / lockedSlot).
 */

function ColorField({ label, hint, color, disabled, onChange }: { label: string, hint: string, color: string, disabled: boolean, onChange: (color: string) => void }) {
  return (
    <label className={cn('group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-border/60 p-3 transition-colors hover:border-primary/45', disabled && 'cursor-not-allowed opacity-60')}>
      <span className='relative inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 shadow-inner' style={{ background: color }}>
        <input type='color' value={color} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled} className='absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed' aria-label={txa('{v1} seç', { v1: label })} />
        <Pipette className='pointer-events-none size-4 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-90' />
      </span>
      <span className='min-w-0'>
        <span className='block text-sm font-black text-foreground'>{label}</span>
        <span className='block text-[11px] text-muted-foreground'>{hint}</span>
        <span className='mt-0.5 block font-mono text-[11px] font-bold text-foreground/70'>{color.toUpperCase()}</span>
      </span>
    </label>
  )
}

/** Canli onizleme: profil sahnesinin kucuk hali (zemin + kimlik karti + yan kart). */
function StagePreview({ theme, previewName }: { theme: ProfileTheme | null, previewName: string }) {
  return (
    <div className='relative h-[180px] overflow-hidden rounded-2xl border border-border/60' style={profileStageVars(theme)} data-profile-theme-preview>
      <ProfileThemeBackdrop theme={theme} />
      <div className='relative flex h-full items-center justify-center gap-4 px-5'>
        <div className='hidden w-[118px] flex-col gap-2 rounded-xl border border-[var(--profile-surface-border)] bg-[var(--profile-surface)] p-2.5 text-white backdrop-blur-md sm:flex'>
          <span className='text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-white/60'>{txa('Ekipler')}</span>
          {[0, 1, 2].map((key) => (
            <span key={key} className='flex items-center gap-1.5'>
              <span className='size-4 rounded-full bg-white/25' />
              <span className='h-1.5 flex-1 rounded-full bg-white/25' />
            </span>
          ))}
        </div>
        <div className='flex w-[150px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0d0f14]/90 text-white shadow-2xl'>
          <span className='h-10' style={{ background: theme ? `linear-gradient(120deg, ${theme.mainColor}, ${theme.accentColor})` : 'rgb(255 255 255 / 0.08)' }} />
          <span className='-mt-4 ml-2.5 size-9 rounded-full border-2 border-[#0d0f14] bg-white/30' />
          <span className='px-2.5 pb-2.5 pt-1'>
            <span className='block truncate text-[11px] font-extrabold'>{previewName}</span>
            <span className='mt-1 block h-1.5 w-3/4 rounded-full bg-white/20' />
            <span className='mt-1 block h-1.5 w-1/2 rounded-full bg-white/15' />
          </span>
        </div>
        <div className='hidden w-[118px] flex-col gap-2 rounded-xl border border-[var(--profile-surface-border)] bg-[var(--profile-surface)] p-2.5 text-white backdrop-blur-md sm:flex'>
          <span className='text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-white/60'>{txa('Şu an okuyor')}</span>
          <span className='h-8 rounded-md bg-white/15' />
          <span className='flex h-5 items-center justify-center rounded-md bg-primary text-[8.5px] font-extrabold text-primary-foreground'>{txa('Kaldığın yerden oku')}</span>
        </div>
      </div>
    </div>
  )
}

export function ProfileThemePicker({ value, onChange, disabled = false, hasAccess = true, lockedSlot, previewName = txa('Sen') }: {
  value: ProfileTheme | null
  onChange: (value: ProfileTheme | null) => void
  disabled?: boolean
  hasAccess?: boolean
  lockedSlot?: ReactNode
  previewName?: string
}) {
  const [draft, setDraft] = useState<ProfileTheme>(value ?? PROFILE_THEME_PRESETS[0])
  const working = value ?? draft
  const controlsDisabled = disabled || !hasAccess
  // Scroll-free layout: the scene preview is fixed, setting groups one at a time in tabs.
  const [pane, setPane] = useState<'presets' | 'style' | 'pattern' | 'colors'>('presets')

  const apply = (patch: Partial<ProfileTheme>) => {
    const next = { ...working, ...patch }
    setDraft(next)
    onChange(next)
  }

  return (
    <div className='space-y-3' data-profile-theme-picker>
      <div className='space-y-2'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <h3 className='m-0 text-sm font-black text-foreground'>{txa('Profil teması')}</h3>
            <p className='m-0 mt-0.5 text-xs text-muted-foreground'>{txa('Profil sayfanın zemini, yan kartlar, düğmeler ve hover kartın bu temayla renklenir.')}</p>
          </div>
          {value && (
            <button type='button' onClick={() => onChange(null)} disabled={controlsDisabled} className='inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[11px] font-black text-muted-foreground hover:text-foreground disabled:opacity-60'>
              <X className='size-3' />{txa('Temayı kaldır')}
            </button>
          )}
        </div>
        <StagePreview theme={value ?? (hasAccess ? null : draft)} previewName={previewName} />
      </div>

      <StudioTabs
        label={txa('Profil teması bölümleri')}
        value={pane}
        onChange={setPane}
        tabs={[
          { id: 'presets', label: txa('Hazır temalar'), icon: <SwatchBook className='size-3.5' /> },
          { id: 'style', label: txa('Sahne stili'), icon: <Sparkles className='size-3.5' /> },
          { id: 'pattern', label: txa('Desen'), icon: <Grid3x3 className='size-3.5' /> },
          { id: 'colors', label: txa('Renkler'), icon: <Palette className='size-3.5' /> },
        ]}
      />

      {pane === 'presets' && (
      <div className='space-y-2.5'>
        <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
          {PROFILE_THEME_PRESETS.map((preset) => {
            const active = sameProfileTheme(value, preset)
            return (
              <button
                key={preset.id}
                type='button'
                onClick={() => { setDraft(preset); onChange({ mainColor: preset.mainColor, accentColor: preset.accentColor, style: preset.style, pattern: preset.pattern }) }}
                disabled={controlsDisabled}
                aria-pressed={active}
                className={cn('group relative h-[68px] overflow-hidden rounded-xl border text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60', active ? 'border-foreground ring-1 ring-foreground/40' : 'border-white/10')}
              >
                <ProfileThemeBackdrop theme={preset} rounded='rounded-xl' />
                <span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-4 text-[11px] font-black text-white'>{preset.name}</span>
                {active && <span className='absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-white text-black'><Check className='size-3' /></span>}
              </button>
            )
          })}
        </div>
      </div>
      )}

      {pane === 'style' && (
        <div className='space-y-2'>
          <p className='m-0 text-xs text-muted-foreground'>{txa('Temanın iki rengi sahneye nasıl yayılsın?')}</p>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            {PROFILE_THEME_STYLES.map((style) => {
              const active = working.style === style && Boolean(value)
              return (
                <button key={style} type='button' onClick={() => apply({ style })} disabled={controlsDisabled} aria-pressed={active} className={cn('relative h-24 overflow-hidden rounded-xl border text-left disabled:cursor-not-allowed disabled:opacity-60', active ? 'border-foreground ring-1 ring-foreground/40' : 'border-white/10')}>
                  <ProfileThemeBackdrop theme={{ ...working, style, pattern: 'none' }} rounded='rounded-xl' />
                  <span className='absolute bottom-1.5 left-2 text-[11.5px] font-black text-white drop-shadow'>{PROFILE_THEME_STYLE_LABEL[style]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {pane === 'pattern' && (
        <div className='space-y-2'>
          <p className='m-0 text-xs text-muted-foreground'>{txa('Sahnenin üstüne ince bir doku ekle.')}</p>
          <div className='grid grid-cols-3 gap-2'>
            {PROFILE_THEME_PATTERNS.map((pattern) => {
              const active = working.pattern === pattern && Boolean(value)
              return (
                <button key={pattern} type='button' onClick={() => apply({ pattern })} disabled={controlsDisabled} aria-pressed={active} className={cn('relative h-20 overflow-hidden rounded-xl border text-left disabled:cursor-not-allowed disabled:opacity-60', active ? 'border-foreground ring-1 ring-foreground/40' : 'border-white/10')}>
                  <ProfileThemeBackdrop theme={{ ...working, style: 'spotlight', pattern }} rounded='rounded-xl' />
                  <span className='absolute bottom-1.5 left-2 text-[11px] font-black text-white drop-shadow'>{PROFILE_THEME_PATTERN_LABEL[pattern]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {pane === 'colors' && (
      <div className='space-y-2'>
        <p className='m-0 text-xs text-muted-foreground'>{txa('Sahnenin iki ışığı; düğmeler ve hover kartı da bu renkleri alır.')}</p>
        <div className='grid gap-2.5 sm:grid-cols-2'>
          <ColorField label={txa('Ana renk')} hint={txa('Sahnenin baskın ışığı')} color={working.mainColor} disabled={controlsDisabled} onChange={(color) => apply({ mainColor: normalizeHoverThemeColor(color, working.mainColor) })} />
          <ColorField label={txa('Vurgu rengi')} hint={txa('İkinci ışık, kenar ve geçişler')} color={working.accentColor} disabled={controlsDisabled} onChange={(color) => apply({ accentColor: normalizeHoverThemeColor(color, working.accentColor) })} />
        </div>
      </div>
      )}

      {!hasAccess && lockedSlot ? lockedSlot : null}
    </div>
  )
}
