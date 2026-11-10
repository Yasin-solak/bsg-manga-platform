import type { Announcement, RewardCondition } from './model'
import { txa } from '@/i18n/activeLocale'

export const conditionLabels: Record<RewardCondition['type'], string> = {
  get verified_email() { return txa('Doğrulanmış e-posta') }, get premium() { return txa('Aktif Premium') }, get account_age() { return txa('Minimum üyelik süresi') },
  get follow_manga() { return txa('Belirli seriyi takip') }, get follow_fansub() { return txa('Belirli fansubu takip') }, get profile_completed() { return txa('Profil kurulumu') },
  get read_chapters() { return txa('Toplam farklı bölüm okuma') }, get read_manga() { return txa('Seçilen seriden bölüm okuma') },
  get follow_manga_count() { return txa('Takip edilen seri sayısı') }, get follow_fansub_count() { return txa('Takip edilen fansub sayısı') },
  get level() { return txa('Minimum kullanıcı seviyesi') }, get claimed_quests() { return txa('Alınan görev ödülü sayısı') }, get fansub_member() { return txa('Fansub ekip üyeliği') },
}
export const conditionReferenceKind = (c: RewardCondition) => c.type === 'follow_manga' || c.type === 'read_manga' ? 'manga' : 'fansub'
export function conditionDescription(c: RewardCondition, refs: Announcement['references']) {
  const title = 'id' in c ? refs[`${conditionReferenceKind(c)}:${c.id}`]?.title || txa('Seçilen içerik') : ''
  switch (c.type) {
    case 'verified_email': return txa('E-posta adresini doğrula')
    case 'premium': return txa('Aktif Premium üyeliğin olsun')
    case 'account_age': return txa('Hesabın en az {v1} günlük olsun', { v1: c.days })
    case 'profile_completed': return txa('Profil kurulumunu tamamla')
    case 'follow_manga': case 'follow_fansub': return `${title} takibi`
    case 'read_chapters': return txa('En az {v1} farklı bölüm oku', { v1: c.count })
    case 'read_manga': return txa('{v1} serisinden en az {v2} farklı bölüm oku', { v1: title, v2: c.count })
    case 'follow_manga_count': return txa('En az {v1} seri takip et', { v1: c.count })
    case 'follow_fansub_count': return txa('En az {v1} fansub takip et', { v1: c.count })
    case 'level': return txa('En az {v1}. seviyeye ulaş', { v1: c.count })
    case 'claimed_quests': return txa('En az {v1} görev ödülünü al', { v1: c.count })
    case 'fansub_member': return txa('{v1} ekibine üye ol', { v1: title })
  }
}
