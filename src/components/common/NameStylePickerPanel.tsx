import type { CSSProperties, ReactNode } from 'react';
import { Link } from '@/i18n/router'
;
import { Check, Crown, Lock, Move, Palette, RotateCcw, Sparkles, Type, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { nameEffectId, useNameEffects } from '@/lib/nameEffectRegistry';
import { usePremiumPerk } from '@/lib/premiumPerks';
import { cn } from '@/lib/utils';
import {
  ACTIVE_NAME_TEXT_COLORS,
  ACTIVE_NAME_TEXT_EFFECTS,
  ACTIVE_NAME_TEXT_FONTS,
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  DEFAULT_NAME_TEXT_MOTION_ID,
  NAME_TEXT_MOTIONS,
  buildNameTextStyleVars,
  buildStandardNameTextStyleVars,
  getNameTextStyleClassName,
  resolveNameTextColorSpec,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
  type NameTextMotionId,
} from '@/data/nameTextEffects';
import { txa } from '@/i18n/activeLocale'

type NameTextColorSlot = 'primary' | 'secondary';

type NameStylePreset = {
  id: string;
  name: string;
  description: string;
  fontId: NameTextFontId;
  effectId: NameTextEffectId;
  colorId: NameTextColorId;
  secondaryColorId: NameTextColorId;
};

type NameStylePickerPanelProps = {
  disabled?: boolean;
  hasAccess: boolean;
  lockedState?: ReactNode;
  premiumHref?: string;
  onPremiumNavigate?: () => void;
  onSelectedNameColorChange: (colorId: NameTextColorId) => void;
  onSelectedNameColorSlotChange: (slot: NameTextColorSlot) => void;
  onSelectedNameEffectChange: (effectId: NameTextEffectId) => void;
  onSelectedNameFontChange: (fontId: NameTextFontId) => void;
  onSelectedNameSecondaryColorChange: (colorId: NameTextColorId) => void;
  /** Motion selection; if not given (e.g. fansub name style) the Motion section is hidden. */
  onSelectedNameMotionChange?: (motionId: NameTextMotionId) => void;
  previewInlineStyle?: CSSProperties;
  previewText: string;
  selectedNameColorId: NameTextColorId;
  selectedNameColorSlot: NameTextColorSlot;
  selectedNameEffectId: NameTextEffectId;
  selectedNameFontId: NameTextFontId;
  selectedNameSecondaryColorId: NameTextColorId;
  selectedNameMotionId?: NameTextMotionId;
  selectedNameStyleClassName: string;
};

const NAME_STYLE_PREVIEW_BASE_STYLE: CSSProperties = {
  ...buildStandardNameTextStyleVars(),
  fontSize: 'clamp(1.35rem, 2.4vw, 2rem)',
  lineHeight: 0.95,
  letterSpacing: 0,
};

const NAME_STYLE_PRESETS: NameStylePreset[] = [
  {
    id: 'modern',
    get name() { return txa('Modern') },
    get description() { return txa('Net ve temiz') },
    fontId: 'neo',
    effectId: 'solid',
    colorId: 'white',
    secondaryColorId: 'neutral',
  },
  {
    id: 'neon',
    get name() { return txa('Neon') },
    get description() { return txa('Parlak vitrin') },
    fontId: 'bold',
    effectId: 'neon',
    colorId: 'violet',
    secondaryColorId: 'cyan',
  },
  {
    id: 'glitch',
    get name() { return txa('Glitch') },
    get description() { return txa('Dijital sapma') },
    fontId: 'mono',
    effectId: 'glitch',
    colorId: 'white',
    secondaryColorId: 'pink',
  },
  {
    id: 'royal',
    get name() { return txa('Royal') },
    get description() { return txa('Altın vurgu') },
    fontId: 'serif',
    effectId: 'gradient',
    colorId: 'gold',
    secondaryColorId: 'copper',
  },
  {
    id: 'manga-ink',
    get name() { return txa('Manga Ink') },
    get description() { return txa('Kalem kontur') },
    fontId: 'comic',
    effectId: 'comic',
    colorId: 'white',
    secondaryColorId: 'black',
  },
  {
    id: 'cyber',
    get name() { return txa('Cyber') },
    get description() { return txa('Tekno cizgi') },
    fontId: 'tech',
    effectId: 'arc',
    colorId: 'cyan',
    secondaryColorId: 'blue',
  },
  {
    id: 'frost',
    get name() { return txa('Frost') },
    get description() { return txa('Soğuk ışık') },
    fontId: 'round',
    effectId: 'neon',
    colorId: 'blue',
    secondaryColorId: 'white',
  },
  {
    id: 'spectrum',
    get name() { return txa('Spectrum') },
    get description() { return txa('Renk geçişi') },
    fontId: 'display',
    effectId: 'prism',
    colorId: 'rainbow',
    secondaryColorId: 'violet',
  },
];

const RECOMMENDED_COLOR_IDS: NameTextColorId[] = [
  'white',
  'neutral',
  'violet',
  'pink',
  'crimson',
  'gold',
  'moss',
  'cyan',
  'blue',
];

const GRADIENT_COLOR_IDS: NameTextColorId[] = [
  'rainbow',
  'sunset',
  'violet',
  'cyan',
  'pine',
  'indigo',
  'copper',
  'black',
];

const EFFECT_LABELS: Partial<Record<NameTextEffectId, string>> = {
  get solid() { return txa('Yok') },
  get neon() { return txa('Glow') },
  get comic() { return txa('Outline') },
  get glitch() { return txa('Split') },
  get arc() { return txa('Pulse') },
  get prism() { return txa('Halo') },
  get gradient() { return txa('Gradient') },
  get pop() { return txa('Lift') },
  pixel: '8-Bit',
};

const EFFECT_CONTROL_ORDER: NameTextEffectId[] = [
  'solid',
  'neon',
  'comic',
  'glitch',
  'arc',
  'prism',
  'gradient',
  'pop',
  'pixel',
];

const ORDERED_NAME_TEXT_EFFECTS = EFFECT_CONTROL_ORDER.flatMap((effectId) => {
  const effect = ACTIVE_NAME_TEXT_EFFECTS.find((activeEffect) => activeEffect.id === effectId);
  return effect ? [effect] : [];
});

const STAGE_BACKGROUND = [
  'radial-gradient(circle at 18% 8%, hsl(var(--primary) / 0.22), transparent 42%)',
  'radial-gradient(circle at 86% 90%, rgba(56,189,248,0.12), transparent 46%)',
  'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
  'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
  'linear-gradient(150deg, #0a0b10 0%, #12141c 55%, #0a0b10 100%)',
].join(', ');

function stripNameDimensionStyle(style?: CSSProperties): CSSProperties {
  if (!style) return {};
  const nextStyle = { ...style };
  delete nextStyle.fontSize;
  delete nextStyle.lineHeight;
  delete nextStyle.letterSpacing;
  return nextStyle;
}

function getColorSwatchStyle(colorId: NameTextColorId): CSSProperties {
  const colorSpec = resolveNameTextColorSpec(colorId);

  return {
    background: `linear-gradient(135deg, ${colorSpec.gradientStart} 0%, ${colorSpec.gradientMid} 48%, ${colorSpec.gradientEnd} 100%)`,
  };
}

function getColorName(colorId: NameTextColorId) {
  return ACTIVE_NAME_TEXT_COLORS.find((color) => color.id === colorId)?.name ?? colorId;
}

function SectionHeading({
  icon,
  title,
  hint,
  trailing,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-[9px] border border-primary/25 bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-black leading-none text-foreground">{title}</h3>
          {hint ? <p className="mt-1 text-[11px] font-medium leading-none text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      {trailing}
    </div>
  );
}

export function NameStylePickerPanel({
  disabled,
  hasAccess,
  lockedState,
  premiumHref = '/magaza/premium',
  onPremiumNavigate,
  onSelectedNameColorChange,
  onSelectedNameColorSlotChange,
  onSelectedNameEffectChange,
  onSelectedNameFontChange,
  onSelectedNameSecondaryColorChange,
  onSelectedNameMotionChange,
  previewInlineStyle,
  previewText,
  selectedNameColorId,
  selectedNameColorSlot,
  selectedNameEffectId,
  selectedNameFontId,
  selectedNameSecondaryColorId,
  selectedNameMotionId = DEFAULT_NAME_TEXT_MOTION_ID,
  selectedNameStyleClassName,
}: NameStylePickerPanelProps) {
  const controlsDisabled = Boolean(disabled || !hasAccess);
  const assetEffects = useNameEffects();
  // Shop Control > Premium: if animated effects are off the section is hidden (the server does not save either).
  const assetEffectsEnabled = usePremiumPerk('name_effects');
  const displayPreviewText = previewText.replace(/^@/, '') || previewText;
  const activeColorId = selectedNameColorSlot === 'primary' ? selectedNameColorId : selectedNameSecondaryColorId;
  const selectedFontName = ACTIVE_NAME_TEXT_FONTS.find((font) => font.id === selectedNameFontId)?.name ?? selectedNameFontId;
  const selectedEffectLabel = EFFECT_LABELS[selectedNameEffectId]
    ?? ACTIVE_NAME_TEXT_EFFECTS.find((effect) => effect.id === selectedNameEffectId)?.name
    ?? assetEffects.find((effect) => nameEffectId(effect.slug) === selectedNameEffectId)?.name
    ?? selectedNameEffectId;
  const previewStyle = {
    ...NAME_STYLE_PREVIEW_BASE_STYLE,
    ...stripNameDimensionStyle(previewInlineStyle),
  };

  const selectPreset = (preset: NameStylePreset) => {
    if (controlsDisabled) return;

    onSelectedNameFontChange(preset.fontId);
    onSelectedNameEffectChange(preset.effectId);
    onSelectedNameColorChange(preset.colorId);
    onSelectedNameSecondaryColorChange(preset.secondaryColorId);
    onSelectedNameColorSlotChange('primary');
  };

  const resetStyle = () => {
    if (controlsDisabled) return;

    onSelectedNameFontChange(DEFAULT_NAME_TEXT_FONT_ID);
    onSelectedNameEffectChange(DEFAULT_NAME_TEXT_EFFECT_ID);
    onSelectedNameColorChange(DEFAULT_NAME_TEXT_COLOR_ID);
    onSelectedNameSecondaryColorChange(DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID);
    onSelectedNameMotionChange?.(DEFAULT_NAME_TEXT_MOTION_ID);
    onSelectedNameColorSlotChange('primary');
  };

  const renderColorButton = (colorId: NameTextColorId) => {
    const isSelected = activeColorId === colorId;

    return (
      <button
        key={colorId}
        type="button"
        title={getColorName(colorId)}
        aria-label={txa('{v1} rengini seç', { v1: getColorName(colorId) })}
        disabled={controlsDisabled}
        onClick={() =>
          selectedNameColorSlot === 'primary'
            ? onSelectedNameColorChange(colorId)
            : onSelectedNameSecondaryColorChange(colorId)
        }
        className={cn(
          'group relative size-8 rounded-full border border-border/70 p-1 transition-all duration-150',
          'hover:scale-110 hover:border-primary/70 disabled:cursor-not-allowed disabled:hover:scale-100',
          isSelected && 'scale-110 border-primary shadow-[0_0_18px_rgba(239,68,68,0.22)]',
        )}
      >
        <span
          className="block h-full w-full rounded-full border border-white/10"
          style={getColorSwatchStyle(colorId)}
        />
        {isSelected ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground">
            <Check className="size-2.5" />
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="relative">
      <div
        className={cn(
          'space-y-2.5 transition',
          !hasAccess && 'pointer-events-none select-none blur-[2px] opacity-55',
        )}
        aria-hidden={!hasAccess}
      >
        {/* ====== HERO: sinematik canli isim sahnesi ====== */}
        <div
          className="relative overflow-hidden rounded-[20px] border border-white/10 shadow-[0_34px_90px_-40px_rgba(0,0,0,0.7)]"
          style={{ background: STAGE_BACKGROUND, backgroundSize: 'auto, auto, 26px 26px, 26px 26px, auto' }}
        >
          <div className="absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" aria-hidden />
          <span className="pointer-events-none absolute -left-16 top-1/2 size-44 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" aria-hidden />
          <span className="pointer-events-none absolute -right-16 top-1/2 size-44 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden />

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={controlsDisabled}
            onClick={resetStyle}
            className="absolute right-3 top-3 z-10 h-8 gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[11px] font-bold text-white/80 backdrop-blur hover:bg-black/60 hover:text-white"
          >
            <RotateCcw className="size-3.5" />
            {txa('Sıfırla')}
          </Button>

          <div className="flex min-h-[88px] flex-col items-center justify-center gap-2 px-8 py-3 text-center">
            <span
              className={cn('name-text-base break-all text-center font-black drop-shadow-[0_12px_36px_rgba(0,0,0,0.6)]', selectedNameStyleClassName)}
              style={previewStyle}
            >
              {displayPreviewText}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/75">
                <Type className="size-3" />
                {selectedFontName}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/75">
                <Sparkles className="size-3" />
                {selectedEffectLabel}
              </span>
              {onSelectedNameMotionChange && selectedNameMotionId !== DEFAULT_NAME_TEXT_MOTION_ID ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/75">
                  <Move className="size-3" />
                  {NAME_TEXT_MOTIONS.find((motion) => motion.id === selectedNameMotionId)?.name ?? selectedNameMotionId}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/75">
                <span className="size-3 rounded-full border border-white/20" style={getColorSwatchStyle(selectedNameColorId)} />
                {getColorName(selectedNameColorId)}
                <span className="text-white/30">/</span>
                <span className="size-3 rounded-full border border-white/20" style={getColorSwatchStyle(selectedNameSecondaryColorId)} />
                {getColorName(selectedNameSecondaryColorId)}
              </span>
            </div>
          </div>
        </div>

        {/* ====== Hazir stiller ====== */}
        <section className="space-y-2 border-t border-border/40 pt-3">
          <SectionHeading
            icon={<Wand2 className="size-3.5" />}
            title={txa('Hazır stiller')}
            hint={txa('Tek dokunuşla komple görünüm')}
          />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {NAME_STYLE_PRESETS.map((preset) => {
              const isSelected =
                selectedNameFontId === preset.fontId &&
                selectedNameEffectId === preset.effectId &&
                selectedNameColorId === preset.colorId &&
                selectedNameSecondaryColorId === preset.secondaryColorId;

              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => selectPreset(preset)}
                  aria-pressed={isSelected}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border text-left transition-all duration-200',
                    'hover:-translate-y-0.5 hover:border-primary/60 disabled:cursor-not-allowed',
                    isSelected
                      ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_16px_40px_rgba(239,68,68,0.16)]'
                      : 'border-white/[0.08]',
                  )}
                >
                  <span className="flex h-12 items-center justify-center overflow-hidden bg-[linear-gradient(150deg,#0a0b10,#141720_55%,#0a0b10)] px-2">
                    <span
                      className={cn(
                        'name-text-base block max-w-full truncate text-center font-black',
                        getNameTextStyleClassName({
                          colorId: preset.colorId,
                          effectId: preset.effectId,
                          fontId: preset.fontId,
                        }),
                      )}
                      style={{
                        ...buildNameTextStyleVars(preset.colorId, preset.secondaryColorId),
                        fontSize: '1rem',
                        lineHeight: 1.05,
                        letterSpacing: 0,
                      }}
                    >
                      {displayPreviewText}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-1 border-t border-white/[0.06] bg-background/70 px-2.5 py-1">
                    <span className="min-w-0 truncate text-[11px] font-black text-foreground">{preset.name}</span>
                    {isSelected ? (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2.5" />
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-x-5 gap-y-3 border-t border-border/40 pt-3 lg:grid-cols-2">
        {/* ====== Yazi tipi: isim her fontta ====== */}
        <section className="space-y-2">
          <SectionHeading
            icon={<Type className="size-3.5" />}
            title={txa('Yazı tipi')}
            hint={txa('İsmin gerçek fontla görünümü')}
          />
          <div className="grid grid-cols-2 gap-2">
            {ACTIVE_NAME_TEXT_FONTS.map((font) => {
              const isSelected = selectedNameFontId === font.id;
              return (
                <button
                  key={font.id}
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => onSelectedNameFontChange(font.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border text-center transition-all duration-150',
                    'hover:-translate-y-0.5 hover:border-primary/60 disabled:cursor-not-allowed',
                    isSelected ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]' : 'border-white/[0.08]',
                  )}
                >
                  <span className="flex h-11 items-center justify-center overflow-hidden bg-[linear-gradient(150deg,#0a0b10,#12141c)] px-2.5">
                    <span
                      className={cn(
                        'name-text-base block max-w-full truncate',
                        getNameTextStyleClassName({ colorId: selectedNameColorId, effectId: 'solid', fontId: font.id }),
                      )}
                      style={{
                        ...buildNameTextStyleVars(selectedNameColorId, selectedNameSecondaryColorId),
                        fontSize: '0.95rem',
                        lineHeight: 1.1,
                      }}
                    >
                      {displayPreviewText}
                    </span>
                  </span>
                  <span className={cn('block truncate border-t border-white/[0.06] bg-background/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em]', isSelected ? 'text-primary' : 'text-muted-foreground')}>
                    {font.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ====== Efekt: isim her efektle canli ====== */}
        <section className="space-y-2">
          <SectionHeading
            icon={<Sparkles className="size-3.5" />}
            title={txa('Efekt')}
            hint={txa('İsmini seçili font ve renklerle canlı gör')}
          />
          <div className="grid grid-cols-2 gap-2">
            {ORDERED_NAME_TEXT_EFFECTS.map((effect) => {
              const isSelected = selectedNameEffectId === effect.id;
              return (
                <button
                  key={effect.id}
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => onSelectedNameEffectChange(effect.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border text-center transition-all duration-150',
                    'hover:-translate-y-0.5 hover:border-primary/60 disabled:cursor-not-allowed',
                    isSelected ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]' : 'border-white/[0.08]',
                  )}
                >
                  <span className="flex h-11 items-center justify-center overflow-hidden bg-[linear-gradient(150deg,#0a0b10,#141720_55%,#0a0b10)] px-2.5">
                    <span
                      className={cn(
                        'name-text-base block max-w-full truncate font-black',
                        getNameTextStyleClassName({ colorId: selectedNameColorId, effectId: effect.id, fontId: selectedNameFontId }),
                      )}
                      style={{
                        ...buildNameTextStyleVars(selectedNameColorId, selectedNameSecondaryColorId),
                        fontSize: '1rem',
                        lineHeight: 1.1,
                      }}
                    >
                      {displayPreviewText}
                    </span>
                  </span>
                  <span className={cn('flex items-center justify-center gap-1 border-t border-white/[0.06] bg-background/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em]', isSelected ? 'text-primary' : 'text-muted-foreground')}>
                    {isSelected ? <Check className="size-3" /> : null}
                    {EFFECT_LABELS[effect.id] ?? effect.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ====== Animasyonlu efektler: ismin etrafinda oynayan gorsel (Magaza Kontrol'den) ====== */}
        {assetEffectsEnabled && assetEffects.length > 0 && (
          <section className="space-y-2" data-name-asset-effects>
            <SectionHeading
              icon={<Wand2 className="size-3.5" />}
              title={txa('Animasyonlu efektler')}
              hint={txa('Adının etrafında canlı oynar')}
            />
            <div className="grid grid-cols-2 gap-2">
              {assetEffects.map((effect) => {
                const id = nameEffectId(effect.slug);
                const isSelected = selectedNameEffectId === id;
                return (
                  <button
                    key={effect.slug}
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => onSelectedNameEffectChange(id)}
                    aria-pressed={isSelected}
                    title={effect.description ?? effect.name}
                    className={cn(
                      'group relative overflow-hidden rounded-2xl border text-center transition-all duration-150',
                      'hover:-translate-y-0.5 hover:border-primary/60 disabled:cursor-not-allowed',
                      isSelected ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]' : 'border-white/[0.08]',
                    )}
                  >
                    <span className="flex h-16 items-center justify-center overflow-hidden bg-[linear-gradient(150deg,#0a0b10,#141720_55%,#0a0b10)] px-4">
                      <span
                        className={cn('name-text-base max-w-full font-black', getNameTextStyleClassName({ colorId: selectedNameColorId, effectId: id, fontId: selectedNameFontId }))}
                        style={{ ...buildNameTextStyleVars(selectedNameColorId, selectedNameSecondaryColorId), fontSize: '1.05rem', lineHeight: 1.1 }}
                      >
                        {displayPreviewText}
                      </span>
                    </span>
                    <span className={cn('flex items-center justify-center gap-1 border-t border-white/[0.06] bg-background/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em]', isSelected ? 'text-primary' : 'text-muted-foreground')}>
                      {isSelected ? <Check className="size-3" /> : null}
                      {effect.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        </div>

        {/* ====== Hareket: yazi yalniz hareket eder (renk / isik vermez), her efektle birlikte calisir ====== */}
        {onSelectedNameMotionChange ? (
          <section className="space-y-2 border-t border-border/40 pt-3" data-name-motion-picker>
            <SectionHeading
              icon={<Move className="size-3.5" />}
              title={txa('Hareket')}
              hint={txa('İsmin kendisi hareket eder; efektle birlikte çalışır')}
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {NAME_TEXT_MOTIONS.map((motion) => {
                const isSelected = selectedNameMotionId === motion.id;
                return (
                  <button
                    key={motion.id}
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => onSelectedNameMotionChange(motion.id)}
                    aria-pressed={isSelected}
                    title={motion.description}
                    data-testid={`name-motion-option-${motion.id}`}
                    className={cn(
                      'group relative overflow-hidden rounded-2xl border text-center transition-all duration-150',
                      'hover:-translate-y-0.5 hover:border-primary/60 disabled:cursor-not-allowed',
                      isSelected ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]' : 'border-white/[0.08]',
                    )}
                  >
                    <span className="flex h-12 items-center justify-center overflow-hidden bg-[linear-gradient(150deg,#0a0b10,#141720_55%,#0a0b10)] px-2.5">
                      <span
                        className={cn(
                          'name-text-base max-w-full font-black',
                          getNameTextStyleClassName({
                            colorId: selectedNameColorId,
                            effectId: selectedNameEffectId,
                            fontId: selectedNameFontId,
                            motionId: motion.id,
                          }),
                        )}
                        style={{
                          ...buildNameTextStyleVars(selectedNameColorId, selectedNameSecondaryColorId),
                          fontSize: '1rem',
                          lineHeight: 1.1,
                        }}
                      >
                        {displayPreviewText}
                      </span>
                    </span>
                    <span className={cn('flex items-center justify-center gap-1 border-t border-white/[0.06] bg-background/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em]', isSelected ? 'text-primary' : 'text-muted-foreground')}>
                      {isSelected ? <Check className="size-3" /> : null}
                      {motion.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ====== Renk paleti ====== */}
        <section className="space-y-2 border-t border-border/40 pt-3">
          <SectionHeading
            icon={<Palette className="size-3.5" />}
            title={txa('Renk paleti')}
            hint={`Su an: ${getColorName(activeColorId)}`}
            trailing={(
              <div className="flex rounded-full border border-border/70 bg-background/70 p-1">
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => onSelectedNameColorSlotChange('primary')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black transition',
                    selectedNameColorSlot === 'primary'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="size-2.5 rounded-full border border-white/25" style={getColorSwatchStyle(selectedNameColorId)} />
                  {txa('Ana')}
                </button>
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => onSelectedNameColorSlotChange('secondary')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black transition',
                    selectedNameColorSlot === 'secondary'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="size-2.5 rounded-full border border-white/25" style={getColorSwatchStyle(selectedNameSecondaryColorId)} />
                  {txa('Yardımcı')}
                </button>
              </div>
            )}
          />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="w-14 shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{txa('Önerilen')}</span>
              <div className="flex flex-wrap gap-1.5">{RECOMMENDED_COLOR_IDS.map(renderColorButton)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="w-14 shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{txa('Gradient')}</span>
              <div className="flex flex-wrap gap-1.5">{GRADIENT_COLOR_IDS.map(renderColorButton)}</div>
            </div>
          </div>
        </section>
      </div>

      {!hasAccess ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/55 p-6 backdrop-blur-[1px]">
          {lockedState ? (
            <div className="w-full max-w-md">{lockedState}</div>
          ) : (
            <div className="max-w-sm rounded-2xl border border-primary/30 bg-card/95 p-5 text-center shadow-[0_22px_80px_rgba(0,0,0,0.5)]">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-base font-black text-foreground">{txa('Premium isim stili')}</h3>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                {txa('İsim stili ayarları Premium üyelikle açılır. Premium sayfasına giderek aktifleştirebilirsin.')}
              </p>
              <Button asChild className="mt-4 h-10 rounded-full px-5 font-black">
                <Link to={premiumHref} onClick={onPremiumNavigate}>
                  <Crown className="mr-2 h-4 w-4" />
                  {txa('Premium\'a git')}
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default NameStylePickerPanel;
