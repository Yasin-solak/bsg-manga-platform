import { createNotification } from './notifications'
import type { Notification } from './types'
import type { ReportTargetType } from '../reportService/types'

type MentionNotificationBase = {
  actorUserId: string
  actorUsername: string
  commentId: string
  routeHint: string
  userId: string
}

type CommentModerationSource = 'community' | 'manga' | 'chapter' | 'list'

/** Bildirim cumlesinde kaynak ("Topluluktaki", "Bolumdeki" ...). */
function commentSourceNoun(source: CommentModerationSource) {
  if (source === 'community') return 'Topluluktaki'
  if (source === 'chapter') return 'Bölümdeki'
  if (source === 'list') return 'Listedeki'
  return 'Mangadaki'
}

function reportTargetLabel(targetType: ReportTargetType) {
  if (targetType === 'manga_comment') return 'Manga yorumu'
  if (targetType === 'manga_list_comment') return 'Liste yorumu'
  if (targetType === 'manga') return 'Manga'
  if (targetType === 'chapter') return 'Manga bolumu'
  return 'Kullanici'
}

export async function sendBadgeEarnedNotification(
  userId: string,
  badgeName: string,
  badgeImageUrl: string,
  badgeId: string,
): Promise<Notification | null> {
  return createNotification({
    user_id: userId,
    type: 'badge_earned',
    title: '\u{1F3C5} Yeni Rozet Kazandin!',
    message: `"${badgeName}" rozetini kazandin!`,
    icon: badgeImageUrl,
    data: { badge_id: badgeId },
  })
}

export async function sendBadgePurchasedNotification(
  userId: string,
  badgeName: string,
  badgeImageUrl: string,
  badgeId: string,
): Promise<Notification | null> {
  return createNotification({
    user_id: userId,
    type: 'badge_purchased',
    title: '\u{1F6D2} Rozet Satin Alindi!',
    message: `"${badgeName}" rozeti envanterine eklendi!`,
    icon: badgeImageUrl,
    data: { badge_id: badgeId },
  })
}

export async function sendLevelUpNotification(userId: string, newLevel: string): Promise<Notification | null> {
  return createNotification({
    user_id: userId,
    type: 'level_up',
    title: '\u{1F389} Seviye Atladin!',
    message: `Tebrikler! Artik ${newLevel} seviyesindesin!`,
    icon: '\u{1F389}',
  })
}

export async function sendMangaCommentMentionNotification(
  params: MentionNotificationBase & { mangaId: string },
): Promise<Notification | null> {
  const actorLabel = params.actorUsername.trim() || 'Bir kullanici'

  return createNotification({
    user_id: params.userId,
    type: 'mention',
    title: 'Bir manga yorumunda senden bahsedildi',
    message: `${actorLabel}, manga yorumunda senden bahsetti.`,
    data: {
      event: 'manga_comment_mention',
      manga_id: params.mangaId,
      comment_id: params.commentId,
      actor_user_id: params.actorUserId,
      actor_username: actorLabel,
      route_hint: params.routeHint,
      event_key: `manga-comment-mention:${params.commentId}:${params.userId}`,
    },
  })
}

export async function sendCommentModerationNotification(params: {
  userId: string
  source: CommentModerationSource
  routeHint: string
  contextTitle: string
  reason?: string
}): Promise<Notification | null> {
  // Kullaniciya giden metin Turkce; baglam (seri / gonderi adi) de yazilir.
  const where = params.contextTitle?.trim() ? `"${params.contextTitle.trim()}" altındaki` : commentSourceNoun(params.source)
  const trimmedReason = params.reason?.trim() || ''
  const message = trimmedReason
    ? `${where} yorumun moderasyon sonucu kaldırıldı. Gerekçe: ${trimmedReason}`
    : `${where} yorumun moderasyon sonucu kaldırıldı.`

  return createNotification({
    user_id: params.userId,
    type: 'system',
    title: 'Yorumun kaldırıldı',
    message,
    data: {
      event: 'comment_moderation_removed',
      route_hint: params.routeHint,
      source: params.source,
      context_title: params.contextTitle,
    },
    bypassPreferences: true,
  })
}

export async function sendReportContentRemovedNotification(params: {
  userId: string
  reportId?: string
  targetId: string
  targetType: ReportTargetType
  targetTitle?: string
  routeHint?: string
  reason?: string
}): Promise<Notification | null> {
  const targetLabel = reportTargetLabel(params.targetType)
  const reason = params.reason?.trim()
  const message = reason
    ? `${targetLabel} rapor incelemesi sonucunda gorunurlukten kaldirildi. Gerekce: ${reason}`
    : `${targetLabel} rapor incelemesi sonucunda gorunurlukten kaldirildi.`

  return createNotification({
    user_id: params.userId,
    type: 'system',
    title: `${targetLabel} kaldirildi`,
    message,
    data: {
      event: 'report_content_removed',
      report_id: params.reportId,
      target_id: params.targetId,
      target_type: params.targetType,
      target_title: params.targetTitle,
      route_hint: params.routeHint,
    },
    bypassPreferences: true,
  })
}

export async function sendReportResolvedReporterNotification(params: {
  userId: string
  reportId?: string
  targetId: string
  targetType: ReportTargetType
  targetTitle?: string
  routeHint?: string
}): Promise<Notification | null> {
  const targetLabel = reportTargetLabel(params.targetType)

  return createNotification({
    user_id: params.userId,
    type: 'system',
    title: 'Raporunuz sonuclandi',
    message: `${targetLabel} icin gonderdiginiz rapor incelendi ve icerik kaldirildi.`,
    data: {
      event: 'report_resolved_content_removed',
      report_id: params.reportId,
      target_id: params.targetId,
      target_type: params.targetType,
      target_title: params.targetTitle,
      route_hint: params.routeHint,
    },
    bypassPreferences: true,
  })
}
