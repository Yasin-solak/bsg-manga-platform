import type {
  Report,
  ReportModerationEvent,
  ReportStatus,
  ReportTargetContext,
  ReportTargetType,
} from '@/services/reportService/types'
import { isE2EModeEnabled } from './e2eMocks'

const REPORTER_PROFILES = [
  { id: '82000000-0000-4000-8000-000000000001', username: 'site_owner', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=site_owner' },
  { id: '82000000-0000-4000-8000-000000000002', username: 'reader_one', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=reader_one' },
  { id: '82000000-0000-4000-8000-000000000003', username: 'kageyama09', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=kageyama09' },
  { id: '82000000-0000-4000-8000-000000000004', username: 'panelokuru', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=panelokuru' },
]

const TARGET_TYPES: ReportTargetType[] = [
  'manga_comment',
  'manga_list_comment',
  'manga_comment',
  'manga_comment',
  'user',
  'manga',
  'chapter',
  'manga_list_comment',
]

const MEDIUM_RISK_REASONS = [
  'Spam / Reklam',
  'Yanıltıcı İçerik',
  'Telif İhlali',
  'Uygunsuz İçerik',
]

const HIGH_RISK_INDICES = new Set([2, 7, 12, 14, 17])
const MEDIUM_RISK_INDICES = new Set([1, 3, 4, 5, 6, 8, 9, 10, 11, 13])
const HIGH_RISK_REASONS = ['Hakaret / Küfür', 'Taciz / Tehdit', 'Nefret Söylemi']

const TARGET_NAMES = [
  'cgtvydn',
  'reader_two',
  'Solo Leveling',
  'Şafak Avcısı',
  'panelgezgini',
  'Kara Kule Arşivi',
  'Gölge Muhafızı · 176. Bölüm',
  'Haftanın Önerileri',
]

const TARGET_PREVIEWS = [
  'Kısa sürede çoklu reklam bağlantısı paylaşıldı.',
  'Aynı bağlantı kısa aralıklarla farklı yorumlarda tekrar paylaşılmış.',
  'Tartışmada başka bir kullanıcıya yönelik aşağılayıcı ifadeler bulunuyor.',
  'İçerikte kaynağı doğrulanamayan yönlendirmeler yer alıyor.',
  'Kullanıcıya doğrudan ve tekrarlanan ısrarlı mesajlar gönderilmiş.',
  'Yayın hakkı konusunda doğrulanması gereken bir bildirim.',
  'Topluluk kurallarıyla uyuşmayan görsel ve açıklama bildirimi.',
  'Belirli bir gruba yönelik ayrımcı ifadeler raporlandı.',
]

function isoHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

function buildFixtureReports() {
  return Array.from({ length: 28 }, (_, index): Report => {
    const reporter = REPORTER_PROFILES[index % REPORTER_PROFILES.length]
    const status: ReportStatus = index < 4 ? 'pending' : index < 16 ? 'resolved' : 'dismissed'
    const targetType = TARGET_TYPES[index % TARGET_TYPES.length]
    const closedAt = status === 'pending' ? undefined : isoHoursAgo(Math.max(1, index * 5 - 2))

    return {
      id: `83000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      reporter_id: reporter.id,
      target_id: `84000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      target_type: targetType,
      reason: HIGH_RISK_INDICES.has(index)
        ? HIGH_RISK_REASONS[index % HIGH_RISK_REASONS.length]
        : MEDIUM_RISK_INDICES.has(index)
          ? MEDIUM_RISK_REASONS[index % MEDIUM_RISK_REASONS.length]
          : index === 0
            ? 'Spam / Reklam'
            : 'Diğer',
      description: index === 0
        ? 'Kısa sürede çoklu reklam ve dolandırıcılık bağlantısı paylaşıldı.'
        : TARGET_PREVIEWS[index % TARGET_PREVIEWS.length],
      status,
      created_at: isoHoursAgo(index < 4 ? index * 0.3 : index * 8),
      resolved_at: closedAt,
      resolved_by: closedAt ? '81000000-0000-4000-8000-000000000001' : undefined,
      reporter: {
        username: reporter.username,
        avatar_url: reporter.avatar_url,
      },
    }
  })
}

let fixtureReports = buildFixtureReports()
const fixtureNotes = new Map<string, ReportModerationEvent[]>()

function buildContext(report: Report): ReportTargetContext {
  const index = Number(report.id.slice(-12)) - 1
  const targetName = TARGET_NAMES[index % TARGET_NAMES.length]
  const preview = TARGET_PREVIEWS[index % TARGET_PREVIEWS.length]
  const ownerId = `85000000-0000-4000-8000-${String((index % 8) + 1).padStart(12, '0')}`
  const publicUrl = report.target_type === 'user'
    ? `/profil/${encodeURIComponent(targetName)}`
    : report.target_type === 'manga' || report.target_type === 'chapter' || report.target_type === 'manga_comment'
      ? '/manga/safak-avcisi-01'
      : report.target_type === 'manga_list_comment'
        ? '/listeler'
        : '/topluluk'

  return {
    targetType: report.target_type,
    targetId: report.target_id,
    targetTitle: targetName,
    targetPreview: preview,
    targetIsActive: true,
    ownerId,
    ownerUsername: targetName,
    ownerAvatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(targetName)}`,
    publicUrl,
    locationPath: report.target_type === 'user' ? 'Kullanıcı > Profil' : 'İçerik > Hedef',
    adminSection: report.target_type === 'user'
      ? 'users'
      : report.target_type === 'manga_list_comment'
        ? 'lists'
        : 'mangas',
  }
}

export function getE2EAdminReports() {
  if (!isE2EModeEnabled()) return null
  return fixtureReports.map((report) => ({ ...report, reporter: report.reporter ? { ...report.reporter } : undefined }))
}

export function getE2EAdminReportContext(report: Report) {
  if (!isE2EModeEnabled()) return null
  const context = buildContext(report)
  return {
    content: { id: report.target_id, body: context.targetPreview, is_active: context.targetIsActive },
    context,
    error: null,
  }
}

export function updateE2EAdminReportStatus(id: string, status: ReportStatus) {
  if (!isE2EModeEnabled()) return false
  fixtureReports = fixtureReports.map((report) => (
    report.id === id
      ? {
          ...report,
          status,
          resolved_at: status === 'pending' ? undefined : new Date().toISOString(),
        }
      : report
  ))
  return true
}

export function getE2EAdminReportHistory(reportId: string) {
  if (!isE2EModeEnabled()) return null
  return [...(fixtureNotes.get(reportId) || [])]
}

export function addE2EAdminReportNote(reportId: string, note: string) {
  if (!isE2EModeEnabled()) return null
  const event: ReportModerationEvent = {
    id: `e2e-note-${Date.now()}`,
    action: 'report.note.add',
    summary: 'Moderasyon notu eklendi.',
    note,
    actorUsername: 'Admin',
    createdAt: new Date().toISOString(),
  }
  fixtureNotes.set(reportId, [event, ...(fixtureNotes.get(reportId) || [])])
  return event
}
