import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import { supabase } from '@/services/supabase'

/*
 * Animated name effects (name_effects): the published list is fetched once and one CSS
 * rule (.name-fx-<slug>) per effect is added to the page. Since name style is carried in the app only as a class
 * (getNameTextEffectClassName -> "name-fx-asset name-fx-<slug>"), the effect shows by itself everywhere
 * the name is drawn. The list is cached in the browser; at startup the cache is applied
 * first, then refreshed.
 */

const nameEffectSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  name: z.string(),
  description: z.string().nullable().optional().transform((value) => value ?? null),
  assetUrl: z.string(),
  overflowX: z.number(),
  overflowY: z.number(),
  offsetY: z.number(),
  blend: z.enum(['normal', 'screen', 'lighten', 'plus-lighter']).catch('normal'),
  layer: z.enum(['back', 'front', 'inside']).catch('back'),
  textGlow: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().transform((value) => value ?? null),
})
export type NameEffect = z.infer<typeof nameEffectSchema>

const CACHE_KEY = 'bsg:name-effects:v1'
const STYLE_ID = 'name-effect-styles'

let effects: NameEffect[] = readCache()
// Shop Control: rules for draft / archived effects and the unsaved preview.
let extras: NameEffect[] = []
let draft: NameEffect | null = null
const listeners = new Set<() => void>()
let loading: Promise<void> | null = null

function readCache(): NameEffect[] {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = z.array(nameEffectSchema).safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

function writeCache(list: NameEffect[]) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(list))
  } catch {
    // Onbellek yalniz hizlandirir; yazilamazsa liste her acilista cekilir.
  }
}

function cssUrl(value: string) {
  return `url("${value.replace(/["\\\n\r]/g, '')}")`
}

// Inner layer: overflow margins become zoom, vertical shift becomes the image's vertical position.
const INSIDE_RULE = [
  'background:var(--name-fx-image) center calc(50% + var(--name-fx-dy)) / calc(100% + 2 * var(--name-fx-ox)) calc(100% + 2 * var(--name-fx-oy)) no-repeat',
  '-webkit-background-clip:text',
  'background-clip:text',
  'color:transparent',
  '-webkit-text-fill-color:transparent',
  'text-shadow:none',
].join(';') + ';'

// Ic katman + efekt rengi: renk gecisi gorselin ustune 'color' karisimiyla biner (isik / doku korunur).
const INSIDE_TINTED_RULE = [
  'background:var(--name-fx-tint),var(--name-fx-image)',
  'background-size:100% 100%,calc(100% + 2 * var(--name-fx-ox)) calc(100% + 2 * var(--name-fx-oy))',
  'background-position:center,center calc(50% + var(--name-fx-dy))',
  'background-repeat:no-repeat',
  'background-blend-mode:color,normal',
  '-webkit-background-clip:text',
  'background-clip:text',
].join(';') + ';'

/** Effect rule: image, overflow margins, layer, blend and text glow. */
export function buildNameEffectRule(effect: NameEffect) {
  const url = resolveStoreAssetUrl(effect.assetUrl) || effect.assetUrl
  const vars = [
    `--name-fx-image:${cssUrl(url)}`,
    `--name-fx-ox:${effect.overflowX}%`,
    `--name-fx-oy:${effect.overflowY}%`,
    `--name-fx-dy:${effect.offsetY}%`,
    `--name-fx-blend:${effect.blend}`,
    `--name-fx-z:${effect.layer === 'front' ? 1 : -1}`,
  ]
  // If the effect color is tinted, the glow switches to that color (--name-fx-glow, buildUserNameStyleProps).
  const glowColor = effect.textGlow ? `var(--name-fx-glow, ${effect.textGlow})` : null
  // Inner: the image is painted inside the letters (background-clip: text). Since text color is transparent,
  // glow uses drop-shadow rather than text-shadow; text-shadow would cover the letters' interior.
  if (effect.layer === 'inside') {
    const glow = glowColor ? `filter:drop-shadow(0 0 .14em ${glowColor}) drop-shadow(0 0 .4em ${glowColor});` : ''
    const base = `.name-fx-asset.name-fx-${effect.slug}`
    return `${base}{${vars.join(';')};${INSIDE_RULE}${glow}}${base}::before{content:none}${base}.name-fx-tinted{${INSIDE_TINTED_RULE}}`
  }
  const glow = glowColor ? `text-shadow:0 0 .3em ${glowColor},0 0 .8em ${glowColor};` : ''
  return `.name-fx-${effect.slug}{${vars.join(';')};${glow}}`
}

function applyStyles(list: NameEffect[]) {
  if (typeof document === 'undefined') return
  const bySlug = new Map<string, NameEffect>()
  for (const effect of [...extras, ...list]) bySlug.set(effect.slug, effect)
  if (draft) bySlug.set(draft.slug, draft)
  list = [...bySlug.values()]
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = list.map(buildNameEffectRule).join('\n')
}

function setEffects(list: NameEffect[]) {
  effects = list
  applyStyles(list)
  listeners.forEach((listener) => listener())
}

/** Fetches published effects and applies the rules (once at app startup). */
export function loadNameEffects(force = false) {
  if (loading && !force) return loading
  applyStyles(effects)
  loading = withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('name_effects_list'), signal),
    { label: 'nameEffects.list', timeoutMs: 10_000 },
  )
    .then(({ data, error }) => {
      if (error) return
      const parsed = z.array(nameEffectSchema).safeParse(data)
      if (!parsed.success) return
      writeCache(parsed.data)
      setEffects(parsed.data)
    })
    .catch(() => undefined)
  return loading
}

/** Shop Control preview: temporarily applies an unsaved effect. */
export function previewNameEffect(effect: NameEffect | null) {
  draft = effect
  applyStyles(effects)
}

/** Shop Control: adds rules for previews of unpublished effects too. */
export function registerAdminNameEffects(list: NameEffect[]) {
  extras = list
  applyStyles(effects)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useNameEffects() {
  return useSyncExternalStore(subscribe, () => effects, () => effects)
}

export function nameEffectId(slug: string) {
  return `fx-${slug}` as const
}
