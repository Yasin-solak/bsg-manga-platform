import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { supabase } from '@/services/supabase'
import { txa } from '@/i18n/activeLocale'

/*
 * Fansub role and permission system (the fansub equivalent of the community server model).
 * The source is in the DB (app_private.fansub_permission_catalog); this list carries labels and
 * descriptions. A contract test verifies the two lists stay equal.
 */

export type FansubPermission =
  | 'panel.erisim' | 'panel.mangalar' | 'panel.bolumler' | 'panel.topluluk' | 'panel.duyurular'
  | 'panel.kredi' | 'panel.gorevler' | 'panel.ifadeler' | 'panel.uyelik' | 'panel.istatistik'
  | 'panel.kasa' | 'panel.takviye' | 'ekip.roller'
  | 'ceviri.gor' | 'ceviri.proje' | 'ceviri.metin' | 'ceviri.dizgi' | 'ceviri.temizlik'
  | 'ceviri.kaynak' | 'ceviri.yayinla'

export interface FansubPermissionDef { key: FansubPermission, label: string, description: string, requires?: FansubPermission }

export const FANSUB_PERMISSION_GROUPS: Array<{ id: 'panel' | 'ceviri', label: string, permissions: FansubPermissionDef[] }> = [
  {
    id: 'panel',
    get label() { return txa('Yönetim paneli') },
    permissions: [
      { key: 'panel.erisim', get label() { return txa('Paneli açabilir') }, get description() { return txa('Yönetim panelini ve genel bakışı görür. Diğer panel izinleri bununla çalışır.') } },
      { key: 'panel.mangalar', get label() { return txa('Mangalar') }, get description() { return txa('Seri vitrini ve katalog sekmesi.') }, requires: 'panel.erisim' },
      { key: 'panel.bolumler', get label() { return txa('Bölümler') }, get description() { return txa('Yayınlanan ve onay bekleyen bölümler.') }, requires: 'panel.erisim' },
      { key: 'panel.topluluk', get label() { return txa('Topluluk') }, get description() { return txa('Gönderi akışı ve mini anketler.') }, requires: 'panel.erisim' },
      { key: 'panel.duyurular', get label() { return txa('Duyurular') }, get description() { return txa('Sabit duyuru ve takipçi bildirimleri.') }, requires: 'panel.erisim' },
      { key: 'panel.kredi', get label() { return txa('Kapanış kredisi') }, get description() { return txa('Bölüm sonu kredi şeridi.') }, requires: 'panel.erisim' },
      { key: 'panel.gorevler', get label() { return txa('Görevler') }, get description() { return txa('Büyüme görevleri ve ödül toplama.') }, requires: 'panel.erisim' },
      { key: 'panel.ifadeler', get label() { return txa('Emoji, çıkartma ve etiket') }, get description() { return txa('Destekçi ifade seti ve fansub etiketi.') }, requires: 'panel.erisim' },
      { key: 'panel.uyelik', get label() { return txa('Üyelik') }, get description() { return txa('Davetler, başvurular ve üye listesi.') }, requires: 'panel.erisim' },
      { key: 'panel.istatistik', get label() { return txa('İstatistikler') }, get description() { return txa('Takip, görünürlük ve performans.') }, requires: 'panel.erisim' },
      { key: 'panel.kasa', get label() { return txa('Kasa') }, get description() { return txa('Coin hareketleri ve varlıklar.') }, requires: 'panel.erisim' },
      { key: 'panel.takviye', get label() { return txa('Takviye') }, get description() { return txa('Boost gücü ve destekçi ödülleri.') }, requires: 'panel.erisim' },
      { key: 'ekip.roller', get label() { return txa('Rolleri yönet') }, get description() { return txa('Kendi rolünün altındaki rolleri düzenler ve üyelere atar; yalnız kendinde olan izinleri verebilir.') }, requires: 'panel.erisim' },
    ],
  },
  {
    id: 'ceviri',
    get label() { return txa('Çeviri Stüdyosu') },
    permissions: [
      { key: 'ceviri.gor', get label() { return txa('Stüdyoyu görüntüle') }, get description() { return txa('Projeleri, sayfaları ve çevirileri görür; hiçbir şeyi değiştiremez.') } },
      { key: 'ceviri.proje', get label() { return txa('Proje yönetimi') }, get description() { return txa('Yeni bölüm açar, sayfa yükler, tarama ve AI çeviri başlatır.') }, requires: 'ceviri.gor' },
      { key: 'ceviri.metin', get label() { return txa('Çeviri metni') }, get description() { return txa('Çevirileri yazar, düzeltir ve onaylar (toplu inceleme dahil).') }, requires: 'ceviri.gor' },
      { key: 'ceviri.dizgi', get label() { return txa('Dizgi') }, get description() { return txa('Alan çizer, taşır, siler; font, boyut ve yazı efektlerini ayarlar.') }, requires: 'ceviri.gor' },
      { key: 'ceviri.temizlik', get label() { return txa('Temizlik ve rötuş') }, get description() { return txa('Fırça, onarım, damga, seçim araçları (Photoshop işleri).') }, requires: 'ceviri.gor' },
      { key: 'ceviri.kaynak', get label() { return txa('Ekip kaynakları') }, get description() { return txa('Ekip fontları, stil kütüphanesi ve sözlük.') }, requires: 'ceviri.gor' },
      { key: 'ceviri.yayinla', get label() { return txa('Yayınla') }, get description() { return txa('Tamamlanan bölümü sitede yayınlar.') }, requires: 'ceviri.gor' },
    ],
  },
]

export const FANSUB_PERMISSION_KEYS: FansubPermission[] = FANSUB_PERMISSION_GROUPS.flatMap((group) => group.permissions.map((entry) => entry.key))

const REQUIRES = new Map<FansubPermission, FansubPermission>(
  FANSUB_PERMISSION_GROUPS.flatMap((group) => group.permissions.filter((entry) => entry.requires).map((entry) => [entry.key, entry.requires as FansubPermission])),
)

/** Alt izin acilinca temel izni de acilir; temel izin kapaninca ona bagli izinler de kapanir. */
export function togglePermission(current: FansubPermission[], key: FansubPermission, on: boolean): FansubPermission[] {
  const next = new Set(current)
  if (on) {
    next.add(key)
    const base = REQUIRES.get(key)
    if (base) next.add(base)
  } else {
    next.delete(key)
    for (const [child, base] of REQUIRES) if (base === key) next.delete(child)
  }
  return [...next]
}

/** Ready-made role templates: created in one click, editable afterward. */
export const FANSUB_ROLE_TEMPLATES: Array<{ name: string, color: string, description: string, permissions: FansubPermission[] }> = [
  { get name() { return txa('Çevirmen') }, color: '#5b8def', get description() { return txa('Çevirileri yazar ve onaylar.') }, permissions: ['ceviri.gor', 'ceviri.metin'] },
  { get name() { return txa('Temizlikçi') }, color: '#34c38f', get description() { return txa('Temizlik ve rötuş (PS) araçları.') }, permissions: ['ceviri.gor', 'ceviri.temizlik'] },
  { get name() { return txa('Dizgici') }, color: '#f1b44c', get description() { return txa('Alanlar, fontlar ve yazı stilleri.') }, permissions: ['ceviri.gor', 'ceviri.dizgi', 'ceviri.kaynak'] },
  { get name() { return txa('Kontrolcü') }, color: '#a66cff', get description() { return txa('Metni ve dizgiyi son kez düzeltir, yayınlar.') }, permissions: ['ceviri.gor', 'ceviri.metin', 'ceviri.dizgi', 'ceviri.yayinla'] },
  { get name() { return txa('Proje sorumlusu') }, color: '#f46a6a', get description() { return txa('Bölüm açar, tarar, tüm stüdyo işleri.') }, permissions: ['ceviri.gor', 'ceviri.proje', 'ceviri.metin', 'ceviri.dizgi', 'ceviri.temizlik', 'ceviri.kaynak', 'ceviri.yayinla'] },
  { get name() { return txa('Topluluk sorumlusu') }, color: '#50a5f1', get description() { return txa('Gönderiler, duyurular ve üyelik.') }, permissions: ['panel.erisim', 'panel.topluluk', 'panel.duyurular', 'panel.uyelik'] },
]

export interface FansubRole {
  id: string
  name: string
  color: string | null
  position: number
  isDefault: boolean
  systemKey: 'member' | 'moderator' | null
  permissions: FansubPermission[]
  memberCount: number
  /** Can the signed-in user edit and assign this role (rank rule)? */
  manageable: boolean
}

export interface FansubRolesSnapshot {
  roles: FansubRole[]
  /** userId -> atanmis rol kimlikleri (varsayilan rol haric). */
  assignments: Map<string, string[]>
  canManage: boolean
  /** Fansub admin or site admin: not bound by rank and permission limits. */
  isOwner: boolean
  /** Admin -1; digerleri atanmis rollerin en kucuk sirasi (1001 = rolsuz). */
  myRank: number
  myUserId: string | null
  myPermissions: Set<FansubPermission>
}

const permissionList = z.array(z.string()).transform((values) => values.filter((value): value is FansubPermission => (FANSUB_PERMISSION_KEYS as string[]).includes(value)))

const snapshotSchema = z.object({
  roles: z.array(z.object({
    id: z.string(), name: z.string(), color: z.string().nullable(), position: z.number(),
    is_default: z.boolean(), system_key: z.enum(['member', 'moderator']).nullable(),
    permissions: permissionList, member_count: z.number(), manageable: z.boolean().default(false),
  })),
  assignments: z.array(z.object({ user_id: z.string(), role_ids: z.array(z.string()) })),
  can_manage: z.boolean(),
  is_owner: z.boolean().default(false),
  my_rank: z.number().default(1001),
  my_user_id: z.string().nullable().default(null),
  my_permissions: permissionList.default([]),
})

export async function getMyFansubPermissions(fansubId: string): Promise<Set<FansubPermission>> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('get_my_fansub_permissions', { p_fansub_id: fansubId }), signal),
    { label: txa('Fansub izinleri') },
  )
  if (error) throw error
  return new Set(permissionList.parse(data ?? []))
}

export async function listFansubRoles(fansubId: string): Promise<FansubRolesSnapshot> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('list_fansub_roles', { p_fansub_id: fansubId }), signal),
    { label: txa('Fansub rolleri') },
  )
  if (error) throw error
  const parsed = snapshotSchema.parse(data)
  return {
    roles: parsed.roles.map((role) => ({
      id: role.id, name: role.name, color: role.color, position: role.position, isDefault: role.is_default,
      systemKey: role.system_key, permissions: role.permissions, memberCount: role.member_count, manageable: role.manageable,
    })),
    assignments: new Map(parsed.assignments.map((entry) => [entry.user_id, entry.role_ids])),
    canManage: parsed.can_manage,
    isOwner: parsed.is_owner,
    myRank: parsed.my_rank,
    myUserId: parsed.my_user_id,
    myPermissions: new Set(parsed.my_permissions),
  }
}

async function manage(fansubId: string, action: string, payload: Record<string, unknown>) {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('manage_fansub_roles', { p_fansub_id: fansubId, p_action: action, p: payload }), signal),
    { label: txa('Fansub rol yönetimi') },
  )
  if (error) throw error
  return data
}

export async function saveFansubRole(fansubId: string, role: { id?: string, name: string, color: string | null, position?: number, permissions: FansubPermission[] }) {
  await manage(fansubId, 'save_role', { ...role, color: role.color ?? '' })
}

export async function deleteFansubRole(fansubId: string, roleId: string) {
  await manage(fansubId, 'delete_role', { id: roleId })
}

export async function setFansubMemberRoles(fansubId: string, userId: string, roleIds: string[]) {
  await manage(fansubId, 'set_member_roles', { user_id: userId, role_ids: roleIds })
}
