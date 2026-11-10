import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bell,
  BookOpen,
  GalleryHorizontalEnd,
  LayoutDashboard,
  Layers,
  Laugh,
  MessagesSquare,
  Rocket,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import type { FansubPermission } from '@/services/fansubRolesService'
import type { FansubYonetTab } from './useFansubYonetState'
import { txa } from '@/i18n/activeLocale'

/*
 * Fansub studio v2 information architecture. Groups follow the workflow: produce content,
 * meet the community, manage the team, grow, measure. The 'Community' tab manages the community v2
 * server; the old post feed (v1) was removed
 * (the old "postlar" address redirects to "topluluk").
 */
export type FansubStudioNavGroup = 'home' | 'content' | 'community' | 'team' | 'growth' | 'measure'

/** Badge tone: separates pending work (attention) from a neutral counter. */
export type FansubStudioNavBadgeTone = 'attention' | 'neutral'

export interface FansubStudioNavItem {
  id: FansubYonetTab
  label: string
  /** Tab title's subline: what is done in this tab. */
  description: string
  icon: LucideIcon
  group: FansubStudioNavGroup
  badge?: number
  badgeTone?: FansubStudioNavBadgeTone
}

/**
 * Tab -> required fansub permission. A fansub admin has all; the "roller" tab
 * is open to the admin and the "Manage roles" (ekip.roller) permission (canManageRoles).
 */
export const FANSUB_TAB_PERMISSION: Record<Exclude<FansubYonetTab, 'roller'>, FansubPermission> = {
  genel: 'panel.erisim',
  mangalar: 'panel.mangalar',
  bolumler: 'panel.bolumler',
  topluluk: 'panel.topluluk',
  duyurular: 'panel.duyurular',
  'kapanis-kredisi': 'panel.kredi',
  gorevler: 'panel.gorevler',
  ifadeler: 'panel.ifadeler',
  uyelik: 'panel.uyelik',
  istatistikler: 'panel.istatistik',
  kasa: 'panel.kasa',
  takviye: 'panel.takviye',
}

export function canOpenFansubTab(tab: FansubYonetTab, permissions: ReadonlySet<string>, canManageRoles: boolean) {
  if (tab === 'roller') return canManageRoles
  return permissions.has('panel.erisim') && permissions.has(FANSUB_TAB_PERMISSION[tab])
}

interface BuildFansubStudioNavItemsParams {
  /** Chapters pending approval (action queue). */
  pendingChapters: number
  /** Pending work on the community server: join applications + open reports. */
  pendingCommunity?: number
  /** Bekleyen ekip katilim basvurusu sayisi. */
  pendingJoinRequests: number
  showBoostManageTab: boolean
  /** If given, only permitted tabs are listed. */
  permissions?: ReadonlySet<string>
  /** Roles and permissions tab (fansub admin / site admin). */
  showRolesTab?: boolean
}

const GROUP_LABELS: Record<FansubStudioNavGroup, string> = {
  home: '',
  get content() { return txa('İçerik') },
  get community() { return txa('Topluluk') },
  get team() { return txa('Ekip') },
  get growth() { return txa('Büyüme') },
  get measure() { return txa('Ölçüm') },
}

/** Sidebar gruplarinin sabit gosterim sirasi. */
export const FANSUB_STUDIO_GROUP_ORDER: FansubStudioNavGroup[] = ['home', 'content', 'community', 'team', 'growth', 'measure']

export function fansubStudioGroupLabel(group: FansubStudioNavGroup) {
  return GROUP_LABELS[group]
}

/** Turns positive numbers into an attention badge, zero into "no badge". */
function attentionBadge(value: number | undefined): { badge?: number; badgeTone?: FansubStudioNavBadgeTone } {
  return value && value > 0 ? { badge: value, badgeTone: 'attention' } : {}
}

export function buildFansubStudioNavItems({
  pendingChapters,
  pendingCommunity = 0,
  pendingJoinRequests,
  showBoostManageTab,
  permissions,
  showRolesTab = false,
}: BuildFansubStudioNavItemsParams): FansubStudioNavItem[] {
  const items: FansubStudioNavItem[] = [
    { id: 'genel', label: txa('Genel bakış'), description: txa('Bekleyen işler, büyüme nabzı ve ekibin son hareketleri.'), icon: LayoutDashboard, group: 'home' },
    { id: 'mangalar', label: txa('Seriler'), description: txa('Serilerinin vitrini, durumu ve okur ilgisi.'), icon: BookOpen, group: 'content' },
    { id: 'bolumler', label: txa('Bölümler'), description: txa('Yayın hattı: taslak, onay, planlı ve yayındaki bölümler.'), icon: Layers, group: 'content', ...attentionBadge(pendingChapters) },
    { id: 'kapanis-kredisi', label: txa('Kapanış kredisi'), description: txa('Bölüm sonunda okura görünen teşekkür şeridi.'), icon: GalleryHorizontalEnd, group: 'content' },
    { id: 'topluluk', label: txa('Sunucu'), description: txa('Topluluk sunucun: üyeler, kanallar, roller ve moderasyon.'), icon: MessagesSquare, group: 'community', ...attentionBadge(pendingCommunity) },
    { id: 'duyurular', label: txa('Duyurular'), description: txa('Profilde sabitlenen duyurular ve takipçi bildirimleri.'), icon: Bell, group: 'community' },
    { id: 'ifadeler', label: txa('İfadeler ve etiket'), description: txa('Destekçilere özel emoji, çıkartma ve fansub etiketi.'), icon: Laugh, group: 'community' },
    { id: 'uyelik', label: txa('Ekip üyeleri'), description: txa('Ekip üyeleri, davetler ve katılım başvuruları.'), icon: Users, group: 'team', ...attentionBadge(pendingJoinRequests) },
    { id: 'gorevler', label: txa('Görevler'), description: txa('Fansub büyüme görevleri ve ödüller.'), icon: Trophy, group: 'growth' },
    { id: 'istatistikler', label: txa('İstatistikler'), description: txa('Takip, görüntülenme ve seri performansı.'), icon: BarChart3, group: 'measure' },
    { id: 'kasa', label: txa('Kasa'), description: txa('Coin hareketleri: bağış, ödül, satın alım ve varlıklar.'), icon: Wallet, group: 'measure' },
  ]

  if (showBoostManageTab) {
    // Boost is at the start of the "Growth" group, before quests.
    const growIndex = items.findIndex((item) => item.id === 'gorevler')
    items.splice(growIndex, 0, {
      id: 'takviye',
      label: txa('Takviye'),
      description: txa('Takviye gücü, seviyeler ve açılan görünüm ayrıcalıkları.'),
      icon: Rocket,
      group: 'growth',
    })
  }

  if (showRolesTab) {
    const membershipIndex = items.findIndex((item) => item.id === 'uyelik')
    items.splice(membershipIndex + 1, 0, {
      id: 'roller',
      label: txa('Roller ve izinler'),
      description: txa('Rol oluştur, izinleri belirle ve üyelere ata.'),
      icon: ShieldCheck,
      group: 'team',
    })
  }

  return permissions ? items.filter((item) => canOpenFansubTab(item.id, permissions, showRolesTab)) : items
}

/** The page title (FansubYonetHeader) takes the active tab's record from here. */
export function findFansubStudioNavItem(tab: FansubYonetTab): FansubStudioNavItem | undefined {
  return buildFansubStudioNavItems({ pendingChapters: 0, pendingJoinRequests: 0, showBoostManageTab: true, showRolesTab: true })
    .find((item) => item.id === tab)
}
