import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'
import { txa } from '@/i18n/activeLocale'

/*
 * Mürek Closet: cosmetic colors and accessories for the mascot Mürek. Catalog, ownership and equipping
 * are on the server (get_murek_shop / buy_murek_item / equip_murek); coins come from the same balance.
 * The user's own look is cached in the module; games and the home page draw the same Mürek.
 */

export type MurekItemKind = 'color' | 'accessory'
export type MurekRarity = 'common' | 'rare' | 'epic' | 'legendary'

const lookSchema = z.object({
  color: z.string().catch('mor'),
  colorHex: z.string().regex(/^#[0-9a-f]{6}$/i).catch('#7c6cff'),
  animated: z.string().nullable().catch(null).default(null),
  accessory: z.string().nullable().catch(null).default(null),
  // Item names (for the Mürek hint on the profile card); absent in old responses.
  colorName: z.string().nullable().catch(null).default(null),
  accessoryName: z.string().nullable().catch(null).default(null),
})

const itemSchema = z.object({
  id: z.string(),
  kind: z.enum(['color', 'accessory']),
  name: z.string().transform((value) => txa(value)),
  description: z.string().catch('').transform((value) => txa(value)),
  price: z.number().int().nonnegative(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']).catch('common'),
  data: z.object({
    hex: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    animated: z.string().optional(),
  }).passthrough().catch({}),
  sort: z.number().int().catch(0),
  isActive: z.boolean().catch(true),
  owners: z.number().int().optional(),
  equipped: z.number().int().optional(),
})

const shopSchema = z.object({
  items: z.array(itemSchema).catch([]),
  owned: z.array(z.string()).catch(['mor']),
  look: lookSchema,
  balance: z.number().int().nullable().catch(null),
})

export type MurekLook = z.infer<typeof lookSchema>
export type MurekItem = z.infer<typeof itemSchema>
export type MurekShop = z.infer<typeof shopSchema>

export const DEFAULT_MUREK_LOOK: MurekLook = { color: 'mor', colorHex: '#7c6cff', animated: null, accessory: null, colorName: null, accessoryName: null }

export function parseMurekShop(value: unknown): MurekShop | null {
  const result = shopSchema.safeParse(value)
  return result.success ? result.data : null
}

export function parseMurekLook(value: unknown): MurekLook {
  const result = lookSchema.safeParse(value)
  return result.success ? result.data : DEFAULT_MUREK_LOOK
}

/** Bir parca denenirken gorunum: renk ya da aksesuar degistirilir, gerisi korunur. */
export function previewMurekLook(look: MurekLook, item: MurekItem | null): MurekLook {
  if (!item) return look
  if (item.kind === 'accessory') return { ...look, accessory: item.id, accessoryName: item.name }
  return { ...look, color: item.id, colorHex: item.data.hex ?? look.colorHex, animated: item.data.animated ?? null, colorName: item.name }
}

const MUREK_ERRORS: Record<string, string> = {
  get AUTH_REQUIRED() { return txa('Bunun için giriş yapmalısın.') },
  get MUREK_ITEM_UNAVAILABLE() { return txa('Bu parça şu an satışta değil.') },
  get MUREK_ITEM_OWNED() { return txa('Bu parça zaten dolabında.') },
  get MUREK_INSUFFICIENT_COIN() { return txa('Coinin yetmiyor. Oyunlardan ve görevlerden coin kazanabilirsin.') },
  get MUREK_ITEM_NOT_OWNED() { return txa('Önce bu parçayı almalısın.') },
}

export function toMurekErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : ''
  const code = Object.keys(MUREK_ERRORS).find((key) => message.includes(key))
  return code ? MUREK_ERRORS[code] : txa('İşlem tamamlanamadı. Biraz sonra tekrar dene.')
}

async function murekRpc(name: string, args: Record<string, unknown>, label: string): Promise<MurekShop> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(name, args), signal),
    { label },
  )
  if (error) throw error
  const shop = parseMurekShop(data)
  if (!shop) throw new Error('MUREK_ITEM_UNAVAILABLE')
  setMyMurekLook(shop.look)
  return shop
}

export function getMurekShop() {
  return murekRpc('get_murek_shop', {}, 'murekService.getMurekShop')
}

export function buyMurekItem(itemId: string) {
  return murekRpc('buy_murek_item', { p_item_id: itemId }, 'murekService.buyMurekItem')
}

export function equipMurek(color: string | null, accessory: string | null) {
  return murekRpc('equip_murek', { p_color: color, p_accessory: accessory }, 'murekService.equipMurek')
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const userLookCache = new Map<string, Promise<MurekLook>>()

/** Another user's Mürek; one request per user (profile + hover cards share it). */
export function getUserMurekCached(userId: string): Promise<MurekLook> {
  if (!UUID_PATTERN.test(userId)) return Promise.resolve(DEFAULT_MUREK_LOOK)
  let request = userLookCache.get(userId)
  if (!request) {
    request = getUserMurek(userId).catch(() => DEFAULT_MUREK_LOOK)
    userLookCache.set(userId, request)
  }
  return request
}

export async function getUserMurek(userId: string): Promise<MurekLook> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('get_user_murek', { p_user_id: userId }), signal),
    { label: 'murekService.getUserMurek' },
  )
  if (error) return DEFAULT_MUREK_LOOK
  return parseMurekLook(data)
}

// --- The user's own Mürek (games, home page) -------------------------------------------

let myLook: MurekLook | null = null
let myLookRequest: Promise<void> | null = null
const listeners = new Set<(look: MurekLook) => void>()

export function setMyMurekLook(look: MurekLook) {
  myLook = look
  listeners.forEach((listener) => listener(look))
}

export function getCachedMyMurekLook(): MurekLook | null {
  return myLook
}

export function subscribeMyMurekLook(listener: (look: MurekLook) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Loads the own look once (concurrent calls share the same request). */
export function loadMyMurekLook(): Promise<void> {
  if (!myLookRequest) {
    myLookRequest = getMurekShop().then(() => undefined).catch(() => undefined).finally(() => { myLookRequest = null })
  }
  return myLookRequest
}

export function clearMyMurekLook() {
  myLook = null
}

// --- Admin -------------------------------------------------------------------------------------

const adminSchema = z.object({ items: z.array(itemSchema).catch([]), revenue: z.number().int().catch(0) })
export type MurekAdminSnapshot = z.infer<typeof adminSchema>

export function parseMurekAdminSnapshot(value: unknown): MurekAdminSnapshot | null {
  const result = adminSchema.safeParse(value)
  return result.success ? result.data : null
}

async function murekAdminRpc(name: string, args: Record<string, unknown>, label: string): Promise<MurekAdminSnapshot> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(name, args), signal),
    { label },
  )
  if (error) throw new Error(error.message || txa('Mürek Dolabı yönetimi tamamlanamadı.'))
  const snapshot = parseMurekAdminSnapshot(data)
  if (!snapshot) throw new Error(txa('Mürek Dolabı verisi okunamadı.'))
  return snapshot
}

export function getAdminMurekItems() {
  return murekAdminRpc('admin_murek_items', {}, 'murekService.adminItems')
}

export function saveAdminMurekItem(item: Pick<MurekItem, 'id'> & Partial<Pick<MurekItem, 'name' | 'description' | 'price' | 'rarity' | 'sort' | 'isActive'>>) {
  return murekAdminRpc('admin_save_murek_item', { p: item }, 'murekService.adminSave')
}
