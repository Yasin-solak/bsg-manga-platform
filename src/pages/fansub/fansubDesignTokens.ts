// Fansub detail page design tokens
// Central constants for a consistent visual language across fansub components.
// Compatible with TONE_STYLES (fansubBoostConstants.ts); tier colors stay outside tokens.

// ---------------------------------------------------------------------------
// Radius: corner rounding by surface hierarchy
// ---------------------------------------------------------------------------

export const FANSUB_RADIUS = {
  /** Dis kabuk kartlar (sekme paneli) */
  shell: 'rounded-[24px]',
  /** Ana kartlar — tier, sidebar, featured, progress banner */
  card: 'rounded-[20px]',
  /** Tum dialog'lar */
  dialog: 'rounded-[28px]',
  /** Ic kutular — ozellik kartlari, istatistik, liste satiri */
  innerCard: 'rounded-2xl',
  /** Rozetler, etiketler, sayac chip'leri */
  chip: 'rounded-full',
  /** CTA and action buttons */
  button: 'rounded-xl',
  /** Input / textarea */
  input: 'rounded-xl',
  /** Kapak gorselleri */
  thumbnail: 'rounded-xl',
} as const

// ---------------------------------------------------------------------------
// Border — kenarlik opakligi hiyerarsisi
// ---------------------------------------------------------------------------

export const FANSUB_BORDER = {
  /** Standart kart kenarligi */
  default: 'border-border/60',
  /** Inner sections, helper dividers */
  subtle: 'border-border/40',
  /** Liste satirlari arasinda ince cizgi */
  separator: 'border-border/30',
  /** Dis kabuk, vurgulu cerceve */
  emphasis: 'border-border/80',
} as const

// ---------------------------------------------------------------------------
// Surface — arka plan yuzey renkleri
// ---------------------------------------------------------------------------

export const FANSUB_SURFACE = {
  /** Ana kart yuzey */
  card: 'bg-background',
  /** Gri tonlu arka plan kutu */
  muted: 'bg-muted/15',
  /** Hafif yukselti (liste satiri, elevated panel) */
  elevated: 'bg-card/50',
  /** Interaktif kart hover seti */
  interactiveHover: 'hover:border-primary/25 hover:bg-card hover:shadow-sm',
} as const

// ---------------------------------------------------------------------------
// Typography — tutarli metin olcegi
// ---------------------------------------------------------------------------

export const FANSUB_TEXT = {
  /** Bolum basliga (ust seviye) */
  sectionTitle: 'text-base font-semibold text-foreground',
  /** Kart basligi */
  cardTitle: 'text-sm font-semibold text-foreground',
  /** Govde metni */
  body: 'text-sm text-muted-foreground',
  /** Kucuk aciklama */
  caption: 'text-xs text-muted-foreground',
  /** Ust baslik / etiket */
  overline: 'text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
  /** Cok kucuk bilgi */
  micro: 'text-[10px] font-medium text-muted-foreground',
  /** Rozet / pill metni */
  badge: 'text-[11px] font-medium',
  /** Buyuk istatistik sayisi */
  stat: 'text-lg font-semibold tabular-nums',
} as const

// ---------------------------------------------------------------------------
// Spacing — tutarli bosluk ritmi
// ---------------------------------------------------------------------------

export const FANSUB_SPACING = {
  /** Bolumleri arasi dikey bosluk */
  sectionGap: 'space-y-4',
  /** Kart ic boslugu */
  cardPadding: 'p-4',
  /** Liste ogesi arasi dikey bosluk */
  listGap: 'space-y-2.5',
  /** Grid ic bosluk */
  gridGap: 'gap-3',
  /** Yatay kucuk oge arasi bosluk */
  inlineGap: 'gap-2',
} as const

// ---------------------------------------------------------------------------
// Thumbnail — kapak gorseli standart boyutlari
// ---------------------------------------------------------------------------

export const FANSUB_THUMBNAIL = {
  /** Small: chapter/calendar row */
  small: 'h-12 w-9',
  /** Orta — manga karti */
  medium: 'h-20 w-14',
} as const
