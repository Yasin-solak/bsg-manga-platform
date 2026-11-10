import { useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { Check, Crown, Lock, Move, Palette, Pipette, RotateCcw, ShieldCheck, Sparkles, Type, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { nameEffectId, useNameEffects } from '@/lib/nameEffectRegistry'
import { usePremiumPerk } from '@/lib/premiumPerks'
import { useNameSurfaceColors } from '@/lib/useNameSurfaceColors'
import { profileStageVars, type ProfileTheme } from '@/lib/profileTheme'
import { cn } from '@/lib/utils'
import {
  ACTIVE_NAME_TEXT_COLORS,
  ACTIVE_NAME_TEXT_FONTS,
  NAME_TEXT_MOTIONS,
  isNameAssetEffectId,
  isNameTextCustomColor,
  resolveNameTextColorHex,
  resolveNameTextColorSpec,
  type NameTextColorId,
  type NameTextCustomColor,
  type NameTextStyleSelection,
} from '@/data/nameTextEffects'
import {
  DEFAULT_NAME_TEXT_FX_COLORS,
  buildUserNameStyleProps,
} from '@/data/userNameStyle'
import { ProfileThemeBackdrop } from './ProfileThemeBackdrop'
import { StudioTabs } from './StudioTabs'
import { txa } from '@/i18n/activeLocale'

/*
 * Name style (user, v2): typeface, color (solid / gradient; palette or free color), an animated effect
 * from Shop Control, effect color and motion. A live preview with the profile theme on top
 * (scene + comment row); a contrast shield applies if the name is too close to the theme.
 */

type ColorSlot = 'primary' | 'secondary'

const FX_TINT_PAIRS: Array<[NameTextCustomColor, NameTextCustomColor]> = [
  ['#22d3ee', '#3b82f6'],
  ['#f472b6', '#a855f7'],
  ['#a3e635', '#16a34a'],
  ['#fde047', '#f97316'],
  ['#f8fafc', '#94a3b8'],
  ['#e11d48', '#7f1d1d'],
]

// Motion names are localized in the UI (data ids are ASCII).
const MOTION_LABEL: Record<string, string> = {
  get none() { return txa('Yok') }, get float() { return txa('Süzülme') }, get bounce() { return txa('Zıplama') }, get sway() { return txa('Salınım') }, get breathe() { return txa('Nefes') }, get drift() { return txa('Kayma') }, get jelly() { return txa('Jöle') }, get shake() { return txa('Titreme') },
}

const TILE_STAGE = 'bg-[linear-gradient(150deg,#0a0b10,#141720_55%,#0a0b10)]'

function Section({ icon, title, hint, trailing, children, testId }: { icon: ReactNode, title: string, hint?: string, trailing?: ReactNode, children: ReactNode, testId?: string }) {
  return (
    <section className='space-y-2.5 pt-1' data-testid={testId}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <span className='flex size-7 items-center justify-center rounded-[9px] border border-primary/25 bg-primary/10 text-primary'>{icon}</span>
          <div>
            <h3 className='text-sm font-black leading-none text-foreground'>{title}</h3>
            {hint ? <p className='mt-1 text-[11px] font-medium leading-none text-muted-foreground'>{hint}</p> : null}
          </div>
        </div>
        {trailing}
      </div>
      {children}
    </section>
  )
}

function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T, options: Array<{ value: T, label: ReactNode }>, onChange: (value: T) => void, disabled?: boolean }) {
  return (
    <div className='flex rounded-full border border-border/70 bg-background/70 p-1' role='radiogroup'>
      {options.map((option) => (
        <button
          key={option.value}
          type='button'
          role='radio'
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-55',
            value === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Tile({ selected, disabled, onClick, label, tall, children, title, testId }: { selected: boolean, disabled: boolean, onClick: () => void, label: ReactNode, tall?: boolean, children: ReactNode, title?: string, testId?: string }) {
  return (
    <button
      type='button'
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      data-testid={testId}
      className={cn(
        'group relative overflow-hidden rounded-2xl border text-center transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-primary/60 disabled:cursor-not-allowed',
        selected ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]' : 'border-border/60',
      )}
    >
      <span className={cn('flex items-center justify-center overflow-hidden px-2.5', tall ? 'h-16' : 'h-11', TILE_STAGE)}>{children}</span>
      <span className={cn('flex items-center justify-center gap-1 border-t border-border/40 bg-background/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em]', selected ? 'text-primary' : 'text-muted-foreground')}>
        {selected ? <Check className='size-3' /> : null}
        {label}
      </span>
    </button>
  )
}

function NamePreview({ style, text, size, guardSurfaces, className }: { style: NameTextStyleSelection, text: string, size: string, guardSurfaces?: string[], className?: string }) {
  const props = buildUserNameStyleProps(style, { guardSurfaces })
  return (
    <span className={cn('max-w-full font-black', props.className, className)} style={{ ...props.style, fontSize: size, lineHeight: 1.1 }}>
      {text}
    </span>
  )
}

function ColorInput({ label, color, disabled, onChange }: { label: string, color: string, disabled: boolean, onChange: (color: NameTextCustomColor) => void }) {
  return (
    <label className={cn('group relative flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-border/80 py-1 pl-1 pr-3 text-[11px] font-bold text-muted-foreground hover:border-primary/50', disabled && 'cursor-not-allowed opacity-60')}>
      <span className='relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20' style={{ background: color }}>
        <input
          type='color'
          value={color}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value.toLowerCase() as NameTextCustomColor)}
          className='absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed'
          aria-label={txa('{v1} seç', { v1: label })}
        />
        <Pipette className='pointer-events-none size-3.5 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-90' />
      </span>
      {label}
      <span className='font-mono text-foreground/75'>{color.toUpperCase()}</span>
    </label>
  )
}

export function UserNameStyleStudio({
  value,
  onChange,
  onReset,
  hasAccess,
  disabled,
  lockedState,
  previewText,
  theme,
  colorSlot,
  onColorSlotChange,
  onPremiumNavigate,
}: {
  value: NameTextStyleSelection
  onChange: (patch: Partial<NameTextStyleSelection>) => void
  onReset: () => void
  hasAccess: boolean
  disabled?: boolean
  lockedState?: ReactNode
  previewText: string
  theme: ProfileTheme | null
  colorSlot: ColorSlot
  onColorSlotChange: (slot: ColorSlot) => void
  onPremiumNavigate?: () => void
}) {
  const controlsDisabled = Boolean(disabled || !hasAccess)
  // Scroll-free layout: the preview is fixed, setting groups one at a time in tabs.
  const [pane, setPane] = useState<'font' | 'color' | 'effect' | 'motion'>('font')
  const assetEffects = useNameEffects()
  const assetEffectsEnabled = usePremiumPerk('name_effects')
  const name = previewText.replace(/^@/, '') || previewText
  const gradient = value.fillId === 'gradient'
  const slot: ColorSlot = gradient ? colorSlot : 'primary'
  const activeColor = slot === 'primary' ? value.colorId : (value.secondaryColorId ?? value.colorId)
  const hasEffect = isNameAssetEffectId(value.effectId)
  const fxColors = value.fxColors ?? DEFAULT_NAME_TEXT_FX_COLORS
  const themeSurfaces = theme ? [theme.mainColor, theme.accentColor] : []
  const guardActive = buildUserNameStyleProps(value, { guardSurfaces: themeSurfaces }).className.includes('name-guard')
  const pageSurfaces = useNameSurfaceColors()
  const setColor = (color: NameTextColorId) => onChange(slot === 'primary' ? { colorId: color } : { secondaryColorId: color })
  // Preview tiles have no effect / motion: only that option's effect shows.
  const plain: NameTextStyleSelection = { ...value, effectId: 'solid', motionId: 'none' }

  const swatch = (colorId: NameTextColorId, label: string) => {
    const spec = resolveNameTextColorSpec(colorId)
    const selected = activeColor === colorId
    return (
      <button
        key={colorId}
        type='button'
        title={label}
        aria-label={txa('{v1} rengini seç', { v1: label })}
        aria-pressed={selected}
        disabled={controlsDisabled}
        onClick={() => setColor(colorId)}
        className={cn(
          'relative size-8 rounded-full border border-border/70 p-1 transition-all hover:scale-110 hover:border-primary/70 disabled:cursor-not-allowed disabled:hover:scale-100',
          selected && 'scale-110 border-primary',
        )}
      >
        <span className='block size-full rounded-full border border-white/10' style={{ background: `linear-gradient(135deg, ${spec.gradientStart}, ${spec.gradientMid} 48%, ${spec.gradientEnd})` }} />
        {selected ? (
          <span className='absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground'>
            <Check className='size-2.5' />
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <div className='relative'>
      <div className={cn('space-y-3 transition', !hasAccess && 'pointer-events-none select-none opacity-55 blur-[2px]')} aria-hidden={!hasAccess} data-user-name-style-studio>
        {/* ====== Canli onizleme: profil temasi sahnesi + yorum satiri ====== */}
        <div className='overflow-hidden rounded-2xl border border-border/60'>
          <div className='relative flex min-h-[128px] flex-col items-center justify-center gap-1.5 px-6 py-5 text-center' style={profileStageVars(theme)}>
            <ProfileThemeBackdrop theme={theme} rounded='rounded-none' />
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={controlsDisabled}
              onClick={onReset}
              className='absolute left-3 top-3 z-10 h-7 gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 text-[11px] font-bold text-white/85 backdrop-blur hover:bg-black/60 hover:text-white'
            >
              <RotateCcw className='size-3' />
              {txa('Sıfırla')}
            </Button>
            <span
              className={cn(
                'absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold backdrop-blur',
                guardActive ? 'border-amber-300/50 bg-amber-400/20 text-amber-100' : 'border-white/15 bg-black/35 text-white/70',
              )}
              title={txa('İsmin profil temana çok yakın renkteyse etrafına otomatik ince bir kontur eklenir.')}
              data-testid='name-style-guard'
            >
              <ShieldCheck className='size-3' />
              {guardActive ? txa('Kontrast kalkanı devrede') : txa('Kontrast yeterli')}
            </span>
            <span className='relative'>
              <NamePreview style={value} text={name} size='clamp(1.5rem, 3vw, 2.15rem)' guardSurfaces={themeSurfaces} />
            </span>
            <span className='relative text-[11px] font-medium text-white/60'>{theme ? txa('Profil temanla birlikte') : txa('Profil teması seçmedin')}</span>
          </div>
          <div className='flex items-center gap-2.5 border-t border-border/60 bg-card px-4 py-3'>
            <span className='size-7 shrink-0 rounded-full bg-muted' aria-hidden />
            <div className='min-w-0 text-left'>
              <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                <NamePreview style={value} text={name} size='13px' guardSurfaces={pageSurfaces} />
                <span>{txa('· 2 dk önce')}</span>
              </div>
              <p className='truncate text-[12.5px] text-foreground/80'>{txa('Bu bölümdeki çeviri efsane olmuş!')}</p>
            </div>
          </div>
        </div>

        <StudioTabs
          label={txa('İsim stili bölümleri')}
          value={pane}
          onChange={setPane}
          tabs={[
            { id: 'font', label: txa('Yazı tipi'), icon: <Type className='size-3.5' /> },
            { id: 'color', label: txa('Renk'), icon: <Palette className='size-3.5' /> },
            ...(assetEffectsEnabled ? [{ id: 'effect' as const, label: txa('Efekt'), icon: <Wand2 className='size-3.5' /> }] : []),
            { id: 'motion', label: txa('Hareket'), icon: <Move className='size-3.5' /> },
          ]}
        />

        {/* ====== 1. Yazi tipi ====== */}
        {pane === 'font' && <Section icon={<Type className='size-3.5' />} title={txa('Yazı tipi')} hint={txa('Adının gerçek fontla görünümü')}>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            {ACTIVE_NAME_TEXT_FONTS.map((font) => (
              <Tile key={font.id} selected={value.fontId === font.id} disabled={controlsDisabled} onClick={() => onChange({ fontId: font.id })} label={font.name}>
                <NamePreview style={{ ...plain, fontId: font.id }} text={name} size='0.95rem' className='block truncate' />
              </Tile>
            ))}
          </div>
        </Section>}

        {/* ====== 2. Renk ====== */}
        {pane === 'color' && <Section
          icon={<Palette className='size-3.5' />}
          title={txa('Renk')}
          hint={gradient ? txa('Ana renkten ikinci renge geçiş') : txa('Adının rengi')}
          trailing={<Segmented value={value.fillId ?? 'solid'} disabled={controlsDisabled} onChange={(fillId) => onChange({ fillId })} options={[{ value: 'solid', label: txa('Düz') }, { value: 'gradient', label: txa('Geçişli') }]} />}
        >
          {gradient && (
            <Segmented
              value={slot}
              disabled={controlsDisabled}
              onChange={onColorSlotChange}
              options={[
                { value: 'primary', label: <><span className='size-2.5 rounded-full border border-white/25' style={{ background: resolveNameTextColorHex(value.colorId) }} />{txa('Ana renk')}</> },
                { value: 'secondary', label: <><span className='size-2.5 rounded-full border border-white/25' style={{ background: resolveNameTextColorHex(value.secondaryColorId) }} />{txa('İkinci renk')}</> },
              ]}
            />
          )}
          <div className='flex flex-wrap items-center gap-1.5'>
            {ACTIVE_NAME_TEXT_COLORS.map((color) => swatch(color.id, color.name))}
          </div>
          <ColorInput
            label={txa('İstediğin renk')}
            color={isNameTextCustomColor(activeColor) ? activeColor : resolveNameTextColorHex(activeColor)}
            disabled={controlsDisabled}
            onChange={setColor}
          />
        </Section>}

        {/* ====== 3. Animasyonlu efekt ====== */}
        {pane === 'effect' && assetEffectsEnabled && (
          <Section icon={<Wand2 className='size-3.5' />} title={txa('Animasyonlu efekt')} hint={txa('Adının etrafında ya da içinde canlı oynar')} testId='name-style-effects'>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
              <Tile selected={!hasEffect} disabled={controlsDisabled} onClick={() => onChange({ effectId: 'solid' })} label={txa('Yok')} tall>
                <NamePreview style={{ ...value, effectId: 'solid', motionId: 'none' }} text={name} size='1rem' className='block truncate' />
              </Tile>
              {assetEffects.map((effect) => {
                const id = nameEffectId(effect.slug)
                return (
                  <Tile key={effect.slug} selected={value.effectId === id} disabled={controlsDisabled} onClick={() => onChange({ effectId: id })} label={effect.name} title={effect.description ?? effect.name} tall>
                    <NamePreview style={{ ...value, effectId: id, motionId: 'none' }} text={name} size='1rem' />
                  </Tile>
                )
              })}
            </div>
          </Section>
        )}

        {/* ====== 4. Efekt rengi ====== */}
        {pane === 'effect' && assetEffectsEnabled && hasEffect && (
          <Section
            icon={<Sparkles className='size-3.5' />}
            title={txa('Efekt rengi')}
            hint={value.fxTint === 'custom' ? txa('İki renk seç; tek renk için ikisini aynı yap') : value.fxTint === 'name' ? txa('Efekt adının rengine boyanır') : txa('Efekt kendi renkleriyle oynar')}
            trailing={(
              <Segmented
                value={value.fxTint ?? 'original'}
                disabled={controlsDisabled}
                onChange={(fxTint) => onChange({ fxTint })}
                options={[{ value: 'original', label: txa('Orijinal') }, { value: 'name', label: txa('İsmimle aynı') }, { value: 'custom', label: txa('Özel') }]}
              />
            )}
            testId='name-style-fx-tint'
          >
            {value.fxTint === 'custom' && (
              <div className='flex flex-wrap items-center gap-2'>
                {FX_TINT_PAIRS.map(([a, b]) => {
                  const selected = fxColors[0] === a && fxColors[1] === b
                  return (
                    <button
                      key={`${a}-${b}`}
                      type='button'
                      aria-label={txa('Efekt rengi {v1} {v2}', { v1: a, v2: b })}
                      aria-pressed={selected}
                      disabled={controlsDisabled}
                      onClick={() => onChange({ fxColors: [a, b] })}
                      className={cn('size-8 rounded-full border-2 transition-transform hover:scale-110', selected ? 'border-primary' : 'border-transparent')}
                      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
                    />
                  )
                })}
                <ColorInput label={txa('Renk 1')} color={fxColors[0]} disabled={controlsDisabled} onChange={(color) => onChange({ fxColors: [color, fxColors[1]] })} />
                <ColorInput label={txa('Renk 2')} color={fxColors[1]} disabled={controlsDisabled} onChange={(color) => onChange({ fxColors: [fxColors[0], color] })} />
              </div>
            )}
          </Section>
        )}

        {/* ====== 5. Hareket ====== */}
        {pane === 'motion' && <Section icon={<Move className='size-3.5' />} title={txa('Hareket')} hint={txa('Sadece yazı hareket eder; efektle birlikte çalışır')} testId='name-style-motion'>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            {NAME_TEXT_MOTIONS.map((motion) => (
              <Tile key={motion.id} selected={(value.motionId ?? 'none') === motion.id} disabled={controlsDisabled} onClick={() => onChange({ motionId: motion.id })} label={MOTION_LABEL[motion.id] ?? motion.name} title={motion.description}>
                <NamePreview style={{ ...value, effectId: 'solid', motionId: motion.id }} text={name} size='0.95rem' />
              </Tile>
            ))}
          </div>
        </Section>}
      </div>

      {!hasAccess ? (
        <div className='absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/55 p-6 backdrop-blur-[1px]'>
          {lockedState ?? (
            <div className='max-w-sm rounded-2xl border border-primary/30 bg-card/95 p-5 text-center shadow-[0_22px_80px_rgba(0,0,0,0.5)]'>
              <div className='mx-auto mb-3 flex size-12 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary'>
                <Lock className='size-5' />
              </div>
              <h3 className='text-base font-black text-foreground'>{txa('Premium isim stili')}</h3>
              <p className='mt-2 text-sm font-medium text-muted-foreground'>{txa('İsim stili ayarları premium üyelikle açılır.')}</p>
              <Button asChild className='mt-4 h-10 rounded-full px-5 font-black'>
                <Link to='/magaza/premium' onClick={onPremiumNavigate}>
                  <Crown className='mr-2 size-4' />
                  {txa('Premium\'a git')}
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

