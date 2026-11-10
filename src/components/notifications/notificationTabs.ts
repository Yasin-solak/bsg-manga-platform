import type { NotificationCategory } from '@/services/notificationService/centerModel'
import { txa } from '@/i18n/activeLocale'

export const NOTIFICATION_TABS: { id: NotificationCategory; label: string; hint: string }[] = [
  { id: 'all', get label() { return txa('Tümü') }, get hint() { return txa('Yeni bir şey olduğunda burada haber vereceğiz.') } },
  { id: 'chapter', get label() { return txa('Bölümler') }, get hint() { return txa('Takip ettiğin serilerin yeni bölümleri burada görünür.') } },
  { id: 'community', get label() { return txa('Topluluk') }, get hint() { return txa('Yanıt, beğeni, takip ve fansub haberleri burada toplanır.') } },
  { id: 'system', get label() { return txa('Sistem') }, get hint() { return txa('Hesap, rozet ve sistem haberlerini burada bulabilirsin.') } },
]
