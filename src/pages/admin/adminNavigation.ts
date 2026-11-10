import type { LucideIcon } from 'lucide-react'
import {
  BookCopy,
  BookPlus,
  FileWarning,
  Gamepad2,
  Inbox,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  ListOrdered,
  Megaphone,
  MessageSquareMore,
  MessagesSquare,
  Settings,
  ShieldAlert,
  Stethoscope,
  Sticker,
  Store,
  TicketPercent,
  Trophy,
  UserRoundCheck,
  UsersRound,
  Wrench,
  Zap,
} from 'lucide-react'
import type { AdminSection } from './adminPageUtils'
import { txa } from '@/i18n/activeLocale'

/*
 * Admin sidebar v2: groups by workflow. A badge shows only PENDING work (total user / announcement
 * counts are not badges). Sections with their flag off stay in the list,
 * marked "Closed".
 */
export type AdminNavGroup = 'overview' | 'queues' | 'moderation' | 'content' | 'economy' | 'system'
export type AdminNavItemId = AdminSection

export const ADMIN_NAV_GROUP_ORDER: AdminNavGroup[] = ['overview', 'queues', 'moderation', 'content', 'economy', 'system']

const GROUP_LABEL: Record<AdminNavGroup, string> = {
  overview: '',
  get queues() { return txa('İnceleme kuyrukları') },
  get moderation() { return txa('Moderasyon') },
  get content() { return txa('İçerik ve ekipler') },
  get economy() { return txa('Ekonomi') },
  get system() { return txa('Sistem') },
}

export function adminNavGroupLabel(group: AdminNavGroup) {
  return GROUP_LABEL[group]
}

export interface AdminNavItem {
  id: AdminNavItemId
  label: string
  description: string
  icon: LucideIcon
  group: AdminNavGroup
  /** Bekleyen is sayisi; 0 ya da tanimsizsa rozet cizilmez. */
  badge?: number
  /** Gecikmesi riskli kuyruk (rapor, yasal talep): rozet kirmizi. */
  urgent?: boolean
  /** Feature flag off: a click informs, the section does not open. */
  inactive?: boolean
}

interface BuildAdminNavItemsParams {
  isReportsFeatureEnabled: boolean
  isOperationsCenterEnabled: boolean
  pendingCount: number
  seriesRequestPendingCount?: number
  /** Open message reports across all servers (community v2). */
  communityOpenReportCount: number
  legalRequestPendingCount: number
  reportPendingCount: number
  /** Unanswered (open) support requests. */
  supportOpenCount?: number
}

export function buildAdminNavItems({
  isReportsFeatureEnabled,
  isOperationsCenterEnabled,
  pendingCount,
  seriesRequestPendingCount = 0,
  communityOpenReportCount,
  legalRequestPendingCount,
  reportPendingCount,
  supportOpenCount = 0,
}: BuildAdminNavItemsParams): AdminNavItem[] {
  return [
    {
      id: 'dashboard',
      label: txa('Genel bakış'),
      description: txa('Platformun nabzı, iş kuyrukları ve kritik sinyaller.'),
      icon: LayoutDashboard,
      group: 'overview',
    },

    // ---- Inceleme kuyruklari: biri karar bekliyor ----
    {
      id: 'pending',
      label: txa('Onay bekleyenler'),
      description: txa('Manga, bölüm, revizyon ve fansub başvuruları.'),
      icon: Inbox,
      group: 'queues',
      badge: pendingCount,
    },
    {
      id: 'series_requests',
      label: txa('Seri talepleri'),
      description: txa('Çeviri Stüdyosu seri taslaklarının onayı.'),
      icon: BookPlus,
      group: 'queues',
      badge: seriesRequestPendingCount,
    },
    {
      id: 'reports',
      label: txa('Raporlar'),
      description: txa('Kural ihlali ve şikâyet kuyruğu.'),
      icon: ShieldAlert,
      group: 'queues',
      badge: reportPendingCount,
      urgent: true,
      inactive: !isReportsFeatureEnabled,
    },
    {
      id: 'legal_requests',
      label: txa('Yasal talepler'),
      description: txa('DMCA, telif ve marka talepleri.'),
      icon: FileWarning,
      group: 'queues',
      badge: legalRequestPendingCount,
      urgent: true,
    },
    {
      id: 'support',
      label: txa('Destek talepleri'),
      description: txa('Kullanıcı mesajları, ekran görüntüleri ve yanıtlar.'),
      icon: LifeBuoy,
      group: 'queues',
      badge: supportOpenCount,
    },

    // ---- Moderasyon: yayindaki icerigin denetimi ----
    {
      id: 'community',
      label: txa('Topluluk'),
      description: txa('Sunucular, odalar ve mesaj şikâyetleri.'),
      icon: MessagesSquare,
      group: 'moderation',
      badge: communityOpenReportCount,
    },
    {
      id: 'comments',
      label: txa('Yorumlar'),
      description: txa('Manga, bölüm ve liste yorumları.'),
      icon: MessageSquareMore,
      group: 'moderation',
    },
    {
      id: 'lists',
      label: txa('Listeler'),
      description: txa('Topluluk listeleri ve liste sayfası düzeni.'),
      icon: ListOrdered,
      group: 'moderation',
    },
    {
      id: 'announcements',
      label: txa('Duyurular'),
      description: txa('Kullanıcılara gösterilen resmi duyurular.'),
      icon: Megaphone,
      group: 'moderation',
    },

    // ---- Content and teams ----
    {
      id: 'mangas',
      label: txa('Mangalar'),
      description: txa('Seri kalitesi, yayın durumu ve revizyonlar.'),
      icon: BookCopy,
      group: 'content',
    },
    {
      id: 'fansubs',
      label: txa('Fansublar'),
      description: txa('Ekipler, üyeler, seriler ve ekonomi.'),
      icon: UserRoundCheck,
      group: 'content',
    },
    {
      id: 'users',
      label: txa('Kullanıcılar'),
      description: txa('Rol, yasak ve hesap denetimi.'),
      icon: UsersRound,
      group: 'content',
    },
    {
      id: 'translation_studio',
      label: txa('Çeviri Stüdyosu'),
      description: txa('Yapay zekâ kullanımı, maliyet, fansub limitleri ve içerik denetimi.'),
      icon: Languages,
      group: 'content',
    },

    // ---- Ekonomi ----
    {
      id: 'store',
      label: txa('Mağaza'),
      description: txa('Ürünler, sezonlar, kampanyalar ve coin ekonomisi.'),
      icon: Store,
      group: 'economy',
    },
    {
      id: 'coin_codes',
      label: txa('Coin kodları'),
      description: txa('Kod üretimi, kullanım ve dağıtım.'),
      icon: TicketPercent,
      group: 'economy',
    },
    {
      id: 'rewards',
      label: txa('Ödüller'),
      description: txa('Aylık ödüller ve görev motoru.'),
      icon: Trophy,
      group: 'economy',
    },
    {
      id: 'boost',
      label: txa('Takviye'),
      description: txa('Takviye çalışma zamanı, yüzeyler ve sağlık.'),
      icon: Zap,
      group: 'economy',
    },
    {
      id: 'supporter_assets',
      label: txa('Emoji ve çıkartma'),
      description: txa('Destekçi ifadeleri, kotalar ve envanter.'),
      icon: Sticker,
      group: 'economy',
    },
    {
      id: 'games',
      label: txa('Oyunlar'),
      description: txa('Oyun Köşesi istatistikleri, bulmaca takvimi ve kurallar.'),
      icon: Gamepad2,
      group: 'economy',
    },

    // ---- Sistem ----
    {
      id: 'text_translations',
      label: txa('Metin çevirileri'),
      description: txa('Panelden yazılan metinlerin İngilizcesi.'),
      icon: Languages,
      group: 'system',
    },
    {
      id: 'operations',
      label: txa('Operasyon'),
      description: txa('Özellik bayrakları, denetim kaydı ve güvenlik.'),
      icon: Wrench,
      group: 'system',
      inactive: !isOperationsCenterEnabled,
    },
    {
      id: 'settings',
      label: txa('Ayarlar'),
      description: txa('Platform davranışı ve sistem ayarları.'),
      icon: Settings,
      group: 'system',
    },
    {
      id: 'diagnostics',
      label: txa('Tanılama'),
      description: txa('Hesaba bağlı teknik kayıtlar ve alarmlar.'),
      icon: Stethoscope,
      group: 'system',
    },
  ]
}

/** Search key ignoring Turkish case and accent differences. */
export function adminNavSearchKey(value: string) {
  return value
    .toLocaleLowerCase('tr')
    .replace(/\u0131/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Quick jump search: titles starting with the query first, then titles containing it,
 * finally matches only in the description (Enter goes to the first result).
 */
export function filterAdminNavItems(items: AdminNavItem[], query: string) {
  const needle = adminNavSearchKey(query.trim())
  if (!needle) return items
  const rank = (item: AdminNavItem) => {
    const label = adminNavSearchKey(item.label)
    if (label.startsWith(needle) || label.includes(` ${needle}`)) return 0
    if (label.includes(needle)) return 1
    return adminNavSearchKey(item.description).includes(needle) ? 2 : -1
  }
  return items
    .map((item, index) => ({ item, index, score: rank(item) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((row) => row.item)
}

/**
 * Target of the "pending work" strip on the identity card: the urgent queue first, otherwise the
 * fullest queue. Null if nothing is pending.
 */
export function pickBusiestQueue(items: AdminNavItem[]) {
  const withWork = items.filter((item) => !item.inactive && (item.badge ?? 0) > 0)
  const urgent = withWork.filter((item) => item.urgent)
  const pool = urgent.length ? urgent : withWork
  return pool.reduce<AdminNavItem | null>((best, item) => (!best || (item.badge ?? 0) > (best.badge ?? 0) ? item : best), null)
}
