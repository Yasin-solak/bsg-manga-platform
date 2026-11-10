import { supabase } from '../supabase'
import { sendBadgeEarnedNotification } from './presets'

async function listOwnedBadgeNames(userId: string) {
  const { data } = await supabase
    .from('user_badges')
    .select('badge_id, badge:badge_id(name)')
    .eq('user_id', userId)

  return new Set<string>(
    (data || [])
      .map((userBadge) => {
        const badge = userBadge.badge as unknown as { name: string } | null
        return badge?.name ?? ''
      })
      .filter((name) => name !== ''),
  )
}

async function grantBadge(userId: string, badgeName: string) {
  const { data: badge } = await supabase
    .from('badges')
    .select('id, name, image_url')
    .eq('name', badgeName)
    .maybeSingle()

  if (!badge) return null

  await supabase
    .from('user_badges')
    .insert({
      user_id: userId,
      badge_id: badge.id,
      is_displayed: false,
      display_order: 0,
    })

  await sendBadgeEarnedNotification(userId, badge.name, badge.image_url, badge.id)
  return badge
}

export async function checkAndGrantReadingBadges(
  userId: string,
  totalChaptersRead: number,
): Promise<{ granted: boolean; badgeName?: string }> {
  const badgeThresholds = [
    { chapters: 1, badgeName: 'Ilk Adim' },
    { chapters: 100, badgeName: 'Kitap Kurdu' },
    { chapters: 500, badgeName: 'Manga Ustasi' },
  ]

  const ownedBadgeNames = await listOwnedBadgeNames(userId)

  for (const threshold of badgeThresholds) {
    if (totalChaptersRead < threshold.chapters || ownedBadgeNames.has(threshold.badgeName)) {
      continue
    }

    const badge = await grantBadge(userId, threshold.badgeName)
    if (badge) {
      return { granted: true, badgeName: badge.name }
    }
  }

  return { granted: false }
}

export async function checkAndGrantCommentBadges(
  userId: string,
  totalComments: number,
): Promise<{ granted: boolean; badgeName?: string }> {
  if (totalComments < 50) {
    return { granted: false }
  }

  const { data: badgeIdRow } = await supabase
    .from('badges')
    .select('id')
    .eq('name', 'Yorum Kahramani')
    .maybeSingle()

  if (!badgeIdRow?.id) {
    return { granted: false }
  }

  const { data: existingBadge } = await supabase
    .from('user_badges')
    .select('id')
    .eq('user_id', userId)
    .eq('badge_id', badgeIdRow.id)
    .maybeSingle()

  if (existingBadge) {
    return { granted: false }
  }

  const badge = await grantBadge(userId, 'Yorum Kahramani')
  if (!badge) {
    return { granted: false }
  }

  return { granted: true, badgeName: badge.name }
}
